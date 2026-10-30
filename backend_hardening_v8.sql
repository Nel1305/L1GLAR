/* ═══════════════════════════════════════════════════════════════
   N MARKET — backend_hardening_v8.sql
   (à appliquer APRÈS backend_hardening_v7.sql)

   Ajoute :
   1. Une clé d'accès rapide par vendeur (connexion sans mot de passe)
   2. Un centre de notifications in-app (commandes, retours,
      promotions/soumissions d'articles, signalements, avis),
      alimenté par des triggers Postgres pour rester cohérent
      quel que soit le client (site web ou app iOS).
   Idempotent : peut être exécuté plusieurs fois sans danger.
═══════════════════════════════════════════════════════════════ */

/* ── 1. CLÉ D'ACCÈS VENDEUR ── */
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_key ON users(access_key) WHERE access_key IS NOT NULL;

CREATE OR REPLACE FUNCTION gen_access_key() RETURNS text
LANGUAGE sql AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

/* Donne une clé à tous les vendeurs qui n'en ont pas encore */
UPDATE users SET access_key = gen_access_key() WHERE access_key IS NULL;

CREATE OR REPLACE FUNCTION fn_login_with_access_key(p_key text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN json_build_object('error', 'Clé d''accès requise.');
  END IF;
  SELECT * INTO v_user FROM users WHERE access_key = upper(trim(p_key));
  IF NOT FOUND THEN RETURN json_build_object('error', 'Clé d''accès invalide.'); END IF;
  IF v_user.is_blocked THEN
    RETURN json_build_object('error', 'Ton compte est actuellement suspendu. Contacte l''administrateur.');
  END IF;
  RETURN json_build_object('user', to_jsonb(v_user) - 'password' - 'password_hash');
END; $$;

CREATE OR REPLACE FUNCTION fn_regenerate_access_key(p_user_id bigint) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  v_key := gen_access_key();
  UPDATE users SET access_key = v_key WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Utilisateur introuvable.'); END IF;
  RETURN json_build_object('access_key', v_key);
END; $$;

/* Ré-applique fn_register_user pour qu'un nouveau vendeur reçoive directement
   une clé d'accès (plus besoin d'appeler fn_regenerate_access_key après coup). */
CREATE OR REPLACE FUNCTION fn_register_user(
  p_first text, p_last text, p_email text, p_phone text, p_pass text, p_filiere text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user users%ROWTYPE; v_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email)) THEN
    RETURN json_build_object('error', 'Cet email est déjà utilisé.');
  END IF;
  v_name := p_first || CASE WHEN p_last IS NOT NULL AND p_last <> '' THEN ' ' || upper(left(p_last,1)) || '.' ELSE '' END;
  INSERT INTO users (first_name, last_name, name, email, phone, password, password_hash, filiere, access_key)
  VALUES (p_first, p_last, v_name, p_email, p_phone, '', crypt(p_pass, gen_salt('bf', 10)), p_filiere, gen_access_key())
  RETURNING * INTO v_user;
  RETURN json_build_object('user', to_jsonb(v_user) - 'password' - 'password_hash');
