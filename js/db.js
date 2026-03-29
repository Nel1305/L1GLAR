/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — db.js
   Toutes les opérations base de données (Supabase)
   Remplace complètement localStorage
═══════════════════════════════════════════════════ */

/* ── Client Supabase (CDN) ── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ════════════════════════════════════
   SESSION (localStorage — juste le user connecté)
════════════════════════════════════ */
function getSession()        { return JSON.parse(localStorage.getItem('glar_session') || 'null'); }
function setSession(user)    { localStorage.setItem('glar_session', JSON.stringify(user)); }
function clearSession()      { localStorage.removeItem('glar_session'); }

/* ════════════════════════════════════
   USERS
════════════════════════════════════ */
async function dbCreateUser(firstName, lastName, email, phone, password) {
  // Vérif email existant
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return { error: 'Cet email est déjà utilisé.' };

  const name = firstName + (lastName ? ' ' + lastName[0].toUpperCase() + '.' : '');
  const hash = btoa(unescape(encodeURIComponent(password))); // encodage simple

  const { data, error } = await db
    .from('users')
    .insert({ first_name: firstName, last_name: lastName, name, email, phone, password: hash })
    .select()
    .single();

  if (error) return { error: error.message };
  return { user: normalizeUser(data) };
}

async function dbLoginUser(email, password) {
  const hash = btoa(unescape(encodeURIComponent(password)));
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password', hash)
    .maybeSingle();

  if (error || !data) return { error: 'Email ou mot de passe incorrect.' };
  return { user: normalizeUser(data) };
}

async function dbUpdateUser(userId, fields) {
  const payload = {};
  if (fields.firstName)  payload.first_name = fields.firstName;
  if (fields.lastName !== undefined) payload.last_name = fields.lastName;
  if (fields.name)       payload.name      = fields.name;
  if (fields.email)      payload.email     = fields.email;
  if (fields.phone !== undefined)    payload.phone     = fields.phone;
  if (fields.bio !== undefined)      payload.bio       = fields.bio;
  if (fields.shopOpen !== undefined) payload.shop_open = fields.shopOpen;
  if (fields.password)   payload.password  = btoa(unescape(encodeURIComponent(fields.password)));

  const { data, error } = await db
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { user: normalizeUser(data) };
}

function normalizeUser(r) {
  return {
    id:        r.id,
    firstName: r.first_name,
    lastName:  r.last_name,
    name:      r.name,
    email:     r.email,
    phone:     r.phone,
    bio:       r.bio,
    shopOpen:  r.shop_open,
    createdAt: r.created_at,
  };
}

