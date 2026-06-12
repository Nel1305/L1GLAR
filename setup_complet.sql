-- ═══════════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — setup_complet.sql
-- Création COMPLÈTE de la base de données (projet neuf)
--
-- Utilise ce script si Supabase te dit "relation ... does not exist"
-- → c'est le signe que les tables n'ont jamais été créées
-- sur ce projet ("N-Market").
--
-- Supabase → SQL Editor → Colle TOUT ce fichier → Run
-- Ce script est idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) :
-- tu peux le relancer sans rien casser.
-- ═══════════════════════════════════════════════════════


-- ════════════════════════════════════
-- 1. UTILISATEURS (vendeurs)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name      text NOT NULL,
  last_name       text,
  name            text NOT NULL,
  email           text UNIQUE NOT NULL,
  phone           text,
  password        text NOT NULL,
  bio             text,
  shop_open       boolean DEFAULT true,
  is_blocked      boolean DEFAULT false,
  blocked_reason  text,
  billing_period  text DEFAULT 'monthly',
  created_at      timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 2. CATÉGORIES / « CLASSES » DU CATALOGUE (gérées par le Super Admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text UNIQUE NOT NULL,
  label      text NOT NULL,
  emoji      text DEFAULT '🛍️',
  color      text DEFAULT '#5b8cff',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO categories (slug, label, emoji, color, sort_order)
VALUES
  ('food',  'Nourriture', '🥞', '#3de8a0', 1),
  ('drink', 'Boissons',   '🥤', '#5b8cff', 2),
  ('other', 'Autres',     '✨', '#9b6dff', 3)
ON CONFLICT (slug) DO NOTHING;


-- ════════════════════════════════════
-- 3. PRODUITS
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS products (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_name text NOT NULL,
  name        text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'other',
  price       numeric NOT NULL DEFAULT 0,
  emoji       text DEFAULT '🛍️',
  photo_url   text,
  rating      numeric DEFAULT 0,
  votes       integer DEFAULT 0,
  available   boolean DEFAULT true,
  track_stock boolean DEFAULT false,
  stock       integer DEFAULT 0,
  show_stock  boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 4. COMMANDES — avec date/heure et adresse de livraison
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS orders (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id        bigint REFERENCES users(id) ON DELETE SET NULL,
  seller_name      text,
  product_id       bigint REFERENCES products(id) ON DELETE SET NULL,
  product_name     text NOT NULL,
  buyer_name       text NOT NULL,
  buyer_email      text,
  buyer_phone      text NOT NULL,
  qty              integer NOT NULL DEFAULT 1,
  total            numeric NOT NULL DEFAULT 0,
  notes            text,
  status           text NOT NULL DEFAULT 'new',  -- 'new' | 'done' | 'cancel'

  -- Date / heure de livraison souhaitées
  delivery_date    date,
  delivery_time    text,

  -- Lieu de livraison
  delivery_type    text DEFAULT 'campus',        -- 'campus' | 'external'
  delivery_address text,                         -- adresse fournie par le client si 'external'

  created_at       timestamptz DEFAULT now()
);

COMMENT ON COLUMN orders.delivery_type    IS 'campus = livraison sur le campus / external = adresse fournie par le client';
COMMENT ON COLUMN orders.delivery_date    IS 'Date de livraison souhaitée par le client';
COMMENT ON COLUMN orders.delivery_time    IS 'Heure de livraison souhaitée par le client (format HH:MM)';
COMMENT ON COLUMN orders.delivery_address IS 'Adresse complète si delivery_type = external';


-- ════════════════════════════════════
-- 5. AVIS / NOTES
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS reviews (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id     bigint REFERENCES users(id) ON DELETE CASCADE,
  product_id    bigint REFERENCES products(id) ON DELETE CASCADE,
  product_name  text,
  seller_name   text,
  reviewer_name text NOT NULL,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text          text,
  created_at    timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 6. COMMISSIONS (facturation des vendeurs)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS commissions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id    bigint REFERENCES users(id) ON DELETE CASCADE,
  seller_name  text NOT NULL,
  period_type  text DEFAULT 'monthly',
  period_label text NOT NULL,
  period_start date,
  period_end   date,
  due_date     date,
  revenue      numeric DEFAULT 0,
  rate         numeric DEFAULT 0,
  amount_due   numeric DEFAULT 0,
  amount_paid  numeric DEFAULT 0,
  status       text DEFAULT 'pending',  -- 'pending' | 'partial' | 'paid'
  note         text,
  paid_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 7. ADMINS (Super Admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS admins (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  password   text NOT NULL,
  name       text NOT NULL DEFAULT 'Admin',
  created_at timestamptz DEFAULT now()
);

-- Compte Super Admin par défaut
-- Email : admin@glar.com   /   Mot de passe : admin2024
INSERT INTO admins (email, password, name)
VALUES ('admin@glar.com', 'YWRtaW4yMDI0', 'Nel''si Admin')
ON CONFLICT (email) DO NOTHING;


-- ════════════════════════════════════
-- 8. CHAT (messagerie entre vendeurs / admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS messages (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id    bigint NOT NULL,
  sender_name  text NOT NULL,
  sender_role  text NOT NULL CHECK (sender_role IN ('seller','admin')),
  receiver_id  bigint,
  content      text NOT NULL,
  is_general   boolean DEFAULT false,
  read_by      jsonb DEFAULT '[]',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_connections (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_a_id   bigint,
  seller_a_name text NOT NULL,
  seller_b_id   bigint,
  seller_b_name text NOT NULL,
  message_count integer DEFAULT 1,
  last_contact  timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 9. SÉCURITÉ (RLS) — accès ouvert via la clé "anon"
--    (l'app gère l'authentification elle-même côté JS)
-- ════════════════════════════════════
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','products','orders','reviews','admins','commissions','messages','seller_connections','categories']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- ════════════════════════════════════
-- 10. VÉRIFICATION FINALE
-- ════════════════════════════════════
SELECT 'users'       AS table_name, count(*) AS rows FROM users       UNION ALL
SELECT 'categories',  count(*) FROM categories  UNION ALL
SELECT 'products',    count(*) FROM products    UNION ALL
SELECT 'orders',      count(*) FROM orders      UNION ALL
SELECT 'reviews',     count(*) FROM reviews     UNION ALL
SELECT 'commissions', count(*) FROM commissions UNION ALL
SELECT 'admins',      count(*) FROM admins      UNION ALL
SELECT 'messages',    count(*) FROM messages    UNION ALL
SELECT 'seller_connections', count(*) FROM seller_connections;
