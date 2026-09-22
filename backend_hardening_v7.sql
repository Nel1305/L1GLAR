-- ═══════════════════════════════════════════════════════
-- N MARKET — backend_hardening_v7.sql
-- Durcissement du backend SANS casser le site existant :
--   1. Hachage bcrypt réel (pgcrypto) au lieu de base64
--   2. Authentification déplacée dans des fonctions RPC
--      SECURITY DEFINER (le mot de passe ne transite plus
--      "en clair" côté client, la comparaison se fait en base)
--   3. Colonnes password non lisibles par la clé publique (anon)
--   4. Index de performance sur les colonnes filtrées/triées
--   5. Fonctions RPC réutilisées à l'identique par le site web
--      ET par l'application iOS → une seule logique d'auth
-- Idempotent : peut être rejoué sans risque.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────
-- 1. Colonnes de hachage bcrypt (en plus de l'ancienne colonne,
--    le temps de migrer ; l'ancienne sera vidée à la fin)
-- ────────────────────────────────────────────
ALTER TABLE users  ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash text;

-- Migration automatique : l'ancien mot de passe est stocké en base64
-- (réversible), on le déchiffre UNE FOIS pour le rehacher en bcrypt,
-- puis on écrase l'ancienne valeur (elle ne sera plus utilisée).
UPDATE users
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

UPDATE admins
SET password_hash = crypt(convert_from(decode(password, 'base64'), 'UTF8'), gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

-- L'ancienne colonne ne sert plus qu'à l'historique de migration ;
-- on la vide pour ne plus jamais exposer un mot de passe récupérable.
UPDATE users  SET password = '' WHERE password_hash IS NOT NULL;
UPDATE admins SET password = '' WHERE password_hash IS NOT NULL;

-- ────────────────────────────────────────────
-- 2. Fonctions RPC d'authentification (SECURITY DEFINER)
--    → seule la fonction peut lire password_hash, jamais le client.
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_register_user(
  p_first text, p_last text, p_email text, p_phone text, p_pass text, p_filiere text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user users%ROWTYPE; v_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email = lower(trim(p_email))) THEN
    RETURN json_build_object('error', 'Cet email est déjà utilisé.');
  END IF;
  IF length(p_pass) < 6 THEN
    RETURN json_build_object('error', 'Mot de passe trop court (min. 6 caractères).');
  END IF;
  v_name := p_first || CASE WHEN p_last IS NOT NULL AND p_last <> '' THEN ' ' || upper(left(p_last,1)) || '.' ELSE '' END;
  INSERT INTO users (first_name,last_name,name,email,phone,password,password_hash,filiere)
  VALUES (p_first, p_last, v_name, lower(trim(p_email)), p_phone, '', crypt(p_pass, gen_salt('bf',10)), p_filiere)
  RETURNING * INTO v_user;
  RETURN json_build_object('user', json_build_object(
    'id', v_user.id, 'firstName', v_user.first_name, 'lastName', v_user.last_name, 'name', v_user.name,
    'email', v_user.email, 'phone', v_user.phone, 'bio', v_user.bio, 'shopOpen', v_user.shop_open,
    'isBlocked', coalesce(v_user.is_blocked,false), 'blockedReason', coalesce(v_user.blocked_reason,''),
    'billingPeriod', coalesce(v_user.billing_period,'monthly'), 'filiere', coalesce(v_user.filiere,''),
    'createdAt', v_user.created_at));
END; $$;

CREATE OR REPLACE FUNCTION public.fn_login_user(p_email text, p_pass text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE email = lower(trim(p_email));
  IF NOT FOUND OR v_user.password_hash IS NULL OR v_user.password_hash <> crypt(p_pass, v_user.password_hash) THEN
    RETURN json_build_object('error', 'Email ou mot de passe incorrect.');
  END IF;
  IF v_user.is_blocked THEN
    RETURN json_build_object('error', 'Ton compte est actuellement suspendu. Contacte l''administrateur.');
  END IF;
  RETURN json_build_object('user', json_build_object(
    'id', v_user.id, 'firstName', v_user.first_name, 'lastName', v_user.last_name, 'name', v_user.name,
    'email', v_user.email, 'phone', v_user.phone, 'bio', v_user.bio, 'shopOpen', v_user.shop_open,
    'isBlocked', coalesce(v_user.is_blocked,false), 'blockedReason', coalesce(v_user.blocked_reason,''),
    'billingPeriod', coalesce(v_user.billing_period,'monthly'), 'filiere', coalesce(v_user.filiere,''),
    'createdAt', v_user.created_at));
END; $$;

CREATE OR REPLACE FUNCTION public.fn_update_password(p_user_id bigint, p_new_pass text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(p_new_pass) < 6 THEN RETURN json_build_object('error','Mot de passe trop court.'); END IF;
  UPDATE users SET password_hash = crypt(p_new_pass, gen_salt('bf',10)) WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_admin_login(p_email text, p_pass text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin admins%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM admins WHERE email = lower(trim(p_email));
  IF NOT FOUND OR v_admin.password_hash IS NULL OR v_admin.password_hash <> crypt(p_pass, v_admin.password_hash) THEN
    RETURN json_build_object('error', 'Email ou mot de passe incorrect.');
  END IF;
  RETURN json_build_object('admin', json_build_object('id',v_admin.id,'email',v_admin.email,'name',v_admin.name));
END; $$;

CREATE OR REPLACE FUNCTION public.fn_admin_update_password(p_admin_id bigint, p_new_pass text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(p_new_pass) < 6 THEN RETURN json_build_object('error','Mot de passe trop court.'); END IF;
  UPDATE admins SET password_hash = crypt(p_new_pass, gen_salt('bf',10)) WHERE id = p_admin_id;
  RETURN json_build_object('ok', true);
END; $$;

-- Le client (anon) n'a le droit d'EXÉCUTER que ces fonctions,
-- jamais de lire directement les colonnes de hachage.
REVOKE SELECT (password, password_hash) ON users  FROM anon, authenticated;
REVOKE SELECT (password, password_hash) ON admins FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_register_user, public.fn_login_user, public.fn_update_password,
  public.fn_admin_login, public.fn_admin_update_password TO anon, authenticated;

-- ────────────────────────────────────────────
-- 3. Index de performance (catalogue, commandes, messages)
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_seller     ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_available  ON products(available) WHERE available = true;
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_seller       ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_group        ON orders(order_group);
CREATE INDEX IF NOT EXISTS idx_messages_general    ON messages(is_general, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_dm         ON messages(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product     ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller      ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status   ON promotions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email));

SELECT 'password_hash migrés (users)'  AS info, count(*) FROM users  WHERE password_hash IS NOT NULL
UNION ALL
SELECT 'password_hash migrés (admins)', count(*) FROM admins WHERE password_hash IS NOT NULL;

-- ────────────────────────────────────────────
-- 2bis. CORRECTIF — un GRANT au niveau TABLE (hérité des droits par
-- défaut Supabase) rend inefficace un simple REVOKE au niveau colonne.
-- On repart d'un accès colonne par colonne, explicite et minimal.
-- ────────────────────────────────────────────
REVOKE ALL ON users  FROM anon, authenticated;
REVOKE ALL ON admins FROM anon, authenticated;

-- Lecture : tout sauf password / password_hash
GRANT SELECT (id, first_name, last_name, name, email, phone, bio, shop_open,
  is_blocked, blocked_reason, billing_period, filiere, created_at)
  ON users TO anon, authenticated;

-- Écriture directe : profil ET actions Super Admin (blocage, facturation),
-- mais jamais le(s) mot(s) de passe (RPC fn_update_password exclusivement).
-- NB : comme dans l'app d'origine, l'espace Super Admin n'est protégé que par
-- un écran de connexion côté client (pas de rôle Postgres dédié) — il partage
-- la même clé publique que le reste du site. Ce durcissement supprime la
-- fuite des mots de passe, mais pour une séparation stricte des privilèges
-- entre vendeur et Super Admin, il faudrait migrer vers Supabase Auth (JWT).
GRANT UPDATE (first_name, last_name, name, email, phone, bio, shop_open, filiere,
  is_blocked, blocked_reason, billing_period)
  ON users TO anon, authenticated;
GRANT DELETE ON users TO anon, authenticated;

-- Création de compte : uniquement via fn_register_user (SECURITY DEFINER) →
-- aucun accès direct (SELECT/INSERT/UPDATE) à la table `admins` pour le client.
GRANT EXECUTE ON FUNCTION public.fn_register_user, public.fn_login_user, public.fn_update_password,
  public.fn_admin_login, public.fn_admin_update_password TO anon, authenticated;

SELECT 'colonnes lisibles par anon sur users' AS info,
       string_agg(column_name, ', ')
FROM information_schema.column_privileges
WHERE table_name='users' AND grantee='anon' AND privilege_type='SELECT';
