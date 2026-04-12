# 🚀 Guide de déploiement — N Market

## Vue d'ensemble

| Composant | Service | Coût |
|-----------|---------|------|
| Hébergement | Netlify (Free) | Gratuit |
| Base de données | Supabase (Free) | Gratuit |
| Emails | EmailJS (Free) | 200 emails/mois gratuit |
| Paiements | Wave | Commission Wave |

---

## ÉTAPE 1 — Supabase

### 1.1 Créer le projet
1. Va sur [supabase.com](https://supabase.com) → **New project**
2. Choisis une région proche (Europe West ou US East)
3. Note le **mot de passe de la BDD** quelque part

### 1.2 Exécuter la migration SQL
1. Dans le dashboard Supabase → **SQL Editor** → **New query**
2. Colle le contenu du fichier `supabase_migration.sql`
3. **Avant de lancer**, modifie la section admin :
   ```sql
   INSERT INTO admins (email, password, name)
   VALUES (
     'ton@email.com',          -- ton vrai email admin
     'dG9ubW90ZGVwYXNzZQ==',  -- voir calcul ci-dessous
     'Nel''si'
   )
   ```
4. **Calculer le mot de passe admin** : ouvre la console du navigateur (F12) et tape :
   ```js
   btoa(encodeURIComponent('tonmotdepasse'))
   ```
   Copie le résultat et colle-le dans le SQL.
5. Clique **Run** → vérifie que toutes les tables sont créées

### 1.3 Récupérer les clés API
1. **Settings** → **API**
2. Note :
   - **Project URL** → `https://xxxxxx.supabase.co`
   - **anon / public key** → `eyJhbGc...` (clé longue)

### 1.4 Configurer le Storage (pour les photos produits)
1. **Storage** → **New bucket** → nom : `products`
2. Rendre le bucket **Public**
3. Dans **Policies** → ajouter une policy `INSERT` pour `anon`

---

## ÉTAPE 2 — EmailJS

### 2.1 Créer un compte
1. Va sur [emailjs.com](https://emailjs.com) → inscription gratuite

### 2.2 Connecter un service email
1. **Email Services** → **Add New Service**
2. Choisis Gmail (ou autre) → suis les instructions d'authentification
3. Note le **Service ID** (ex: `service_abc123`)

### 2.3 Créer les templates

#### Template 1 : Bienvenue (ID: `template_welcome`)
```
Sujet : Bienvenue sur {{platform_name}} 🎉

Bonjour {{to_name}},

Ton compte vendeur sur {{platform_name}} a bien été créé.
Tu peux maintenant te connecter et commencer à vendre !

→ {{login_url}}

À bientôt,
L'équipe {{platform_name}}
```

#### Template 2 : Confirmation commande (ID: `template_order_confirm`)
```
Sujet : ✅ Commande {{order_code}} confirmée — {{platform_name}}

Bonjour {{to_name}},

Ta commande a bien été enregistrée !

━━━━━━━━━━━━━━━━━━━━━━━━
CODE DE COMMANDE : {{order_code}}
━━━━━━━━━━━━━━━━━━━━━━━━

📦 Produit   : {{product_name}}
👤 Vendeur   : {{seller_name}}
🔢 Quantité  : {{quantity}}
💰 Prix unit : {{unit_price}}
💳 TOTAL     : {{total}}
📝 Note      : {{notes}}

📅 Passée le : {{order_date}}

Garde ton code de commande — le vendeur en aura besoin
lors de la remise de ta commande.

Des questions ? Contacte-nous : {{platform_email}}

{{platform_name}}
```

#### Template 3 : Nouvelle commande → Vendeur (ID: `template_order_notify`)
```
Sujet : 🛍 Nouvelle commande {{order_code}} — {{platform_name}}

Bonjour {{to_name}},

Tu as reçu une nouvelle commande !

Code : {{order_code}}
Client : {{buyer_name}} ({{buyer_phone}})
Produit : {{product_name}} × {{quantity}}
Total : {{total}}
Note : {{notes}}

Passée le {{order_date}}

{{platform_name}}
```

#### Template 4 : Facture commission (ID: `template_invoice`)
```
Sujet : 🧾 Facture commission {{period_label}} — {{platform_name}}

Bonjour {{to_name}},

Ta facture de commission pour la période {{period_label}} est disponible.

CA réalisé : {{revenue}}
Taux       : {{commission_rate}}
Montant dû : {{amount_due}}
À payer avant le : {{due_date}}

Paiement via Wave :
→ Numéro : {{wave_number}}
→ Nom    : {{wave_name}}

{{instructions}}

{{platform_name}} — {{platform_email}}
```

### 2.4 Récupérer les clés
1. **Account** → **API Keys** → note ta **Public Key**
2. Note ton **Service ID** depuis Email Services

---

## ÉTAPE 3 — Configurer le projet

Ouvre `js/config.js` et remplis toutes les valeurs :

```javascript
/* 1. SUPABASE */
const SUPABASE_URL = 'https://XXXXXX.supabase.co';  // Project URL
const SUPABASE_KEY = 'eyJhbGc...';                  // anon/public key

/* 2. EMAILJS */
const EMAILJS_PUBLIC_KEY       = 'XXXXXXXXXX';      // Account → API Keys
const EMAILJS_SERVICE_ID       = 'service_XXXXXX';  // Email Services
const EMAILJS_TEMPLATE_WELCOME = 'template_welcome';
const EMAILJS_TEMPLATE_INVOICE = 'template_invoice';

/* 3. PAIEMENT WAVE */
const WAVE_NUMBER = '+221 7X XXX XX XX';            // Ton numéro Wave
const WAVE_NAME   = "Nel'si";                       // Ton prénom

/* 4. PLATEFORME */
const PLATFORM_NAME       = 'N Market';
const PLATFORM_EMAIL      = 'admin@nmarket.sn';     // Ton email
const COMMISSION_RATE_PCT = 5;                      // Taux %
```

---

## ÉTAPE 4 — Déployer sur Netlify

### 4.1 Méthode Git (recommandée)
1. Push le dossier `nmarket/` sur GitHub
2. Va sur [netlify.com](https://netlify.com) → **New site from Git**
3. Connecte ton repo → **Deploy site**
4. Netlify détecte automatiquement le `netlify.toml`

### 4.2 Méthode drag & drop
1. Va sur [netlify.com](https://netlify.com) → **Sites** → **Add new site**
2. Glisse-dépose le **dossier `nmarket/`** directement
3. Le site est en ligne en 30 secondes

### 4.3 Domaine personnalisé (optionnel)
1. **Domain settings** → **Add custom domain**
2. Ajoute `nmarket.ton-domaine.sn` (ou autre)
3. Suis les instructions DNS

---

## ÉTAPE 5 — Vérifications post-déploiement

### Checklist
- [ ] La page d'accueil charge et affiche "Aucun produit disponible"
- [ ] La modal de connexion s'ouvre bien
- [ ] Créer un compte vendeur → email de bienvenue reçu
- [ ] Se connecter → accès à l'espace vendeur
- [ ] Ajouter un produit → visible sur la page d'accueil
- [ ] Passer une commande → email de confirmation reçu + code généré
- [ ] Le ticket PNG se télécharge correctement
- [ ] L'accès super admin (`/pages/superadmin.html`) fonctionne
- [ ] Le chat envoie et reçoit des messages

### URL importantes après déploiement
```
Site public    : https://ton-site.netlify.app/
Espace vendeur : https://ton-site.netlify.app/pages/admin.html
Super admin    : https://ton-site.netlify.app/pages/superadmin.html
```

---

## Récapitulatif des IDs à configurer

| Variable | Où la trouver | Exemple |
|----------|---------------|---------|
| `SUPABASE_URL` | Supabase → Settings → API | `https://abc.supabase.co` |
| `SUPABASE_KEY` | Supabase → Settings → API → anon key | `eyJhbGc...` |
| `EMAILJS_PUBLIC_KEY` | EmailJS → Account → API Keys | `user_XXXXX` |
| `EMAILJS_SERVICE_ID` | EmailJS → Email Services | `service_XXXXX` |
| `WAVE_NUMBER` | Ton compte Wave | `+221 77 XXX XX XX` |
| Mot de passe admin | Tu le choisis | via `btoa(encodeURIComponent(...))` |

---

*N Market — codé par Nel'si*
