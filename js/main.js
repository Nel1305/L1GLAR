/* ═══════════════════════════════════════════════
   N MARKET — main.js (page publique)
   Sécurisé : XSS mitigé via escapeHtml()
═══════════════════════════════════════════════ */

'use strict';

let activeFilter = 'all';
let searchQ      = '';
let allProducts  = [];

/* ── SECURITE : échapper le HTML utilisateur ── */
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initFilters();
  initAuth();
  syncSessionUI();
  initOrderForm();
  initReviewForm();
  await loadProducts();
  initModals();
  initMobUser();
});

function initOrderForm() {
  document.getElementById('qtyMinus').addEventListener('click', () => {
    const e = document.getElementById('oQty');
    e.value = Math.max(1, parseInt(e.value || 1) - 1);
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    const e = document.getElementById('oQty');
    e.value = parseInt(e.value || 1) + 1;
  });
  document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);
}

function initReviewForm() {
  document.getElementById('openReviewBtn').addEventListener('click', () => openModal('reviewModal'));
  document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
}

function initMobUser() {
  const btn = document.getElementById('mobUserBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const s = getSession();
    if (s) {
      /* Connecté : proposer déconnexion */
      showToast('Connecté', s.firstName + ' · ' + s.email);
    } else {
      openModal('authModal');
    }
  });
}

/* ── NAV ── */
function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-item[data-page], .mob-nav-item[data-page]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-page="${btn.dataset.page}"]`).forEach(b => b.classList.add('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + btn.dataset.page)?.classList.add('active');
      if (btn.dataset.page === 'order')   await populateOrderSelects();
      if (btn.dataset.page === 'reviews') await loadReviews();
    });
  });
  /* nav mobile */
  document.querySelectorAll('.mob-nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-page], .mob-nav-item[data-page]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-page="${btn.dataset.page}"]`).forEach(b => b.classList.add('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + btn.dataset.page)?.classList.add('active');
      if (btn.dataset.page === 'order')   populateOrderSelects();
      if (btn.dataset.page === 'reviews') loadReviews();
    });
  });
}

