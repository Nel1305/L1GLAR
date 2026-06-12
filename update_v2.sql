-- ═══════════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — update_v2.sql
-- Nouvelles fonctionnalités :
--   1. Date & heure de livraison souhaitées pour les commandes
--   2. Adresse de livraison saisie par le client (hors école)
--   3. Catalogue de "classes" (catégories) gérable par le Super Admin
--
-- Supabase → SQL Editor → Coller tout → Run
-- (Ce script est idempotent : tu peux le relancer sans danger)
-- ═══════════════════════════════════════════════════════

-- ════════════════════════════════════
-- 1. COMMANDES — date / heure / livraison
-- ════════════════════════════════════
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date    date;          -- date de livraison souhaitée
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time    text;          -- heure souhaitée (ex: "12:30")
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type    text DEFAULT 'campus'; -- 'campus' | 'external'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;         -- adresse si livraison hors école

-- Petite vérification de cohérence (pas bloquant si NULL)
COMMENT ON COLUMN orders.delivery_type    IS 'campus = livraison sur le campus / external = adresse fournie par le client';
COMMENT ON COLUMN orders.delivery_date    IS 'Date de livraison souhaitée par le client';
COMMENT ON COLUMN orders.delivery_time    IS 'Heure de livraison souhaitée par le client (format HH:MM)';
COMMENT ON COLUMN orders.delivery_address IS 'Adresse complète si delivery_type = external';


-- ════════════════════════════════════
-- 2. CATALOGUE — classes / catégories (gérées par le Super Admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text UNIQUE NOT NULL,        -- identifiant technique, ex: 'food', 'fournitures'
  label      text NOT NULL,               -- nom affiché, ex: 'Nourriture'
  emoji      text DEFAULT '🛍️',
  color      text DEFAULT '#5b8cff',      -- couleur du badge (hex)
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Catégories de base (reprend celles déjà utilisées dans le code)
INSERT INTO categories (slug, label, emoji, color, sort_order)
VALUES
  ('food',  'Nourriture', '🥞', '#3de8a0', 1),
  ('drink', 'Boissons',   '🥤', '#5b8cff', 2),
  ('other', 'Autres',     '✨', '#9b6dff', 3)
ON CONFLICT (slug) DO NOTHING;


-- ════════════════════════════════════
-- 3. RLS — autoriser l'accès public (lecture/écriture) comme les autres tables
-- ════════════════════════════════════
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_all" ON categories;
CREATE POLICY "public_all" ON categories FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════
-- 4. Vérification finale
-- ════════════════════════════════════
SELECT 'categories' AS table_name, count(*) AS rows FROM categories
UNION ALL
SELECT 'orders (avec delivery_date)', count(*) FROM orders WHERE delivery_date IS NOT NULL;
