/* ════════════════════════════════════════════════════════════════
   N MARKET — secure_07_repair_grants.sql
   RÉPARATION des droits d'exécution des fonctions.

   Symptôme corrigé : « permission denied for function fn_place_order »
   (la commande échoue : erreur 403 sur /rpc/fn_place_order).
   Cause : secure_01 relancé APRÈS secure_05 efface les droits de la nouvelle fn_place_order
   et recrée l'ancienne version (13 paramètres).

   Sans risque, ré-exécutable à tout moment, dans n'importe quel ordre.
   NE relance plus secure_01 : si besoin, relance seulement ce fichier.
════════════════════════════════════════════════════════════════ */

-- 1. supprime l'ancienne fn_place_order (13 paramètres) si elle est revenue
DROP FUNCTION IF EXISTS public.fn_place_order(text,text,text,date,text,text,text,text,text,jsonb,double precision,double precision,text);

-- 2. redonne les droits, version par version (toutes les surcharges existantes)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.proname IN (
         -- visiteurs + connectés
         'is_admin','my_user_id','my_active_seller_id','seller_expired','fn_place_order','fn_add_review',
         'fn_create_return','fn_create_return_by_code','fn_active_promoted_product_ids','fn_report_seller',
         -- connectés seulement
         'fn_request_promotion','fn_set_wa_notifications','fn_submit_verification',
         'admin_set_block','admin_set_billing','admin_delete_seller','admin_list_admins','admin_set_profile',
         'admin_save_admin','admin_remove_admin','admin_review_verification','admin_revoke_verification')
  LOOP
    IF f.proname IN ('is_admin','my_user_id','my_active_seller_id','seller_expired','fn_place_order','fn_add_review',
                     'fn_create_return','fn_create_return_by_code','fn_active_promoted_product_ids','fn_report_seller') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

-- 3. contrôle : doit lister fn_place_order avec anon ET authenticated
SELECT p.oid::regprocedure AS fonction,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS connecte
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'fn_place_order';
