/* ═══════════════════════════════════════════════════
   N MARKET — main.js  (page publique)
═══════════════════════════════════════════════════ */

let activeFilter = 'all';
let sortKey = 'reco', fPriceMin = null, fPriceMax = null, fStock = false, fRating = false;
let searchQ      = '';
let allProducts  = [];
let allSellers   = [];
let promotedIds  = [];
function sellerBadge(sellerId) {
  const u = allSellers.find(x => x.id === sellerId);
  return u && u.verified ? ' <span class="vbadge" title="Vendeur vérifié : identité contrôlée par N Market">✓ Vérifié</span>' : '';
}
function sellerFiliere(sellerId) {
  const u = allSellers.find(x => x.id === sellerId);
  return u && u.filiere ? esc(getFiliereLabel(u.filiere)) : '';     // déjà échappé
}

document.addEventListener('DOMContentLoaded', async () => {
  // Session Supabase Auth + retour du lien « mot de passe oublié » / confirmation d'email
  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') openModal('recoveryModal');
  });
  await initSession();
  initNav();
  await loadCategories();
  await loadFilieres();
  initFilters();
  initAuth();
  populateFiliereSelects();
  syncSessionUI();
  loadCart();
  await loadProducts();
  loadAdBanners();
  NMCache.startAutoRefresh(async () => { await loadProducts(); await loadAdBanners(); }, 90000,
    () => document.getElementById('page-products').classList.contains('active'));
  initDeliveryFields();
  document.getElementById('submitReturnBtn').addEventListener('click', submitReturn);
  document.getElementById('submitReportBtn').addEventListener('click', submitSellerReport);
});

/* ── NAV ── */
function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + btn.dataset.page).classList.add('active');
      if (btn.dataset.page === 'cart')    renderCart();
      if (btn.dataset.page === 'reviews') await loadReviews();
    });
  });
}

/* ── PRODUCTS ── */
async function loadProducts() {
  NMCache.beginPage();
  showLoader(true);
  allProducts = await dbGetProducts({ available: true });
  if (!allSellers.length) allSellers = await dbGetPublicSellers();
  promotedIds = await dbGetActivePromotedProductIds();
  showLoader(false);
  renderProducts();
  populateReviewProductSelect();
  if (document.getElementById('page-cart').classList.contains('active')) renderCart();
}

function populateReviewProductSelect() {
  document.getElementById('rvProduct').innerHTML =
    allProducts.map(x => `<option value="${Number(x.id)}">${esc(x.name)} — ${esc(x.sellerName)}</option>`).join('');
}

function matchesFilters(p, skipCat) {
  if (!skipCat && activeFilter !== 'all' && p.cat !== activeFilter) return false;
  if (searchQ && !(p.name.toLowerCase().includes(searchQ) || p.sellerName.toLowerCase().includes(searchQ) || (p.desc||'').toLowerCase().includes(searchQ))) return false;
  if (fPriceMin != null && p.price < fPriceMin) return false;
  if (fPriceMax != null && p.price > fPriceMax) return false;
  if (fStock && isOutOfStock(p)) return false;
  if (fRating && !(p.rating >= 4)) return false;
  return true;
}
function activeFilterCount() { return (fPriceMin != null || fPriceMax != null ? 1 : 0) + (fStock ? 1 : 0) + (fRating ? 1 : 0); }

function sortProducts(list) {
  const byReco = (a, b) => (b.rating - a.rating) || ((b.votes||0) - (a.votes||0));
  const fns = {
    reco: byReco,
    rating: byReco,
    new: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
  };
  return [...list].sort(fns[sortKey] || byReco);
}

function resetAllFilters() {
  fPriceMin = fPriceMax = null; fStock = false; fRating = false; searchQ = ''; activeFilter = 'all';
  const set = (id, v) => { const e = document.getElementById(id); if (e) { if (e.type === 'checkbox') e.checked = v; else e.value = v; } };
  set('fPriceMin', ''); set('fPriceMax', ''); set('fStock', false); set('fRating', false); set('searchInput', ''); set('filterSelect', 'all');
  document.querySelectorAll('#filterButtons .filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  renderProducts();
}

function renderActiveChips() {
  const box = document.getElementById('activeFilters'); if (!box) return;
  const chips = [];
  if (activeFilter !== 'all') { const c = getCategories().find(x => x.slug === activeFilter); chips.push(['cat', c ? c.label : activeFilter]); }
  if (searchQ) chips.push(['q', '« ' + searchQ + ' »']);
  if (fPriceMin != null || fPriceMax != null) chips.push(['price', (fPriceMin != null ? fPriceMin.toLocaleString() : '0') + ' – ' + (fPriceMax != null ? fPriceMax.toLocaleString() : '∞') + ' FCFA']);
  if (fStock) chips.push(['stock', 'En stock']);
  if (fRating) chips.push(['rating', '4 ★ et plus']);
  box.innerHTML = chips.map(([k, t]) => `<button type="button" class="chip" data-rm="${k}">${esc(t)} <span aria-hidden="true">✕</span><span class="sr">retirer</span></button>`).join('') +
    (chips.length > 1 ? '<button type="button" class="chip-clear" data-rm="all">Tout effacer</button>' : '');
  box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.rm;
    if (k === 'all') return resetAllFilters();
    if (k === 'cat') { activeFilter = 'all'; document.getElementById('filterSelect').value = 'all'; document.querySelectorAll('#filterButtons .filter-btn').forEach(x => x.classList.toggle('active', x.dataset.filter === 'all')); }
    if (k === 'q') { searchQ = ''; document.getElementById('searchInput').value = ''; }
    if (k === 'price') { fPriceMin = fPriceMax = null; document.getElementById('fPriceMin').value = ''; document.getElementById('fPriceMax').value = ''; }
    if (k === 'stock') { fStock = false; document.getElementById('fStock').checked = false; }
    if (k === 'rating') { fRating = false; document.getElementById('fRating').checked = false; }
    renderProducts();
  }));
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const list = allProducts.filter(p => matchesFilters(p, false));

  // compteurs par catégorie (en tenant compte des autres filtres)
  const counts = {}; let totalAll = 0;
  allProducts.forEach(p => { if (matchesFilters(p, true)) { counts[p.cat] = (counts[p.cat] || 0) + 1; totalAll++; } });
  document.querySelectorAll('#filterButtons .filter-btn').forEach(b => {
    const n = b.dataset.filter === 'all' ? totalAll : (counts[b.dataset.filter] || 0);
    let c = b.querySelector('.cnt'); if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); }
    c.textContent = n;
  });
  const fc = document.getElementById('fCount'), n = activeFilterCount();
  if (fc) { fc.hidden = !n; fc.textContent = n; }
  const rc = document.getElementById('resultCount');
  if (rc) rc.textContent = list.length + ' produit' + (list.length > 1 ? 's' : '');
  const apply = document.getElementById('fpApply'); if (apply) apply.textContent = 'Voir ' + list.length + ' résultat' + (list.length > 1 ? 's' : '');
  renderActiveChips();

  if (!list.length) {
    grid.innerHTML = `<div class="empty">Aucun produit ne correspond.<br><button type="button" class="btn-ghost" id="emptyReset" style="margin-top:12px">Effacer les filtres</button></div>`;
    const r = document.getElementById('emptyReset'); if (r) r.addEventListener('click', resetAllFilters);
    return;
  }

  const sorted = sortProducts(list);
  // Section « Sponsorisé » : seulement en tri recommandé, sans filtre
  const noFilter = activeFilter === 'all' && !searchQ && !activeFilterCount() && sortKey === 'reco';
  const sponsored = noFilter ? sorted.filter(p => promotedIds.includes(p.id)) : [];
  const rest = sponsored.length ? sorted.filter(p => !promotedIds.includes(p.id)) : sorted;

  let html = '';
  if (sponsored.length) {
    html += `<div class="section-divider">Sponsorisé</div><div class="grid">${sponsored.map(p => productCardHtml(p, true)).join('')}</div>`;
    html += `<div class="section-divider">Tous les produits</div>`;
  }
  html += `<div class="grid">${rest.map(p => productCardHtml(p, false)).join('')}</div>`;
  grid.innerHTML = html;
  bindProductGridEvents(grid);
}

