-- Add UPI transaction reference capture for manual UPI checkout

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS upi_transaction_ref text;

-- Replace guest checkout RPC to accept UPI transaction reference
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
  p_upi_transaction_ref text,
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
    upi_transaction_ref,
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
    NULLIF(trim(p_upi_transaction_ref), ''),
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

REVOKE ALL ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.place_order_guest(text,text,text,text,text,text,text,text,text,text,text,text,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
