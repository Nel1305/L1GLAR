# N Market — Vérification des vendeurs (badge « Vérifié »)

## Mise en route (une seule fois)
0. Si la commande affiche « permission denied for function fn_place_order » : exécute `secure_07_repair_grants.sql` (cause : `secure_01` relancé après `secure_05`). Ne relance plus `secure_01`.
1. Éditeur SQL Supabase → exécute **`secure_06_verification.sql`** (après 01, 02, 04, 05). Ré-exécutable.
   Il crée : colonnes de vérification, table `seller_verifications`, bucket Storage **privé** `kyc`, règles d'accès, limites et expiration.
2. Redéploie le site. Rien d'autre à configurer.

## Règles (modifiables dans la table `settings`)
| Clé | Défaut | Effet |
|---|---|---|
| `verif_trial_days` | `3` | Délai (jours) pour envoyer le dossier. Mets 2, 3 ou 4 selon ton choix. |
| `verif_max_products` | `5` | Nombre maximum de produits d'un compte non vérifié. |

Exemple : `UPDATE settings SET value = '4' WHERE key = 'verif_trial_days';` (ne change que les nouveaux comptes ; les comptes existants gardent leur échéance).

- **Vendeurs existants** : leur délai démarre au moment où tu exécutes le SQL.
- **Non vérifié** : 5 produits maximum ; bandeau avec le temps restant.
- **Délai dépassé sans dossier** : compte **désactivé** — produits masqués du catalogue, plus aucune écriture, commandes refusées. Le vendeur peut toujours se connecter, mais seule la page « Vérification » reste accessible.
- **Dossier envoyé avant l'échéance** : le compte reste actif pendant l'examen. Envoyé après l'échéance : le compte reste désactivé jusqu'à la validation.
- **Refus** : motif obligatoire, le vendeur est notifié et reçoit un nouveau délai pour renvoyer.
- **Validation** : badge « Vérifié » sur ses produits et sa boutique, limite levée, notification.

## Parcours Super Admin
Menu **Vérifications** (pastille quand des dossiers attendent) → *Examiner* → pièce + selfie côte à côte → *Valider* ou *Refuser (avec motif)*.
Onglet « Vérifiés » : bouton *Retirer le badge* (fraude, usurpation…).

## Protection des images
- Bucket `kyc` **privé** : jamais d'URL publique. Un vendeur n'écrit que dans son dossier et ne lit que le sien ; seul le Super Admin lit tout (liens temporaires de 5 minutes).
- Les images sont compressées avant envoi (JPEG), 6 Mo maximum.
- **À la validation, les pièces sont supprimées automatiquement** (minimisation des données). Les dossiers refusés restent jusqu'à un renvoi : supprime-les à la main (Supabase → Storage → kyc) si tu ne veux pas les garder.
- Le vendeur coche un consentement précisant l'usage et la suppression.
- Ce sont des données personnelles sensibles : vérifie les obligations légales qui s'appliquent à ton activité (au Sénégal, déclaration/autorisation auprès de la CDP) et mentionne ce traitement dans tes conditions d'utilisation.

## Limite à connaître
La vérification est **manuelle** : le Super Admin compare visage et pièce à l'œil. Il n'y a pas de reconnaissance faciale automatique.

## Connexion
Après connexion ou création de compte, le vendeur arrive directement dans son espace (le bouton « Mon espace vendeur » est supprimé). Sur le site, cliquer sur son profil en haut à droite (ou l'onglet « Compte » sur téléphone) ouvre son espace.
