/* ════════════════════════════════════════════════════════════════
   N MARKET — secure_06_verification.sql
   Vérification des comptes vendeurs (pièce d'identité + visage) → badge « Vérifié »

   • Compte NON vérifié : 5 produits maximum (réglable) et un délai de 3 jours (réglable)
   • Passé le délai sans dossier envoyé : le compte est DÉSACTIVÉ
     (produits masqués du catalogue, plus aucune écriture, commandes refusées)
     → le vendeur peut toujours se connecter pour envoyer son dossier
   • Dossier envoyé AVANT la fin du délai : le compte reste actif pendant l'examen (24-48 h)
   • Le Super Admin valide ou refuse ; la validation donne le badge
   • Les images sont dans un bucket Storage PRIVÉ « kyc » : le vendeur ne lit/écrit que son dossier,
     seul le Super Admin lit tout. Rien n'est jamais public.

   À exécuter APRÈS secure_01, secure_02, secure_04 et secure_05. Ré-exécutable.
════════════════════════════════════════════════════════════════ */

/* ── 1. Réglages (modifiables dans la table settings, par le Super Admin) ── */
INSERT INTO settings (key, value) VALUES ('verif_trial_days', '3'), ('verif_max_products', '5')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verif_days() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest(1, least(30, coalesce((SELECT nullif(value, '')::int FROM settings WHERE key = 'verif_trial_days'), 3)));
$$;
CREATE OR REPLACE FUNCTION public.verif_max_products() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest(1, least(1000, coalesce((SELECT nullif(value, '')::int FROM settings WHERE key = 'verif_max_products'), 5)));
$$;

