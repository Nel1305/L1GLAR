# N Market — Google Maps + WhatsApp (Meta) : mise en route

> ℹ️ **WhatsApp est actuellement affiché « Bientôt disponible »** sur le site (`WHATSAPP_ENABLED = false`) : la page affiche « en cours de préparation » et la case WhatsApp du formulaire de commande est masquée. Tout se réactive en passant `WHATSAPP_ENABLED = true` une fois les étapes B–D faites.

Tout ce qui suit demande **tes** comptes (Google Cloud, Meta Business, Supabase). Rien ne part tant que les
étapes ne sont pas faites : le site continue de fonctionner normalement (sans carte intégrée, sans WhatsApp).

## Ce qui a été ajouté

| Fonction | Où |
|---|---|
| Livraison hors campus : bouton **« Utiliser ma position »**, carte Google avec repère déplaçable, adresse pré-remplie | formulaire de commande (`js/maps.js`) |
| Le vendeur voit la **carte + Itinéraire + Ouvrir dans Google Maps** (et le point du campus pour les livraisons campus) | Mes commandes → détail |
| **Code de reçu** `NM-XXXX-XXXX` (un par article) sur le ticket, l'écran de confirmation et le message WhatsApp | commande |
| **Retour par code** (remplace n° de commande + téléphone) | page Retours |
| Messages WhatsApp **automatiques** : reçu au client, nouvelle commande au vendeur, changement de statut, demande de retour et réponse | Edge Functions (`supabase/functions`) |
| **Page WhatsApp** : conversations clients, contexte de commande, réponse depuis la plateforme, temps réel | menu vendeur **et** Super Admin |

## Ordre des étapes

1. **SQL** : exécute `secure_05_maps_whatsapp.sql` (après 01, 02, 04).
2. **Google Maps** (étape A) → renseigne `GOOGLE_MAPS_API_KEY` et `CAMPUS` dans `js/config.js`.
3. **Meta** (étape B) → crée l'app, le numéro, les modèles, le jeton.
4. **Supabase** (étape C) → déploie les 3 fonctions, ajoute les secrets, branche la base.
5. **Webhook Meta** (étape D) → pointe Meta vers `wa-webhook`.
6. Passe `WHATSAPP_ENABLED = true` dans `js/config.js`, redéploie le site.

---

## A. Google Maps

