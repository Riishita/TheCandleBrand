-- Run this in Supabase SQL Editor **after** applying migrations that add/rename columns,
-- if the dashboard API still says "schema cache" or unknown column for existing tables.
NOTIFY pgrst, 'reload schema';