function productCardHtml(p, isSponsored) {
  const out = isOutOfStock(p);
  const low = p.trackStock && p.stock > 0 && p.stock <= 3;
  const cat = getCategories().find(c => c.slug === p.cat);
  return `
    <article class="card${isSponsored?' sponsored':''}${out?' is-out':''}">
      <div class="card-img cat-${esc(p.cat)}" data-detail="${p.id}" role="button" tabindex="0" aria-label="Voir ${esc(p.name)}">${thumbHtml(p, p.name)}${out?'<span class="img-flag">Rupture de stock</span>':''}</div>
      <div class="card-body">
        <div class="card-meta">${isSponsored ? '<span class="sp-tag">Sponsorisé</span>' : ''}${cat ? esc(cat.label) : ''}${low ? `<span class="card-low">Plus que ${p.stock}</span>` : ''}</div>
        <h3 class="card-name" data-detail="${p.id}" role="button" tabindex="0">${esc(p.name)}</h3>
        <div class="card-seller"><span>${esc(p.sellerName)}${sellerBadge(p.sellerId)}</span><span class="shop-link" data-shop="${p.sellerId}">Voir la boutique</span></div>
        <div class="card-row">
          <div class="card-price">${p.price.toLocaleString()} <small>FCFA</small></div>
          <div class="card-rating" title="Note moyenne">${p.rating ? '★ ' + p.rating + (p.votes ? ` <span>(${p.votes})</span>` : '') : '<span>Pas encore noté</span>'}</div>
        </div>
        <button class="btn-order" data-id="${p.id}" data-name="${esc(p.name)}" ${out?'disabled':''}>${out?'Indisponible':'Ajouter au panier'}</button>
      </div>
    </article>`;
}

function bindProductGridEvents(grid) {
  grid.querySelectorAll('[data-detail]').forEach(el => {
    el.addEventListener('click', () => openProductDetail(parseInt(el.dataset.detail)));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProductDetail(parseInt(el.dataset.detail)); } });
  });
  grid.querySelectorAll('.btn-order:not(:disabled)').forEach(btn =>
    btn.addEventListener('click', () => addToCart(parseInt(btn.dataset.id)))
  );
  grid.querySelectorAll('[data-shop]').forEach(el =>
    el.addEventListener('click', (ev) => { ev.stopPropagation(); openShop(parseInt(el.dataset.shop)); })
  );
}

/* ── BANNIÈRES PUBLICITAIRES (carousel) ── */
let _bannerTimer = null;

async function loadAdBanners() {
  const wrap = document.getElementById('adBannersList');
  if (!wrap) return;
  const banners = await dbGetAdBanners(true);
  if (!banners.length) { wrap.innerHTML = ''; return; }

  // Une seule bannière : affichage simple sans carousel
  if (banners.length === 1) {
    const b = banners[0];
    const bgStyle = safeImg(b.imageUrl) ? `background-image:url('${safeImg(b.imageUrl)}')` : `background:${safeColor(b.bgColor)}`;
    const inner = `<div class="ab-overlay"><div class="ab-title">${esc(b.title)}</div>${b.subtitle ? `<div class="ab-subtitle">${esc(b.subtitle)}</div>` : ''}</div><span class="ab-tag">Publicité</span>`;
    wrap.innerHTML = safeHref(b.linkUrl)
      ? `<a class="ad-banner" style="${bgStyle}" href="${safeHref(b.linkUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="ad-banner" style="${bgStyle}">${inner}</div>`;
    return;
  }

  // Plusieurs bannières : carousel
  const slides = banners.map((b, i) => {
    const bgStyle = safeImg(b.imageUrl) ? `background-image:url('${safeImg(b.imageUrl)}')` : `background:${safeColor(b.bgColor)}`;
    const inner = `<div class="ab-overlay"><div class="ab-title">${esc(b.title)}</div>${b.subtitle ? `<div class="ab-subtitle">${esc(b.subtitle)}</div>` : ''}</div><span class="ab-tag">Publicité</span>`;
    const el = safeHref(b.linkUrl)
      ? `<a class="ad-banner ab-slide" style="${bgStyle}" href="${safeHref(b.linkUrl)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="ad-banner ab-slide" style="${bgStyle}">${inner}</div>`;
    return el;
  }).join('');

  const dots = banners.map((_, i) => `<button class="ab-dot${i===0?' active':''}" data-idx="${i}"></button>`).join('');

  wrap.innerHTML = `
    <div class="ab-carousel">
      <div class="ab-track" id="abTrack">${slides}</div>
      <button class="ab-arrow ab-prev" id="abPrev">&#8249;</button>
      <button class="ab-arrow ab-next" id="abNext">&#8250;</button>
      <div class="ab-dots" id="abDots">${dots}</div>
    </div>`;

  let current = 0;
  const track = document.getElementById('abTrack');
  const dotsEl = document.getElementById('abDots');

  function goTo(idx) {
    current = (idx + banners.length) % banners.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsEl.querySelectorAll('.ab-dot').forEach((d, i) => d.classList.toggle('active', i === current));
  }

  document.getElementById('abPrev').addEventListener('click', () => { goTo(current - 1); resetTimer(); });
  document.getElementById('abNext').addEventListener('click', () => { goTo(current + 1); resetTimer(); });
  dotsEl.querySelectorAll('.ab-dot').forEach(d => d.addEventListener('click', () => { goTo(parseInt(d.dataset.idx)); resetTimer(); }));

  // Swipe tactile
  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { goTo(diff > 0 ? current + 1 : current - 1); resetTimer(); }
  });

  function resetTimer() {
    if (_bannerTimer) clearInterval(_bannerTimer);
    _bannerTimer = setInterval(() => goTo(current + 1), 4000);
  }
  resetTimer();
}

