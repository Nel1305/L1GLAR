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

module.exports = { esc, jsonScript, slugify, productPath, origin, rest, indexHtml, SITE_NAME };
