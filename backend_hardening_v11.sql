-- ───────────────────────────────────────────────────────────────
-- v11 — Attributs produit par catégorie (app iOS) + structure Premium
-- ───────────────────────────────────────────────────────────────
-- Exécuter ce fichier (ou le backend_hardening_all.sql mis à jour) dans
-- Supabase > SQL Editor. Toutes les opérations sont additives et
-- idempotentes (IF NOT EXISTS) — aucun risque sur les données existantes.

-- Champs libres par catégorie (taille, état, marque, stockage…), stockés en
-- JSONB plat (clé -> valeur texte) pour ne plus jamais avoir besoin d'une
-- migration de colonne quand une nouvelle caractéristique est ajoutée.
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes jsonb;
COMMENT ON COLUMN products.attributes IS 'Caractéristiques libres par catégorie (taille, état, marque, stockage…), définies côté app/site — clé/valeur texte en JSON.';

-- Structure "abonnement Premium" — pas de facturation réelle pour l'instant,
-- juste de quoi activer/désactiver manuellement et stocker la
-- personnalisation (thème/couleurs) une fois activée.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium        boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_theme      jsonb;
COMMENT ON COLUMN users.is_premium         IS 'Abonnement Premium actif (activation manuelle pour l''instant — pas de paiement intégré).';
COMMENT ON COLUMN users.premium_expires_at IS 'Date de fin de l''abonnement Premium en cours, si applicable.';
COMMENT ON COLUMN users.premium_theme      IS 'Personnalisation de l''interface vendeur réservée aux comptes Premium (couleurs, accent...) — JSON libre.';
