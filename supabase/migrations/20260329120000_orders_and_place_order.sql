-- Orders
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  notes TEXT,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Admins (authenticated) full access
CREATE POLICY "Authenticated users can select orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete orders" ON public.orders FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can select order_items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order_items" ON public.order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete order_items" ON public.order_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guest checkout: single RPC avoids granting SELECT on orders to anon
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
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

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

  RETURN new_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO authenticated;