/* ── FILIÈRES (sélecteurs dynamiques) ── */
function populateFiliereSelects() {
  const opts = '<option value="">— Sélectionner —</option>' + getFilieres().map(f => `<option value="${esc(f.slug)}">${esc(f.label)}</option>`).join('');
  const rFiliere = document.getElementById('rFiliere');
  if (rFiliere) rFiliere.innerHTML = opts;
  const oFiliere = document.getElementById('oFiliere');
  if (oFiliere) oFiliere.innerHTML = opts;
}

function initFilters() {
  const wrap = document.getElementById('filterButtons');
  const select = document.getElementById('filterSelect');
  const cats = getCategories();

  wrap.innerHTML = '<button class="filter-btn active" data-filter="all">Tout</button>' +
    cats.map(c => `<button class="filter-btn" data-filter="${esc(c.slug)}">${esc(c.emoji)} ${esc(c.label)}</button>`).join('');
  select.innerHTML = '<option value="all">Toutes les catégories</option>' +
    cats.map(c => `<option value="${esc(c.slug)}">${esc(c.emoji)} ${esc(c.label)}</option>`).join('');

  function setFilter(val) {
    activeFilter = val;
    wrap.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === val));
    select.value = val;
    renderProducts();
  }

  wrap.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
  select.addEventListener('change', () => setFilter(select.value));

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase().trim();
    renderProducts();
  });

  document.getElementById('sortSelect').addEventListener('change', e => { sortKey = e.target.value; renderProducts(); });
  const num = v => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };
  document.getElementById('fPriceMin').addEventListener('input', e => { fPriceMin = num(e.target.value); renderProducts(); });
  document.getElementById('fPriceMax').addEventListener('input', e => { fPriceMax = num(e.target.value); renderProducts(); });
  document.getElementById('fStock').addEventListener('change', e => { fStock = e.target.checked; renderProducts(); });
  document.getElementById('fRating').addEventListener('change', e => { fRating = e.target.checked; renderProducts(); });
  document.getElementById('fpReset').addEventListener('click', resetAllFilters);
  const panel = document.getElementById('filtersPanel'), ov = document.getElementById('fpOverlay');
  const openP = () => { panel.classList.add('open'); ov.classList.add('show'); document.body.classList.add('fp-open'); };
  const closeP = () => { panel.classList.remove('open'); ov.classList.remove('show'); document.body.classList.remove('fp-open'); };
  document.getElementById('openFilters').addEventListener('click', openP);
  document.getElementById('fpClose').addEventListener('click', closeP);
  document.getElementById('fpApply').addEventListener('click', closeP);
  ov.addEventListener('click', closeP);
}

/* ── CART (PANIER) ── */
let cart = [];
function loadCart() {
  try { cart = JSON.parse(localStorage.getItem('nmarket_cart') || '[]'); } catch { cart = []; }
  cart.forEach(i => { if (i.note === undefined) i.note = ''; });
  updateCartBadge();
}
function saveCart() {
  localStorage.setItem('nmarket_cart', JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const count = cart.reduce((s,i) => s + i.qty, 0);
  document.body.classList.toggle('cart-empty', count === 0);      // le Panier disparaît du menu quand il est vide
  if (count === 0) {
    const cp = document.getElementById('page-cart');
    const ok = document.getElementById('orderSuccess');
    if (cp && cp.classList.contains('active') && ok && ok.style.display === 'none') {
      const b = document.querySelector('.sidebar .nav-item[data-page="products"]'); if (b) setTimeout(() => b.click(), 350);
    }
  }
  ['cartCount','cartCountMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = ''; }
    else el.style.display = 'none';
  });
}
function addToCart(productId, addQty) {
  addQty = Math.max(1, parseInt(addQty, 10) || 1);
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const existing = cart.find(i => i.productId === productId);
  const wantQty = (existing ? existing.qty : 0) + addQty;
  if (p.trackStock && wantQty > p.stock) { showToast('Stock insuffisant', `Il ne reste que ${p.stock} unité(s) de ce produit.`, 'var(--red)'); return; }
  if (existing) existing.qty += addQty;
  else cart.push({ productId, qty: addQty, note: '' });
  saveCart();
  showCartPopup(p, addQty);
  if (document.getElementById('page-cart').classList.contains('active')) renderCart();
}
/* Popup « Ajouté au panier » */
let _cpTimer = null;
function showCartPopup(p, qty) {
  const el = document.getElementById('cartPopup'); if (!el) return;
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cpThumb').innerHTML = thumbHtml(p, p.name);
  document.getElementById('cpName').textContent = p.name;
  document.getElementById('cpMeta').textContent = qty + ' × ' + Number(p.price).toLocaleString() + ' FCFA · ' + total + ' article' + (total > 1 ? 's' : '') + ' au panier';
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(_cpTimer); _cpTimer = setTimeout(hideCartPopup, 5000);
}
function hideCartPopup() { const el = document.getElementById('cartPopup'); if (el) { el.classList.remove('show'); setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 220); } }
document.addEventListener('DOMContentLoaded', () => {
  const v = document.getElementById('cpView'), k = document.getElementById('cpKeep'), x = document.getElementById('cpClose');
  if (v) v.addEventListener('click', () => { hideCartPopup(); const b = document.querySelector('.sidebar .nav-item[data-page="cart"]'); if (b) b.click(); window.scrollTo({ top: 0 }); });
  if (k) k.addEventListener('click', hideCartPopup);
  if (x) x.addEventListener('click', hideCartPopup);
});
function removeFromCart(productId) { cart = cart.filter(i => i.productId !== productId); saveCart(); renderCart(); }
function setCartQty(productId, qty) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  if (qty < 1) { removeFromCart(productId); return; }
  const p = allProducts.find(x => x.id === productId);
  if (p && p.trackStock && qty > p.stock) {
    showToast('Stock insuffisant', `Il ne reste que ${p.stock} unité(s) de ce produit.`, 'var(--red)');
    qty = p.stock;
  }
  item.qty = qty;
  saveCart(); renderCart();
}
function setCartNote(productId, note) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  item.note = note;
  saveCart();
}

