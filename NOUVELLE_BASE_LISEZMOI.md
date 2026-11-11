# N Market — Créer une base de données NEUVE (Supabase)

Testé sur un PostgreSQL vide : 00 → 01 → 04 → 05 → 06 → 07, inscription vendeur (trigger),
création de produit, commande anonyme avec ticket (NM-XXXX-XXXX) : tout passe.
Non testé : Auth réel de Supabase (mails, confirmation), Edge Function WhatsApp, upload KYC réel.

## 1. Dans Supabase (nouveau projet ou projet vidé)
1. **Settings → API** : copie *Project URL* et la clé publishable (ou anon public), puis mets-les dans `js/config.js`
   (SUPABASE_URL et SUPABASE_KEY). Si tu crées un NOUVEAU projet, l'URL change : sinon le site
   continue de viser l'ancien.
2. **Authentication → URL Configuration** :
   - Site URL : `https://n-market-sigma.vercel.app`
   - Redirect URLs : `https://n-market-sigma.vercel.app/**`
3. **Authentication → Providers → Email** : désactive « Confirm email » (inscription immédiate,
   sans mail). `secure_08` le garantit aussi côté base.
4. *(Optionnel, WhatsApp)* **Database → Extensions** : active `pg_net`.

## 2. SQL Editor — exécuter dans CET ordre, un fichier à la fois
| # | Fichier | Rôle |
|---|---------|------|
| 1 | `secure_00_base.sql` | tables de départ + catégories, filières, réglages, offres de promotion |
| 2 | `secure_01_migration.sql` | sécurité (RLS), fonctions, triggers, inscription côté serveur |
| 3 | `secure_04_super_admin.sql` | crée le compte Super Admin (email/mot de passe en haut du fichier : modifie-les avant) |
| 4 | `secure_05_maps_whatsapp.sql` | carte, codes de reçu, WhatsApp (« bientôt ») |
| 5 | `secure_06_verification.sql` | vérification vendeur (pièce d'identité + visage), badge, limites |
| 6 | `secure_08_auto_confirm.sql` | plus de confirmation par email : comptes confirmés automatiquement |
| 7 | `secure_09_orphan_auth.sql` | libère les emails d'anciens comptes restés dans Authentication |
| 8 | `secure_10_wa_templates.sql` | messages WhatsApp personnalisés du vendeur |
| 9 | `secure_12_ticket_style.sql` | ticket personnalisable par le vendeur (après `secure_06`) |
| 13 | `secure_13_fix_norm_phone.sql` | Correctif « permission denied for function norm_phone » (statut Livrée/Annulée) – à lancer en dernier |
| 10 | `secure_11_filieres_estm.sql` | niveaux/filières ESTM (inutile sur base neuve : déjà dans `secure_00`) |
| 11 | `secure_07_repair_grants.sql` | droits d'exécution des fonctions — **toujours en dernier** |

Ne saute pas `secure_02` : il ne sert que pour d'anciens comptes, inutile sur une base neuve.

## 2 bis. Accès Super Admin
Il n'y a plus de page de connexion Super Admin : connecte-toi par le formulaire de connexion normal du site avec l'email/mot de passe du super admin, tu es redirigé automatiquement vers le Super Admin. L'adresse `pages/superadmin.html` renvoie vers l'accueil si on n'est pas connecté.

## 3. Règles à retenir
- **Ne jamais relancer `secure_01` après `secure_05`** : cela casse les droits de commande
  (« permission denied for function fn_place_order »). Si ça arrive : relance `secure_07`.
- Après avoir exécuté `secure_04`, change le mot de passe du super admin depuis le site, puis
  retire le mot de passe du fichier.
- Si l'inscription échoue : exécute `diagnostic_inscription.sql`.

## 4. Vérification rapide après installation
1. Ouvre le site, crée un compte vendeur → tu arrives directement dans l'espace vendeur.
2. Ajoute un produit, passe une commande en tant que client → le ticket s'affiche.
3. Page Super Admin → connexion avec l'email/mot de passe du point 3 du tableau.
