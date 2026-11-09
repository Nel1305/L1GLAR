# N Market — refonte sécurité : mode d'emploi

## Ce qui change
| Avant | Maintenant |
|---|---|
| Politiques RLS `public_all` (tout ouvert) | RLS par rôle : visiteur / vendeur connecté / admin |
| Sessions = objet modifiable dans `localStorage` | **Supabase Auth** (JWT signé, vérifié par la base) |
| `fn_update_password`, `fn_regenerate_access_key`… appelables par n'importe qui | Supprimées. Mot de passe via Auth ; actions admin = RPC qui vérifient `is_admin()` |
| Clés d'accès lisibles par `anon` | Connexion par clé supprimée → « Mot de passe oublié » par email |
| Prix/quantités/stock décidés par le navigateur, panier non atomique | `fn_place_order` : prix recalculés, stock verrouillé, tout-ou-rien |
| Avis, retours, signalements insérés directement | RPC validées (anti-spam, vérif. n° commande + téléphone) |
| XSS (innerHTML non échappé) | `esc()` / `safeImg()` / `safeHref()` partout ; testé avec payloads |
| Chat « E2E » avec clé publique dans le code | Texte clair protégé par RLS + TLS ; expéditeur imposé par le serveur |
| Emails/téléphones des vendeurs lisibles publiquement | Vue `public_sellers` (id, nom, bio, filière, boutique ouverte) |
| Libs depuis CDN, pas de CSP | Libs hébergées (`js/vendor`), CSP + HSTS + Referrer-Policy (netlify.toml) |

## Déploiement (dans cet ordre)
1. **Sauvegarde** ta base (Supabase → Database → Backups).
2. Supabase → Authentication → Providers → Email : active **Confirm email** (recommandé) ; Authentication → URL Configuration : mets l'URL de ton site dans *Site URL* et *Redirect URLs* (`https://ton-site/index.html`) ; mot de passe minimum 8.
3. SQL Editor : exécute `secure_01_migration.sql`. La dernière requête liste les politiques : aucune `public_all` ne doit rester.
4. Exécute `secure_02_migrate_existing_accounts.sql` : les vendeurs gardent email + mot de passe actuels.
5. Édite puis exécute `secure_04_super_admin.sql` : il crée le compte super admin (email + mot de passe indiqués en tête de fichier) et sert aussi à le changer plus tard. Plus besoin de passer par Authentication → Add user.
   ⚠ `admin@glar.com / admin2024` était public dans le dépôt : il est supprimé par l'étape 3, ne le réutilise pas.
6. Déploie le nouveau code (ce dossier) sur Netlify.
7. Teste : connexion vendeur, connexion admin (`pages/superadmin.html`), une commande, une annulation.

## Changements de comportement à connaître
- **Application iOS** : elle utilise l'ancien backend (RPC supprimées, tables fermées). Elle doit être migrée vers `supabase.auth` + les nouvelles RPC avant de fonctionner à nouveau.
- Les emails de notification de commande n'étaient envoyés aux vendeurs que depuis le navigateur de l'acheteur (ce qui obligeait à publier leur email). Ils sont retirés ; les vendeurs reçoivent les notifications dans l'app. Pour du mail : Database Webhook → Edge Function.
- Une commande **annulée est définitive** (le stock est recrédité une seule fois, côté serveur).
- Retour produit : n° de commande + **téléphone** doivent correspondre (le nom seul ne suffit plus).
- Changer d'email demande une confirmation par lien.

## Limites restantes (honnêtes)
- Commandes/avis/signalements restent publics (pas de compte acheteur) : protégés par validation et limites de débit simples, pas par identité. Pour aller plus loin : captcha (Turnstile) côté Supabase Auth/Edge Function.
- La CSP garde `'unsafe-inline'` pour les scripts (le code utilise des `onclick` inline). L'échappement est la vraie défense ; migrer vers des `addEventListener` permettrait une CSP stricte.
- Les anciens fichiers SQL (setup, update_v2…v6, hardening, fix) ont été supprimés du projet : ils recréaient des règles ouvertes. Seuls `secure_01, 02 et 04` sont à utiliser.
- Après quelques jours de recul, supprime les colonnes `password`, `password_hash`, `access_key` (commande en fin de `secure_02`).
- `diagnostic.html` a été supprimé du projet.


## Ajouts : Google Maps, WhatsApp, code de reçu
Voir **WHATSAPP_MAPS_LISEZMOI.md** (étapes Google, Meta, Supabase). Nouveau fichier SQL : `secure_05_maps_whatsapp.sql`
(à exécuter après 01, 02 et 04). Les retours se font désormais avec le **code de reçu** et non plus avec le téléphone.
La CSP autorise maintenant `maps.googleapis.com` ; le jeton Meta reste uniquement dans les secrets des Edge Functions.