END; $$;
GRANT EXECUTE ON FUNCTION fn_register_user(text,text,text,text,text,text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_login_with_access_key(text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_regenerate_access_key(bigint) TO anon, authenticated;
-- access_key est déjà inclus dans le GRANT SELECT de v7 (colonne ajoutée a posteriori) :
GRANT SELECT (access_key) ON users TO anon, authenticated;

/* ── 2. CENTRE DE NOTIFICATIONS ── */
CREATE TABLE IF NOT EXISTS notifications (
  id            bigserial PRIMARY KEY,
  recipient_type text NOT NULL CHECK (recipient_type IN ('seller','admin','buyer')),
  recipient_id  bigint,              -- NULL = diffusé à tous les destinataires de ce type (ex: tous les admins)
  type          text NOT NULL,       -- order_new, order_status, return_new, return_status,
                                      -- promotion_new, promotion_status, seller_report, review_new
  title         text NOT NULL,
  body          text,
  related_id    bigint,              -- id de la commande / retour / promotion / etc. concernée
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created    ON notifications(created_at DESC);

REVOKE ALL ON notifications FROM anon, authenticated;
GRANT SELECT ON notifications TO anon, authenticated;
GRANT UPDATE (is_read) ON notifications TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO anon, authenticated;

/* ── 2a. Trigger : nouvelle commande → notifie le vendeur ── */
CREATE OR REPLACE FUNCTION trg_notify_order_new() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('seller', NEW.seller_id, 'order_new', 'Nouvelle commande',
          NEW.buyer_name || ' a commandé ' || NEW.product_name, NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_order_new ON orders;
CREATE TRIGGER t_notify_order_new AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION trg_notify_order_new();

/* ── 2b. Trigger : changement de statut de commande → notifie l'acheteur (si email connu, on ne stocke pas de compte acheteur ici, donc on cible seller aussi pour historique) ── */
CREATE OR REPLACE FUNCTION trg_notify_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
    VALUES ('seller', NEW.seller_id, 'order_status', 'Commande mise à jour',
            'Commande #' || NEW.id || ' → ' || NEW.status, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_order_status ON orders;
CREATE TRIGGER t_notify_order_status AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION trg_notify_order_status();

/* ── 2c. Trigger : nouveau retour/litige → notifie le vendeur ── */
CREATE OR REPLACE FUNCTION trg_notify_return_new() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('seller', NEW.seller_id, 'return_new', 'Nouveau retour / litige',
          NEW.buyer_name || ' — ' || NEW.product_name, NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_return_new ON returns;
CREATE TRIGGER t_notify_return_new AFTER INSERT ON returns
FOR EACH ROW EXECUTE FUNCTION trg_notify_return_new();

/* ── 2d. Trigger : soumission d'une promotion (« soumission d'article ») → notifie les admins ── */
CREATE OR REPLACE FUNCTION trg_notify_promotion_new() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('admin', NULL, 'promotion_new', 'Nouvelle demande de sponsoring',
          NEW.seller_name || ' — ' || NEW.product_name || ' (' || NEW.plan_label || ')', NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_promotion_new ON promotions;
CREATE TRIGGER t_notify_promotion_new AFTER INSERT ON promotions
FOR EACH ROW EXECUTE FUNCTION trg_notify_promotion_new();

/* ── 2e. Trigger : décision admin sur une promotion → notifie le vendeur ── */
CREATE OR REPLACE FUNCTION trg_notify_promotion_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
    VALUES ('seller', NEW.seller_id, 'promotion_status',
            CASE NEW.status WHEN 'active' THEN 'Sponsoring approuvé' WHEN 'rejected' THEN 'Sponsoring refusé' ELSE 'Sponsoring mis à jour' END,
            NEW.product_name, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_promotion_status ON promotions;
CREATE TRIGGER t_notify_promotion_status AFTER UPDATE ON promotions
FOR EACH ROW EXECUTE FUNCTION trg_notify_promotion_status();

/* ── 2f. Trigger : signalement d'un vendeur → notifie les admins ── */
CREATE OR REPLACE FUNCTION trg_notify_seller_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('admin', NULL, 'seller_report', 'Signalement vendeur',
          NEW.seller_name || ' — ' || left(NEW.reason, 80), NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_seller_report ON seller_reports;
CREATE TRIGGER t_notify_seller_report AFTER INSERT ON seller_reports
FOR EACH ROW EXECUTE FUNCTION trg_notify_seller_report();

/* ── 2g. Trigger : nouvel avis → notifie le vendeur ── */
CREATE OR REPLACE FUNCTION trg_notify_review_new() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, type, title, body, related_id)
  VALUES ('seller', NEW.seller_id, 'review_new', 'Nouvel avis reçu',
          NEW.reviewer_name || ' — ' || NEW.rating || '★', NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_notify_review_new ON reviews;
CREATE TRIGGER t_notify_review_new AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION trg_notify_review_new();

/* Fin backend_hardening_v8.sql */
