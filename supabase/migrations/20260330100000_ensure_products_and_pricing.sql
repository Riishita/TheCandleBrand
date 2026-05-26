-- Idempotent repair: ensure products row matches the app (price, name, scent, stock, etc.).
-- Prerequisites: public.categories and public.products already exist (base migration applied once).
-- Run in Supabase → SQL Editor if columns are missing or PostgREST reports "schema cache" errors.

-- 1) Typo fix: prize → price (only if price column does not already exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'prize'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN prize TO price;
  END IF;
END $$;

-- 2) Core product columns (ADD COLUMN IF NOT EXISTS is OK on Postgres 11+)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scent text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS in_stock boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

-- 3) name must not be null for app forms; backfill empties
UPDATE public.products SET name = 'Untitled candle' WHERE name IS NULL OR trim(name) = '';

ALTER TABLE public.products
  ALTER COLUMN name SET NOT NULL;

-- 4) Normalize price to NUMERIC(10,2) for currency (safe if already that type)
ALTER TABLE public.products
  ALTER COLUMN price TYPE numeric(10, 2)
  USING round(coalesce(price, 0::numeric), 2);

-- 5) category_id — add only if missing and categories table exists (nullable until you assign collections)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'categories'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6) Seed stock when 0 but marked in stock
UPDATE public.products
SET stock_quantity = 25
WHERE stock_quantity = 0 AND in_stock IS true;

-- 7) Reload API schema so PostgREST sees all columns (fixes “schema cache” errors)
NOTIFY pgrst, 'reload schema';