/* ── PRODUCTS ── */
async function loadProducts() {
  showLoader(true);
  allProducts = await dbGetProducts({ available: true });
  showLoader(false);
  renderProducts();
  await populateOrderSelects();
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const list = allProducts.filter(p =>
    (activeFilter === 'all' || p.cat === activeFilter) &&
    (p.name.toLowerCase().includes(searchQ) ||
     p.sellerName.toLowerCase().includes(searchQ) ||
     (p.desc || '').toLowerCase().includes(searchQ))
  );

  if (!list.length) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><p>Aucun produit disponible</p></div>';
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="card" role="article" aria-label="${esc(p.name)}">
      <div class="card-img cat-${esc(p.cat)}">
        ${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="card-emoji">${esc(p.emoji)}</span>`}
        <div class="card-img-grad"></div>
      </div>
      <div class="card-body">
        <span class="badge badge-${esc(p.cat)}">${catLabel(p.cat)}</span>
        <div class="card-name">${esc(p.name)}</div>
        ${p.desc ? `<div class="card-desc">${esc(p.desc)}</div>` : ''}
        <div class="card-seller">par ${esc(p.sellerName)}</div>
        <div class="card-row">
          <div class="card-price">${p.price.toLocaleString()} <span class="card-currency">FCFA</span></div>
          <div class="card-rating">
            <span class="star-icon">★</span>
            ${p.rating ? `${p.rating}${p.votes ? ` <span class="rating-count">(${p.votes})</span>` : ''}` : '—'}
          </div>
        </div>
        <button class="btn-order" data-id="${esc(String(p.id))}" data-name="${esc(p.name)}">Commander</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.btn-order').forEach(btn =>
    btn.addEventListener('click', () => quickOrder(btn.dataset.id, btn.dataset.name))
  );
}

function initFilters() {
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderProducts();
    });
  });
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase().trim();
    renderProducts();
  });
}

async function quickOrder(id, name) {
  document.querySelectorAll('.nav-item[data-page], .mob-nav-item[data-page]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-page="order"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-order').classList.add('active');
  await populateOrderSelects();
  document.getElementById('oProduct').value = id;
}

/* ── ORDER ── */
async function populateOrderSelects() {
  const p = allProducts.length ? allProducts : await dbGetProducts({ available: true });
  const opts = '<option value="">Choisir un produit…</option>' +
    p.map(x => `<option value="${esc(String(x.id))}">${esc(x.emoji)} ${esc(x.name)} — ${x.price.toLocaleString()} FCFA (${esc(x.sellerName)})</option>`).join('');
  document.getElementById('oProduct').innerHTML = opts;
  document.getElementById('rvProduct').innerHTML = p.map(x =>
    `<option value="${esc(String(x.id))}">${esc(x.name)} — ${esc(x.sellerName)}</option>`).join('');
}



/* Génère un code de commande unique : NM-YYMM-XXXX */
function generateOrderCode() {
  const now  = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return 'NM-' + yymm + '-' + rand;
}

async function submitOrder() {
  const name  = document.getElementById('oName').value.trim();
  const email = document.getElementById('oEmail').value.trim();
  const phone = document.getElementById('oPhone').value.trim();
  const pid   = parseInt(document.getElementById('oProduct').value);
  const qty   = Math.max(1, parseInt(document.getElementById('oQty').value) || 1);
  const notes = document.getElementById('oNotes').value.trim();

  if (!name)  { showToast('Champ manquant', 'Le nom est requis.', 'var(--red)'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Email invalide', 'Vérifie ton adresse email.', 'var(--red)'); return;
  }
  if (!pid) { showToast('Produit manquant', 'Sélectionne un produit.', 'var(--red)'); return; }

  const p = allProducts.find(x => x.id === pid);
  if (!p) return;

  const orderCode = generateOrderCode();
  const total     = p.price * qty;
  const btn       = document.getElementById('submitOrderBtn');
  btn.disabled    = true; showLoader(true);

  const result = await dbInsertOrder({
    sellerId: p.sellerId, sellerName: p.sellerName,
    productId: p.id, productName: p.name,
    buyerName: name, buyerEmail: email, buyerPhone: phone,
    qty, total, notes, orderCode
  });

  showLoader(false); btn.disabled = false;
  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }

  /* Enrichir l'objet order avec les données locales si la BDD ne retourne pas orderCode */
  const order = { ...result.order, orderCode, buyerName: name, buyerEmail: email, buyerPhone: phone, sellerName: p.sellerName, createdAt: new Date().toISOString() };

  /* Afficher la success box avec ticket */
  showOrderSuccess(order, p, qty, total, notes);

  /* Emails */
  if (typeof sendOrderConfirmEmail !== 'undefined') {
    sendOrderConfirmEmail(order, p).then(r => {
      if (r.ok) showToast('Email envoyé', 'Confirmation envoyée sur ' + email + ' ✉️');
      else       showToast('Email', 'Commande enregistrée. Email non envoyé.', 'var(--amber)');
    });
  }

  /* Reset form */
  ['oName','oEmail','oPhone','oNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('oProduct').value = '';
  document.getElementById('oQty').value = 1;
}

function showOrderSuccess(order, product, qty, total, notes) {
  const box = document.getElementById('orderSuccess');
  document.getElementById('orderSuccessText').innerHTML =
    `<div class="ticket-inline">
      <div class="ticket-code-label">Code de commande</div>
      <div class="ticket-code-value">${esc(order.orderCode)}</div>
      <div class="ticket-code-hint">Garde ce code — le vendeur en aura besoin</div>
    </div>
    <div class="ticket-summary">
      ${qty}× <strong>${esc(product.name)}</strong> — ${total.toLocaleString()} FCFA
      ${notes ? `<br><span style="color:var(--t3);font-size:.75rem">Note : ${esc(notes)}</span>` : ''}
    </div>
    <div class="ticket-actions">
      <button class="ticket-btn" id="downloadTicketBtn" onclick="downloadTicket(currentTicketData)">
        ⬇ Télécharger le ticket
      </button>
      <button class="ticket-btn ghost" id="screenshotHintBtn" onclick="showScreenshotHint()">
        📸 Faire une capture
      </button>
    </div>
    <div id="ticketCanvas" class="ticket-canvas-wrap" style="display:none"></div>`;
  box.classList.add('show');
  box.scrollIntoView({ behavior: 'smooth' });

  /* Stocker les données pour le bouton download */
  window.currentTicketData = { order, product, qty, total, notes };
}

/* ── TICKET CANVAS ── */
function buildTicketCanvas(data) {
  const { order, product, qty, total, notes } = data;
  const W = 480, H = 640;
  const canvas  = document.createElement('canvas');
  canvas.width  = W * 2; // retina
  canvas.height = H * 2;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  /* Fond */
  ctx.fillStyle = '#080c10';
  ctx.fillRect(0, 0, W, H);

  /* Bordure dorée */
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  /* Trait pointillé séparateur */
  function dashes(y) {
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(201,168,76,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(W - 28, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  /* Header — logo */
  ctx.fillStyle = '#c9a84c';
  ctx.font      = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N MARKET', W / 2, 54);
  ctx.fillStyle = 'rgba(201,168,76,0.55)';
  ctx.font      = '11px sans-serif';
  ctx.fillText('TICKET DE COMMANDE', W / 2, 72);

  dashes(88);

  /* Code de commande */
  ctx.fillStyle = '#e8c97a';
  ctx.font      = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(order.orderCode || '--', W / 2, 132);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font      = '10px sans-serif';
  ctx.fillText('CODE DE COMMANDE', W / 2, 150);

  dashes(164);

  /* Infos commande */
  function row(label, value, y, valColor) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font      = '10px sans-serif';
    ctx.fillText(label.toUpperCase(), 36, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = valColor || '#f4f0e8';
    ctx.font      = '13px sans-serif';
    // Truncate long values
    let v = String(value);
    if (v.length > 32) v = v.slice(0, 30) + '…';
    ctx.fillText(v, W - 36, y);
  }

  row('Produit',   product.name,                    198);
  row('Vendeur',   order.sellerName || '—',          224);
  row('Quantité',  qty + ' unité' + (qty > 1 ? 's' : ''), 250);
  row('Prix unit', product.price.toLocaleString('fr-FR') + ' FCFA', 276);
  dashes(290);
  row('TOTAL',     total.toLocaleString('fr-FR') + ' FCFA', 316, '#c9a84c');

  dashes(330);

  row('Client',    order.buyerName,                  358);
  if (order.buyerPhone) row('Téléphone', order.buyerPhone, 382);

  if (notes) {
    dashes(396);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font      = '10px sans-serif';
    ctx.fillText('MODIFICATIONS DEMANDÉES', 36, 416);
    ctx.fillStyle = 'rgba(244,240,232,0.7)';
    ctx.font      = '11px sans-serif';
    const words = notes.split(' ');
    let line = ''; let ly = 432;
    words.forEach(w => {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > W - 72 && line) {
        ctx.fillText(line, 36, ly); line = w; ly += 16;
      } else line = test;
    });
    if (line) ctx.fillText(line, 36, ly);
  }

  /* Date */
  const dateStr = new Date(order.createdAt || Date.now())
    .toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  dashes(H - 100);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font      = '10px sans-serif';
  ctx.fillText(dateStr, W / 2, H - 78);
  ctx.fillText("Conserve ce ticket comme preuve d'achat", W / 2, H - 62);

  /* Pied de page */
  ctx.fillStyle = 'rgba(201,168,76,0.4)';
  ctx.font      = '9px sans-serif';
  ctx.fillText("codé par Nel'si · N Market", W / 2, H - 26);

  return canvas;
}

function downloadTicket(data) {
  if (!data) return;
  const canvas = buildTicketCanvas(data);
  const link   = document.createElement('a');
  link.download = 'ticket-' + (data.order.orderCode || 'commande') + '.png';
  link.href     = canvas.toDataURL('image/png');
  link.click();
  showToast('Ticket téléchargé', 'Enregistré en PNG ✓');

  /* Afficher aussi dans la page */
  const wrap = document.getElementById('ticketCanvas');
  if (wrap) {
    canvas.style.maxWidth  = '100%';
    canvas.style.borderRadius = '12px';
    canvas.style.border    = '1px solid rgba(201,168,76,0.3)';
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function showScreenshotHint() {
  /* Afficher le ticket dans la page pour faciliter la capture */
  if (!window.currentTicketData) return;
  const canvas = buildTicketCanvas(window.currentTicketData);
  canvas.style.maxWidth    = '100%';
  canvas.style.borderRadius = '12px';
  canvas.style.border      = '1px solid rgba(201,168,76,0.3)';
  const wrap = document.getElementById('ticketCanvas');
  if (wrap) {
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('Ticket affiché', "Fais une capture d'écran maintenant 📸");
  }
}

/* ── REVIEWS ── */
async function loadReviews() {
  const reviews = await dbGetReviews();
  const el = document.getElementById('reviewsList');
  if (!reviews.length) {
    el.innerHTML = '<div class="empty-reviews">Aucun avis pour l\'instant. Sois le premier !</div>';
    return;
  }
  el.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-top">
        <div class="review-avatar">${esc(r.reviewerName[0].toUpperCase())}</div>
        <div class="review-meta">
          <div class="review-name">${esc(r.reviewerName)}</div>
          <div class="review-product">${esc(r.productName)}${r.sellerName ? ` · ${esc(r.sellerName)}` : ''}</div>
        </div>
        <div class="review-stars">${starsHtml(r.rating)}</div>
      </div>
      ${r.text ? `<div class="review-text">${esc(r.text)}</div>` : ''}
    </div>`).join('');
}