1. console.cloud.google.com → crée un projet → **active la facturation** (obligatoire pour Maps ; Google offre un crédit mensuel).
2. *APIs & Services → Library* : active **Maps JavaScript API** et **Geocoding API** (celle-ci sert à remplir l'adresse depuis le repère ; facultative).
3. *Credentials → Create credentials → API key*, puis **restreins-la** :
   - *Application restrictions* : **Websites (HTTP referrers)** → `https://ton-domaine.netlify.app/*` (et ton domaine perso).
   - *API restrictions* : Maps JavaScript API + Geocoding API seulement.
   - ⚠ La clé est visible dans le navigateur : c'est normal pour Maps, **la restriction par domaine est ce qui la protège**. Ajoute aussi un **budget/quota d'alerte** dans Google Cloud.
4. `js/config.js` :
   ```js
   const GOOGLE_MAPS_API_KEY = 'AIza…';
   const CAMPUS = { name: 'ESTM Dakar', lat: 14.xxxx, lng: -17.xxxx }; // clic droit sur Google Maps → copier les coordonnées
   ```
5. Sans clé : tout marche quand même (GPS du navigateur + liens Google Maps), juste sans carte intégrée.

La CSP (`netlify.toml`) autorise déjà `maps.googleapis.com` / `maps.gstatic.com`. Le navigateur demande la permission de localisation au client ; s'il refuse, il place le repère à la main ou écrit son adresse.

---

## B. Meta (WhatsApp Business Platform)

Dans **Meta Business Suite / Business Manager** (déjà créé) puis **developers.facebook.com** :

1. *Mes apps → Créer une app* (type **Business**), rattachée à ton Business Manager. Ajoute le produit **WhatsApp**.
2. *WhatsApp → API Setup* : ajoute ton **numéro de téléphone** (un numéro dédié à la plateforme ; un numéro déjà utilisé dans l'appli WhatsApp doit d'abord en être retiré – vérifie les conditions actuelles dans la doc Meta). Note :
   - **Phone number ID** → secret `WA_PHONE_NUMBER_ID`
   - le numéro lui-même → `WHATSAPP_BUSINESS_NUMBER` dans `js/config.js` (format `221771234567`)
3. **Jeton permanent** : Business Settings → *Users → System users* → crée un utilisateur système (Admin), assigne-lui l'app + le compte WhatsApp, puis *Generate token* avec les permissions `whatsapp_business_messaging` et `whatsapp_business_management` → secret `WA_TOKEN`. (Le jeton de test de 24 h ne convient pas.)
4. **App Secret** : App → Settings → Basic → secret `WA_APP_SECRET` (sert à vérifier que le webhook vient bien de Meta).
5. **Vérification de l'entreprise** : demande-la dans Business Settings → Security Center ; sans elle les envois sont limités.
6. **Modèles de messages** (*WhatsApp Manager → Message templates*). Un message envoyé **à l'initiative de la plateforme** doit utiliser un modèle approuvé. Crée ces 6 modèles, catégorie **Utilitaire**, langue **Français (fr)**, avec **exactement** ces noms et textes (les `{{n}}` sont les variables ; Meta demande un exemple pour chacune) :

| Nom | Texte |
|---|---|
| `nm_order_receipt` | Bonjour {{1}}, ta commande {{2}} est bien reçue. Total : {{3}} FCFA. Code(s) de reçu : {{4}}. Garde ce code : il te servira pour un retour. Vendeur : {{5}}. |
| `nm_new_order_seller` | Nouvelle commande : {{1}} — {{2}} FCFA. Client : {{3}} ({{4}}). Livraison : {{5}}. Détails dans ton espace vendeur. |
| `nm_order_status` | Bonjour {{1}}, ta commande {{2}} ({{3}}) est maintenant : {{4}}. |
| `nm_return_ack` | Ta demande de retour pour {{1}} a bien été transmise au vendeur. Tu recevras sa réponse ici. |
| `nm_return_seller` | Demande de retour pour {{1}} (client : {{2}}, {{3}}). Motif : {{4}}. Réponds depuis ton espace vendeur. |
| `nm_return_status` | Ta demande de retour pour {{1}} est {{2}}. Réponse du vendeur : {{3}}. Merci de ta confiance ! |

   Exemples pour Meta : {{1}} `Amina` · {{2}} `#42` · {{3}} `1 500` · {{4}} `NM-AB3K-9XQ2` · {{5}} `Alice Shop`. Si tu changes un texte, change-le aussi dans `supabase/functions/_shared/wa.ts` (ou renomme via les secrets `WA_TPL_RECEIPT`, `WA_TPL_SELLER_NEW`, `WA_TPL_STATUS`, `WA_TPL_RETURN_ACK`, `WA_TPL_RETURN_SELLER`, `WA_TPL_RETURN_STATUS`). L'approbation prend de quelques minutes à quelques heures.

### Règles WhatsApp à connaître
- **Consentement** : le client coche « Recevoir mon reçu… sur WhatsApp » (décochée par défaut) ; rien ne lui est envoyé sinon. Les vendeurs peuvent couper leurs notifications (case en haut de la page WhatsApp).
- **Fenêtre de 24 h** : un message libre n'est possible que dans les 24 h après le dernier message du **client**. Au-delà, la page WhatsApp désactive la zone de saisie (seuls les modèles automatiques partent).
- **Coût** : les modèles sont facturés par Meta à l'envoi (selon pays/catégorie) ; consulte la grille tarifaire dans WhatsApp Manager.
- Tant que ton numéro n'est pas validé, Meta n'autorise l'envoi qu'à quelques numéros de test.
- Les numéros à 9 chiffres sont complétés avec l'indicatif `WHATSAPP_DEFAULT_CC` (`221`). Les vendeurs doivent avoir un numéro valide dans leur profil.

---

## C. Supabase : fonctions + secrets

Avec la CLI Supabase (`npm i -g supabase`, puis `supabase login` et `supabase link --project-ref qknoqmwmvqlcejbpkkgt`) :

```bash
supabase functions deploy wa-notify
supabase functions deploy wa-send
supabase functions deploy wa-webhook

supabase secrets set \
  WA_TOKEN='<jeton permanent>' \
  WA_PHONE_NUMBER_ID='<phone number id>' \
  WA_APP_SECRET='<app secret>' \
  WA_VERIFY_TOKEN='<une longue phrase aléatoire de ton choix>' \
  WA_NOTIFY_SECRET='<un autre long secret aléatoire>' \
  WA_DEFAULT_CC=221
```

(`supabase/config.toml` désactive la vérification JWT uniquement pour `wa-notify` et `wa-webhook`, qui se protègent par secret / signature Meta. `wa-send` exige un utilisateur connecté.)

**Brancher la base** (éditeur SQL, avec TES valeurs ; le secret doit être identique à `WA_NOTIFY_SECRET`) :

```sql
INSERT INTO wa_config (key, value) VALUES
  ('notify_url',    'https://qknoqmwmvqlcejbpkkgt.supabase.co/functions/v1/wa-notify'),
  ('notify_secret', '<le même secret que WA_NOTIFY_SECRET>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

L'extension **pg_net** doit être active (Dashboard → Database → Extensions). Tant que `wa_config` est vide, aucun appel n'est fait et les commandes marchent normalement ; un échec WhatsApp ne bloque **jamais** une commande.

## D. Webhook Meta (réponses des clients + accusés de lecture)

App Meta → WhatsApp → *Configuration* :
- **Callback URL** : `https://qknoqmwmvqlcejbpkkgt.supabase.co/functions/v1/wa-webhook`
- **Verify token** : la valeur de `WA_VERIFY_TOKEN`
- Clique *Verify and save*, puis **abonne le champ `messages`**.

---

## Comportement à connaître

- Un message reçu d'un client est rattaché au **vendeur de sa commande la plus récente** (même numéro). Si le numéro est inconnu, seul le Super Admin le voit.
- Chaque vendeur ne voit **que** ses clients (règle de sécurité côté base) ; le Super Admin voit tout.
- Les retours se font désormais avec le **code de reçu** ; 40 codes faux / 10 min bloquent temporairement la saisie (anti-devinette).
- Anciennes commandes : un code leur a été attribué par `secure_05` (visible dans le détail côté vendeur).
- `fn_place_order` change de signature : si tu avais des appels extérieurs, ils doivent passer `p_wa_opt_in`.

## Test de bout en bout

1. Commande test avec « hors campus » + position + case WhatsApp cochée → ticket avec `NM-…`.
2. Le vendeur reçoit le WhatsApp « Nouvelle commande » avec le lien Google Maps ; le client reçoit son reçu.
3. Le client répond sur WhatsApp → la conversation apparaît dans **WhatsApp** (vendeur et Super Admin), le vendeur répond depuis le site.
4. Page Retours : saisir le code → demande créée, WhatsApp d'accusé au client et d'alerte au vendeur.
5. Marquer la commande « livrée » → message de statut au client.