/* ════════════════════════════════════
   PRODUCTS
════════════════════════════════════ */
async function dbGetProducts(filters = {}) {
  let q = db.from('products').select('*').order('created_at', { ascending: false });
  if (filters.sellerId)  q = q.eq('seller_id', filters.sellerId);
  if (filters.available) q = q.eq('available', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(normalizeProduct);
}

async function dbInsertProduct(sellerId, sellerName, fields) {
  const { data, error } = await db
    .from('products')
    .insert({
      seller_id:   sellerId,
      seller_name: sellerName,
      name:        fields.name,
      description: fields.desc || '',
      category:    fields.cat,
      price:       fields.price,
      emoji:       fields.emoji || '🛍️',
      photo_url:   fields.photo || null,
      available:   true,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { product: normalizeProduct(data) };
}

async function dbUpdateProduct(productId, fields) {
  const payload = {};
  if (fields.name  !== undefined) payload.name        = fields.name;
  if (fields.desc  !== undefined) payload.description = fields.desc;
  if (fields.cat   !== undefined) payload.category    = fields.cat;
  if (fields.price !== undefined) payload.price       = fields.price;
  if (fields.emoji !== undefined) payload.emoji       = fields.emoji;
  if (fields.photo !== undefined) payload.photo_url   = fields.photo;
  if (fields.available !== undefined) payload.available = fields.available;
  if (fields.rating    !== undefined) payload.rating   = fields.rating;
  if (fields.votes     !== undefined) payload.votes    = fields.votes;

  const { data, error } = await db
    .from('products')
    .update(payload)
    .eq('id', productId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { product: normalizeProduct(data) };
}

async function dbDeleteProduct(productId) {
  const { error } = await db.from('products').delete().eq('id', productId);
  return error ? { error: error.message } : { ok: true };
}

function normalizeProduct(r) {
  return {
    id:         r.id,
    sellerId:   r.seller_id,
    sellerName: r.seller_name,
    name:       r.name,
    desc:       r.description,
    cat:        r.category,
    price:      r.price,
    emoji:      r.emoji,
    photo:      r.photo_url,
    rating:     parseFloat(r.rating) || 0,
    votes:      r.votes || 0,
    available:  r.available,
    createdAt:  r.created_at,
  };
}

/* ════════════════════════════════════
   ORDERS
════════════════════════════════════ */
async function dbGetOrders(filters = {}) {
  let q = db.from('orders').select('*').order('created_at', { ascending: false });
  if (filters.sellerId) q = q.eq('seller_id', filters.sellerId);
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(normalizeOrder);
}

async function dbInsertOrder(fields) {
  const { data, error } = await db
    .from('orders')
    .insert({
      seller_id:    fields.sellerId,
      product_id:   fields.productId,
      product_name: fields.productName,
      buyer_name:   fields.buyerName,
      buyer_email:  fields.buyerEmail,
      buyer_phone:  fields.buyerPhone || '',
      qty:          fields.qty,
      total:        fields.total,
      notes:        fields.notes || '',
      status:       'new',
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { order: normalizeOrder(data) };
}

async function dbUpdateOrderStatus(orderId, status) {
  const { error } = await db
    .from('orders')
    .update({ status })
    .eq('id', orderId);
  return error ? { error: error.message } : { ok: true };
}

async function dbDeleteOrder(orderId) {
  const { error } = await db.from('orders').delete().eq('id', orderId);
  return error ? { error: error.message } : { ok: true };
}

function normalizeOrder(r) {
  return {
    id:          r.id,
    sellerId:    r.seller_id,
    sellerName:  r.seller_name || '',
    productId:   r.product_id,
    productName: r.product_name,
    buyerName:   r.buyer_name,
    buyerEmail:  r.buyer_email,
    buyerPhone:  r.buyer_phone,
    qty:         r.qty,
    total:       r.total,
    notes:       r.notes,
    status:      r.status,
    createdAt:   r.created_at,
  };
}

/* ════════════════════════════════════
   REVIEWS
════════════════════════════════════ */
async function dbGetReviews(filters = {}) {
  let q = db.from('reviews').select('*').order('created_at', { ascending: false });
  if (filters.sellerId)  q = q.eq('seller_id', filters.sellerId);
  if (filters.productId) q = q.eq('product_id', filters.productId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(normalizeReview);
}

async function dbInsertReview(fields) {
  const { data, error } = await db
    .from('reviews')
    .insert({
      seller_id:     fields.sellerId,
      product_id:    fields.productId,
      product_name:  fields.productName,
      seller_name:   fields.sellerName,
      reviewer_name: fields.reviewerName,
      rating:        fields.rating,
      text:          fields.text,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { review: normalizeReview(data) };
}

function normalizeReview(r) {
  return {
    id:           r.id,
    sellerId:     r.seller_id,
    productId:    r.product_id,
    productName:  r.product_name,
    sellerName:   r.seller_name,
    reviewerName: r.reviewer_name,
    rating:       r.rating,
    text:         r.text,
    createdAt:    r.created_at,
  };
}

/* ════════════════════════════════════
   SHARED UI HELPERS
════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showToast(title, msg, color) {
  const t = document.getElementById('toast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg || '';
  t.style.borderLeftColor = color || 'var(--accent)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3800);
}

function showLoader(show) {
  const el = document.getElementById('loader');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function starsHtml(rating, size) {
  const sz = size || '0.9rem';
  return [...Array(5)].map((_, i) =>
    `<span style="color:${i < Math.round(rating) ? 'var(--yellow)' : 'var(--surface3)'};font-size:${sz}">★</span>`
  ).join('');
}
function catLabel(cat) { return cat==='food'?'Nourriture':cat==='drink'?'Boisson':'Autre'; }
function statusLabel(s){ return s==='new'?'🔵 Nouvelle':s==='done'?'✅ Livrée':'❌ Annulée'; }
function today()       { return new Date().toISOString().split('T')[0]; }
function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); })
  );
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
});