function renderCart() {
  const items = cart.map(i => ({ ...i, p: allProducts.find(x => x.id === i.productId) })).filter(i => i.p);
  const empty = document.getElementById('cartEmpty');
  const content = document.getElementById('cartContent');
  const done = document.getElementById('orderSuccess');
  const doneShown = !!done && done.style.display !== 'none';
  if (!items.length) { empty.style.display = doneShown ? 'none' : ''; content.style.display = 'none'; return; }
  // nouveau panier : on efface la confirmation / le ticket de la commande précédente
  if (done) { done.style.display = 'none'; const tw = document.getElementById('ticketWrap'); if (tw) tw.style.display = 'none'; }
  empty.style.display = 'none'; content.style.display = '';
  const wrap = document.getElementById('cartItems');
  wrap.innerHTML = items.map(i => `
    <div class="cart-item">
      <div class="ci-main">
        <div class="ci-img">${thumbHtml(i.p, '')}</div>
        <div class="ci-info">
          <div class="ci-name">${esc(i.p.name)}</div>
          <div class="ci-seller">${esc(i.p.sellerName)}${sellerFiliere(i.p.sellerId)?` · ${sellerFiliere(i.p.sellerId)}`:''}</div>
          <div class="ci-price">${i.p.price.toLocaleString()} FCFA</div>
        </div>
        <div class="ci-qty">
          <button data-act="dec" data-id="${i.p.id}">−</button>
          <span>${i.qty}</span>
          <button data-act="inc" data-id="${i.p.id}">+</button>
        </div>
        <div class="ci-remove" data-act="rm" data-id="${i.p.id}" title="Retirer">✕</div>
      </div>
      <div class="ci-note-wrap">
        <textarea class="ci-note" data-note="${i.p.id}" rows="1" placeholder="Précision pour ce produit (ex : sans sucre, sauce à part…)">${esc(i.note||'')}</textarea>
      </div>
    </div>
  `).join('');
  const total = items.reduce((s,i) => s + i.p.price * i.qty, 0);
  document.getElementById('cartTotal').textContent = total.toLocaleString() + ' FCFA';
  wrap.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const item = cart.find(x => x.productId === id);
      if (btn.dataset.act === 'inc') setCartQty(id, item.qty + 1);
      if (btn.dataset.act === 'dec') setCartQty(id, item.qty - 1);
      if (btn.dataset.act === 'rm')  removeFromCart(id);
    });
  });
  wrap.querySelectorAll('[data-note]').forEach(el => {
    el.addEventListener('input', () => setCartNote(parseInt(el.dataset.note), el.value));
  });
}

/* ── PRODUCT DETAIL ── */
async function openProductDetail(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  showLoader(true);
  const reviews = await dbGetReviews({ productId: id });
  showLoader(false);
  const filiere = sellerFiliere(p.sellerId);
  document.getElementById('pdContent').innerHTML = `
    <div class="pd-img cat-${esc(p.cat)}">${thumbHtml(p, p.name)}</div>
    <div class="pd-title">${esc(p.name)}</div>
    <div class="pd-seller">Vendu par <span class="shop-link" id="pdShopLink">${esc(p.sellerName)}</span>${sellerBadge(p.sellerId)}${filiere?` <span class="seller-filiere">· ${filiere}</span>`:''}</div>
    <div class="pd-row">
      <div class="pd-price">${p.price.toLocaleString()} <small>FCFA</small></div>
      <div class="pd-rating">${p.rating ? '★ ' + p.rating + (p.votes ? ` (${p.votes} avis)` : '') : 'Pas encore noté'}</div>
    </div>
    ${stockBadgeHtml(p)}
    ${p.desc ? `<div class="pd-desc">${esc(p.desc)}</div>` : ''}
    <div class="pd-buy">
      <div class="qty" ${isOutOfStock(p)?'hidden':''}>
        <button type="button" id="pdMinus" aria-label="Moins">−</button><span id="pdQty">1</span><button type="button" id="pdPlus" aria-label="Plus">+</button>
      </div>
      <button class="btn-primary" id="pdAddBtn" ${isOutOfStock(p)?'disabled':''}>${isOutOfStock(p)?'Rupture de stock':'Ajouter au panier'}</button>
    </div>
    <ul class="pd-info">
      <li><strong>Livraison</strong><span>Sur le campus ou à l'adresse de ton choix, à la date que tu indiques. Le vendeur te contacte pour confirmer.</span></li>
      <li><strong>Paiement</strong><span>À la remise de la commande ou par Wave, comme convenu avec le vendeur.</span></li>
      <li><strong>Retour</strong><span>Demande un retour avec le code de ton reçu (NM-…).</span></li>
    </ul>
    <div class="pd-reviews">
      <h4>Avis sur ce produit (${reviews.length})</h4>
      ${reviews.length ? reviews.map(r => `
        <div class="review-card">
          <div class="review-top">
            <div><div class="review-name">${esc(r.reviewerName)}</div></div>
            <div class="review-stars">${starsHtml(r.rating)}</div>
          </div>
          <div class="review-text">${esc(r.text)}</div>
        </div>`).join('') : '<div style="color:var(--t3);font-size:.78rem">Aucun avis pour ce produit pour l\'instant.</div>'}
    </div>
  `;
  const addBtn = document.getElementById('pdAddBtn');
  let q = 1; const maxQ = p.trackStock ? Math.max(1, p.stock) : 99;
  const qEl = document.getElementById('pdQty');
  const setQ = v => { q = Math.min(maxQ, Math.max(1, v)); if (qEl) qEl.textContent = q; };
  const mi = document.getElementById('pdMinus'), pl = document.getElementById('pdPlus');
  if (mi) mi.addEventListener('click', () => setQ(q - 1));
  if (pl) pl.addEventListener('click', () => setQ(q + 1));
  if (addBtn && !addBtn.disabled) addBtn.addEventListener('click', () => { addToCart(id, q); closeModal('productDetailModal'); });
  document.getElementById('pdShopLink').addEventListener('click', () => { closeModal('productDetailModal'); openShop(p.sellerId); });
  openModal('productDetailModal');
}

/* ── BOUTIQUE VENDEUR ── */
async function openShop(sellerId) {
  showLoader(true);
  const [products, seller] = await Promise.all([
    dbGetProducts({ sellerId, available: true }),
    (async () => { if (!allSellers.length) allSellers = await dbGetPublicSellers(); return allSellers.find(u=>u.id===sellerId); })()
  ]);
  showLoader(false);
  if (!seller) return;

  const promoted = products.filter(p => promotedIds.includes(p.id));
  const rest = products.filter(p => !promotedIds.includes(p.id));
  const sortedRest = [...rest].sort((a,b) => (b.rating-a.rating) || ((b.votes||0)-(a.votes||0)));
  const ordered = [...promoted, ...sortedRest];

  const avgRating = products.length ? (products.reduce((s,p)=>s+(p.rating||0)*((p.votes||0)||1), 0) / products.reduce((s,p)=>s+((p.votes||0)||1),0)) : 0;
  const filiere = seller.filiere ? getFiliereLabel(seller.filiere) : '';

  document.getElementById('shopContent').innerHTML = `
    <div class="shop-header">
      <div class="shop-avatar">${esc((seller.name||'?')[0].toUpperCase())}</div>
      <div class="shop-info">
        <div class="shop-name">${esc(seller.name)}${seller.verified ? ' <span class="vbadge" title="Vendeur vérifié">✓ Vérifié</span>' : ''}</div>
        <div class="shop-meta">${filiere?esc(filiere)+' · ':''}${products.length} produit${products.length>1?'s':''}</div>
        ${avgRating ? `<div class="shop-rating">★ ${avgRating.toFixed(1)} note moyenne</div>` : ''}
      </div>
      <div class="shop-actions">
        <button class="btn-report" id="shopReportBtn">⚠ Signaler</button>
      </div>
    </div>
    <div id="shopProductsGrid">
      ${ordered.length ? `<div class="grid">${ordered.map(p => productCardHtml(p, promotedIds.includes(p.id))).join('')}</div>` : '<div class="empty">Ce vendeur n\'a aucun produit disponible pour le moment.</div>'}
    </div>
  `;
  bindProductGridEvents(document.getElementById('shopProductsGrid'));
  document.getElementById('shopReportBtn').addEventListener('click', () => openReportModal(seller.id, seller.name));
  openModal('shopModal');
}

