/* ═══════════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — config.js
   ► Remplis TOUTES les valeurs ci-dessous avant de déployer
═══════════════════════════════════════════════════════ */

/* ── 1. SUPABASE ── */
const SUPABASE_URL = 'https://XXXXXXXXXXXX.supabase.co'; // ← Settings → API → Project URL
const SUPABASE_KEY = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // ← Settings → API → anon/public key

/* ── 2. EMAILJS ── */
const EMAILJS_PUBLIC_KEY    = 'XXXXXXXXXXXXXXXX';  // ← Account → API Keys → Public Key
const EMAILJS_SERVICE_ID    = 'service_XXXXXXX';   // ← Email Services → ton service
const EMAILJS_TEMPLATE_WELCOME  = 'template_welcome';   // ← template confirmation de compte
const EMAILJS_TEMPLATE_INVOICE  = 'template_invoice';   // ← template facture commission

/* ── 3. PAIEMENT WAVE ── */
const WAVE_NUMBER = '+221 XX XXX XX XX'; // ← Ton numéro Wave pour recevoir les paiements
const WAVE_NAME   = 'Nel\'si';           // ← Ton prénom affiché dans le mail

/* ── 4. PLATEFORME ── */
const PLATFORM_NAME       = 'Market Place L1 GLAR';
const PLATFORM_EMAIL      = 'admin@glar.com';      // ← Email affiché dans les mails
const COMMISSION_RATE_PCT = 5;                     // ← Taux de commission (%)
