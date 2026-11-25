-- ========================================================
-- TapMenu SaaS: Complete Supabase Database Setup
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kxszokrflzknhtsicbzm/sql
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Restaurants Table
CREATE TABLE IF NOT EXISTS public.restaurants (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    email TEXT,
    owner_email TEXT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tagline TEXT DEFAULT 'Fresh flavours and signature dishes',
    logo TEXT DEFAULT '🍽️',
    currency TEXT DEFAULT '₦',
    plan TEXT DEFAULT 'basic',
    table_limit INT DEFAULT NULL,
    status TEXT DEFAULT 'active',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    opening_hours TEXT DEFAULT '10:00 AM - 10:00 PM',
    design JSONB DEFAULT '{}',
    tables JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column check in case existing
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'basic';
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS table_limit INT DEFAULT NULL;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS design JSONB DEFAULT '{}';
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS tables JSONB DEFAULT '[]';
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS cac_certificate_url TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS cac_status TEXT DEFAULT 'none';

-- 2. Menu Items Table
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category TEXT DEFAULT 'Main Dishes',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC NOT NULL,
    badge TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    image TEXT DEFAULT '',
    emoji TEXT DEFAULT '',
    prep_time TEXT DEFAULT '15 min',
    allergens TEXT[] DEFAULT '{}',
    is_sold_out BOOLEAN DEFAULT FALSE,
    sold_out BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sold_out BOOLEAN DEFAULT FALSE;

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    customer_name TEXT DEFAULT 'Guest Diner',
    customer_phone TEXT DEFAULT '',
    items JSONB NOT NULL,
    subtotal NUMERIC,
    vat NUMERIC,
    total NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
    payment_method TEXT DEFAULT 'pos' CHECK (payment_method IN ('pos', 'cash', 'transfer')),
    source TEXT DEFAULT 'qr' CHECK (source IN ('nfc', 'qr', 'web')),
    order_type TEXT DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'both')),
    packaging_fee NUMERIC,
    pack_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vat NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine_in';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pack_count INT;

-- 4. Waiter Buzzer Calls Table
CREATE TABLE IF NOT EXISTS public.waiter_calls (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    reason TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved'))
);