/* ── SIGNALEMENT D'UN VENDEUR ── */
function openReportModal(sellerId, sellerName) {
  document.getElementById('reportSellerId').value = sellerId;
  document.getElementById('reportModalSub').textContent = `Signalement concernant : ${sellerName}`;
  document.getElementById('reportName').value = '';
  document.getElementById('reportPhone').value = '';
  document.getElementById('reportReason').value = '';
  document.getElementById('reportSuccess').classList.remove('show');
  openModal('reportModal');
}

async function submitSellerReport() {
  const sellerId = parseInt(document.getElementById('reportSellerId').value);
  const reporterName  = document.getElementById('reportName').value.trim();
  const reporterPhone = document.getElementById('reportPhone').value.trim();
  const reason = document.getElementById('reportReason').value.trim();
  if (!reason) { showToast('Motif manquant', 'Décris le problème rencontré.', 'var(--red)'); return; }

  showLoader(true);
  const r = await dbInsertSellerReport({ sellerId, reporterName, reporterPhone, reason });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('reportSuccess').classList.add('show');
  showToast('Signalement envoyé', 'Le Super Admin va l\'examiner.', 'var(--green)');
}

/* ── DELIVERY FIELDS ── */
function initDeliveryFields() {
  const dateEl = document.getElementById('oDate');
  if (dateEl) dateEl.min = today();
  document.querySelectorAll('input[name="deliveryType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.delivery-type-opt').forEach(o => o.classList.remove('active'));
      radio.closest('.delivery-type-opt').classList.add('active');
      document.getElementById('oAddressField').style.display = radio.value === 'external' ? '' : 'none';
      document.getElementById('oCampusFields').style.display = radio.value === 'campus' ? '' : 'none';
      if (radio.value === 'external') { picker.mount(); }
    });
  });
  const picker = window.deliveryPicker = createLocationPicker('oMapBox', { onChange: s => {
    const addr = document.getElementById('oAddress');
    if (s.label && (!addr.value.trim() || addr.dataset.auto === '1')) { addr.value = s.label; addr.dataset.auto = '1'; }
    const chk = document.getElementById('oMapCheck');
    if (s.lat != null) { chk.href = gmapsViewUrl(s.lat, s.lng); chk.style.display = ''; }
    document.getElementById('oMapHint').textContent = s.lat != null ? '✅ Position enregistrée. Tu peux déplacer le repère pour l\'ajuster.' : document.getElementById('oMapHint').textContent;
  }});
  document.getElementById('oAddress').addEventListener('input', e => { e.target.dataset.auto = '0'; });
  document.getElementById('oLocateBtn').addEventListener('click', async () => {
    const btn = document.getElementById('oLocateBtn'); btn.disabled = true; btn.textContent = 'Localisation…';
    await picker.mount();
    const r = await picker.locate();
    btn.disabled = false; btn.textContent = '📍 Utiliser ma position';
    if (r.error) showToast('Position non obtenue', r.error, 'var(--red)');
    else if (r.accuracy > 200) showToast('Position approximative', 'Précision ~' + r.accuracy + ' m : ajuste le repère sur la carte si besoin.', 'var(--t2)');
  });
  if (typeof WHATSAPP_ENABLED === 'undefined' || !WHATSAPP_ENABLED) { const r = document.getElementById('oWaRow'); if (r) r.style.display = 'none'; }   // WhatsApp : bientôt
  document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);
}