/* ── 2. Colonnes sur users ── */
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified            boolean     NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at         timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status text        NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verif_deadline      timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verif_submitted_at  timestamptz;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_verification_status_chk CHECK (verification_status IN ('none','pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vendeurs existants : le délai démarre MAINTENANT (ils ne sont pas pénalisés rétroactivement)
UPDATE users SET verif_deadline = now() + make_interval(days => verif_days()) WHERE verif_deadline IS NULL AND NOT verified;

-- nouveaux vendeurs : délai posé côté serveur à l'inscription
CREATE OR REPLACE FUNCTION public.trg_users_verif_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.verified := false; NEW.verification_status := 'none';
  NEW.verif_deadline := now() + make_interval(days => verif_days());
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_users_verif_deadline ON users;
CREATE TRIGGER t_users_verif_deadline BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION public.trg_users_verif_deadline();

-- le vendeur LIT ces colonnes mais ne peut jamais les modifier (aucun GRANT UPDATE dessus)
GRANT SELECT (verified, verified_at, verification_status, verif_deadline, verif_submitted_at) ON users TO authenticated;

/* ── 3. Compte expiré ? (non vérifié, délai dépassé, et pas de dossier en examen déposé à temps) ── */
CREATE OR REPLACE FUNCTION public.seller_expired(p_user_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT NOT u.verified
       AND u.verif_deadline IS NOT NULL AND now() > u.verif_deadline
       AND NOT (u.verification_status = 'pending' AND u.verif_submitted_at IS NOT NULL AND u.verif_submitted_at <= u.verif_deadline)
      FROM users u WHERE u.id = p_user_id
  ), false);
$$;

-- toute écriture vendeur passe par my_active_seller_id() : un compte expiré ne peut plus écrire
CREATE OR REPLACE FUNCTION public.my_active_seller_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND NOT coalesce(is_blocked, false) AND NOT seller_expired(id);
$$;

-- le catalogue public masque les produits des comptes expirés
DROP POLICY IF EXISTS products_read ON products;
CREATE POLICY products_read ON products FOR SELECT
  USING ((available AND NOT seller_expired(seller_id)) OR seller_id = my_user_id() OR is_admin());

-- compte non vérifié : nombre de produits limité
CREATE OR REPLACE FUNCTION public.trg_products_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max int := verif_max_products();
BEGIN
  IF NOT coalesce((SELECT verified FROM users WHERE id = NEW.seller_id), false)
     AND (SELECT count(*) FROM products WHERE seller_id = NEW.seller_id) >= v_max THEN
    RAISE EXCEPTION 'Compte non vérifié : % produits maximum. Fais vérifier ton compte pour en ajouter davantage.', v_max;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_products_limit ON products;
CREATE TRIGGER t_products_limit BEFORE INSERT ON products
FOR EACH ROW EXECUTE FUNCTION public.trg_products_limit();

-- une commande ne peut plus viser un vendeur désactivé (panier resté ouvert, etc.)
CREATE OR REPLACE FUNCTION public.trg_orders_seller_active() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.seller_id IS NOT NULL AND seller_expired(NEW.seller_id) THEN
    RAISE EXCEPTION 'Ce vendeur est temporairement indisponible.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_orders_seller_active ON orders;
CREATE TRIGGER t_orders_seller_active BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_seller_active();

-- vitrine publique : le badge est visible de tous (aucune donnée de contact)
CREATE OR REPLACE VIEW public.public_sellers WITH (security_invoker = false) AS
  SELECT id, name, bio, shop_open, filiere, verified FROM users WHERE NOT coalesce(is_blocked, false);
GRANT SELECT ON public.public_sellers TO anon, authenticated;

/* ── 4. Dossiers de vérification ── */
CREATE TABLE IF NOT EXISTS seller_verifications (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_type       text   NOT NULL CHECK (id_type IN ('cni','passeport','carte_etudiant','permis')),
  id_doc_path   text   NOT NULL,
  selfie_path   text   NOT NULL,
  status        text   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note    text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid
);
CREATE INDEX IF NOT EXISTS idx_sv_user   ON seller_verifications (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sv_status ON seller_verifications (status, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sv_one_pending ON seller_verifications (user_id) WHERE status = 'pending';

ALTER TABLE seller_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seller_verifications FROM anon, authenticated;
GRANT SELECT ON seller_verifications TO authenticated;
DROP POLICY IF EXISTS sv_select ON seller_verifications;
CREATE POLICY sv_select ON seller_verifications FOR SELECT TO authenticated
  USING (user_id = my_user_id() OR is_admin());
REVOKE ALL ON SEQUENCE seller_verifications_id_seq FROM anon, authenticated;

/* ── 5. Stockage privé des images ── */
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kyc', 'kyc', false, 6000000, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 6000000,
                               allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS kyc_insert ON storage.objects;
DROP POLICY IF EXISTS kyc_select ON storage.objects;
DROP POLICY IF EXISTS kyc_delete ON storage.objects;
-- un vendeur dépose UNIQUEMENT dans son dossier <auth.uid()>/…
CREATE POLICY kyc_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc' AND (storage.foldername(name))[1] = auth.uid()::text);
-- lecture : son dossier, ou Super Admin
CREATE POLICY kyc_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc' AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin()));
-- suppression : Super Admin seulement (effacement des pièces après validation)
CREATE POLICY kyc_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kyc' AND is_admin());

/* ── 6. Actions ── */
-- Vendeur : envoie son dossier (les images sont déjà dans son dossier Storage)
CREATE OR REPLACE FUNCTION public.fn_submit_verification(p_id_type text, p_id_path text, p_selfie_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid bigint := my_user_id(); v_auth text := auth.uid()::text; v_name text; v_ver boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Connecte-toi d''abord.'); END IF;
  SELECT name, verified INTO v_name, v_ver FROM users WHERE id = v_uid;
  IF v_ver THEN RETURN jsonb_build_object('ok', false, 'error', 'Ton compte est déjà vérifié.'); END IF;
  IF p_id_type NOT IN ('cni','passeport','carte_etudiant','permis') THEN RETURN jsonb_build_object('ok', false, 'error', 'Type de pièce invalide.'); END IF;
  IF p_id_path IS NULL OR p_selfie_path IS NULL
     OR p_id_path NOT LIKE v_auth || '/%' OR p_selfie_path NOT LIKE v_auth || '/%'
     OR p_id_path LIKE '%..%' OR p_selfie_path LIKE '%..%' OR length(p_id_path) > 200 OR length(p_selfie_path) > 200 OR p_id_path = p_selfie_path THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fichiers invalides.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc' AND name = p_id_path)
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc' AND name = p_selfie_path) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Les images n''ont pas été reçues. Réessaie.');
  END IF;
  IF EXISTS (SELECT 1 FROM seller_verifications WHERE user_id = v_uid AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ton dossier est déjà en cours d''examen.');
  END IF;
  INSERT INTO seller_verifications (user_id, id_type, id_doc_path, selfie_path) VALUES (v_uid, p_id_type, p_id_path, p_selfie_path);
  UPDATE users SET verification_status = 'pending', verif_submitted_at = now() WHERE id = v_uid;
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('admin', NULL, 'verification', 'Nouveau dossier de vérification', v_name || ' a envoyé sa pièce d''identité et son selfie.', v_uid);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Super Admin : valide ou refuse
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_id bigint, p_approve boolean, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row seller_verifications; v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  SELECT * INTO v_row FROM seller_verifications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dossier introuvable.'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Dossier déjà traité.'; END IF;
  IF NOT p_approve AND v_note IS NULL THEN RAISE EXCEPTION 'Indique le motif du refus.'; END IF;

  UPDATE seller_verifications SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         admin_note = v_note, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = p_id;
  IF p_approve THEN
    UPDATE users SET verified = true, verified_at = now(), verification_status = 'approved' WHERE id = v_row.user_id;
    INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
    VALUES ('seller', v_row.user_id, 'verification', 'Compte vérifié ✓', 'Ton compte est vérifié : le badge s''affiche sur ta boutique et la limite de produits est levée.', p_id);
  ELSE
    UPDATE users SET verification_status = 'rejected', verif_submitted_at = NULL,
           verif_deadline = now() + make_interval(days => verif_days()) WHERE id = v_row.user_id;
    INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
    VALUES ('seller', v_row.user_id, 'verification', 'Vérification refusée', 'Motif : ' || v_note || '. Tu peux renvoyer un dossier.', p_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'id_doc_path', v_row.id_doc_path, 'selfie_path', v_row.selfie_path);
END; $$;

-- Super Admin : retire le badge (fraude, usurpation…)
CREATE OR REPLACE FUNCTION public.admin_revoke_verification(p_user_id bigint, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  UPDATE users SET verified = false, verified_at = NULL, verification_status = 'none', verif_submitted_at = NULL,
         verif_deadline = now() + make_interval(days => verif_days()) WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendeur introuvable.'; END IF;
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('seller', p_user_id, 'verification', 'Badge retiré', coalesce('Motif : ' || left(p_reason, 300), 'Ton badge a été retiré. Renvoie un dossier pour le retrouver.'), p_user_id);
  RETURN jsonb_build_object('ok', true);
END; $$;

/* ── 7. Droits d'exécution (liste blanche) ── */
REVOKE ALL ON FUNCTION public.verif_days(), public.verif_max_products(), public.seller_expired(bigint),
  public.trg_users_verif_deadline(), public.trg_products_limit(), public.trg_orders_seller_active(),
  public.fn_submit_verification(text, text, text), public.admin_review_verification(bigint, boolean, text),
  public.admin_revoke_verification(bigint, text) FROM PUBLIC, anon, authenticated;
-- appelée par les politiques RLS (anon lit le catalogue) :
GRANT EXECUTE ON FUNCTION public.seller_expired(bigint), public.my_active_seller_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_verification(text, text, text),
  public.admin_review_verification(bigint, boolean, text), public.admin_revoke_verification(bigint, text) TO authenticated;

/* Vérification : doit lister seller_verifications avec sv_select uniquement */
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('seller_verifications') OR (schemaname='storage' AND policyname LIKE 'kyc_%');
