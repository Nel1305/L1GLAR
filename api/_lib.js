// Fonctions communes aux pages « SEO » (produit + sitemap). Lecture seule, avec la clé publique Supabase.
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qknoqmwmvqlcejbpkkgt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable__HOYwyn9kHOiqU8CADOvBg__eycTWo8';
const SITE_NAME = 'N Market';

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// JSON placé dans <script> : on neutralise « < » pour qu'aucun texte ne puisse fermer la balise
const jsonScript = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));

function slugify(name) {
  const t = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return t;
}
const productPath = p => '/p/' + p.id + (slugify(p.name) ? '-' + slugify(p.name) : '');

function origin(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return 'https://' + (/^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : 'n-market-sigma.vercel.app');
}

async function rest(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}

function indexHtml() {
  return fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
}

const shopPath = s => '/boutique/' + s.id + (slugify(s.name) ? '-' + slugify(s.name) : '');
const CAT_LABELS = { food: 'Nourriture', drink: 'Boissons', other: 'Autres' };
const catLabel = c => CAT_LABELS[c] || (c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : 'Autres');
const safeHttps = u => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const fmt = n => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');

/* Assemble la page : l'appli (index.html) + balises SEO propres à la page + texte lisible par les robots.
   - les balises SEO « génériques » de l'accueil (data-seo) sont retirées pour éviter les doublons ;
   - le bloc #seoPage est visible tant que l'appli n'a pas démarré, puis l'appli le retire (même contenu que la fiche affichée). */
function renderShell(html, o) {
  html = html.replace(/<(meta|link)\b[^>]*\bdata-seo\b[^>]*>/g, '').replace(/<script\b[^>]*\bdata-seo\b[^>]*>[\s\S]*?<\/script>/g, '');
  const head = `<base href="/">
<meta name="robots" content="${o.noindex ? 'noindex' : 'index,follow,max-image-preview:large'}">
${o.canonical ? `<link rel="canonical" href="${esc(o.canonical)}">` : ''}
<meta name="description" content="${esc(o.desc)}">
<meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">${o.canonical ? `<meta property="og:url" content="${esc(o.canonical)}">` : ''}
<meta property="og:image" content="${esc(o.image)}"><meta property="og:image:alt" content="${esc(o.imageAlt || o.title)}">
${(o.meta || []).join('\n')}
<meta name="twitter:card" content="${o.imageIsPhoto ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.desc)}"><meta name="twitter:image" content="${esc(o.image)}">
${(o.ld || []).map(x => `<script type="application/ld+json">${jsonScript(x)}</script>`).join('\n')}`;
  return html.replace(/<title>[^<]*<\/title>/, `<title>${esc(o.title)}</title>`)
             .replace('<head>', '<head>' + head)
             .replace(/<body([^>]*)>/, s => s + (o.body || ''));
}

module.exports = { esc, jsonScript, slugify, productPath, shopPath, catLabel, safeHttps, clip, fmt, renderShell, origin, rest, indexHtml, SITE_NAME };
