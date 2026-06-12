-- ═══════════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — fix_database.sql
-- Lance ce script SI tu as des problèmes de connexion
-- Supabase → SQL Editor → Colle tout → Run
-- ═══════════════════════════════════════════════════════

-- ── 1. Colonnes manquantes dans users ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked      boolean    DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period  text       DEFAULT 'monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_open       boolean    DEFAULT true;

-- ── 2. Supprimer les contraintes de téléphone qui bloquent ──
-- (au cas où elles empêchent l'inscription)
ALTER TABLE users DROP CONSTRAINT IF EXISTS phone_senegal;
ALTER TABLE users DROP CONSTRAINT IF EXISTS phone_format;
ALTER TABLE users DROP CONSTRAINT IF EXISTS first_name_not_empty;
ALTER TABLE users DROP CONSTRAINT IF EXISTS last_name_not_empty;
ALTER TABLE users DROP CONSTRAINT IF EXISTS password_length;

-- ── 3. Remettre le téléphone comme optionnel ──
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- ── 4. Colonnes manquantes dans orders ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE orders ALTER COLUMN buyer_phone DROP NOT NULL;

-- ── 5. Colonnes manquantes dans commissions ──
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'monthly';

-- ── 6. Table admins ──
CREATE TABLE IF NOT EXISTS admins (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  password   text NOT NULL,
  name       text NOT NULL DEFAULT 'Admin',
  created_at timestamptz DEFAULT now()
);

-- ── 7. Réinitialiser le compte admin ──
-- Mot de passe : admin2024 → hash btoa = YWRtaW4yMDI0
DELETE FROM admins WHERE email = 'admin@glar.com';
INSERT INTO admins (email, password, name)
VALUES ('admin@glar.com', 'YWRtaW4yMDI0', 'Nel''si Admin');

-- ── 8. Tables chat (si pas encore créées) ──
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

-- ── 9. S'assurer que les politiques RLS sont ouvertes ──
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','products','orders','reviews','admins','commissions','messages','seller_connections']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- ── 10. Vérification finale ──
SELECT
  'users'    AS table_name, count(*) AS rows FROM users    UNION ALL
SELECT 'admins',   count(*) FROM admins   UNION ALL
SELECT 'products', count(*) FROM products UNION ALL
SELECT 'orders',   count(*) FROM orders   UNION ALL
SELECT 'reviews',  count(*) FROM reviews;