-- 5. Kitchen Expenses Table
CREATE TABLE IF NOT EXISTS public.kitchen_expenses (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    recorded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Kitchen Inventory Table
CREATE TABLE IF NOT EXISTS public.kitchen_inventory (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    min_threshold NUMERIC DEFAULT 1,
    cost_per_unit NUMERIC DEFAULT 0,
    category TEXT DEFAULT 'general',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Kitchen Shifts Table (Consolidated Z-Reports)
CREATE TABLE IF NOT EXISTS public.kitchen_shifts (
    id TEXT PRIMARY KEY,
    shift_id TEXT,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    started_at TEXT,
    started_at_ts NUMERIC,
    ended_at TEXT,
    ended_at_ts NUMERIC,
    date TEXT,
    total_revenue NUMERIC DEFAULT 0,
    total_orders INT DEFAULT 0,
    served_orders INT DEFAULT 0,
    vat NUMERIC DEFAULT 0,
    payments JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Card Orders Table (Smart Hardware Cards)
CREATE TABLE IF NOT EXISTS public.card_orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT REFERENCES public.restaurants(id) ON DELETE SET NULL,
    restaurant_name TEXT,
    contact_phone TEXT,
    quantity INT DEFAULT 10,
    unit_price NUMERIC DEFAULT 2500,
    total_amount NUMERIC DEFAULT 25000,
    card_type TEXT DEFAULT 'pvc_matte',
    target_url_payload TEXT,
    table_numbers TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Platform Settings (Global SaaS configuration)
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- Enable Row Level Security (RLS)
-- ========================================================
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- ========================================================
-- Public RLS Policies (Allow App to Read and Write)
-- ========================================================
DROP POLICY IF EXISTS "Public restaurants read" ON public.restaurants;
CREATE POLICY "Public restaurants read" ON public.restaurants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public restaurants write" ON public.restaurants;
CREATE POLICY "Public restaurants write" ON public.restaurants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public menu items read" ON public.menu_items;
CREATE POLICY "Public menu items read" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public menu items write" ON public.menu_items;
CREATE POLICY "Public menu items write" ON public.menu_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public orders read" ON public.orders;
CREATE POLICY "Public orders read" ON public.orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public orders write" ON public.orders;
CREATE POLICY "Public orders write" ON public.orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public waiter calls read" ON public.waiter_calls;
CREATE POLICY "Public waiter calls read" ON public.waiter_calls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public waiter calls write" ON public.waiter_calls;
CREATE POLICY "Public waiter calls write" ON public.waiter_calls FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public kitchen expenses read" ON public.kitchen_expenses;
CREATE POLICY "Public kitchen expenses read" ON public.kitchen_expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public kitchen expenses write" ON public.kitchen_expenses;
CREATE POLICY "Public kitchen expenses write" ON public.kitchen_expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public kitchen inventory read" ON public.kitchen_inventory;
CREATE POLICY "Public kitchen inventory read" ON public.kitchen_inventory FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public kitchen inventory write" ON public.kitchen_inventory;
CREATE POLICY "Public kitchen inventory write" ON public.kitchen_inventory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public kitchen shifts read" ON public.kitchen_shifts;
CREATE POLICY "Public kitchen shifts read" ON public.kitchen_shifts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public kitchen shifts write" ON public.kitchen_shifts;
CREATE POLICY "Public kitchen shifts write" ON public.kitchen_shifts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public card orders read" ON public.card_orders;
CREATE POLICY "Public card orders read" ON public.card_orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public card orders write" ON public.card_orders;
CREATE POLICY "Public card orders write" ON public.card_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public platform settings read" ON public.platform_settings;
CREATE POLICY "Public platform settings read" ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public platform settings write" ON public.platform_settings;
CREATE POLICY "Public platform settings write" ON public.platform_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ========================================================
-- Enable Realtime for Live Kitchen and Customer Updates
-- ========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'waiter_calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waiter_calls;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'menu_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'restaurants') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurants;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kitchen_expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_expenses;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kitchen_inventory') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_inventory;
  END IF;
END $$;

-- =========================================================================
-- Security Definer Function: Admin User Purge
-- Allows purging auth.users when a restaurant account is deleted by administration
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO anon, authenticated, service_role;

-- =========================================================================
-- Dish Modifiers (Swallow, Protein, Spice, Extras) & Customer CRM
-- =========================================================================
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'table_service';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders
ADD CONSTRAINT orders_order_type_check
CHECK (order_type IN ('dine_in', 'takeaway', 'both', 'delivery'));

CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    normalized_phone TEXT NOT NULL,
    total_orders INT DEFAULT 0,
    total_spend NUMERIC DEFAULT 0,
    last_order_at BIGINT,
    last_order_type TEXT DEFAULT 'dine_in',
    favorite_items JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    created_at BIGINT,
    UNIQUE (restaurant_id, normalized_phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON public.customers(restaurant_id);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Allow public access to customers') THEN
    CREATE POLICY "Allow public access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 11. Subscription Transactions (Paystack Payments & Audit Log)
CREATE TABLE IF NOT EXISTS public.subscription_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    reference TEXT NOT NULL UNIQUE,
    plan_id TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    months INT NOT NULL DEFAULT 1,
    amount_kobo BIGINT NOT NULL,
    currency TEXT DEFAULT 'NGN',
    customer_email TEXT,
    channel TEXT DEFAULT 'paystack',
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_tx_restaurant ON public.subscription_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_sub_tx_reference ON public.subscription_transactions(reference);
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscription_transactions' AND policyname = 'Allow public access to subscription_transactions') THEN
    CREATE POLICY "Allow public access to subscription_transactions" ON public.subscription_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


