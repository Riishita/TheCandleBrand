-- Inventory count per candle (each product already belongs to a category via category_id)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

-- Seed starting stock when still at default 0 but marked available
UPDATE public.products
SET stock_quantity = 25
WHERE stock_quantity = 0 AND in_stock IS true;

-- Atomic decrement for admin-created orders (authenticated)
CREATE OR REPLACE FUNCTION public.decrement_product_stock(p_product_id uuid, p_qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty integer;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN (SELECT stock_quantity FROM public.products WHERE id = p_product_id);
  END IF;

  UPDATE public.products
  SET
    stock_quantity = stock_quantity - p_qty,
    in_stock = (stock_quantity - p_qty) > 0
  WHERE id = p_product_id AND stock_quantity >= p_qty
  RETURNING stock_quantity INTO new_qty;

  IF new_qty IS NULL THEN
    RAISE EXCEPTION 'Insufficient stock for product %', p_product_id;
  END IF;

  RETURN new_qty;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_product_stock(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, integer) TO authenticated;

-- Guest checkout: reserve stock in the same transaction as the order
CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address text,
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

  INSERT INTO public.orders (customer_name, customer_email, customer_phone, shipping_address, status, total)
  VALUES (
    trim(p_customer_name),
    trim(p_customer_email),
    NULLIF(trim(p_customer_phone), ''),
    trim(p_shipping_address),
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

REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO authenticated;