async function submitOrder() {
  const name  = document.getElementById('oName').value.trim();
  const phone = document.getElementById('oPhone').value.trim();
  const notes = document.getElementById('oNotes').value.trim();
  const deliveryDate = document.getElementById('oDate').value;
  const deliveryTime = document.getElementById('oTime').value;
  const deliveryType = document.querySelector('input[name="deliveryType"]:checked').value;
  const deliveryAddress = document.getElementById('oAddress').value.trim();
  const classe  = document.getElementById('oClasse').value.trim();
  const filiere = document.getElementById('oFiliere').value;

  const items = cart.map(i => ({ ...i, p: allProducts.find(x => x.id === i.productId) })).filter(i => i.p);
  if (!items.length) { showToast('Panier vide', 'Ajoute au moins un produit.', 'var(--red)'); return; }
  if (!name || !phone) { showToast('Champs manquants', 'Nom et téléphone requis.', 'var(--red)'); return; }
  if (!deliveryDate || !deliveryTime) { showToast('Date/heure manquantes', 'Choisis une date et une heure de livraison.', 'var(--red)'); return; }
  const geo = deliveryType === 'external' && window.deliveryPicker ? window.deliveryPicker.position : null;
  if (deliveryType === 'external' && !deliveryAddress && !geo) { showToast('Adresse manquante', 'Indique l\'adresse hors campus ou place un repère sur la carte.', 'var(--red)'); return; }
  if (deliveryType === 'campus' && (!classe || !filiere)) { showToast('Informations manquantes', 'Indique ta classe et ta filière pour la livraison sur le campus.', 'var(--red)'); return; }

  for (const i of items) {
    if (i.p.trackStock && i.qty > i.p.stock) { showToast('Stock insuffisant', `Il ne reste que ${i.p.stock} unité(s) de "${i.p.name}".`, 'var(--red)'); return; }
  }

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true; showLoader(true);

  // UNE seule opération atomique côté serveur : prix recalculés, stock verrouillé,
  // tout le panier est annulé si un article échoue (plus de commandes partielles ni de doublons).
  const result = await dbPlaceOrder({
    buyerName:name, buyerPhone:phone, notes, deliveryDate, deliveryTime, deliveryType,
    deliveryAddress: deliveryType==='external' ? deliveryAddress : '',
    buyerClasse: deliveryType==='campus' ? classe : '', buyerFiliere: deliveryType==='campus' ? filiere : '',
    lat: geo ? geo.lat : null, lng: geo ? geo.lng : null, placeName: geo ? geo.label : '',
    waOptIn: document.getElementById('oWaOptIn').checked,
    items: items.map(i => ({ productId:i.p.id, qty:i.qty, note:(i.note||'').trim() }))
  });
  showLoader(false); btn.disabled = false;
  if (result.error) { showToast('Commande impossible', result.error, 'var(--red)'); await loadProducts(); return; }

  // Reconstruit les lignes du ticket à partir des montants CALCULÉS PAR LE SERVEUR
  const createdOrders = result.orders.map(o => ({
    order: { id:o.id, createdAt:o.createdAt },
    p: { name:o.productName, sellerName:o.sellerName, price:o.qty ? o.total/o.qty : o.total },
    qty:o.qty, total:o.total, note:o.itemNote, code:o.receiptCode
  }));

  const grandTotal = result.grandTotal;
  const firstId = createdOrders[0].order.id;
  const ticketRef = createdOrders.length>1 ? `#${firstId}–#${createdOrders[createdOrders.length-1].order.id}` : `#${firstId}`;
  document.getElementById('orderSuccessText').innerHTML =
    createdOrders.map(o => `${Number(o.qty)}× <strong>${esc(o.p.name)}</strong> — ${o.total.toLocaleString()} FCFA${o.note?`<br><span style="color:var(--t3);font-size:.85em">↳ ${esc(o.note)}</span>`:''}${o.code?`<br><span class="receipt-code">🔑 ${esc(o.code)}</span>`:''}`).join('<br>') +
    `<br><strong>Total : ${grandTotal.toLocaleString()} FCFA</strong><br>` +
    `<span style="color:var(--t3)">Numéro de commande : ${esc(ticketRef)}</span>`;
  document.getElementById('orderSuccess').style.display = '';
  if (typeof WHATSAPP_BUSINESS_NUMBER !== 'undefined' && WHATSAPP_BUSINESS_NUMBER) {
    const codes = createdOrders.map(o => o.code).filter(Boolean).join(', ');
    document.getElementById('waContactLink').href = 'https://wa.me/' + encodeURIComponent(WHATSAPP_BUSINESS_NUMBER) + '?text=' + encodeURIComponent('Bonjour, ma commande ' + codes);
    document.getElementById('waContactP').hidden = false;
  }

  // Affiche le ticket, puis demande au client s'il veut le télécharger
  fillTicket(createdOrders, { name, phone, notes, deliveryDate, deliveryTime, deliveryType, deliveryAddress, classe, filiere, grandTotal });
  document.getElementById('orderSuccess').scrollIntoView({ behavior:'smooth' });
  // image du ticket prête d'abord, puis question au client
  Promise.race([prepareTicket(), new Promise(r => setTimeout(r, 4000))]).then(() => setTimeout(() => openModal('ticketAsk'), 300));

  // Vide le panier et réinitialise le formulaire
  cart = []; saveCart(); renderCart();
  ['oName','oPhone','oNotes','oAddress','oDate','oTime','oClasse'].forEach(id => document.getElementById(id).value='');
  document.getElementById('oWaOptIn').checked = false; if (window.deliveryPicker) window.deliveryPicker.reset();
  document.getElementById('oFiliere').value = '';
  document.querySelector('input[name="deliveryType"][value="campus"]').checked = true;
  document.querySelectorAll('.delivery-type-opt').forEach(o => o.classList.remove('active'));
  document.querySelector('.delivery-type-opt[data-val="campus"]').classList.add('active');
  document.getElementById('oAddressField').style.display = 'none';
  document.getElementById('oCampusFields').style.display = '';

  // Rafraîchit le catalogue (stock mis à jour par le serveur)
  await loadProducts();
  // Les vendeurs sont prévenus par le centre de notifications (trigger serveur).
  // Les emails vendeur ne sont plus envoyés depuis le navigateur du client : cela exigeait
  // de publier l'email de chaque vendeur à tous les visiteurs.
}

/* ── TICKET / PREUVE DE COMMANDE ── */
function fillTicket(createdOrders, f) {
  const firstId = createdOrders[0].order.id;
  document.getElementById('tkPlatform').textContent = typeof PLATFORM_NAME !== 'undefined' ? PLATFORM_NAME : 'N Market';
  document.getElementById('tkId').textContent       = createdOrders.length>1 ? `#${firstId}–#${createdOrders[createdOrders.length-1].order.id}` : `#${firstId}`;
  document.getElementById('tkDate').textContent     = formatDateTime(createdOrders[0].order.createdAt || new Date().toISOString());
  document.getElementById('tkName').textContent     = f.name;
  document.getElementById('tkPhone').textContent    = f.phone;

  const classeRow = document.getElementById('tkClasseRow');
  if (f.deliveryType === 'campus') { classeRow.style.display=''; document.getElementById('tkClasse').textContent = `${f.classe} · ${getFiliereLabel(f.filiere)}`; }
  else classeRow.style.display = 'none';

  document.getElementById('tkItems').innerHTML = createdOrders.map(o => `
    <div class="ticket-row"><span class="k">#${Number(o.order.id)} · ${esc(o.p.name)} ×${Number(o.qty)}</span><span class="v">${o.total.toLocaleString()} FCFA</span></div>
    <div class="ticket-row" style="font-size:.7rem"><span class="k">Vendeur</span><span class="v">${esc(o.p.sellerName)}</span></div>
    ${o.note ? `<div class="ticket-row" style="font-size:.7rem"><span class="k">Précision</span><span class="v">${esc(o.note)}</span></div>` : ''}
    ${o.code ? `<div class="ticket-row"><span class="k">Code de reçu</span><span class="v receipt-code">${esc(o.code)}</span></div>` : ''}
  `).join('<div class="ticket-sep"></div>');

  document.getElementById('tkTotal').textContent    = `${f.grandTotal.toLocaleString()} FCFA`;
  document.getElementById('tkDelivery').textContent = `${new Date(f.deliveryDate+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})} à ${f.deliveryTime}`;
  document.getElementById('tkPlace').textContent    = deliveryTypeLabel(f.deliveryType);
  const notesRow = document.getElementById('tkNotesRow');
  if (f.notes) { notesRow.style.display=''; document.getElementById('tkNotes').textContent = f.notes; }
  else notesRow.style.display = 'none';
  const addrRow = document.getElementById('tkAddressRow');
  if (f.deliveryType === 'external' && f.deliveryAddress) { addrRow.style.display=''; document.getElementById('tkAddress').textContent = f.deliveryAddress; }
  else addrRow.style.display = 'none';

  document.getElementById('ticketWrap').style.display = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('downloadTicketBtn').addEventListener('click', downloadTicket);
});

/* Le ticket est converti en image AVANT de demander au client ce qu'il veut en faire :
   le clic « Télécharger » n'a plus qu'à enregistrer un fichier déjà prêt (les navigateurs mobiles bloquent
   un téléchargement lancé après un délai). */
