-- ═══════════════════════════════════════════════════════
-- N MARKET — update_v6.sql
-- Nouvelles fonctionnalités :
--   1. Modifications/notes spécifiques par produit (commande)
--   2. Signalement des vendeurs par les clients + suppression
--      de compte après seuil de signalements validés
--   3. Bannières publicitaires (Super Admin)
--   4. Tri du catalogue par note (mise en avant)
--
-- Supabase → SQL Editor → Coller tout → Run (idempotent)
-- ═══════════════════════════════════════════════════════

-- ════════════════════════════════════
-- 1. COMMANDES — note spécifique à la ligne (déjà "notes" existe au global,
--    on garde "notes" pour compat, et on ajoute item_note pour le détail produit)
-- ════════════════════════════════════
ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_note text;
COMMENT ON COLUMN orders.item_note IS 'Modification/précision spécifique à CE produit (vs notes = note globale du panier, conservée pour compat)';


-- ════════════════════════════════════
-- 2. SIGNALEMENTS DE VENDEURS
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS seller_reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id    bigint REFERENCES users(id) ON DELETE CASCADE,
  seller_name  text NOT NULL,
  reporter_name  text,
  reporter_phone text,
  reason       text NOT NULL,
  status       text DEFAULT 'pending',  -- 'pending' | 'validated' | 'dismissed'
  created_at   timestamptz DEFAULT now()
);
COMMENT ON COLUMN seller_reports.status IS 'pending = en attente, validated = signalement jugé fondé par le Super Admin, dismissed = rejeté';

-- Seuil de signalements validés à partir duquel le Super Admin
-- est invité à supprimer le compte (réglage modifiable)
INSERT INTO settings (key, value) VALUES ('report_threshold', '3')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════
-- 3. BANNIÈRES PUBLICITAIRES
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS ad_banners (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text NOT NULL,
  subtitle    text,
  image_url   text,
  link_url    text,
  bg_color    text DEFAULT '#1a7a4a',
  active      boolean DEFAULT true,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);


-- ════════════════════════════════════
-- 4. RLS
-- ════════════════════════════════════
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['seller_reports','ad_banners']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- ════════════════════════════════════
-- 5. Vérification finale
-- ════════════════════════════════════
SELECT 'seller_reports' AS table_name, count(*) AS rows FROM seller_reports UNION ALL
SELECT 'ad_banners', count(*) FROM ad_banners UNION ALL
SELECT 'orders (avec item_note)', count(*) FROM orders WHERE item_note IS NOT NULL;
