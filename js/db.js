/* ═══════════════════════════════════════════════════
   N MARKET — db.js  (Supabase)
═══════════════════════════════════════════════════ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // Le Super Admin a sa PROPRE session : s'y connecter ou en sortir ne touche plus la session vendeur/client
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
          storageKey: /superadmin/i.test(location.pathname) ? 'nm-admin-auth' : 'nm-user-auth' }
});

/* Badge « compte vérifié » (rosace bleue + coche blanche, façon réseaux sociaux) */
function vBadge(title) {
  return `<span class="vbadge" role="img" aria-label="Compte vérifié" title="${String(title || 'Vendeur vérifié : identité contrôlée par N Market').replace(/"/g, '&quot;')}"><svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path fill="#0095f6" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.4l3.1 3 5.8-6.2"/></svg></span>`;
}

/* ── ÉCHAPPEMENT HTML (anti-XSS) ──
   TOUTE donnée venant de la base (noms, descriptions, messages, adresses…) doit
   passer par esc() avant d'être insérée dans du HTML. safeImg/safeHref/safeColor
   valident les valeurs utilisées dans src / href / style. */
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}
/* URL d'image : https:// ou data:image/(png|jpeg|webp|gif) uniquement, sinon '' */
function safeImg(u) {
  u = String(u || '').trim();
  return (/^https:\/\/[^\s"'<>]+$/i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(u)) ? esc(u) : '';
}
/* Lien cliquable : http(s) uniquement */
function safeHref(u) {
  u = String(u || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? esc(u) : '';
}
/* Couleur : #rgb / #rrggbb uniquement */
function safeColor(c, fallback) {
  c = String(c || '').trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : (fallback || '#404040');
}
/* Adresse lisible d'un produit : 12-robe-wax-bleue (identique à celle du serveur /api/product) */
function productSlug(p) {
  const t = String(p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return p.id + (t ? '-' + t : '');
}
/* Vignette produit : image validée, sinon emoji (échappé) */
function thumbHtml(p, alt) {
  const src = safeImg(p.photo);
  return src ? `<img src="${src}" alt="${esc(alt || '')}">` : (esc(p.emoji) || catEmoji(p.cat));
}
/* Pour un argument JS dans un attribut onclick="…" : jamais de concaténation brute */
function jsArg(v) { return esc(JSON.stringify(v === undefined ? null : v)); }

/* ── SESSION ──
   L'identité est portée par Supabase Auth (JWT signé, vérifié par la base via RLS).
   Le profil vendeur ci-dessous n'est QU'UN CACHE D'AFFICHAGE : le modifier dans la
   console du navigateur ne donne aucun droit supplémentaire. */
let _profile = null;
function getSession()   { return _profile; }
function setSession(u)  { _profile = u; }
async function clearSession() { _profile = null; try { await db.auth.signOut({ scope: 'local' }); } catch (e) {} }   // local : ne déconnecte pas les autres appareils / sessions

const USER_COLS = 'id, first_name, last_name, name, email, phone, bio, shop_open, is_blocked, blocked_reason, billing_period, filiere, created_at, verified, verification_status, verif_deadline, verif_submitted_at';

/* Charge la session Auth courante + le profil vendeur. À appeler au démarrage de chaque page. */
async function initSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { _profile = null; return null; }
  const { data, error } = await db.from('users').select(USER_COLS).eq('auth_id', session.user.id).maybeSingle();
  let row = data;
  if (!error && !row) {                 // compte Auth sans profil (ancien compte) : on le recrée côté serveur
    const { data: pid } = await db.rpc('fn_ensure_profile');
    if (pid) { const r2 = await db.from('users').select(USER_COLS).eq('auth_id', session.user.id).maybeSingle(); row = r2.data; }
  }
  if (error || !row) { _profile = null; return null; }          // compte Auth sans profil vendeur (ex. admin)
  if (row.is_blocked) { await clearSession(); return null; }
  _profile = nu(row);
  return _profile;
}

function authErrMsg(error) {
  const m = (error && error.message) || '';
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m))       return 'Confirme d\'abord ton email (lien reçu par mail).';
  if (/already registered|already been registered|déjà utilisé/i.test(m)) return 'Cet email est déjà utilisé.';
  if (/Database error saving new user/i.test(m)) return 'Création impossible : email déjà utilisé, ou erreur du serveur. Si cet email est nouveau, préviens l\'administrateur (erreur base de données).';
  if (/email.*(rate|limit)|over_email_send_rate_limit/i.test(m)) return 'Trop d\'emails envoyés pour le moment. Réessaie dans une heure.';
  if (/signups? (not allowed|disabled)/i.test(m)) return 'Les inscriptions sont désactivées pour le moment.';
  if (/redirect/i.test(m) && /not allowed|invalid/i.test(m)) return 'Adresse de redirection non autorisée (réglage Supabase).';
  if (/rate limit|too many/i.test(m))       return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/banned|suspend/i.test(m))            return 'Ton compte est actuellement suspendu. Contacte l\'administrateur.';
  if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Mot de passe trop faible (8 caractères minimum).';
  return m || 'Erreur inconnue.';
}

/* ── USERS ── */
async function dbCreateUser(first, last, email, phone, pass, filiere) {
  const { data, error } = await db.auth.signUp({
    email: email.trim(), password: pass,
    options: { data: { first_name: first, last_name: last || '', phone: phone || '', filiere: filiere || '' },
               emailRedirectTo: location.origin + '/pages/admin.html' }
  });
  if (error) return { error: authErrMsg(error) };
  // Supabase renvoie un faux succès (sans session) si l'email existe déjà et que la confirmation est activée
  if (!data.session) {
    // Pas de confirmation par email : on ouvre la session aussitôt (si l'email existait déjà, le mot de passe sera refusé)
    const { error: e2 } = await db.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (e2) {
      if (/not confirmed/i.test(e2.message || '')) return { error: 'Confirmation par email encore active dans Supabase : désactive « Confirm email » (Authentication → Providers → Email) ou exécute secure_08_auto_confirm.sql.' };
      return { error: 'Cet email est déjà utilisé. Connecte-toi ou réinitialise ton mot de passe.' };
    }
  }
  const u = await initSession();
  if (!u) return { error: 'Compte créé mais profil introuvable. Réessaie de te connecter.' };
  return { user: u };
}
/* Le Super Admin n'a PAS de page de connexion à lui : il se connecte par le formulaire normal.
   Si le compte est administrateur, sa session est copiée dans l'espace admin (clé de stockage séparée)
   puis retirée de la session client, et on le redirige vers le Super Admin. */
