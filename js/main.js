/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — main.js  (page publique)
═══════════════════════════════════════════════════ */

let activeFilter  = 'all';
let searchQ       = '';
let allProducts   = [];   // cache local pour le filtrage instantané

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initFilters();
  initAuth();
  syncSessionUI();
  await loadProducts();
  await loadReviews();
  initOrderForm();
  initReviewForm();
});

/* ════════════════════════════
   NAVIGATION
════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const page = btn.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + page).classList.add('active');
      if (page === 'order')   await populateOrderSelects();
      if (page === 'reviews') await loadReviews();
    });
  });
}

/* ════════════════════════════
   PRODUCTS
════════════════════════════ */
async function loadProducts() {
  showLoader(true);
  allProducts = await dbGetProducts({ available: true });
  showLoader(false);
  renderProducts();
  await populateOrderSelects();
}

function renderProducts() {
  const list = allProducts.filter(p =>
    (activeFilter === 'all' || p.cat === activeFilter) &&
    (p.name.toLowerCase().includes(searchQ) ||
     p.sellerName.toLowerCase().includes(searchQ) ||
     (p.desc || '').toLowerCase().includes(searchQ))
  );

  const grid = document.getElementById('productsGrid');
  if (!list.length) { grid.innerHTML = '<div class="empty">Aucun produit disponible.</div>'; return; }

  grid.innerHTML = list.map(p => `
    <div class="card">
      <div class="card-img">${p.photo ? `<img src="${p.photo}" alt="${p.name}">` : p.emoji}</div>
      <div class="card-body">
        <div class="badge badge-${p.cat}">${catLabel(p.cat)}</div>
        <div class="card-name">${p.name}</div>
        ${p.desc ? `<div class="card-desc">${p.desc}</div>` : ''}
        <div class="card-seller">Par ${p.sellerName}</div>
        <div class="card-row">
          <div class="card-price">${p.price.toLocaleString()} FCFA</div>
          <div class="card-rating">
            <span style="color:var(--yellow)">★</span>
            ${p.rating || '—'}
            ${p.votes ? `<span style="color:var(--text3)">(${p.votes})</span>` : ''}
          </div>
        </div>
        <button class="btn-order" data-id="${p.id}" data-name="${p.name}">Commander</button>
      </div>
    </div>
  `).join('');

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

async function quickOrder(productId, productName) {
  document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-page="order"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-order').classList.add('active');
  await populateOrderSelects();
  document.getElementById('oProduct').value = productId;
}

/* ════════════════════════════
   ORDER
════════════════════════════ */
async function populateOrderSelects() {
  const products = allProducts.length ? allProducts : await dbGetProducts({ available: true });
  document.getElementById('oProduct').innerHTML =
    '<option value="">Choisir un produit…</option>' +
    products.map(p => `<option value="${p.id}">${p.emoji} ${p.name} — ${p.price.toLocaleString()} FCFA (${p.sellerName})</option>`).join('');
  document.getElementById('rvProduct').innerHTML =
    products.map(p => `<option value="${p.id}">${p.name} — ${p.sellerName}</option>`).join('');
}

function initOrderForm() {
  document.getElementById('qtyMinus').addEventListener('click', () => {
    const el = document.getElementById('oQty');
    el.value = Math.max(1, parseInt(el.value || 1) - 1);
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    const el = document.getElementById('oQty');
    el.value = parseInt(el.value || 1) + 1;
  });
  document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);
}

async function submitOrder() {
  const name      = document.getElementById('oName').value.trim();
  const email     = document.getElementById('oEmail').value.trim();
  const phone     = document.getElementById('oPhone').value.trim();
  const productId = parseInt(document.getElementById('oProduct').value);
  const qty       = parseInt(document.getElementById('oQty').value) || 1;
  const notes     = document.getElementById('oNotes').value.trim();

  if (!name || !email || !productId) {
    showToast('Champs manquants', 'Nom, email et produit sont requis.', 'var(--red)');
    return;
  }

  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  showLoader(true);

  const result = await dbInsertOrder({
    sellerId:    p.sellerId,
    productId:   p.id,
    productName: p.name,
    buyerName:   name,
    buyerEmail:  email,
    buyerPhone:  phone,
    qty,
    total:       p.price * qty,
    notes,
  });

  showLoader(false);
  btn.disabled = false;

  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }

  document.getElementById('orderSuccessText').innerHTML =
    `${qty}× <strong>${p.name}</strong> — <strong>${(p.price * qty).toLocaleString()} FCFA</strong>` +
    (notes ? `<br>Note : <em>${notes}</em>` : '') +
    `<br>Confirmation envoyée à ${email}.`;
  const box = document.getElementById('orderSuccess');
  box.classList.add('show');
  box.scrollIntoView({ behavior: 'smooth' });

  ['oName','oEmail','oPhone','oNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('oProduct').value = '';
  document.getElementById('oQty').value = 1;
}

