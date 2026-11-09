/* ════════════════════════════════════════════════════════════════
   DIAGNOSTIC — « je n'arrive pas à créer de compte »
   Simule une inscription DANS la base, puis annule tout (rien n'est conservé).
   Exécute tout le fichier dans l'éditeur SQL Supabase : le résultat s'affiche dans « Results ».
════════════════════════════════════════════════════════════════ */
CREATE OR REPLACE FUNCTION public._diag_signup() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ok boolean;
BEGIN
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'diag-' || v_id || '@example.invalid', '{"first_name":"Diag","last_name":"Test","phone":"770000000"}', now(), now());
    SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = v_id) INTO v_ok;
    RAISE EXCEPTION 'ROLLBACK_VOULU:%', CASE WHEN v_ok THEN 'oui' ELSE 'non' END;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ROLLBACK_VOULU:oui' THEN RETURN 'OK — la base crée bien le profil à l''inscription. Le problème est ailleurs (voir ci-dessous).'; END IF;
    IF SQLERRM LIKE 'ROLLBACK_VOULU:non' THEN RETURN 'PROBLÈME — l''inscription passe mais aucun profil n''est créé (trigger on_auth_user_created absent : relance secure_01 puis secure_07).'; END IF;
    RETURN 'ÉCHEC BASE — ' || SQLERRM || ' (code ' || SQLSTATE || ')  ← envoie-moi cette ligne';
  END;
END; $$;
SELECT public._diag_signup() AS resultat;
DROP FUNCTION public._diag_signup();

-- Contrôles complémentaires (lecture seule)
SELECT 'trigger inscription présent' AS controle, count(*) = 1 AS ok FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal
UNION ALL SELECT 'colonne verified présente', count(*) = 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'verified'
UNION ALL SELECT 'trigger délai vérification présent', count(*) = 1 FROM pg_trigger WHERE tgname = 't_users_verif_deadline' AND NOT tgisinternal;
