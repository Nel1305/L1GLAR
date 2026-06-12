-- ═══════════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — update_v3.sql
-- Nouvelles fonctionnalités :
--   1. Gestion des stocks par produit (afficher ou non, rupture de stock)
--   2. Email de l'acheteur devient optionnel (le téléphone suffit)
--      → le vendeur garde son email pour recevoir factures & notifications
--
-- Supabase → SQL Editor → Coller tout → Run
-- (Idempotent : tu peux le relancer sans danger)
-- ═══════════════════════════════════════════════════════

-- ════════════════════════════════════
-- 1. PRODUITS — gestion du stock
-- ════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock boolean DEFAULT false; -- le vendeur active/désactive le suivi du stock
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock       integer DEFAULT 0;     -- quantité disponible
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_stock  boolean DEFAULT true;  -- afficher la quantité aux clients (sinon juste "en stock"/"rupture")

COMMENT ON COLUMN products.track_stock IS 'true = le stock est géré pour ce produit (sinon stock illimité)';
COMMENT ON COLUMN products.stock       IS 'Quantité restante (utilisée seulement si track_stock = true)';
COMMENT ON COLUMN products.show_stock  IS 'true = le nombre exact est visible par les clients, false = seulement "en stock" / "rupture de stock"';


-- ════════════════════════════════════
-- 2. COMMANDES — email acheteur optionnel
-- ════════════════════════════════════
ALTER TABLE orders ALTER COLUMN buyer_email DROP NOT NULL;
COMMENT ON COLUMN orders.buyer_email IS 'Optionnel — le téléphone (buyer_phone) est la coordonnée principale du client';


-- ════════════════════════════════════
-- 3. Vérification finale
-- ════════════════════════════════════
SELECT 'products (avec suivi de stock)' AS info, count(*) AS rows FROM products WHERE track_stock = true
UNION ALL
SELECT 'orders (sans email)', count(*) FROM orders WHERE buyer_email IS NULL OR buyer_email = '';