/* ════════════════════════════
   REVIEWS
════════════════════════════ */
async function loadReviews() {
  showLoader(true);
  const reviews = await dbGetReviews();
  showLoader(false);
  const el = document.getElementById('reviewsList');
  if (!reviews.length) { el.innerHTML = '<div style="color:var(--text3);font-size:.87rem">Aucun avis pour l\'instant.</div>'; return; }
  el.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-top">
        <div>
          <div class="review-name">${r.reviewerName}</div>
          <div class="review-product">${r.productName} · ${r.sellerName || ''}</div>
        </div>
        <div class="review-stars">${starsHtml(r.rating)}</div>
      </div>
      <div class="review-text">${r.text}</div>
    </div>
  `).join('');
}

function initReviewForm() {
  document.getElementById('openReviewBtn').addEventListener('click', () => openModal('reviewModal'));
  document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
}

async function submitReview() {
  const name      = document.getElementById('rvName').value.trim();
  const productId = parseInt(document.getElementById('rvProduct').value);
  const text      = document.getElementById('rvText').value.trim();
  const star      = document.querySelector('input[name="rv"]:checked');

  if (!name || !text || !star) { showToast('Champs manquants', 'Remplis tous les champs.', 'var(--red)'); return; }

  const p = allProducts.find(x => x.id === productId);

  showLoader(true);
  const result = await dbInsertReview({
    sellerId:     p ? p.sellerId : null,
    productId,
    productName:  p ? p.name : '—',
    sellerName:   p ? p.sellerName : '—',
    reviewerName: name,
    rating:       parseInt(star.value),
    text,
  });

  if (!result.error && p) {
    /* Recalculer la note du produit */
    const allRv = await dbGetReviews({ productId });
    const avg   = allRv.reduce((s, r) => s + r.rating, 0) / allRv.length;
    await dbUpdateProduct(p.id, { rating: Math.round(avg * 10) / 10, votes: allRv.length });
    await loadProducts();
  }

  showLoader(false);

  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }

  closeModal('reviewModal');
  showToast('Avis publié', 'Merci pour ton retour ! 🙏');
  await loadReviews();
  document.getElementById('rvName').value = '';
  document.getElementById('rvText').value = '';
  document.querySelectorAll('input[name="rv"]').forEach(r => r.checked = false);
}

/* ════════════════════════════
   AUTH
════════════════════════════ */
function initAuth() {
  document.getElementById('goRegister').addEventListener('click', () => {
    document.getElementById('viewLogin').style.display    = 'none';
    document.getElementById('viewRegister').style.display = '';
  });
  document.getElementById('goLogin').addEventListener('click', () => {
    document.getElementById('viewRegister').style.display = 'none';
    document.getElementById('viewLogin').style.display    = '';
  });
  document.getElementById('userPill').addEventListener('click', () => {
    if (!getSession()) openModal('authModal');
  });
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
}

async function handleLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  if (!email || !pass) { showToast('Champs manquants', 'Email et mot de passe requis.', 'var(--red)'); return; }
  showLoader(true);
  const result = await dbLoginUser(email, pass);
  showLoader(false);
  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }
  setSession(result.user);
  closeModal('authModal');
  syncSessionUI();
  showToast('Connecté', `Bienvenue ${result.user.firstName} ! 👋`);
}

async function handleRegister() {
  const first = document.getElementById('rFirst').value.trim();
  const last  = document.getElementById('rLast').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const pass  = document.getElementById('rPass').value;
  if (!first || !email || !pass) { showToast('Champs manquants', 'Prénom, email et mot de passe requis.', 'var(--red)'); return; }
  if (pass.length < 6)           { showToast('Mot de passe trop court', 'Minimum 6 caractères.', 'var(--red)'); return; }
  showLoader(true);
  const result = await dbCreateUser(first, last, email, phone, pass);
  showLoader(false);
  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }
  setSession(result.user);
  closeModal('authModal');
  syncSessionUI();
  showToast('Compte créé !', `Bienvenue ${first} 🎉 Tu peux maintenant vendre !`);
}

function syncSessionUI() {
  const user = getSession();
  if (user) {
    document.getElementById('userAvatar').textContent = user.firstName[0].toUpperCase();
    document.getElementById('userName').textContent   = user.name;
    document.getElementById('userRole').textContent   = 'Vendeur';
    document.getElementById('userPill').style.cursor  = 'default';
    document.getElementById('adminBtn').style.display = '';
  } else {
    document.getElementById('userAvatar').textContent = '?';
    document.getElementById('userName').textContent   = 'Se connecter';
    document.getElementById('userRole').textContent   = 'Visiteur';
    document.getElementById('userPill').style.cursor  = 'pointer';
    document.getElementById('adminBtn').style.display = 'none';
  }
}
