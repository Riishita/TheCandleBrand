-- Guest checkout + billing + tracking + richer admin statuses

-- 1) Extend orders schema for structured billing and shipment metadata
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS billing_address_line_1 text,
  ADD COLUMN IF NOT EXISTS billing_address_line_2 text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_state text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text,
  ADD COLUMN IF NOT EXISTS billing_country text,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'manual_upi',
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS carrier text;

-- Ensure status constraint supports full admin workflow
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'pending',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded'
    )
  );

-- 2) New guest checkout RPC with full billing fields
CREATE OR REPLACE FUNCTION public.place_order_guest(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_notes text,
  p_payment_mode text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order_id uuid;
  total numeric(10,2);
  r record;
  shipping_compact text;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  CREATE TEMP TABLE _place_order_cart_agg (
    pid uuid PRIMARY KEY,
    qty_needed integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _place_order_cart_agg (pid, qty_needed)
  SELECT
    (elem->>'product_id')::uuid,
    SUM(GREATEST((elem->>'quantity')::int, 1))::int
  FROM jsonb_array_elements(p_items) AS elem
  WHERE elem ? 'product_id' AND nullif(trim(elem->>'product_id'), '') IS NOT NULL
  GROUP BY 1;

  FOR r IN SELECT * FROM _place_order_cart_agg
  LOOP
    PERFORM 1
    FROM public.products
    WHERE id = r.pid AND stock_quantity >= r.qty_needed
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not enough stock for one or more items';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((elem->>'quantity')::int * (elem->>'unit_price')::numeric), 0)
  INTO total
  FROM jsonb_array_elements(p_items) AS elem;

  shipping_compact := trim(
    coalesce(p_address_line_1, '') || E'\n' ||
    coalesce(nullif(trim(p_address_line_2), ''), '') || E'\n' ||
    coalesce(p_city, '') || ', ' || coalesce(p_state, '') || ' ' || coalesce(p_postal_code, '') || E'\n' ||
    coalesce(p_country, '')
  );

  INSERT INTO public.orders (
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    billing_address_line_1,
    billing_address_line_2,
    billing_city,
    billing_state,
    billing_postal_code,
    billing_country,
    notes,
    payment_mode,
    status,
    total
  )
  VALUES (
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    NULLIF(trim(p_customer_phone), ''),
    shipping_compact,
    trim(p_address_line_1),
    NULLIF(trim(p_address_line_2), ''),
    trim(p_city),
    trim(p_state),
    trim(p_postal_code),
    trim(p_country),
    NULLIF(trim(p_notes), ''),
    coalesce(nullif(trim(p_payment_mode), ''), 'manual_upi'),
    'pending',
    total
  )
  RETURNING id INTO new_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT
    new_order_id,
    CASE
      WHEN elem ? 'product_id' AND nullif(trim(elem->>'product_id'), '') IS NOT NULL
      THEN (elem->>'product_id')::uuid
      ELSE NULL
    END,
    trim(elem->>'product_name'),
    GREATEST((elem->>'quantity')::int, 1),
    (elem->>'unit_price')::numeric
  FROM jsonb_array_elements(p_items) AS elem;

  FOR r IN SELECT * FROM _place_order_cart_agg
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity - r.qty_needed,
      in_stock = (stock_quantity - r.qty_needed) > 0
    WHERE id = r.pid;
  END LOOP;

  RETURN new_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,jsonb) TO authenticated;

-- 3) Guest tracking RPC (Order ID + Email)
CREATE OR REPLACE FUNCTION public.get_order_tracking(
  p_order_id uuid,
  p_customer_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'customer_name', o.customer_name,
      'customer_email', o.customer_email,
      'customer_phone', o.customer_phone,
      'status', o.status,
      'notes', o.notes,
      'payment_mode', o.payment_mode,
      'tracking_number', o.tracking_number,
      'tracking_url', o.tracking_url,
      'carrier', o.carrier,
      'total', o.total,
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ),
    'items', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price
          )
        )
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM public.orders o
  WHERE o.id = p_order_id
    AND lower(o.customer_email) = lower(trim(p_customer_email))
  LIMIT 1;

  RETURN coalesce(result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_tracking(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
