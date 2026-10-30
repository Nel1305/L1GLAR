/* ═══════════════════════════════════════════════════════════════
   N MARKET — backend_hardening_v7.sql
   Durcissement de l'authentification (mots de passe bcrypt + RPC
   SECURITY DEFINER) + révocation des accès colonne directs.
   Idempotent : peut être exécuté plusieurs fois sans danger.
═══════════════════════════════════════════════════════════════ */

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ── 1. Colonnes de hash ── */
ALTER TABLE users  ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash text;

/* ── 2. Migration unique des anciens mots de passe base64 → bcrypt ── */
UPDATE users
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

UPDATE admins
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

UPDATE users  SET password = '' WHERE password_hash IS NOT NULL;
UPDATE admins SET password = '' WHERE password_hash IS NOT NULL;

/* ── 3. Fonctions RPC (SECURITY DEFINER) ── */

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
  INSERT INTO users (first_name, last_name, name, email, phone, password, password_hash, filiere)
  VALUES (p_first, p_last, v_name, p_email, p_phone, '', crypt(p_pass, gen_salt('bf', 10)), p_filiere)
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

/* ── 4. Révocation large puis re-octroi ciblé (colonne par colonne) ──
   Important : un GRANT ALL au niveau table (comme celui posé par défaut par
   Supabase) écrase silencieusement un REVOKE au niveau colonne. On révoque
   donc TOUT d'abord, puis on ré-autorise explicitement les colonnes sûres. */
REVOKE ALL ON users  FROM anon, authenticated;
REVOKE ALL ON admins FROM anon, authenticated;

GRANT SELECT (id, first_name, last_name, name, email, phone, bio, shop_open, is_blocked, blocked_reason, billing_period, filiere, created_at)
  ON users TO anon, authenticated;
GRANT UPDATE (first_name, last_name, name, email, phone, bio, shop_open, filiere)
  ON users TO anon, authenticated;
GRANT UPDATE (is_blocked, blocked_reason, billing_period)
  ON users TO anon, authenticated;
/* Pas de GRANT INSERT ici : la création de compte DOIT passer par fn_register_user
   (seule façon de poser un password_hash bcrypt). DELETE reste nécessaire pour
   dbDeleteSeller (suppression de compte vendeur par le Super Admin). */
GRANT DELETE ON users TO anon, authenticated;

GRANT SELECT (id, name, email, created_at) ON admins TO anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_register_user(text,text,text,text,text,text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_login_user(text,text)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_update_password(bigint,text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_login(text,text)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_update_password(bigint,text)               TO anon, authenticated;

/* ── 5. Index de performance ── */
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

/* Fin backend_hardening_v7.sql — déjà appliqué par l'utilisateur sur le projet Supabase réel. */