function _adminStorageKey() { return 'nm-admin-auth'; }
async function _handoffAdminSession(session) {
  const ac = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: _adminStorageKey() } });
  const { error } = await ac.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return !error;
}
async function dbLoginUser(email, pass) {
  const { data: sd, error } = await db.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (error) return { error: authErrMsg(error) };
  try {
    const { data: adm } = await db.from('admins').select('id').eq('auth_id', sd.session.user.id).maybeSingle();
    if (adm) {
      if (await _handoffAdminSession(sd.session)) { await clearSession(); return { admin: true }; }
      await clearSession(); return { error: 'Connexion impossible. Réessaie.' };
    }
  } catch (e) { /* pas admin : suite normale */ }
  const u = await initSession();
  if (!u) { await clearSession(); return { error: 'Ton compte est suspendu ou introuvable. Contacte l\'administrateur.' }; }
  return { user: u };
}
async function dbRequestPasswordReset(email) {
  const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/index.html' });
  return error ? { error: authErrMsg(error) } : { ok: true };
}
async function dbSetNewPassword(pass) {
  const { error } = await db.auth.updateUser({ password: pass });
  return error ? { error: authErrMsg(error) } : { ok: true };
}
async function dbUpdateUser(id, f) {
  const p = {};
  if (f.firstName !== undefined) p.first_name  = f.firstName;
  if (f.lastName  !== undefined) p.last_name   = f.lastName;
  if (f.name      !== undefined) p.name        = f.name;
  if (f.phone     !== undefined) p.phone       = f.phone;
  if (f.bio       !== undefined) p.bio         = f.bio;
  if (f.shopOpen  !== undefined) p.shop_open   = f.shopOpen;
  if (f.filiere   !== undefined) p.filiere     = f.filiere;
  if (Object.keys(p).length) {
    const { error } = await db.from('users').update(p).eq('id', id);
    if (error) return { error: error.message };
  }
  let notice = '';
  if (f.email && _profile && f.email.trim().toLowerCase() !== (_profile.email || '').toLowerCase()) {
    const { error } = await db.auth.updateUser({ email: f.email.trim() });
    if (error) return { error: authErrMsg(error) };
    notice = 'Un lien de confirmation a été envoyé à ta nouvelle adresse email.';
  }
  if (f.password) {
    const { error } = await db.auth.updateUser({ password: f.password });
    if (error) return { error: authErrMsg(error) };
  }
  const { data, error } = await db.from('users').select(USER_COLS).eq('id', id).single();
  if (error) return { error: error.message };
  return { user: nu(data), notice };
}
/* Super Admin uniquement (RLS : un vendeur n'obtient que sa propre ligne) */
async function dbGetAllUsers() {
  const { data, error } = await db.from('users').select(USER_COLS).order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return (data || []).map(nu);
}
/* Vitrine publique : aucun email / téléphone */
async function dbGetPublicSellers() {
  const { data, error } = await db.from('public_sellers').select('id, name, bio, shop_open, filiere, verified').order('name');
  if (error) { console.error(error); return []; }
  return (data || []).map(nu);
}
function nu(r) {
  return { id:r.id, firstName:r.first_name||(r.name||'?'), lastName:r.last_name, name:r.name, email:r.email, phone:r.phone, bio:r.bio, shopOpen:r.shop_open, isBlocked:r.is_blocked||false, blockedReason:r.blocked_reason||'', billingPeriod:r.billing_period||'monthly', filiere:r.filiere||'', createdAt:r.created_at,
           verified:!!r.verified, verificationStatus:r.verification_status||'none', verifDeadline:r.verif_deadline||null, verifSubmittedAt:r.verif_submitted_at||null };
}