let ticketBlob = null, ticketName = 'ticket-commande.png', ticketPrep = null;

function prepareTicket() {
  ticketBlob = null;
  const el = document.getElementById('ticketCard');
  ticketName = `ticket-commande-${document.getElementById('tkId').textContent.replace(/[^0-9–-]/g, '')}.png`;
  if (typeof html2canvas === 'undefined' || !el) return (ticketPrep = Promise.resolve(null));
  ticketPrep = (async () => {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    if (!canvas.width || !canvas.height) throw new Error('ticket invisible');
    return await new Promise(res => canvas.toBlob(b => { ticketBlob = b; res(b); }, 'image/png'));
  })().catch(() => null);
  return ticketPrep;
}

/* Affiche l'image du ticket plein écran (appui long pour l'enregistrer) : dernier recours */
function showTicketImage() {
  if (!ticketBlob) { showToast('Ticket', 'Fais une capture d\'écran du ticket affiché.', 'var(--orange)'); return; }
  const url = URL.createObjectURL(ticketBlob);
  const ov = document.createElement('div');
  ov.className = 'ticket-viewer';
  ov.innerHTML = `<div class="tv-box"><img src="${url}" alt="Ticket de commande"><p>Appuie longuement sur l'image pour l'enregistrer, ou fais une capture d'écran.</p><button class="btn-primary" type="button">Fermer</button></div>`;
  ov.querySelector('button').addEventListener('click', () => { ov.remove(); URL.revokeObjectURL(url); });
  document.body.appendChild(ov);
}

async function downloadTicket() {
  if (!ticketBlob) { showToast('Un instant…', 'Préparation du ticket', 'var(--t2)'); await (ticketPrep || prepareTicket()); }
  if (!ticketBlob) { showToast('Téléchargement impossible', 'Fais une capture d\'écran du ticket affiché.', 'var(--red)'); return; }
  const file = new File([ticketBlob], ticketName, { type: 'image/png' });
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iPhone/iPad : l'attribut « download » est ignoré → feuille de partage (« Enregistrer l'image »)
  if (isApple && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Ticket N Market' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    const url = URL.createObjectURL(ticketBlob);
    const a = document.createElement('a');
    a.href = url; a.download = ticketName; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    showToast('Ticket', 'Téléchargement lancé. Vérifie tes téléchargements.', 'var(--green)');
  } catch (e) { showTicketImage(); }
}

/* ── RETOURS / LITIGES ── */
async function submitReturn() {
  const code = document.getElementById('rtCode').value.trim();
  const reason = document.getElementById('rtReason').value.trim();
  if (!code || !reason) { showToast('Champs manquants', 'Indique ton code de reçu et le motif.', 'var(--red)'); return; }

  showLoader(true);
  // La vérification du code de reçu est faite CÔTÉ SERVEUR
  const r = await dbInsertReturn({ code, reason });
  showLoader(false);
  if (r.error) { showToast('Demande refusée', r.error, 'var(--red)'); return; }
  document.getElementById('returnSuccess').classList.add('show');
  showToast('Demande envoyée', 'Le vendeur a été notifié de ta demande.', 'var(--green)');
  ['rtCode','rtReason'].forEach(id => document.getElementById(id).value='');
}

/* ── REVIEWS ── */
async function loadReviews() {
  const reviews = await dbGetReviews();
  const el = document.getElementById('reviewsList');
  if (!reviews.length) { el.innerHTML='<div style="color:var(--t3);font-size:.78rem">Aucun avis pour l\'instant.</div>'; return; }
  el.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-top">
        <div><div class="review-name">${esc(r.reviewerName)}</div><div class="review-product">${esc(r.productName)} · ${esc(r.sellerName||'')}</div></div>
        <div class="review-stars">${starsHtml(r.rating)}</div>
      </div>
      <div class="review-text">${esc(r.text)}</div>
    </div>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('openReviewBtn').addEventListener('click', () => openModal('reviewModal'));
  document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
});

async function submitReview() {
  const name = document.getElementById('rvName').value.trim();
  const pid  = parseInt(document.getElementById('rvProduct').value);
  const text = document.getElementById('rvText').value.trim();
  const star = document.querySelector('input[name="rv"]:checked');
  if (!name||!text||!star) { showToast('Champs manquants','Remplis tous les champs.','var(--red)'); return; }

  showLoader(true);
  const rr = await dbInsertReview({ productId:pid, reviewerName:name, rating:parseInt(star.value), text });
  if (rr.error) { showLoader(false); showToast('Avis refusé', rr.error, 'var(--red)'); return; }
  allProducts = await dbGetProducts({ available:true });   // note moyenne recalculée par le serveur
  renderProducts();
  showLoader(false);
  closeModal('reviewModal');
  showToast('Avis publié','Merci pour ton retour ! 🙏');
  await loadReviews();
  document.getElementById('rvName').value='';document.getElementById('rvText').value='';
  document.querySelectorAll('input[name="rv"]').forEach(r=>r.checked=false);
}

/* ── AUTH ── */
let pendingRegistration = null;

function initAuth() {
  document.getElementById('goRegister').addEventListener('click', () => { document.getElementById('viewLogin').style.display='none'; document.getElementById('viewRegister').style.display=''; });
  document.getElementById('goLogin').addEventListener('click', () => { document.getElementById('viewRegister').style.display='none'; document.getElementById('viewLogin').style.display=''; });
  document.getElementById('userPill').addEventListener('click', () => { if (getSession()) location.href = 'pages/admin.html'; else openModal('authModal'); });
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('forgotBtn').addEventListener('click', handleForgot);
  document.getElementById('goForgot').addEventListener('click', () => { document.getElementById('loginFormEmail').style.display='none'; document.getElementById('loginFormForgot').style.display=''; });
  document.getElementById('goPasswordLogin').addEventListener('click', () => { document.getElementById('loginFormForgot').style.display='none'; document.getElementById('loginFormEmail').style.display=''; });
  document.getElementById('saveNewPassBtn').addEventListener('click', handleSaveNewPassword);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('acceptTermsBtn').addEventListener('click', acceptTermsAndCreateAccount);
  document.getElementById('declineTermsBtn').addEventListener('click', declineTerms);
}

async function handleLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  if (!email||!pass) { showToast('Champs manquants','Email et mot de passe requis.','var(--red)'); return; }
  showLoader(true);
  const r = await dbLoginUser(email, pass);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  closeModal('authModal'); syncSessionUI();
  showToast('Connecté', `Bienvenue ${r.user.firstName} !`);
  setTimeout(() => { location.href = 'pages/admin.html'; }, 350);   // entre directement dans l'espace vendeur
}

