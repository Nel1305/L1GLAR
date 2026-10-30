/* ═══════════════════════════════════════════════════════════════
   N MARKET — backend_hardening_all.sql
   Regroupe, DANS L'ORDRE, tout ce qui a été préparé jusqu'ici :
     v7  → mots de passe bcrypt + RPC de connexion sécurisées
     v8  → clé d'accès vendeur + centre de notifications
     v9  → filet de sécurité schéma (colonnes manquantes sur `users`)
     v10 → coordonnées GPS pour les livraisons hors campus (app iOS)

   À exécuter UNE SEULE FOIS, en entier, dans Supabase →
   SQL Editor → nouvelle requête → coller tout → Run.
   Entièrement idempotent : le relancer ne casse rien si une partie
   a déjà été appliquée.
═══════════════════════════════════════════════════════════════ */


-- ───────────────────────────────────────────────────────────────
-- v7 — Authentification bcrypt + RPC SECURITY DEFINER
-- ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users  ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash text;

UPDATE users
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

UPDATE admins
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

UPDATE users  SET password = '' WHERE password_hash IS NOT NULL;
UPDATE admins SET password = '' WHERE password_hash IS NOT NULL;

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

CREATE OR REPLACE FUNCTION fn_login_user(p_email text, p_pass text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(email) = lower(trim(p_email));
  IF NOT FOUND THEN RETURN json_build_object('error', 'Email ou mot de passe incorrect.'); END IF;
  IF v_user.password_hash IS NULL OR crypt(p_pass, v_user.password_hash) <> v_user.password_hash THEN
    RETURN json_build_object('error', 'Email ou mot de passe incorrect.');
  END IF;
  IF v_user.is_blocked THEN
    RETURN json_build_object('error', 'Ton compte est actuellement suspendu. Contacte l''administrateur.');
  END IF;
  RETURN json_build_object('user', to_jsonb(v_user) - 'password' - 'password_hash');
END; $$;

CREATE OR REPLACE FUNCTION fn_update_password(p_user_id bigint, p_new_pass text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_new_pass IS NULL OR length(p_new_pass) < 6 THEN
    RETURN json_build_object('error', 'Mot de passe trop court (6 caractères minimum).');
  END IF;
  UPDATE users SET password_hash = crypt(p_new_pass, gen_salt('bf', 10)), password = '' WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Utilisateur introuvable.'); END IF;
  RETURN json_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION fn_admin_login(p_email text, p_pass text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin admins%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM admins WHERE lower(email) = lower(trim(p_email));
  IF NOT FOUND THEN RETURN json_build_object('error', 'Email ou mot de passe incorrect.'); END IF;
  IF v_admin.password_hash IS NULL OR crypt(p_pass, v_admin.password_hash) <> v_admin.password_hash THEN
    RETURN json_build_object('error', 'Email ou mot de passe incorrect.');
  END IF;
  RETURN json_build_object('admin', to_jsonb(v_admin) - 'password' - 'password_hash');
END; $$;

CREATE OR REPLACE FUNCTION fn_admin_update_password(p_admin_id bigint, p_new_pass text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_new_pass IS NULL OR length(p_new_pass) < 6 THEN
    RETURN json_build_object('error', 'Mot de passe trop court (6 caractères minimum).');
  END IF;
  UPDATE admins SET password_hash = crypt(p_new_pass, gen_salt('bf', 10)), password = '' WHERE id = p_admin_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Administrateur introuvable.'); END IF;
  RETURN json_build_object('ok', true);
END; $$;

REVOKE ALL ON users  FROM anon, authenticated;
REVOKE ALL ON admins FROM anon, authenticated;

GRANT SELECT (id, first_name, last_name, name, email, phone, bio, shop_open, is_blocked, blocked_reason, billing_period, filiere, created_at)
  ON users TO anon, authenticated;
GRANT UPDATE (first_name, last_name, name, email, phone, bio, shop_open, filiere)
  ON users TO anon, authenticated;
GRANT UPDATE (is_blocked, blocked_reason, billing_period)
  ON users TO anon, authenticated;
GRANT DELETE ON users TO anon, authenticated;

GRANT SELECT (id, name, email, created_at) ON admins TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_products_seller    ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available) WHERE available = true;
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_seller      ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_group       ON orders(order_group);
CREATE INDEX IF NOT EXISTS idx_messages_general   ON messages(is_general, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_dm        ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product    ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller     ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status  ON promotions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email));


-- ───────────────────────────────────────────────────────────────
-- v8 — Clé d'accès vendeur + centre de notifications
-- ───────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_key ON users(access_key) WHERE access_key IS NOT NULL;

CREATE OR REPLACE FUNCTION gen_access_key() RETURNS text
LANGUAGE sql AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

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

GRANT EXECUTE ON FUNCTION fn_register_user(text,text,text,text,text,text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_login_user(text,text)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_update_password(bigint,text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_login(text,text)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_update_password(bigint,text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_login_with_access_key(text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_regenerate_access_key(bigint) TO anon, authenticated;
GRANT SELECT (access_key) ON users TO anon, authenticated;

CREATE TABLE IF NOT EXISTS notifications (
  id            bigserial PRIMARY KEY,
  recipient_type text NOT NULL CHECK (recipient_type IN ('seller','admin','buyer')),
  recipient_id  bigint,
  type          text NOT NULL,
  title         text NOT NULL,
  body          text,
  related_id    bigint,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created    ON notifications(created_at DESC);

REVOKE ALL ON notifications FROM anon, authenticated;
GRANT SELECT ON notifications TO anon, authenticated;
GRANT UPDATE (is_read) ON notifications TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO anon, authenticated;

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


-- ───────────────────────────────────────────────────────────────
-- v9 — Filet de sécurité schéma (colonnes manquantes sur `users`)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_open      boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked     boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS filiere        text;

UPDATE users
SET first_name = split_part(email, '@', 1)
WHERE first_name IS NULL OR first_name = '';

UPDATE users
SET name = first_name
WHERE name IS NULL OR name = '';

UPDATE users SET access_key = gen_access_key() WHERE access_key IS NULL;


-- ───────────────────────────────────────────────────────────────
-- v10 — Coordonnées GPS pour les livraisons hors campus (app iOS)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_place_name text;

COMMENT ON COLUMN orders.delivery_lat        IS 'Latitude du point de livraison (hors campus), choisie via Apple Maps sur iOS';
COMMENT ON COLUMN orders.delivery_lng        IS 'Longitude du point de livraison (hors campus), choisie via Apple Maps sur iOS';
COMMENT ON COLUMN orders.delivery_place_name IS 'Nom court du lieu (ex: nom du quartier/POI) résolu par Apple Maps, pour affichage rapide côté vendeur';


-- ───────────────────────────────────────────────────────────────
-- v11 — Attributs produit par catégorie (app iOS) + structure Premium
-- ───────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes jsonb;
COMMENT ON COLUMN products.attributes IS 'Caractéristiques libres par catégorie (taille, état, marque, stockage…), définies côté app/site — clé/valeur texte en JSON.';

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium        boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_theme      jsonb;
COMMENT ON COLUMN users.is_premium         IS 'Abonnement Premium actif (activation manuelle pour l''instant — pas de paiement intégré).';
COMMENT ON COLUMN users.premium_expires_at IS 'Date de fin de l''abonnement Premium en cours, si applicable.';
COMMENT ON COLUMN users.premium_theme      IS 'Personnalisation de l''interface vendeur réservée aux comptes Premium (couleurs, accent...) — JSON libre.';


-- ───────────────────────────────────────────────────────────────
-- Vérification finale — ne doit renvoyer aucune ligne
-- ───────────────────────────────────────────────────────────────
SELECT id, email FROM users WHERE first_name IS NULL OR name IS NULL OR access_key IS NULL;
