/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — db.js  (Supabase)
═══════════════════════════════════════════════════ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── SESSION ── */
function getSession()     { return JSON.parse(localStorage.getItem('glar_session') || 'null'); }
function setSession(u)    { localStorage.setItem('glar_session', JSON.stringify(u)); }
function clearSession()   { localStorage.removeItem('glar_session'); }

/* ── USERS ── */
async function dbCreateUser(first, last, email, phone, pass) {
  const { data: ex } = await db.from('users').select('id').eq('email', email).maybeSingle();
  if (ex) return { error: 'Cet email est déjà utilisé.' };
  const name = first + (last ? ' ' + last[0].toUpperCase() + '.' : '');
  const hash = btoa(unescape(encodeURIComponent(pass)));
  const { data, error } = await db.from('users').insert({ first_name:first, last_name:last, name, email, phone, password:hash }).select().single();
  if (error) return { error: error.message };
  return { user: nu(data) };
}
async function dbLoginUser(email, pass) {
  const { data, error } = await db.from('users').select('*').eq('email', email.trim()).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Email ou mot de passe incorrect.' };
  if (data.password !== btoa(unescape(encodeURIComponent(pass)))) return { error: 'Email ou mot de passe incorrect.' };
  if (data.is_blocked) return { error: 'Ton compte est actuellement suspendu. Contacte l\'administrateur.' };
  return { user: nu(data) };
}
async function dbUpdateUser(id, f) {
  const p = {};
  if (f.firstName !== undefined) p.first_name  = f.firstName;
  if (f.lastName  !== undefined) p.last_name   = f.lastName;
  if (f.name      !== undefined) p.name        = f.name;
  if (f.email     !== undefined) p.email       = f.email;
  if (f.phone     !== undefined) p.phone       = f.phone;
  if (f.bio       !== undefined) p.bio         = f.bio;
  if (f.shopOpen  !== undefined) p.shop_open   = f.shopOpen;
  if (f.password)                p.password    = btoa(unescape(encodeURIComponent(f.password)));
  const { data, error } = await db.from('users').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { user: nu(data) };
}
async function dbGetAllUsers() {
  const { data, error } = await db.from('users').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return (data || []).map(nu);
}
function nu(r) {
  return { id:r.id, firstName:r.first_name, lastName:r.last_name, name:r.name, email:r.email, phone:r.phone, bio:r.bio, shopOpen:r.shop_open, isBlocked:r.is_blocked||false, blockedReason:r.blocked_reason||'', billingPeriod:r.billing_period||'monthly', createdAt:r.created_at };
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
  const { data, error } = await db.from('products').insert({ seller_id:sellerId, seller_name:sellerName, name:f.name, description:f.desc||'', category:f.cat, price:f.price, emoji:f.emoji||'🛍️', photo_url:f.photo||null, available:true }).select().single();
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
  if (f.rating    !== undefined) p.rating      = f.rating;
  if (f.votes     !== undefined) p.votes       = f.votes;
  if (f.sellerName!== undefined) p.seller_name = f.sellerName;
  const { data, error } = await db.from('products').update(p).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { product: np(data) };
}
async function dbDeleteProduct(id) {
  const { error } = await db.from('products').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function np(r) {
  return { id:r.id, sellerId:r.seller_id, sellerName:r.seller_name, name:r.name, desc:r.description, cat:r.category, price:r.price, emoji:r.emoji, photo:r.photo_url, rating:parseFloat(r.rating)||0, votes:r.votes||0, available:r.available, createdAt:r.created_at };
}

/* ── ORDERS ── */
async function dbGetOrders(f = {}) {
  let q = db.from('orders').select('*').order('created_at', { ascending: false });
  if (f.sellerId)                  q = q.eq('seller_id', f.sellerId);
  if (f.status && f.status!=='all') q = q.eq('status', f.status);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data || []).map(no);
}
async function dbInsertOrder(f) {
  const { data, error } = await db.from('orders').insert({
    seller_id:f.sellerId, seller_name:f.sellerName||'',
    product_id:f.productId, product_name:f.productName,
    buyer_name:f.buyerName, buyer_email:f.buyerEmail,
    buyer_phone:f.buyerPhone||'', qty:f.qty, total:f.total,
    notes:f.notes||'', status:'new',
    order_code: f.orderCode || '',
    items: f.items ? (typeof f.items === 'string' ? f.items : JSON.stringify(f.items)) : null
  }).select().single();
  if (error) return { error: error.message };
  return { order: no(data) };
}
async function dbUpdateOrderStatus(id, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
function no(r) {
  return {
    id:r.id, sellerId:r.seller_id, sellerName:r.seller_name||'',
    productId:r.product_id, productName:r.product_name,
    buyerName:r.buyer_name, buyerEmail:r.buyer_email,
    buyerPhone:r.buyer_phone, qty:r.qty, total:r.total,
    notes:r.notes, status:r.status, createdAt:r.created_at,
    orderCode:r.order_code||'',
    items: r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : null
  };
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
  const { data, error } = await db.from('reviews').insert({ seller_id:f.sellerId, product_id:f.productId, product_name:f.productName, seller_name:f.sellerName, reviewer_name:f.reviewerName, rating:f.rating, text:f.text }).select().single();
  if (error) return { error: error.message };
  return { review: nr(data) };
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
async function dbAdminLogin(email, pass) {
  const { data, error } = await db.from('admins').select('*').eq('email', email.trim()).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Email ou mot de passe incorrect.' };
  if (data.password !== btoa(unescape(encodeURIComponent(pass)))) return { error: 'Email ou mot de passe incorrect.' };
  return { admin: data };
}
async function dbBlockUser(id, block, reason) {
  const { error } = await db.from('users').update({ is_blocked: block, blocked_reason: reason||null }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
async function dbUpdateUserBilling(id, period) {
  const { error } = await db.from('users').update({ billing_period: period }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

/* ── CHAT ── */
async function dbSendMessage(f) {
  const { data, error } = await db.from('messages').insert({ sender_id:f.senderId, sender_name:f.senderName, sender_role:f.senderRole, receiver_id:f.receiverId||null, content:f.content, is_general:f.isGeneral||false }).select().single();
  if (error) return { error: error.message };
  return { message: data };
}
async function dbGetMessages(f = {}) {
  let q = db.from('messages').select('*').order('created_at', { ascending: true }).limit(100);
  if (f.isGeneral) { q = q.eq('is_general', true); }
  else if (f.userA && f.userB) {
    q = q.eq('is_general', false).or(`and(sender_id.eq.${f.userA},receiver_id.eq.${f.userB}),and(sender_id.eq.${f.userB},receiver_id.eq.${f.userA})`);
  }
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}
async function dbUpsertConnection(aId, aName, bId, bName) {
  const minId = Math.min(aId, bId), maxId = Math.max(aId, bId);
  const minName = minId === aId ? aName : bName;
  const maxName = maxId === aId ? aName : bName;
  const { data: ex } = await db.from('seller_connections').select('id, message_count').eq('seller_a_id', minId).eq('seller_b_id', maxId).maybeSingle();
  if (ex) {
    await db.from('seller_connections').update({ message_count: ex.message_count + 1, last_contact: new Date().toISOString() }).eq('id', ex.id);
  } else {
    await db.from('seller_connections').insert({ seller_a_id:minId, seller_a_name:minName, seller_b_id:maxId, seller_b_name:maxName });
  }
}
async function dbGetConnections() {
  const { data } = await db.from('seller_connections').select('*').order('last_contact', { ascending: false });
  return data || [];
}

/* ── SHARED UI ── */
function openModal(id)  { document.getElementById(id)?.classList.add('show'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); document.body.style.overflow=''; }
function showToast(title, msg, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg || '';
  t.style.borderLeftColor = color || 'var(--gold)';
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3800);
}
function showLoader(v) { const el = document.getElementById('loader'); if (el) el.style.display = v ? 'flex' : 'none'; }
function starsHtml(r, sz) {
  sz = sz || '.85rem';
  return [...Array(5)].map((_,i) => `<span style="color:${i<Math.round(r)?'var(--gold)':'var(--g3)'};font-size:${sz}">★</span>`).join('');
}
function catLabel(c) {
  const l = { food:'Nourriture', drink:'Boissons', clothing:'Vêtements', accessories:'Accessoires',
    electronics:'Électronique', books:'Livres & Cours', beauty:'Beauté & Santé', sport:'Sport',
    services:'Services', art:'Art & Créations', tech:'High-Tech', other:'Divers' };
  return l[c] || c;
}
function statusLabel(s)  { return s==='new'?'Nouvelle':s==='done'?'Livrée':'Annulée'; }
function formatDate(s)   { if (!s) return '—'; return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); }
function today()         { return new Date().toISOString().split('T')[0]; }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target===o) o.classList.remove('show'); }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
});