async function submitReview() {
  const name = document.getElementById('rvName').value.trim();
  const pid  = parseInt(document.getElementById('rvProduct').value);
  const text = document.getElementById('rvText').value.trim();
  const star = document.querySelector('input[name="rv"]:checked');

  if (!name || !text || !star) {
    showToast('Champs manquants', 'Remplis tous les champs.', 'var(--red)'); return;
  }
  if (name.length > 100) { showToast('Nom trop long', 'Maximum 100 caractères.', 'var(--red)'); return; }
  if (text.length > 500) { showToast('Commentaire trop long', 'Maximum 500 caractères.', 'var(--red)'); return; }

  const p = allProducts.find(x => x.id === pid);
  showLoader(true);
  await dbInsertReview({
    sellerId: p?.sellerId, productId: pid,
    productName: p?.name || '—', sellerName: p?.sellerName || '—',
    reviewerName: name, rating: parseInt(star.value), text
  });

  if (p) {
    const rv  = await dbGetReviews({ productId: pid });
    const avg = rv.reduce((s, r) => s + r.rating, 0) / rv.length;
    await dbUpdateProduct(pid, { rating: Math.round(avg * 10) / 10, votes: rv.length });
    allProducts = await dbGetProducts({ available: true });
    renderProducts();
  }

  showLoader(false);
  closeModal('reviewModal');
  showToast('Avis publié', 'Merci pour ton retour ! 🙏');
  await loadReviews();
  document.getElementById('rvName').value = '';
  document.getElementById('rvText').value = '';
  document.querySelectorAll('input[name="rv"]').forEach(r => r.checked = false);
}

