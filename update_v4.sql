-- ═══════════════════════════════════════════════════════
-- N MARKET — update_v4.sql
-- Nouvelles fonctionnalités :
--   1. Réglages plateforme persistants (taux de commission)
--   2. Filières (Super Admin) + filière du vendeur
--   3. Livraison sur le campus : classe & filière du destinataire
--   4. Panier (plusieurs produits dans une même commande groupée)
--   5. Retours / litiges sur commande
--
-- Supabase → SQL Editor → Coller tout → Run (idempotent)
-- ═══════════════════════════════════════════════════════

-- ════════════════════════════════════
-- 1. RÉGLAGES PLATEFORME (clé/valeur)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text
);
INSERT INTO settings (key, value) VALUES ('commission_rate', '5')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════
-- 2. FILIÈRES (gérées par le Super Admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS filieres (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text UNIQUE NOT NULL,
  label      text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
INSERT INTO filieres (slug, label, sort_order) VALUES
  ('l1-glar', 'L1 GLAR', 1),
  ('l2-glar', 'L2 GLAR', 2),
  ('l3-glar', 'L3 GLAR', 3)
ON CONFLICT (slug) DO NOTHING;

-- Le vendeur indique sa filière (affichée sur ses produits)
ALTER TABLE users ADD COLUMN IF NOT EXISTS filiere text;


-- ════════════════════════════════════
-- 3. LIVRAISON CAMPUS — classe & filière du destinataire
--    + PANIER — regrouper plusieurs lignes de commande
-- ════════════════════════════════════
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_classe  text; -- ex: "L1", "Terminale S2"
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_filiere text; -- ex: "L1 GLAR"
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_group   text; -- identifiant commun pour les commandes passées en un seul panier

COMMENT ON COLUMN orders.buyer_classe  IS 'Classe du destinataire (si livraison sur le campus)';
COMMENT ON COLUMN orders.buyer_filiere IS 'Filière du destinataire (si livraison sur le campus)';
COMMENT ON COLUMN orders.order_group   IS 'Identifiant partagé entre les commandes issues du même panier';


-- ════════════════════════════════════
-- 4. RETOURS / LITIGES
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS returns (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id        bigint REFERENCES orders(id) ON DELETE CASCADE,
  seller_id       bigint REFERENCES users(id) ON DELETE CASCADE,
  buyer_name      text,
  buyer_phone     text,
  product_name    text,
  reason          text NOT NULL,
  status          text DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  seller_response text,
  created_at      timestamptz DEFAULT now(),
  responded_at    timestamptz
);


-- ════════════════════════════════════
-- 5. RLS
-- ════════════════════════════════════
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['settings','filieres','returns']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- ════════════════════════════════════
-- 6. Vérification finale
-- ════════════════════════════════════
SELECT 'settings'  AS table_name, count(*) AS rows FROM settings  UNION ALL
SELECT 'filieres',  count(*) FROM filieres UNION ALL
SELECT 'returns',   count(*) FROM returns  UNION ALL
SELECT 'users (avec filière)', count(*) FROM users WHERE filiere IS NOT NULL;