async function handleForgot() {
  const email = document.getElementById('fEmail').value.trim();
  if (!email) { showToast('Champ manquant','Indique l\'email de ton compte.','var(--red)'); return; }
  showLoader(true);
  const r = await dbRequestPasswordReset(email);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  // Message identique que le compte existe ou non (pas d'énumération d'emails)
  showToast('Vérifie ta boîte mail', 'Si ce compte existe, un lien de réinitialisation vient d\'être envoyé.', 'var(--green)');
  document.getElementById('loginFormForgot').style.display='none'; document.getElementById('loginFormEmail').style.display='';
}

async function handleSaveNewPassword() {
  const pass = document.getElementById('newPass').value;
  if (pass.length < 8) { showToast('Mot de passe trop court','Minimum 8 caractères.','var(--red)'); return; }
  showLoader(true);
  const r = await dbSetNewPassword(pass);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('newPass').value = '';
  closeModal('recoveryModal');
  await initSession(); syncSessionUI();
  showToast('Mot de passe mis à jour','Tu es connecté.','var(--green)');
}

/* Étape 1 : valide le formulaire, puis ouvre la popup des conditions vendeur.
   Le compte n'est créé qu'après acceptation. */
function handleRegister() {
  const first = document.getElementById('rFirst').value.trim();
  const last  = document.getElementById('rLast').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const filiere = document.getElementById('rFiliere').value;
  const pass  = document.getElementById('rPass').value;
  if (!first||!email||!pass) { showToast('Champs manquants','Prénom, email et mot de passe requis.','var(--red)'); return; }
  if (pass.length<8) { showToast('Mot de passe trop court','Minimum 8 caractères.','var(--red)'); return; }

  pendingRegistration = { first, last, email, phone, filiere, pass };

  // Affiche la popup des conditions, avec boutons Accepter / Refuser
  document.getElementById('termsFooterText').textContent = 'Pour finaliser la création de ton compte vendeur, merci de lire et d\'accepter les conditions ci-dessus.';
  document.getElementById('termsActions').style.display = '';
  openModal('termsModal');
}

/* Étape 2 : l'utilisateur accepte → on crée réellement le compte */
async function acceptTermsAndCreateAccount() {
  if (!pendingRegistration) { closeModal('termsModal'); return; }
  const { first, last, email, phone, filiere, pass } = pendingRegistration;

  showLoader(true);
  const r = await dbCreateUser(first, last, email, phone, pass, filiere);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }

  pendingRegistration = null;
  closeModal('termsModal');
  closeModal('authModal');
  if (r.needsConfirmation) {
    showToast('Confirme ton email 📧', 'Un lien de confirmation vient d\'être envoyé. Clique dessus, puis connecte-toi.', 'var(--green)');
    return;
  }
  syncSessionUI();
  showToast('Compte créé !', `Bienvenue ${first} 🎉`);
  // Email de bienvenue (envoyé avant de quitter la page)
  let mail = Promise.resolve();
  if (typeof sendWelcomeEmail !== 'undefined') mail = Promise.race([sendWelcomeEmail(r.user).catch(() => null), new Promise(x => setTimeout(x, 2500))]);
  mail.then(() => { location.href = 'pages/admin.html'; });   // entre directement dans l'espace vendeur
}

/* L'utilisateur refuse → le compte n'est pas créé */
function declineTerms() {
  pendingRegistration = null;
  closeModal('termsModal');
  showToast('Inscription annulée', 'Tu dois accepter les conditions pour devenir vendeur sur N Market.', 'var(--red)');
}

function syncSessionUI() {
  const u = getSession();
  if (u) {
    document.getElementById('userAvatar').textContent = u.firstName[0].toUpperCase();
    document.getElementById('userName').textContent   = u.name;
    document.getElementById('userRole').textContent   = 'Vendeur';
    document.getElementById('userPill').style.cursor  = 'pointer';
    document.getElementById('userRole').textContent   = 'Vendeur · Mon espace';
  } else {
    document.getElementById('userAvatar').textContent = '?';
    document.getElementById('userName').textContent   = 'Se connecter';
    document.getElementById('userRole').textContent   = 'Visiteur';
    document.getElementById('userPill').style.cursor  = 'pointer';
  }
}


/* ── Tutoriel « Comment ça marche » : s'ouvre à la première visite, puis via le lien sous le titre ── */
document.addEventListener('DOMContentLoaded', () => {
  const KEY = 'nm_tuto_v1';
  const close = () => { closeModal('howModal'); try { localStorage.setItem(KEY, '1'); } catch (e) {} };
  const ok = document.getElementById('howOk'), btn = document.getElementById('howBtn');
  if (ok) ok.addEventListener('click', close);
  if (btn) btn.addEventListener('click', () => openModal('howModal'));
  document.querySelectorAll('[data-close="howModal"]').forEach(b => b.addEventListener('click', close));
  let seen = false; try { seen = !!localStorage.getItem(KEY); } catch (e) {}
  if (!seen) setTimeout(() => openModal('howModal'), 600);
});

/* ── Catégories : dans la colonne de filtres sur PC/tablette, en ligne défilante sur téléphone ── */
document.addEventListener('DOMContentLoaded', () => {
  const chips = document.getElementById('filterButtons'), panel = document.getElementById('filtersPanel');
  if (!chips || !panel) return;
  const anchor = document.createComment('chips'); chips.parentNode.insertBefore(anchor, chips);
  const grp = document.createElement('div'); grp.className = 'fp-group fp-cats';
  grp.innerHTML = '<div class="fp-title">Catégories</div>';
  const mq = window.matchMedia('(min-width: 769px)');
  const place = () => {
    if (mq.matches) { grp.appendChild(chips); panel.insertBefore(grp, panel.querySelector('.fp-group:not(.fp-cats)')); chips.classList.add('in-rail'); }
    else { if (grp.parentNode) grp.remove(); anchor.parentNode.insertBefore(chips, anchor.nextSibling); chips.classList.remove('in-rail'); }
  };
  place(); (mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place));
});

document.addEventListener('DOMContentLoaded', () => {
  const yes = document.getElementById('ticketAskYes'), no = document.getElementById('ticketAskNo');
  if (yes) yes.addEventListener('click', () => { closeModal('ticketAsk'); downloadTicket(); });
  if (no) no.addEventListener('click', () => {
    closeModal('ticketAsk');
    const t = document.getElementById('ticketWrap'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Ticket affiché', 'Fais ta capture d\'écran maintenant.', 'var(--t2)');
  });
});

/* La confirmation et le ticket sortent du bloc « panier » : celui-ci est masqué dès que le panier est vidé,
   ce qui rendait le ticket invisible (donc non capturable) juste après la commande. */
document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('cartContent'), ok = document.getElementById('orderSuccess'), tk = document.getElementById('ticketWrap');
  if (!content || !ok || !tk) return;
  const box = document.createElement('div'); box.className = 'form-wrap'; box.id = 'orderDone';
  box.appendChild(ok); box.appendChild(tk);
  content.parentNode.insertBefore(box, content.nextSibling);
});
