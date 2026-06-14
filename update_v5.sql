-- ═══════════════════════════════════════════════════════
-- N MARKET — update_v5.sql
-- Nouvelle fonctionnalité : PUBLICITÉ / PRODUITS SPONSORISÉS
--   - Les vendeurs peuvent demander à mettre un produit "en avant"
--     (boost payant) pour une durée donnée.
--   - Le Super Admin fixe les tarifs, valide/active/refuse les demandes.
--   - Les produits actifs et non expirés sont mis en avant
--     (section "Sponsorisé" + badge) sur la marketplace.
--
-- Supabase → SQL Editor → Coller tout → Run (idempotent)
-- ═══════════════════════════════════════════════════════

-- ════════════════════════════════════
-- 1. TARIFS DE PROMOTION (gérés par le Super Admin)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS promo_plans (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text NOT NULL,        -- ex: "Mise en avant 3 jours"
  duration_days integer NOT NULL,   -- durée du boost en jours
  price       numeric NOT NULL,     -- prix en FCFA
  sort_order  integer DEFAULT 0,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO promo_plans (label, duration_days, price, sort_order) VALUES
  ('Mise en avant — 3 jours',  3,  1000, 1),
  ('Mise en avant — 7 jours',  7,  2000, 2),
  ('Mise en avant — 15 jours', 15, 3500, 3)
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════
-- 2. DEMANDES DE PROMOTION (par produit)
-- ════════════════════════════════════
CREATE TABLE IF NOT EXISTS promotions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    bigint REFERENCES products(id) ON DELETE CASCADE,
  seller_id     bigint REFERENCES users(id) ON DELETE CASCADE,
  seller_name   text NOT NULL,
  product_name  text NOT NULL,
  plan_id       bigint REFERENCES promo_plans(id) ON DELETE SET NULL,
  plan_label    text,
  duration_days integer NOT NULL,
  price         numeric NOT NULL,
  status        text DEFAULT 'pending',  -- 'pending' | 'active' | 'rejected' | 'expired'
  starts_at     timestamptz,
  ends_at       timestamptz,
  admin_note    text,
  created_at    timestamptz DEFAULT now()
);

COMMENT ON COLUMN promotions.status IS 'pending = en attente de validation/paiement, active = mis en avant actuellement, rejected = refusé, expired = terminé';


-- ════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['promo_plans','promotions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- ════════════════════════════════════
-- 4. Vérification finale
-- ════════════════════════════════════
SELECT 'promo_plans' AS table_name, count(*) AS rows FROM promo_plans UNION ALL
SELECT 'promotions',  count(*) FROM promotions;
