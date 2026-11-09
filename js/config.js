/* ═══════════════════════════════════════════════════════
   N MARKET — config.js
   ► Remplis TOUTES les valeurs ci-dessous avant de déployer
═══════════════════════════════════════════════════════ */

/* ── 1. SUPABASE ── */
const SUPABASE_URL = 'https://qknoqmwmvqlcejbpkkgt.supabase.co'; // ← Settings → API → Project URL
const SUPABASE_KEY = 'sb_publishable__HOYwyn9kHOiqU8CADOvBg__eycTWo8'; // ← Settings → API → anon/public key

/* ── 2. EMAILJS ── */
const EMAILJS_PUBLIC_KEY = 'C6F_StHUlgq2eIluh';  // ← Account → API Keys → Public Key
const EMAILJS_SERVICE_ID = 'service_ba2jyzr';   // ← Email Services → ton service
const EMAILJS_TEMPLATE_WELCOME = 'template_pjffqw3';   // ← template confirmation de compte
const EMAILJS_TEMPLATE_INVOICE = 'template_ok738pd';   // ← template facture commission
const EMAILJS_TEMPLATE_SELLER_NOTIF = 'template_seller_notif'; // ← template notification nouvelle commande (vendeur)

/* ── 3. PAIEMENT WAVE ── */
const WAVE_NUMBER = '+221 77 597 71 14'; // ← Ton numéro Wave pour recevoir les paiements
const WAVE_NAME = 'Nel\'si';           // ← Ton prénom affiché dans le mail

/* ── 4. PLATEFORME ── */
const PLATFORM_NAME = 'N Market';
const PLATFORM_EMAIL = 'ppbuabey@gmail.com';      // ← Email affiché dans les mails
const COMMISSION_RATE_PCT = 2;                     // ← Taux de commission (%)

/* ── 5. GOOGLE MAPS (carte de livraison hors campus) ──
   Clé API : console.cloud.google.com → APIs & Services → Credentials.
   Active « Maps JavaScript API » (+ « Geocoding API » pour pré-remplir l'adresse).
   RESTREINS la clé aux sites HTTP referrers de ton domaine (voir WHATSAPP_MAPS_LISEZMOI.md).
   Laisse vide pour fonctionner sans carte : le client partage sa position GPS et le vendeur
   ouvre Google Maps via un lien. */
const GOOGLE_MAPS_API_KEY = '';
/* Point de repère du campus (clic droit sur Google Maps → copier les coordonnées) */
const CAMPUS = { name: 'Campus', lat: null, lng: null };
/* Centre de la carte quand le client n'a pas encore partagé sa position (Dakar par défaut) */
const MAP_DEFAULT_CENTER = { lat: 14.6937, lng: -17.4441 };

/* ── 6. WHATSAPP (Meta Cloud API) ──
   Les messages automatiques partent des Edge Functions Supabase (le jeton Meta n'est JAMAIS ici).
   Mets true quand les fonctions sont déployées : la boîte WhatsApp des vendeurs devient active. */
const WHATSAPP_ENABLED = false;
const WHATSAPP_DEFAULT_CC = '221';     // indicatif ajouté aux numéros locaux à 9 chiffres (221 = Sénégal)
const WHATSAPP_BUSINESS_NUMBER = '';   // numéro WhatsApp Business affiché aux clients (ex : '221771234567')