/* ── PRODUCTS ── */
async function dbGetProducts(f = {}) {
  let q = db.from('products').select('*').order('created_at', { ascending: false });
  if (f.sellerId)  q = q.eq('seller_id', f.sellerId);
  if (f.available) q = q.eq('available', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(np);
}
async function dbInsertProduct(sellerId, sellerName, f) {
  const { data, error } = await db.from('products').insert({ seller_id:sellerId, name:f.name, description:f.desc||'', category:f.cat, price:f.price, emoji:f.emoji||'🛍️', photo_url:f.photo||null, available:true, track_stock:f.trackStock||false, stock:f.trackStock?(f.stock||0):0, show_stock:f.showStock!==false }).select().single();
  if (error) return { error: error.message };
  return { product: np(data) };
}
async function dbUpdateProduct(id, f) {
  const p = {};
  if (f.name      !== undefined) p.name        = f.name;
  if (f.desc      !== undefined) p.description = f.desc;
  if (f.cat       !== undefined) p.category    = f.cat;
  if (f.price     !== undefined) p.price       = f.price;
  if (f.emoji     !== undefined) p.emoji       = f.emoji;
  if (f.photo     !== undefined) p.photo_url   = f.photo;
  if (f.available !== undefined) p.available   = f.available;
  if (f.trackStock!== undefined) p.track_stock = f.trackStock;
  if (f.stock     !== undefined) p.stock       = f.stock;
  if (f.showStock !== undefined) p.show_stock  = f.showStock;
  const { data, error } = await db.from('products').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { product: np(data) };
}
async function dbDeleteProduct(id) {
  const { error } = await db.from('products').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function np(r) {
  return { id:r.id, sellerId:r.seller_id, sellerName:r.seller_name, name:r.name, desc:r.description, cat:r.category, price:r.price, emoji:r.emoji, photo:r.photo_url, rating:parseFloat(r.rating)||0, votes:r.votes||0, available:r.available, createdAt:r.created_at,
    trackStock:r.track_stock||false, stock:r.stock||0, showStock:r.show_stock!==false };
}
function isOutOfStock(p)  { return !!(p.trackStock && p.stock <= 0); }
function stockBadgeHtml(p) {
  if (!p.trackStock) return '';
  if (p.stock <= 0) return `<div class="stock-badge out">Rupture de stock</div>`;
  if (p.showStock)  return `<div class="stock-badge ok">En stock · ${Number(p.stock)||0} restant${p.stock>1?'s':''}</div>`;
  return `<div class="stock-badge ok">En stock</div>`;
}

/* ── CATEGORIES (« classes » du catalogue, gérées par le Super Admin) ── */
async function dbGetCategories() {
  const { data, error } = await db.from('categories').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []).map(ncat);
}
async function dbInsertCategory(f) {
  const { data, error } = await db.from('categories').insert({ slug:f.slug, label:f.label, emoji:f.emoji||'🛍️', color:f.color||'#404040', sort_order:f.sortOrder||0 }).select().single();
  if (error) return { error: error.message };
  return { category: ncat(data) };
}
async function dbUpdateCategory(id, f) {
  const p = {};
  if (f.slug      !== undefined) p.slug       = f.slug;
  if (f.label     !== undefined) p.label      = f.label;
  if (f.emoji     !== undefined) p.emoji      = f.emoji;
  if (f.color     !== undefined) p.color      = f.color;
  if (f.sortOrder !== undefined) p.sort_order = f.sortOrder;
  const { data, error } = await db.from('categories').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { category: ncat(data) };
}
async function dbDeleteCategory(id) {
  const { error } = await db.from('categories').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function ncat(r) {
  return { id:r.id, slug:r.slug, label:r.label, emoji:r.emoji||'🛍️', color:r.color||'#404040', sortOrder:r.sort_order||0 };
}

/* Cache local des catégories — chargée au démarrage de chaque page via loadCategories() */
let _categoriesCache = [];
async function loadCategories() {
  _categoriesCache = await dbGetCategories();
  if (!_categoriesCache.length) {
    // Fallback si la table est vide / pas encore créée
    _categoriesCache = [
      { id:0, slug:'food',  label:'Nourriture', emoji:'🥞', color:'#3de8a0', sortOrder:1 },
      { id:0, slug:'drink', label:'Boissons',   emoji:'🥤', color:'#8a8a85', sortOrder:2 },
      { id:0, slug:'other', label:'Autres',     emoji:'✨', color:'#9b6dff', sortOrder:3 },
    ];
  }
  return _categoriesCache;
}
function getCategories() { return _categoriesCache; }
function getCategory(slug) { return _categoriesCache.find(c => c.slug === slug); }

/* ── FILIÈRES (gérées par le Super Admin) ── */
async function dbGetFilieres() {
  const { data, error } = await db.from('filieres').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []).map(nf);
}
async function dbInsertFiliere(f) {
  const { data, error } = await db.from('filieres').insert({ slug:f.slug, label:f.label, sort_order:f.sortOrder||0 }).select().single();
  if (error) return { error: error.message };
  return { filiere: nf(data) };
}
async function dbUpdateFiliere(id, f) {
  const p = {};
  if (f.slug      !== undefined) p.slug       = f.slug;
  if (f.label     !== undefined) p.label      = f.label;
  if (f.sortOrder !== undefined) p.sort_order = f.sortOrder;
  const { data, error } = await db.from('filieres').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { filiere: nf(data) };
}
async function dbDeleteFiliere(id) {
  const { error } = await db.from('filieres').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function nf(r) { return { id:r.id, slug:r.slug, label:r.label, sortOrder:r.sort_order||0 }; }


/* ── NIVEAUX & FILIÈRES ESTM (menus déroulants) ──
   Licences : brochures ESTM. Licences pro et Masters : sources tierces, À CONFIRMER avec l'ESTM.
   Les mêmes filières sont créées dans la base par secure_11_filieres_estm.sql (le serveur les vérifie). */
const ESTM_LEVELS = [
  { value: 'L1', label: 'L1 — Licence 1', cycle: 'L' }, { value: 'L2', label: 'L2 — Licence 2', cycle: 'L' }, { value: 'L3', label: 'L3 — Licence 3', cycle: 'L' },
  { value: 'Licence pro', label: 'Licence professionnelle (cours du soir)', cycle: 'LP' },
  { value: 'M1', label: 'M1 — Master 1', cycle: 'M' }, { value: 'M2', label: 'M2 — Master 2', cycle: 'M' }
];
const ESTM_CYCLE_SUFFIX = { L: ' (Licence)', LP: ' (Licence pro)', M: ' (Master)' };
const ESTM_PROGRAMS = [
  { slug: "cim", label: "Communication, Informatique et Multimédia (CIM)", cycle: 'L' },
  { slug: "glar", label: "Génie Logiciel et Administration Réseaux (GLAR)", cycle: 'L' },
  { slug: "trc", label: "Télécommunications, Réseaux et Cybersécurité (TRC)", cycle: 'L' },
  { slug: "geer", label: "Génie Électrique et Énergies Renouvelables (GEER)", cycle: 'L' },
  { slug: "droit", label: "Droit", cycle: 'L' },
  { slug: "fc", label: "Finance-Comptabilité (FC)", cycle: 'L' },
  { slug: "sdg", label: "Sciences de gestion (SDG)", cycle: 'L' },
  { slug: "lp-glar", label: "Génie Logiciel et Administration Réseaux (GLAR)", cycle: 'LP' },
  { slug: "lp-trc", label: "Télécommunications, Réseaux et Cybersécurité (TRC)", cycle: 'LP' },
  { slug: "lp-geer", label: "Génie Électrique et Énergies Renouvelables (GEER)", cycle: 'LP' },
  { slug: "lp-fc", label: "Finance-Comptabilité (FC)", cycle: 'LP' },
  { slug: "lp-sdg", label: "Sciences de gestion (SDG)", cycle: 'LP' },
  { slug: "lp-marketing-communication", label: "Marketing-Communication", cycle: 'LP' },
  { slug: "lp-banque-assurance", label: "Banque-Assurance", cycle: 'LP' },
  { slug: "lp-genie-logiciel-mobile", label: "Génie logiciel et applications mobiles", cycle: 'LP' },
  { slug: "lp-grh", label: "Gestion des ressources humaines", cycle: 'LP' },
  { slug: "lp-transport-logistique", label: "Transport-Logistique", cycle: 'LP' },
  { slug: "lp-cp-international-business", label: "Chef de projet International Business", cycle: 'LP' },
  { slug: "lp-management-services-reseaux", label: "Management des services et réseaux de communication", cycle: 'LP' },
  { slug: "m-telecom-reseaux", label: "Télécommunications-Réseaux", cycle: 'M' },
  { slug: "m-fc", label: "Finance-Comptabilité", cycle: 'M' },
  { slug: "m-ingenierie-financiere", label: "Ingénierie financière", cycle: 'M' },
  { slug: "m-compta-audit-controle", label: "Comptabilité-Audit et Contrôle de gestion", cycle: 'M' },
  { slug: "m-banque-assurance", label: "Banque-Assurance", cycle: 'M' },
  { slug: "m-grh", label: "Gestion des ressources humaines", cycle: 'M' },
  { slug: "m-management-projets-innovation", label: "Management de projets et innovation", cycle: 'M' },
  { slug: "m-cp-international-business", label: "Chef de projet International Business", cycle: 'M' },
  { slug: "m-transport-logistique", label: "Transport-Logistique", cycle: 'M' },
  { slug: "m-ssi", label: "Sécurité des Systèmes d'Information", cycle: 'M' },
  { slug: "m-genie-logiciel-reseaux", label: "Génie logiciel et Réseaux", cycle: 'M' },
  { slug: "m-informatique-multimedia", label: "Informatique et Multimédia", cycle: 'M' }
];
let _filieresCache = [];
async function loadFilieres() {
  _filieresCache = await dbGetFilieres();
  if (!_filieresCache.length) {
    _filieresCache = ESTM_PROGRAMS.map((p, i) => ({ id:0, slug:p.slug, label:p.label+ESTM_CYCLE_SUFFIX[p.cycle], sortOrder:i+1 }));
  }
  return _filieresCache;
}
function getFilieres() { return _filieresCache; }
function getFiliereLabel(slug) {
  const f = _filieresCache.find(x=>x.slug===slug); if (f) return f.label;
  const e = ESTM_PROGRAMS.find(x=>x.slug===slug); return e ? e.label + ESTM_CYCLE_SUFFIX[e.cycle] : (slug||'');
}

/* ── RÉGLAGES PLATEFORME ── */
let _settingsCache = {};
async function loadSettings() {
  const { data, error } = await db.from('settings').select('*');
  _settingsCache = {};
  if (!error) (data||[]).forEach(r => _settingsCache[r.key] = r.value);
  return _settingsCache;
}
function getSetting(key, fallback) { return _settingsCache[key] !== undefined ? _settingsCache[key] : fallback; }
async function setSetting(key, value) {
  const { error } = await db.from('settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
  if (!error) _settingsCache[key] = String(value);
  return error ? { error: error.message } : { ok: true };
}
function getCommissionRate() { return parseFloat(getSetting('commission_rate', COMMISSION_RATE_PCT)) || COMMISSION_RATE_PCT; }

/* ── ORDERS ── */
async function dbGetOrders(f = {}) {
  let q = db.from('orders').select('*').order('created_at', { ascending: false });
  if (f.sellerId)                  q = q.eq('seller_id', f.sellerId);
  if (f.status && f.status!=='all') q = q.eq('status', f.status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(no);
}
/* Création de commande : UNE seule RPC atomique côté serveur.
   Le serveur recalcule les prix, vérifie et décrémente le stock (verrou de ligne),
   et annule tout le panier si un article échoue. Le client n'envoie ni prix ni total. */
async function dbPlaceOrder(f) {
  const { data, error } = await db.rpc('fn_place_order', {
    p_buyer_name: f.buyerName, p_buyer_phone: f.buyerPhone, p_notes: f.notes || '',
    p_delivery_date: f.deliveryDate, p_delivery_time: f.deliveryTime, p_delivery_type: f.deliveryType,
    p_delivery_address: f.deliveryAddress || null, p_buyer_classe: f.buyerClasse || null, p_buyer_filiere: f.buyerFiliere || null,
    p_items: f.items.map(i => ({ product_id: i.productId, qty: i.qty, note: i.note || '' })),
    p_lat: f.lat ?? null, p_lng: f.lng ?? null, p_place_name: f.placeName || null, p_wa_opt_in: !!f.waOptIn
  });
  if (error) return { error: error.message };
  return { orderGroup: data.order_group, grandTotal: Number(data.grand_total), orders: (data.orders || []).map(o => ({
    id:o.id, createdAt:o.created_at, productId:o.product_id, productName:o.product_name, sellerId:o.seller_id,
    sellerName:o.seller_name, qty:o.qty, total:Number(o.total), itemNote:o.item_note || '', receiptCode:o.receipt_code || ''
  })) };
}
async function dbGetOrderById(id) {
  const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return no(data);
}
async function dbUpdateOrderStatus(id, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function no(r) {
  return { id:r.id, sellerId:r.seller_id, sellerName:r.seller_name||'', productId:r.product_id, productName:r.product_name, buyerName:r.buyer_name, buyerEmail:r.buyer_email, buyerPhone:r.buyer_phone, qty:r.qty, total:r.total, notes:r.notes, itemNote:r.item_note||'', status:r.status, createdAt:r.created_at,
    deliveryDate:r.delivery_date, deliveryTime:r.delivery_time, deliveryType:r.delivery_type||'campus', deliveryAddress:r.delivery_address,
    deliveryLat:r.delivery_lat||null, deliveryLng:r.delivery_lng||null, deliveryPlaceName:r.delivery_place_name||'',
    buyerClasse:r.buyer_classe||'', buyerFiliere:r.buyer_filiere||'', orderGroup:r.order_group||null, receiptCode:r.receipt_code||'' };
}


/* ── MESSAGES WHATSAPP DU VENDEUR (liens wa.me, sans API) ── */
const WA_TAGS = [
  ['{prenom}', 'Prénom du client'], ['{produit}', 'Produit'], ['{quantite}', 'Quantité'], ['{total}', 'Total'],
  ['{code}', 'Code du reçu'], ['{boutique}', 'Ma boutique'], ['{date_livraison}', 'Date / heure'], ['{lieu}', 'Lieu de livraison']
];
const WA_DEFAULTS = [
  { key: 'received',  label: 'Commande reçue',        text: 'Bonjour {prenom} 👋 j\'ai bien reçu ta commande {code} : {quantite} × {produit} ({total}). Je te confirme la livraison prévue le {date_livraison}. — {boutique}' },
  { key: 'preparing', label: 'Préparation en cours',  text: 'Bonjour {prenom} ! Ta commande {code} ({produit}) est en cours de préparation 🧑‍🍳. Je te préviens dès qu\'elle part. — {boutique}' },
  { key: 'delivery',  label: 'Bientôt livré',         text: 'Bonjour {prenom} 🚚 ta commande {code} est en route et sera bientôt livrée ({lieu}). Prépare {total} si paiement à la remise. — {boutique}' },
  { key: 'custom',    label: 'Mon message',           text: 'Bonjour {prenom}, ' }
];
const _waLocalKey = id => 'nm_wa_tpl_' + id;
async function dbGetWaTemplates(sellerId) {
  let list = null;
  try {
    const { data, error } = await db.from('users').select('wa_templates').eq('id', sellerId).maybeSingle();
    if (!error && data && Array.isArray(data.wa_templates) && data.wa_templates.length) list = data.wa_templates;
  } catch (e) {}
  if (!list) { try { const raw = localStorage.getItem(_waLocalKey(sellerId)); if (raw) list = JSON.parse(raw); } catch (e) {} }
  if (!Array.isArray(list)) list = [];
  // on garde l'ordre des modèles par défaut, complété par ce que le vendeur a modifié
  return WA_DEFAULTS.map(d => { const m = list.find(x => x && x.key === d.key); return m ? { key: d.key, label: String(m.label || d.label), text: String(m.text || d.text) } : { ...d }; });
}
async function dbSaveWaTemplates(sellerId, list) {
  try { localStorage.setItem(_waLocalKey(sellerId), JSON.stringify(list)); } catch (e) {}
  const { error } = await db.rpc('fn_set_wa_templates', { p_templates: list });
  return error ? { local: true, error: error.message } : { ok: true };
}
/* numéro → format international (Sénégal par défaut : 9 chiffres → +221) */
function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 9) d = '221' + d;
  else if (d.length === 10 && d[0] === '0') d = '221' + d.slice(1);
  return d.length >= 8 ? d : '';
}
function waFill(text, o, shopName) {
  const first = String(o.buyerName || '').trim().split(/\s+/)[0] || '';
  const lieu = o.deliveryType === 'external' ? (o.deliveryPlaceName || o.deliveryAddress || 'hors campus') : 'sur le campus';
  const when = [o.deliveryDate ? new Date(o.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '', o.deliveryTime || ''].filter(Boolean).join(' à ') || 'bientôt';
  const map = { prenom: first, produit: o.productName || '', quantite: o.qty, total: Number(o.total || 0).toLocaleString('fr-FR') + ' FCFA',
                code: o.receiptCode || ('#' + o.id), boutique: shopName || o.sellerName || '', date_livraison: when, lieu };
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m));
}
function waLink(phone, message) { const n = waPhone(phone); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(message) : ''; }


/* ── TICKET PERSONNALISÉ (voir js/ticket.js) — tolérant : si secure_12 n'est pas exécuté, style par défaut ── */
async function dbGetTicketStyle(sellerIds) {
  try {
    const ids = [...new Set((sellerIds || []).filter(Boolean))];
    if (ids.length !== 1) return sanitizeTicketStyle(null);      // plusieurs vendeurs : ticket neutre
    const { data, error } = await db.from('public_sellers').select('ticket_style').eq('id', ids[0]).maybeSingle();
    if (error || !data) return sanitizeTicketStyle(null);
    return sanitizeTicketStyle(data.ticket_style);
  } catch (e) { return sanitizeTicketStyle(null); }
}
async function dbSaveTicketStyle(style) {
  const { error } = await db.rpc('fn_set_ticket_style', { p_style: style ? sanitizeTicketStyle(style) : null });
  return error ? { error: error.message } : { ok: true };
}

/* ── PUBLICITÉ / PRODUITS SPONSORISÉS ── */
async function dbGetPromoPlans(activeOnly) {
  let q = db.from('promo_plans').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(npp);
}
async function dbInsertPromoPlan(f) {
  const { data, error } = await db.from('promo_plans').insert({ label:f.label, duration_days:f.durationDays, price:f.price, sort_order:f.sortOrder||0, active:f.active!==false }).select().single();
  if (error) return { error: error.message };
  return { plan: npp(data) };
}
async function dbUpdatePromoPlan(id, f) {
  const p = {};
  if (f.label        !== undefined) p.label = f.label;
  if (f.durationDays  !== undefined) p.duration_days = f.durationDays;
  if (f.price         !== undefined) p.price = f.price;
  if (f.sortOrder     !== undefined) p.sort_order = f.sortOrder;
  if (f.active        !== undefined) p.active = f.active;
  const { data, error } = await db.from('promo_plans').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { plan: npp(data) };
}
async function dbDeletePromoPlan(id) {
  const { error } = await db.from('promo_plans').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function npp(r) { return { id:r.id, label:r.label, durationDays:r.duration_days, price:r.price, sortOrder:r.sort_order||0, active:r.active!==false }; }

async function dbGetPromotions(f = {}) {
  let q = db.from('promotions').select('*').order('created_at', { ascending: false });
  if (f.sellerId) q = q.eq('seller_id', f.sellerId);
  if (f.status)   q = q.eq('status', f.status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(npromo);
}
async function dbInsertPromotion(f) {
  const { data, error } = await db.rpc('fn_request_promotion', { p_product_id: f.productId, p_plan_id: f.planId });
  if (error) return { error: error.message };
  return { promotion: npromo(data) };
}
async function dbUpdatePromotion(id, f) {
  const p = {};
  if (f.status     !== undefined) p.status     = f.status;
  if (f.startsAt   !== undefined) p.starts_at  = f.startsAt;
  if (f.endsAt     !== undefined) p.ends_at    = f.endsAt;
  if (f.adminNote  !== undefined) p.admin_note = f.adminNote;
  const { data, error } = await db.from('promotions').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { promotion: npromo(data) };
}
function npromo(r) {
  return { id:r.id, productId:r.product_id, sellerId:r.seller_id, sellerName:r.seller_name, productName:r.product_name,
    planId:r.plan_id, planLabel:r.plan_label, durationDays:r.duration_days, price:r.price, status:r.status||'pending',
    startsAt:r.starts_at, endsAt:r.ends_at, adminNote:r.admin_note||'', createdAt:r.created_at };
}
/* Retourne l'ensemble des productId actuellement "sponsorisés" (promotion active et non expirée) */
async function dbGetActivePromotedProductIds() {
  const { data, error } = await db.rpc('fn_active_promoted_product_ids');
  if (error) { console.error(error); return []; }
  return (data || []).map(Number);
}

/* ── SIGNALEMENTS DE VENDEURS ── */
async function dbGetSellerReports(f = {}) {
  let q = db.from('seller_reports').select('*').order('created_at', { ascending: false });
  if (f.sellerId) q = q.eq('seller_id', f.sellerId);
  if (f.status)   q = q.eq('status', f.status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(nsr);
}
async function dbInsertSellerReport(f) {
  const { error } = await db.rpc('fn_report_seller', {
    p_seller_id: f.sellerId, p_name: f.reporterName || null, p_phone: f.reporterPhone || null, p_reason: f.reason });
  return error ? { error: error.message } : { ok: true };
}
async function dbUpdateSellerReport(id, status) {
  const { data, error } = await db.from('seller_reports').update({ status }).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { report: nsr(data) };
}
function nsr(r) {
  return { id:r.id, sellerId:r.seller_id, sellerName:r.seller_name, reporterName:r.reporter_name||'', reporterPhone:r.reporter_phone||'', reason:r.reason, status:r.status||'pending', createdAt:r.created_at };
}
function getReportThreshold() { return parseInt(getSetting('report_threshold', 3)) || 3; }

/* ── BANNIÈRES PUBLICITAIRES ── */
async function dbGetAdBanners(activeOnly) {
  let q = db.from('ad_banners').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(nab);
}
async function dbInsertAdBanner(f) {
  const { data, error } = await db.from('ad_banners').insert({
    title:f.title, subtitle:f.subtitle||null, image_url:f.imageUrl||null, link_url:f.linkUrl||null,
    bg_color:f.bgColor||'#404040', active:f.active!==false, sort_order:f.sortOrder||0
  }).select().single();
  if (error) return { error: error.message };
  return { banner: nab(data) };
}
async function dbUpdateAdBanner(id, f) {
  const p = {};
  if (f.title    !== undefined) p.title     = f.title;
  if (f.subtitle !== undefined) p.subtitle  = f.subtitle;
  if (f.imageUrl !== undefined) p.image_url = f.imageUrl;
  if (f.linkUrl  !== undefined) p.link_url  = f.linkUrl;
  if (f.bgColor  !== undefined) p.bg_color  = f.bgColor;
  if (f.active   !== undefined) p.active    = f.active;
  if (f.sortOrder!== undefined) p.sort_order= f.sortOrder;
  const { data, error } = await db.from('ad_banners').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { banner: nab(data) };
}
async function dbDeleteAdBanner(id) {
  const { error } = await db.from('ad_banners').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function nab(r) {
  return { id:r.id, title:r.title, subtitle:r.subtitle||'', imageUrl:r.image_url||'', linkUrl:r.link_url||'', bgColor:r.bg_color||'#404040', active:r.active!==false, sortOrder:r.sort_order||0 };
}

/* ── RETOURS / LITIGES ── */
async function dbGetReturns(f = {}) {
  let q = db.from('returns').select('*').order('created_at', { ascending: false });
  if (f.sellerId) q = q.eq('seller_id', f.sellerId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(nret);
}
/* Création vérifiée côté serveur : n° de commande + téléphone doivent correspondre */
async function dbInsertReturn(f) {
  const { data, error } = await db.rpc('fn_create_return_by_code', { p_code: f.code, p_reason: f.reason });
  if (error) return { error: error.message };
  return data && data.ok ? { ok: true } : { error: (data && data.error) || 'Demande refusée.' };
}
async function dbUpdateReturn(id, f) {
  const p = {};
  if (f.status         !== undefined) p.status          = f.status;
  if (f.sellerResponse !== undefined) p.seller_response = f.sellerResponse;
  if (f.status !== undefined) p.responded_at = new Date().toISOString();
  const { data, error } = await db.from('returns').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { return: nret(data) };
}
function nret(r) {
  return { id:r.id, orderId:r.order_id, sellerId:r.seller_id, buyerName:r.buyer_name, buyerPhone:r.buyer_phone, productName:r.product_name, reason:r.reason, status:r.status||'pending', sellerResponse:r.seller_response||'', createdAt:r.created_at, respondedAt:r.responded_at };
}

/* ── REVIEWS ── */
async function dbGetReviews(f = {}) {
  let q = db.from('reviews').select('*').order('created_at', { ascending: false });
  if (f.sellerId)  q = q.eq('seller_id', f.sellerId);
  if (f.productId) q = q.eq('product_id', f.productId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(nr);
}
async function dbInsertReview(f) {
  const { error } = await db.rpc('fn_add_review', { p_product_id: f.productId, p_name: f.reviewerName, p_rating: f.rating, p_text: f.text });
  return error ? { error: error.message } : { ok: true };
}
function nr(r) {
  return { id:r.id, sellerId:r.seller_id, productId:r.product_id, productName:r.product_name, sellerName:r.seller_name, reviewerName:r.reviewer_name, rating:r.rating, text:r.text, createdAt:r.created_at };
}

/* ── COMMISSIONS ── */
async function dbGetCommissions(f = {}) {
  let q = db.from('commissions').select('*').order('period_start', { ascending: false });
  if (f.status && f.status !== 'all') q = q.eq('status', f.status);
  if (f.sellerId) q = q.eq('seller_id', f.sellerId);
  const { data } = await q;
  return data || [];
}
async function dbInsertCommission(c) {
  const { data, error } = await db.from('commissions').insert(c).select().single();
  if (error) return { error: error.message };
  return { commission: data };
}
async function dbUpdateCommission(id, f) {
  const { data, error } = await db.from('commissions').update(f).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { commission: data };
}

/* ── ADMIN ── */
/* Connexion Super Admin : Supabase Auth, PUIS vérification que le compte figure dans `admins`
   (le droit réel est de toute façon contrôlé par is_admin() dans chaque politique RLS). */
async function dbAdminLoadSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return null;
  const { data } = await db.from('admins').select('id, name, email').eq('auth_id', session.user.id).maybeSingle();
  return data || null;
}
async function dbAdminLogin(email, pass) {
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (error) return { error: authErrMsg(error) };
  const admin = await dbAdminLoadSession();
  if (!admin) { await clearSession(); return { error: 'Ce compte n\'a pas les droits administrateur.' }; }
  return { admin };
}
async function dbAdminUpdatePassword(newPass) {
  const { error } = await db.auth.updateUser({ password: newPass });
  return error ? { error: authErrMsg(error) } : { ok: true };
}
/* Section « Compte admin » */
async function dbAdminChangePassword(current, next) {
  const me = await dbAdminLoadSession();
  if (!me) return { error: 'Session expirée.' };
  const { error: e1 } = await db.auth.signInWithPassword({ email: me.email, password: current });
  if (e1) return { error: 'Mot de passe actuel incorrect.' };
  return dbAdminUpdatePassword(next);
}
async function dbAdminChangeEmail(email) {
  const { error } = await db.auth.updateUser({ email: email.trim() });
  return error ? { error: authErrMsg(error) } : { ok: true };
}
async function dbAdminSetProfile(name) {
  const { error } = await db.rpc('admin_set_profile', { p_name: name });
  return error ? { error: error.message } : { ok: true };
}
async function dbAdminListAdmins() {
  const { data, error } = await db.rpc('admin_list_admins');
  return error ? [] : (data || []);
}
async function dbAdminSaveAdmin(email, name, password, replace) {
  const { error } = await db.rpc('admin_save_admin', { p_email: email, p_name: name, p_password: password, p_replace: !!replace });
  return error ? { error: error.message } : { ok: true };
}
async function dbAdminRemoveAdmin(id) {
  const { error } = await db.rpc('admin_remove_admin', { p_id: id });
  return error ? { error: error.message } : { ok: true };
}
async function dbBlockUser(id, block, reason) {
  const { error } = await db.rpc('admin_set_block', { p_user_id: id, p_block: block, p_reason: reason || null });
  return error ? { error: error.message } : { ok: true };
}
async function dbUpdateUserBilling(id, period) {
  const { error } = await db.rpc('admin_set_billing', { p_user_id: id, p_period: period });
  return error ? { error: error.message } : { ok: true };
}
/* Supprime définitivement un compte vendeur (Auth + profil + produits) */
async function dbDeleteSeller(id) {
  const { error } = await db.rpc('admin_delete_seller', { p_user_id: id });
  return error ? { error: error.message } : { ok: true };
}

/* ── CHAT ── */
/* Chat : l'expéditeur (id, nom, rôle) est IMPOSÉ par le serveur d'après le JWT ;
   le client ne choisit que le destinataire et le contenu. */
async function dbSendMessage(f) {
  const { error } = await db.from('messages').insert({
    sender_id: 0, sender_name: '-', sender_role: 'seller',       // écrasés par le trigger serveur
    receiver_role: f.isGeneral ? null : f.receiverRole, receiver_id: f.isGeneral ? null : (f.receiverId || null),
    content: f.content, is_general: !!f.isGeneral
  });
  return error ? { error: error.message } : { ok: true };
}
/* room: {general:true} | {support:true} (vendeur ↔ admin) | {sellerId} (vendeur ↔ vendeur) ;
   me = { id, isAdmin } */
async function dbGetMessages(room, me) {
  let q = db.from('messages').select('*').order('created_at', { ascending: true }).limit(100);
  const n = x => parseInt(x, 10);
  if (room.general) {
    q = q.eq('is_general', true);
  } else if (me.isAdmin) {            // admin ↔ vendeur X
    const x = n(room.sellerId);
    q = q.eq('is_general', false).or(`and(sender_role.eq.seller,sender_id.eq.${x},receiver_role.eq.admin),and(sender_role.eq.admin,receiver_role.eq.seller,receiver_id.eq.${x})`);
  } else if (room.support) {          // vendeur ↔ admin
    const m = n(me.id);
    q = q.eq('is_general', false).or(`and(sender_role.eq.seller,sender_id.eq.${m},receiver_role.eq.admin),and(sender_role.eq.admin,receiver_role.eq.seller,receiver_id.eq.${m})`);
  } else {                            // vendeur ↔ vendeur
    const m = n(me.id), x = n(room.sellerId);
    q = q.eq('is_general', false).or(`and(sender_role.eq.seller,sender_id.eq.${m},receiver_role.eq.seller,receiver_id.eq.${x}),and(sender_role.eq.seller,sender_id.eq.${x},receiver_role.eq.seller,receiver_id.eq.${m})`);
  }
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}
async function dbGetConnections() {
  const { data } = await db.from('seller_connections').select('*').order('last_contact', { ascending: false });
  return data || [];
}

/* ── NOTIFICATIONS ──
   Alimentées côté serveur par des triggers Postgres (voir backend_hardening_v8.sql)
   sur orders / returns / promotions / seller_reports / reviews, afin que toute
   action faite depuis le site OU depuis l'app iOS génère la même notification,
   sans dépendre d'un code client dupliqué. */
async function dbGetNotifications(recipientType, recipientId, opts = {}) {
  let q = db.from('notifications').select('*').eq('recipient_type', recipientType).order('created_at', { ascending: false }).limit(opts.limit || 50);
  if (recipientId !== null && recipientId !== undefined) q = q.eq('recipient_id', recipientId);
  if (opts.unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(nn);
}
async function dbGetUnreadNotificationCount(recipientType, recipientId) {
  let q = db.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_type', recipientType).eq('is_read', false);
  if (recipientId !== null && recipientId !== undefined) q = q.eq('recipient_id', recipientId);
  const { count, error } = await q;
  if (error) { console.error(error); return 0; }
  return count || 0;
}
async function dbMarkNotificationRead(id) {
  const { error } = await db.from('notifications').update({ is_read: true }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
async function dbMarkAllNotificationsRead(recipientType, recipientId) {
  let q = db.from('notifications').update({ is_read: true }).eq('recipient_type', recipientType).eq('is_read', false);
  if (recipientId !== null && recipientId !== undefined) q = q.eq('recipient_id', recipientId);
  const { error } = await q;
  return error ? { error: error.message } : { ok: true };
}
function nn(r) {
  return { id:r.id, recipientType:r.recipient_type, recipientId:r.recipient_id, type:r.type, title:r.title, body:r.body||'', relatedId:r.related_id, isRead:r.is_read||false, createdAt:r.created_at };
}
function notifIcon(type) {
  switch (type) {
    case 'order_new':        return '🛒';
    case 'order_status':     return '📦';
    case 'return_new':       return '↩️';
    case 'return_status':    return '✅';
    case 'promotion_new':    return '📣';
    case 'promotion_status': return '⭐';
    case 'seller_report':    return '⚠️';
    case 'verification':     return '🛡';
    case 'review_new':       return '⭐';
    default:                 return '🔔';
  }
}
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff/60) + ' min';
  if (diff < 86400) return Math.floor(diff/3600) + ' h';
  return Math.floor(diff/86400) + ' j';
}

/* ── SHARED UI ── */
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showToast(title, msg, color) {
  const t = document.getElementById('toast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg || '';
  t.style.borderColor = color ? `var(--line2)` : 'var(--line2)';
  if (color) t.style.borderLeftColor = color;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3600);
}
function showLoader(v) { if (window.NM_SILENT && v) return; const el = document.getElementById('loader'); if (el) el.style.display = v ? 'flex' : 'none'; }   // NM_SILENT : actualisation en arrière-plan
function starsHtml(r, sz) {
  sz = sz || '.85rem';
  return [...Array(5)].map((_,i) => `<span style="color:${i<Math.round(r)?'var(--gold)':'var(--t4)'};font-size:${sz}">★</span>`).join('');
}
function catLabel(c)     { const cat = getCategory(c); return cat ? cat.label : (c==='food'?'Nourriture':c==='drink'?'Boisson':'Autre'); }  /* texte brut : échapper à l'affichage */
function catEmoji(c)     { const cat = getCategory(c); return esc(cat ? cat.emoji : '🛍️'); }
function catBadge(c, extraStyle) {
  const cat = getCategory(c);
  const color = safeColor(cat ? cat.color : '#404040');
  const label = esc(catLabel(c));
  return `<div class="badge" style="background:${hexToRgba(color,0.12)};color:${color};border:1px solid ${hexToRgba(color,0.25)};${extraStyle||''}">${label}</div>`;
}
function hexToRgba(hex, alpha) {
  hex = (hex||'#404040').replace('#','');
  if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function statusLabel(s)  { return s==='new'?'Nouvelle':s==='done'?'Livrée':'Annulée'; }
function deliveryTypeLabel(t) { return t==='external' ? 'Hors campus' : 'Sur le campus'; }
function formatDate(s)   { if (!s) return '—'; return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); }
function formatDateTime(s) { if (!s) return '—'; return new Date(s).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
function formatDeliveryDateTime(o) {
  if (!o || !o.deliveryDate) return '—';
  const d = new Date(o.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
  return o.deliveryTime ? `${d} à ${o.deliveryTime}` : d;
}
function today()         { return new Date().toISOString().split('T')[0]; }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target===o) o.classList.remove('show'); }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.close === 'termsModal' && typeof pendingRegistration !== 'undefined' && pendingRegistration && typeof declineTerms === 'function') {
      declineTerms();
    } else {
      closeModal(b.dataset.close);
      const actions = document.getElementById('termsActions');
      if (b.dataset.close === 'termsModal' && actions) actions.style.display = 'none';
    }
  }));
});


/* ── COMPRESSION D'IMAGE (réduit fortement la bande passante : les photos sont stockées dans la base) ── */
function compressImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Lecture impossible'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        let { width: w, height: h } = img;
        const k = Math.min(1, maxDim / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}


/* ══════════ VÉRIFICATION DES VENDEURS (pièce d'identité + selfie) ══════════
   Les images vont dans un bucket Storage PRIVÉ « kyc », dossier <auth.uid()>/ :
   le vendeur n'écrit/lit que le sien, seul le Super Admin lit tout (voir secure_06_verification.sql). */
const KYC_BUCKET = 'kyc';

/* état du compte : 'verified' | 'pending' | 'active' (délai en cours) | 'expired' */
function verifState(u) {
  if (!u) return { code: 'none' };
  if (u.verified) return { code: 'verified' };
  const dl = u.verifDeadline ? new Date(u.verifDeadline).getTime() : null;
  const msLeft = dl ? dl - Date.now() : null;
  const inTime = u.verificationStatus === 'pending' && u.verifSubmittedAt && dl && new Date(u.verifSubmittedAt).getTime() <= dl;
  if (msLeft !== null && msLeft <= 0 && !inTime) return { code: 'expired', msLeft: 0 };
  if (u.verificationStatus === 'pending') return { code: 'pending', msLeft };
  return { code: u.verificationStatus === 'rejected' ? 'rejected' : 'active', msLeft };
}
function fmtLeft(ms) {
  if (ms === null || ms === undefined) return '';
  const h = Math.max(0, Math.floor(ms / 3600000)), d = Math.floor(h / 24);
  return d >= 1 ? `${d} jour${d > 1 ? 's' : ''} ${h % 24} h` : `${h} h`;
}

function canvasToBlob(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Lecture impossible'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Conversion impossible')), 'image/jpeg', quality);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function dbSubmitVerification(idType, idFile, selfieFile) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return { error: 'Connecte-toi d\'abord.' };
  const uid = session.user.id, stamp = Date.now();
  let idBlob, selfieBlob;
  try { [idBlob, selfieBlob] = await Promise.all([canvasToBlob(idFile, 1600, 0.82), canvasToBlob(selfieFile, 1200, 0.82)]); }
  catch (e) { return { error: 'Image illisible. Utilise une photo JPG ou PNG.' }; }
  const idPath = `${uid}/${stamp}-piece.jpg`, selfiePath = `${uid}/${stamp}-selfie.jpg`;
  const up = (path, blob) => db.storage.from(KYC_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  const [a, b] = await Promise.all([up(idPath, idBlob), up(selfiePath, selfieBlob)]);
  if (a.error || b.error) return { error: 'Envoi impossible : ' + ((a.error || b.error).message || 'réessaie.') };
  const { data, error } = await db.rpc('fn_submit_verification', { p_id_type: idType, p_id_path: idPath, p_selfie_path: selfiePath });
  if (error) return { error: error.message };
  if (!data || !data.ok) return { error: (data && data.error) || 'Envoi refusé.' };
  if (window.NMCache) NMCache.invalidate('*volatile');
  return { ok: true };
}
async function dbGetMyVerifications() {
  const { data, error } = await db.from('seller_verifications').select('id, id_type, status, admin_note, submitted_at, reviewed_at').order('submitted_at', { ascending: false }).limit(10);
  if (error) { console.error(error); return []; }
  return data || [];
}

