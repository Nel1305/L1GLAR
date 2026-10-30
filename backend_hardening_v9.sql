/* ═══════════════════════════════════════════════════════════════
   N MARKET — backend_hardening_v9.sql
   Filet de sécurité schéma : garantit que toutes les colonnes que
   l'app iOS et le site attendent sur `users` existent réellement et
   sont renseignées, même si la table `users` existait déjà (avec un
   schéma plus ancien) avant que v7/v8 n'introduisent first_name,
   name séparés, access_key, etc.

   Pourquoi ce fichier : CREATE TABLE IF NOT EXISTS (dans
   setup_complet.sql) ne touche à rien si la table existe déjà, donc
   sur un projet ancien certaines colonnes peuvent manquer. Résultat
   observé : la connexion réussit côté base, mais la réponse JSON ne
   contient pas first_name/name → l'app iOS n'arrivait pas à lire la
   réponse ("the data couldn't be read because it is missing").

   Idempotent : peut être exécuté plusieurs fois sans danger.
═══════════════════════════════════════════════════════════════ */

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_open      boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked     boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS filiere        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key     text;

/* Comble les trous pour les comptes déjà existants, à partir de ce
   qui est disponible (email en dernier recours) plutôt que de
   laisser des valeurs NULL sur des champs que l'app traite comme
   obligatoires. */
UPDATE users
SET first_name = split_part(email, '@', 1)
WHERE first_name IS NULL OR first_name = '';

UPDATE users
SET name = first_name
WHERE name IS NULL OR name = '';

/* Les comptes créés avant v8 n'ont pas encore de clé d'accès. */
UPDATE users
SET access_key = gen_access_key()
WHERE access_key IS NULL
  AND EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'gen_access_key'
  );

/* Vérification rapide après exécution : ne doit renvoyer aucune ligne. */
SELECT id, email FROM users WHERE first_name IS NULL OR name IS NULL;
