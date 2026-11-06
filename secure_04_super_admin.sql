/* ═══════════════════════════════════════════════════════════════
   N MARKET — secure_04_super_admin.sql
   Crée le SUPER ADMIN et permet de le CHANGER à tout moment.
   Remplace secure_03_create_admin.sql (pas besoin de passer par le
   Dashboard Supabase : le compte Auth est créé ici).

   À exécuter après secure_01 (et secure_02). Exécutable plusieurs fois.

   ── IDENTIFIANTS INITIAUX (modifie-les ci-dessous AVANT d'exécuter) ──
      Email         : cbuabey@gmail.com
      Mot de passe  : wafASUCZ9#mw-_PG6!Bx
   Connexion : page « Super Admin » du site avec ces deux valeurs.
   ⚠ Change le mot de passe dès la 1re connexion (Paramètres du super
     admin) puis SUPPRIME ce fichier / retire le mot de passe ci-dessous.

   ── CHANGER DE SUPER ADMIN PLUS TARD ──
   Dans l'éditeur SQL Supabase, exécute :
     SELECT public.set_super_admin('nouvel@email.com', 'Nouveau Nom', 'NouveauMotDePasseFort!');
   → crée le nouveau compte, lui donne les droits, et RETIRE les droits
     de l'ancien super admin (son compte Auth reste mais n'a plus accès).
   Pour garder l'ancien en plus (deux admins) :
     SELECT public.set_super_admin('autre@email.com', 'Nom', 'MotDePasse!', false);
   Tout cela peut aussi se faire depuis le site : Super Admin → « Compte admin ».
   Pour seulement changer le mot de passe de l'admin actuel : même appel avec
   son email actuel et le nouveau mot de passe.
   Pour retirer les droits d'un admin :
     SELECT public.remove_super_admin('email@a-retirer.com');
═══════════════════════════════════════════════════════════════ */

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_super_admin(
  p_email text, p_name text, p_password text, p_remove_others boolean DEFAULT true
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_email text := lower(btrim(p_email)); v_uid uuid;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Email invalide.'; END IF;
  IF length(coalesce(p_password, '')) < 12 THEN RAISE EXCEPTION 'Mot de passe trop court (12 caractères minimum).'; END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
            crypt(p_password, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid, v_uid::text,
            jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  ELSE
    -- compte Auth existant : on remet le mot de passe, on le débloque et on confirme l'email
    UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()), banned_until = NULL, updated_at = now()
     WHERE id = v_uid;
  END IF;

  IF p_remove_others THEN
    DELETE FROM admins WHERE auth_id IS DISTINCT FROM v_uid;
  END IF;

  INSERT INTO admins (email, password, name, auth_id)
  VALUES (v_email, '', coalesce(nullif(btrim(p_name), ''), 'Admin'), v_uid)
  ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id, name = EXCLUDED.name, password = '';

  RETURN 'Super admin : ' || v_email;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_super_admin(p_email text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM admins) <= 1 THEN
    RAISE EXCEPTION 'Impossible : c''est le dernier admin. Crée d''abord le suivant avec set_super_admin.';
  END IF;
  DELETE FROM admins WHERE lower(email) = lower(btrim(p_email));
  RETURN 'Droits admin retirés : ' || p_email;
END; $$;

-- Ces fonctions ne sont appelables que depuis l'éditeur SQL (jamais depuis le site)
REVOKE ALL ON FUNCTION public.set_super_admin(text, text, text, boolean)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_super_admin(text)                    FROM PUBLIC, anon, authenticated;

/* ── Gestion depuis l'interface Super Admin (section « Compte admin ») ──
   Ces 4 fonctions sont appelables par un admin connecté UNIQUEMENT (is_admin()). */
CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE (id bigint, email text, name text, is_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY SELECT a.id, a.email, a.name, (a.auth_id = auth.uid()) FROM admins a ORDER BY a.id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_profile(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF length(btrim(coalesce(p_name,''))) < 2 THEN RAISE EXCEPTION 'Nom trop court.'; END IF;
  UPDATE admins SET name = left(btrim(p_name), 80) WHERE auth_id = auth.uid();
END; $$;

-- Ajoute un admin, ou remplace le super admin (p_replace = true : l'appelant perd ses droits)
CREATE OR REPLACE FUNCTION public.admin_save_admin(p_email text, p_name text, p_password text, p_replace boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN public.set_super_admin(p_email, p_name, p_password, p_replace);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_remove_admin(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF EXISTS (SELECT 1 FROM admins WHERE id = p_id AND auth_id = auth.uid()) THEN
    RAISE EXCEPTION 'Tu ne peux pas te retirer toi-même : utilise « Transférer le rôle ».';
  END IF;
  PERFORM public.remove_super_admin((SELECT email FROM admins WHERE id = p_id));
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_admins(), public.admin_set_profile(text),
  public.admin_save_admin(text, text, text, boolean), public.admin_remove_admin(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admins(), public.admin_set_profile(text),
  public.admin_save_admin(text, text, text, boolean), public.admin_remove_admin(bigint) TO authenticated;

-- ▼▼▼ CRÉATION DU SUPER ADMIN INITIAL (modifie les 3 valeurs si besoin) ▼▼▼
SELECT public.set_super_admin('cbuabey@gmail.com', 'Super Admin', 'wafASUCZ9#mw-_PG6!Bx');

-- ID du super admin
SELECT a.id AS admin_id, a.email, a.name, a.auth_id AS auth_uuid, a.created_at FROM admins a;