/* ── Super Admin ── */
async function dbAdminListVerifications(status) {
  let q = db.from('seller_verifications').select('id, user_id, id_type, id_doc_path, selfie_path, status, admin_note, submitted_at, reviewed_at').order('submitted_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}
async function dbAdminVerifSignedUrls(paths) {
  const { data, error } = await db.storage.from(KYC_BUCKET).createSignedUrls(paths, 300);   // liens valables 5 min
  if (error) return {};
  const m = {}; (data || []).forEach(x => { if (x.signedUrl) m[x.path] = x.signedUrl; });
  return m;
}
async function dbAdminReviewVerification(id, approve, note) {
  const { data, error } = await db.rpc('admin_review_verification', { p_id: id, p_approve: !!approve, p_note: note || null });
  if (error) return { error: error.message };
  // après validation, les pièces ne sont plus nécessaires : on les efface (minimisation des données)
  if (approve && data && data.id_doc_path) { try { await db.storage.from(KYC_BUCKET).remove([data.id_doc_path, data.selfie_path]); } catch (e) {} }
  if (window.NMCache) NMCache.invalidate('*volatile');
  return { ok: true };
}
async function dbAdminRevokeVerification(userId, reason) {
  const { error } = await db.rpc('admin_revoke_verification', { p_user_id: userId, p_reason: reason || null });
  if (window.NMCache) NMCache.invalidate('*volatile');
  return error ? { error: error.message } : { ok: true };
}
