/* ═══════════════════════════════════════════════════════════════
   N MARKET — secure_02_migrate_existing_accounts.sql
   Reprend les vendeurs EXISTANTS dans Supabase Auth en conservant
   leur mot de passe actuel (hash bcrypt recopié tel quel) : ils se
   reconnectent avec le même email / mot de passe.

   À exécuter UNE fois, après secure_01_migration.sql.
   Les comptes admin ne sont volontairement PAS migrés
   (voir secure_04_super_admin.sql).

   Si ce script échoue (schéma Auth différent) : rien n'est cassé,
   les vendeurs utiliseront « Mot de passe oublié » sur le site
   après que tu auras créé leurs comptes Auth (ou qu'ils se
   réinscrivent après suppression de l'ancienne ligne users).
═══════════════════════════════════════════════════════════════ */
DO $$
DECLARE r record; v_uid uuid; v_done int := 0; v_skip int := 0;
BEGIN
  FOR r IN SELECT id, email, password_hash FROM users
            WHERE auth_id IS NULL AND email IS NOT NULL AND password_hash IS NOT NULL LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(r.email)) THEN
      -- On ne rattache JAMAIS automatiquement à un compte Auth préexistant (risque de détournement)
      RAISE NOTICE 'Ignoré (email déjà présent dans Auth) : %', r.email;
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    v_uid := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', lower(r.email),
            r.password_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid, v_uid::text,
            jsonb_build_object('sub', v_uid::text, 'email', lower(r.email), 'email_verified', true),
            'email', now(), now(), now());

    UPDATE users SET auth_id = v_uid WHERE id = r.id;
    v_done := v_done + 1;
  END LOOP;
  RAISE NOTICE 'Comptes migrés : % — ignorés : %', v_done, v_skip;
END $$;

-- Contrôle : vendeurs sans compte Auth (ils devront utiliser « Mot de passe oublié »)
SELECT id, email FROM users WHERE auth_id IS NULL;

/* Quand tout fonctionne (plusieurs jours après), tu peux supprimer les anciens secrets :
     ALTER TABLE users  DROP COLUMN password, DROP COLUMN password_hash, DROP COLUMN access_key;
     ALTER TABLE admins DROP COLUMN password, DROP COLUMN password_hash;                         */