/* ── AUTH ── */
function initAuth() {
  document.getElementById('goRegister').addEventListener('click', () => {
    document.getElementById('viewLogin').style.display = 'none';
    document.getElementById('viewRegister').style.display = '';
  });
  document.getElementById('goLogin').addEventListener('click', () => {
    document.getElementById('viewRegister').style.display = 'none';
    document.getElementById('viewLogin').style.display = '';
  });
  document.getElementById('userPill').addEventListener('click', () => {
    if (!getSession()) openModal('authModal');
  });
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
}

async function handleLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  if (!email || !pass) { showToast('Champs manquants', 'Email et mot de passe requis.', 'var(--red)'); return; }
  showLoader(true);
  const r = await dbLoginUser(email, pass);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  setSession(r.user); closeModal('authModal'); syncSessionUI();
  showToast('Connecté !', `Bienvenue ${esc(r.user.firstName)} 👋`);
}

async function handleRegister() {
  const first = document.getElementById('rFirst').value.trim();
  const last  = document.getElementById('rLast').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const pass  = document.getElementById('rPass').value;

  if (!first || !email || !pass) { showToast('Champs manquants', 'Prénom, email et mot de passe requis.', 'var(--red)'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide', 'Vérifie ton adresse email.', 'var(--red)'); return; }
  if (pass.length < 6) { showToast('Mot de passe trop court', 'Minimum 6 caractères.', 'var(--red)'); return; }

  showLoader(true);
  const r = await dbCreateUser(first, last, email, phone, pass);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  setSession(r.user); closeModal('authModal'); syncSessionUI();
  showToast('Compte créé !', `Bienvenue ${esc(first)} 🎉`);
  if (typeof sendWelcomeEmail !== 'undefined') {
    sendWelcomeEmail(r.user).then(res => {
      if (res.ok) showToast('Email envoyé', 'Vérifie ta boîte mail 📧');
    });
  }
}

function handleLogout() {
  clearSession(); syncSessionUI();
  showToast('Déconnecté', 'À bientôt !');
}

function syncSessionUI() {
  const u = getSession();
  const pill = document.getElementById('userPill');
  if (u) {
    document.getElementById('userAvatar').textContent = u.firstName[0].toUpperCase();
    document.getElementById('userName').textContent   = u.name;
    document.getElementById('userRole').textContent   = 'Vendeur';
    pill.style.cursor = 'default';
    document.getElementById('adminBtn').style.display = '';
    document.getElementById('logoutBtn') && (document.getElementById('logoutBtn').style.display = '');
  } else {
    document.getElementById('userAvatar').textContent = '?';
    document.getElementById('userName').textContent   = 'Se connecter';
    document.getElementById('userRole').textContent   = 'Visiteur';
    pill.style.cursor = 'pointer';
    document.getElementById('adminBtn').style.display = 'none';
    document.getElementById('logoutBtn') && (document.getElementById('logoutBtn').style.display = 'none');
  }
}

/* ── MODALS ── */
function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
  });
  /* fermer avec Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.show').forEach(ov => closeModal(ov.id));
  });
}

function openModal(id)  { document.getElementById(id)?.classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); document.body.style.overflow = ''; }

/* ── HELPERS ── */
function showLoader(v) { document.getElementById('loader').style.display = v ? 'flex' : 'none'; }
function catLabel(c)   { return { food:'🥞 Nourriture', drink:'🥤 Boissons', other:'✨ Autres' }[c] || c; }
function starsHtml(n)  { return Array.from({length:5}, (_,i) => `<span class="${i < n ? 'star-on' : 'star-off'}">★</span>`).join(''); }

let _toastTimer;
function showToast(title, msg, color = 'var(--gold)') {
  const t = document.getElementById('toast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg;
  t.style.borderLeftColor = color;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}
