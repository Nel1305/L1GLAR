/* ═══════════════════════════════════════════════════════
   N MARKET — config.js
   ► Remplis TOUTES les valeurs ci-dessous avant de déployer
═══════════════════════════════════════════════════════ */

/* ── 1. SUPABASE ── */
const SUPABASE_URL = 'https://qknoqmwmvqlcejbpkkgt.supabase.co'; // ← Settings → API → Project URL
const SUPABASE_KEY = 'sb_publishable__HOYwyn9kHOiqU8CADOvBg__eycTWo8'; // ← Settings → API → anon/public key

/* ── 2. EMAILJS ── */
const EMAILJS_PUBLIC_KEY    = 'C6F_StHUlgq2eIluh';  // ← Account → API Keys → Public Key
const EMAILJS_SERVICE_ID    = 'service_ba2jyzr';   // ← Email Services → ton service
const EMAILJS_TEMPLATE_WELCOME  = 'template_pjffqw3';   // ← template confirmation de compte
const EMAILJS_TEMPLATE_INVOICE  = 'template_dwcyv7g';   // ← template facture commission
const EMAILJS_TEMPLATE_SELLER_NOTIF = 'template_seller_notif'; // ← template notification nouvelle commande (vendeur)

/* ── 3. PAIEMENT WAVE ── */
const WAVE_NUMBER = '+221 77 597 71 14'; // ← Ton numéro Wave pour recevoir les paiements
const WAVE_NAME   = 'Nel\'si';           // ← Ton prénom affiché dans le mail

/* ── 4. PLATEFORME ── */
const PLATFORM_NAME       = 'N Market';
const PLATFORM_EMAIL      = 'ppbuabey@gmail.com';      // ← Email affiché dans les mails
const COMMISSION_RATE_PCT = 5;                     // ← Taux de commission (%)
