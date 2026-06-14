/* ═══════════════════════════════════════════════════
   N MARKET — main.js  (page publique)
═══════════════════════════════════════════════════ */

let activeFilter = 'all';
let searchQ      = '';
let allProducts  = [];
let allSellers   = [];
let promotedIds  = [];
function sellerFiliere(sellerId) {
  const u = allSellers.find(x => x.id === sellerId);
  return u && u.filiere ? getFiliereLabel(u.filiere) : '';
}

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  await loadCategories();
  await loadFilieres();
  initFilters();
  initAuth();
  populateFiliereSelects();
  syncSessionUI();
  loadCart();
  await loadProducts();
  initDeliveryFields();
  document.getElementById('submitReturnBtn').addEventListener('click', submitReturn);
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
  showLoader(true);
  allProducts = await dbGetProducts({ available: true });
  if (!allSellers.length) allSellers = await dbGetAllUsers();
  promotedIds = await dbGetActivePromotedProductIds();
  showLoader(false);
  renderProducts();
  populateReviewProductSelect();
  if (document.getElementById('page-cart').classList.contains('active')) renderCart();
}

function populateReviewProductSelect() {
  document.getElementById('rvProduct').innerHTML =
    allProducts.map(x => `<option value="${x.id}">${x.name} — ${x.sellerName}</option>`).join('');
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const list = allProducts.filter(p =>
    (activeFilter === 'all' || p.cat === activeFilter) &&
    (p.name.toLowerCase().includes(searchQ) || p.sellerName.toLowerCase().includes(searchQ) || (p.desc||'').toLowerCase().includes(searchQ))
  );

  if (!list.length) { grid.innerHTML = '<div class="empty">Aucun produit disponible.</div>'; bindProductGridEvents(grid); return; }

  // Section "Sponsorisé" : produits dont une promotion est active, parmi la liste filtrée
  const sponsored = activeFilter === 'all' && !searchQ ? list.filter(p => promotedIds.includes(p.id)) : [];
  const rest = sponsored.length ? list.filter(p => !promotedIds.includes(p.id)) : list;

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
  return `
    <div class="card${isSponsored?' sponsored':''}">
      <div class="card-img cat-${p.cat}" data-detail="${p.id}">${p.photo ? `<img src="${p.photo}" alt="${p.name}">` : (p.emoji || catEmoji(p.cat))}</div>
      <div class="card-body">
        ${isSponsored ? `<div class="sponsored-badge">★ Sponsorisé</div>` : ''}
        ${catBadge(p.cat)}${stockBadgeHtml(p)}
        <div class="card-name" data-detail="${p.id}" style="cursor:pointer">${p.name}</div>
        ${p.desc ? `<div class="card-desc">${p.desc}</div>` : ''}
        <div class="card-seller">Par ${p.sellerName}${sellerFiliere(p.sellerId)?` <span class="seller-filiere">· ${sellerFiliere(p.sellerId)}</span>`:''}</div>
        <div class="card-row">
          <div class="card-price">${p.price.toLocaleString()} FCFA</div>
          <div class="card-rating"><span style="color:var(--gold)">★</span> ${p.rating||'—'} ${p.votes?`<span style="color:var(--t3)">(${p.votes})</span>`:''}</div>
        </div>
        <div class="card-actions">
          <button class="btn-detail" data-detail="${p.id}">Détails & avis</button>
          <button class="btn-order" data-id="${p.id}" data-name="${p.name}" ${isOutOfStock(p)?'disabled':''}>${isOutOfStock(p)?'Rupture':'🛒 Ajouter'}</button>
        </div>
      </div>
    </div>`;
}

function bindProductGridEvents(grid) {
  grid.querySelectorAll('[data-detail]').forEach(el =>
    el.addEventListener('click', () => openProductDetail(parseInt(el.dataset.detail)))
  );
  grid.querySelectorAll('.btn-order:not(:disabled)').forEach(btn =>
    btn.addEventListener('click', () => addToCart(parseInt(btn.dataset.id)))
  );
}

/* ── FILIÈRES (sélecteurs dynamiques) ── */
function populateFiliereSelects() {
  const opts = '<option value="">— Sélectionner —</option>' + getFilieres().map(f => `<option value="${f.slug}">${f.label}</option>`).join('');
  const rFiliere = document.getElementById('rFiliere');
  if (rFiliere) rFiliere.innerHTML = opts;
  const oFiliere = document.getElementById('oFiliere');
  if (oFiliere) oFiliere.innerHTML = opts;
}

function initFilters() {
  const wrap = document.getElementById('filterButtons');
  const cats = getCategories();
  wrap.innerHTML = '<button class="filter-btn active" data-filter="all">Tout</button>' +
    cats.map(c => `<button class="filter-btn" data-filter="${c.slug}">${c.emoji} ${c.label}</button>`).join('');
  wrap.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
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

/* ── CART (PANIER) ── */
let cart = [];
function loadCart() {
  try { cart = JSON.parse(localStorage.getItem('nmarket_cart') || '[]'); } catch { cart = []; }
  updateCartBadge();
}
function saveCart() {
  localStorage.setItem('nmarket_cart', JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const count = cart.reduce((s,i) => s + i.qty, 0);
  ['cartCount','cartCountMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = ''; }
    else el.style.display = 'none';
  });
}
function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const existing = cart.find(i => i.productId === productId);
  const wantQty = (existing ? existing.qty : 0) + 1;
  if (p.trackStock && wantQty > p.stock) { showToast('Stock insuffisant', `Il ne reste que ${p.stock} unité(s) de ce produit.`, 'var(--red)'); return; }
  if (existing) existing.qty++;
  else cart.push({ productId, qty: 1 });
  saveCart();
  showToast('Ajouté au panier 🛒', p.name, 'var(--green)');
  if (document.getElementById('page-cart').classList.contains('active')) renderCart();
}
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
function renderCart() {
  const items = cart.map(i => ({ ...i, p: allProducts.find(x => x.id === i.productId) })).filter(i => i.p);
  const empty = document.getElementById('cartEmpty');
  const content = document.getElementById('cartContent');
  if (!items.length) { empty.style.display = ''; content.style.display = 'none'; return; }
  empty.style.display = 'none'; content.style.display = '';
  const wrap = document.getElementById('cartItems');
  wrap.innerHTML = items.map(i => `
    <div class="cart-item">
      <div class="ci-img">${i.p.photo ? `<img src="${i.p.photo}" alt="">` : (i.p.emoji || catEmoji(i.p.cat))}</div>
      <div class="ci-info">
        <div class="ci-name">${i.p.name}</div>
        <div class="ci-seller">${i.p.sellerName}${sellerFiliere(i.p.sellerId)?` · ${sellerFiliere(i.p.sellerId)}`:''}</div>
        <div class="ci-price">${i.p.price.toLocaleString()} FCFA</div>
      </div>
      <div class="ci-qty">
        <button data-act="dec" data-id="${i.p.id}">−</button>
        <span>${i.qty}</span>
        <button data-act="inc" data-id="${i.p.id}">+</button>
      </div>
      <div class="ci-remove" data-act="rm" data-id="${i.p.id}" title="Retirer">✕</div>
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
    <div class="pd-img cat-${p.cat}">${p.photo ? `<img src="${p.photo}" alt="${p.name}">` : (p.emoji || catEmoji(p.cat))}</div>
    ${catBadge(p.cat)}${stockBadgeHtml(p)}
    <div class="pd-title">${p.name}</div>
    <div class="pd-seller">Par ${p.sellerName}${filiere?` <span class="seller-filiere">· ${filiere}</span>`:''}</div>
    ${p.desc ? `<div class="pd-desc">${p.desc}</div>` : ''}
    <div class="pd-row">
      <div class="pd-price">${p.price.toLocaleString()} FCFA</div>
      <div class="pd-rating">★ ${p.rating||'—'} ${p.votes?`(${p.votes} avis)`:''}</div>
    </div>
    <button class="btn-primary" id="pdAddBtn" ${isOutOfStock(p)?'disabled':''}>${isOutOfStock(p)?'Rupture de stock':'🛒 Ajouter au panier'}</button>
    <div class="pd-reviews">
      <h4>Avis sur ce produit (${reviews.length})</h4>
      ${reviews.length ? reviews.map(r => `
        <div class="review-card">
          <div class="review-top">
            <div><div class="review-name">${r.reviewerName}</div></div>
            <div class="review-stars">${starsHtml(r.rating)}</div>
          </div>
          <div class="review-text">${r.text}</div>
        </div>`).join('') : '<div style="color:var(--t3);font-size:.78rem">Aucun avis pour ce produit pour l\'instant.</div>'}
    </div>
  `;
  const addBtn = document.getElementById('pdAddBtn');
  if (addBtn && !addBtn.disabled) addBtn.addEventListener('click', () => { addToCart(id); closeModal('productDetailModal'); });
  openModal('productDetailModal');
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
    });
  });
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
  if (deliveryType === 'external' && !deliveryAddress) { showToast('Adresse manquante', 'Indique l\'adresse de livraison hors campus.', 'var(--red)'); return; }
  if (deliveryType === 'campus' && (!classe || !filiere)) { showToast('Informations manquantes', 'Indique ta classe et ta filière pour la livraison sur le campus.', 'var(--red)'); return; }

  for (const i of items) {
    if (i.p.trackStock && i.qty > i.p.stock) { showToast('Stock insuffisant', `Il ne reste que ${i.p.stock} unité(s) de "${i.p.name}".`, 'var(--red)'); return; }
  }

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true; showLoader(true);

  const orderGroup = `og_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const createdOrders = [];
  for (const i of items) {
    const result = await dbInsertOrder({
      sellerId:i.p.sellerId, sellerName:i.p.sellerName, productId:i.p.id, productName:i.p.name,
      buyerName:name, buyerPhone:phone, qty:i.qty, total:i.p.price*i.qty, notes,
      deliveryDate, deliveryTime, deliveryType, deliveryAddress: deliveryType==='external' ? deliveryAddress : '',
      buyerClasse: deliveryType==='campus' ? classe : '', buyerFiliere: deliveryType==='campus' ? filiere : '',
      orderGroup
    });
    if (result.error) { showLoader(false); btn.disabled = false; showToast('Erreur', result.error, 'var(--red)'); return; }
    createdOrders.push({ order: result.order, p: i.p, qty: i.qty });
    if (i.p.trackStock) await dbUpdateProduct(i.p.id, { stock: Math.max(0, i.p.stock - i.qty) });
  }

  showLoader(false); btn.disabled = false;

  const grandTotal = createdOrders.reduce((s,o) => s + o.p.price*o.qty, 0);
  const deliveryLine = `${new Date(deliveryDate+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})} à ${deliveryTime}`;
  const placeLine = deliveryType==='external' ? `Livraison hors campus : ${deliveryAddress}` : `Livraison sur le campus (${classe} · ${getFiliereLabel(filiere)})`;
  document.getElementById('orderSuccessText').innerHTML =
    createdOrders.map(o => `${o.qty}× <strong>${o.p.name}</strong> — ${(o.p.price*o.qty).toLocaleString()} FCFA`).join('<br>') +
    `<br><strong>Total : ${grandTotal.toLocaleString()} FCFA</strong><br>` +
    `<span style="color:var(--t3)">📅 ${deliveryLine}<br>📍 ${placeLine}</span>` +
    (notes?`<br><span style="color:var(--t3)">Note : ${notes}</span>`:'');
  document.getElementById('orderSuccess').classList.add('show');

  // Remplit et affiche le ticket de preuve de commande
  fillTicket(createdOrders, { name, phone, notes, deliveryDate, deliveryTime, deliveryType, deliveryAddress, classe, filiere, grandTotal });
  document.getElementById('ticketWrap').style.display = '';
  document.getElementById('orderSuccess').scrollIntoView({ behavior:'smooth' });

  // Vide le panier et réinitialise le formulaire
  cart = []; saveCart(); renderCart();
  ['oName','oPhone','oNotes','oAddress','oDate','oTime','oClasse'].forEach(id => document.getElementById(id).value='');
  document.getElementById('oFiliere').value = '';
  document.querySelector('input[name="deliveryType"][value="campus"]').checked = true;
  document.querySelectorAll('.delivery-type-opt').forEach(o => o.classList.remove('active'));
  document.querySelector('.delivery-type-opt[data-val="campus"]').classList.add('active');
  document.getElementById('oAddressField').style.display = 'none';
  document.getElementById('oCampusFields').style.display = '';

  // Rafraîchit le catalogue (stock mis à jour)
  await loadProducts();

  // Notifie chaque vendeur par email (il a fourni son email à l'inscription pour recevoir factures & notifications)
  if (typeof sendSellerOrderNotifEmail !== 'undefined') {
    const sellers = await dbGetAllUsers();
    for (const o of createdOrders) {
      const seller = sellers.find(u => u.id === o.p.sellerId);
      if (seller) sendSellerOrderNotifEmail(seller, o.order, o.p);
    }
  }
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
    <div class="ticket-row"><span class="k">#${o.order.id} · ${o.p.name} ×${o.qty}</span><span class="v">${(o.p.price*o.qty).toLocaleString()} FCFA</span></div>
    <div class="ticket-row" style="font-size:.7rem"><span class="k">Vendeur</span><span class="v">${o.p.sellerName}</span></div>
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
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('downloadTicketBtn').addEventListener('click', downloadTicket);
});

function downloadTicket() {
  const el = document.getElementById('ticketCard');
  if (typeof html2canvas === 'undefined') {
    showToast('Indisponible', 'Fais une capture d\'écran de ce ticket comme preuve.', 'var(--orange)');
    return;
  }
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    const link = document.createElement('a');
    link.download = `ticket-commande-${document.getElementById('tkId').textContent.replace(/#/g,'')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(() => {
    showToast('Erreur', 'Téléchargement impossible. Fais une capture d\'écran.', 'var(--red)');
  });
}

/* ── RETOURS / LITIGES ── */
async function submitReturn() {
  const orderId = parseInt(document.getElementById('rtOrderId').value);
  const name  = document.getElementById('rtName').value.trim();
  const phone = document.getElementById('rtPhone').value.trim();
  const reason = document.getElementById('rtReason').value.trim();
  if (!orderId || !name || !phone || !reason) { showToast('Champs manquants', 'Remplis tous les champs.', 'var(--red)'); return; }

  showLoader(true);
  const order = await dbGetOrderById(orderId);
  if (!order) { showLoader(false); showToast('Commande introuvable', 'Vérifie le numéro de commande indiqué sur ton ticket.', 'var(--red)'); return; }
  const phoneMatches = order.buyerPhone && order.buyerPhone.replace(/\s/g,'') === phone.replace(/\s/g,'');
  const nameMatches  = order.buyerName && order.buyerName.toLowerCase().trim() === name.toLowerCase().trim();
  if (!phoneMatches && !nameMatches) {
    showLoader(false);
    showToast('Vérification impossible', 'Le nom ou le téléphone ne correspond pas à cette commande.', 'var(--red)');
    return;
  }
  const r = await dbInsertReturn({ orderId, sellerId:order.sellerId, buyerName:name, buyerPhone:phone, productName:order.productName, reason });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('returnSuccess').classList.add('show');
  showToast('Demande envoyée', 'Le vendeur a été notifié de ta demande.', 'var(--green)');
  ['rtOrderId','rtName','rtPhone','rtReason'].forEach(id => document.getElementById(id).value='');
}

/* ── REVIEWS ── */
async function loadReviews() {
  const reviews = await dbGetReviews();
  const el = document.getElementById('reviewsList');
  if (!reviews.length) { el.innerHTML='<div style="color:var(--t3);font-size:.78rem">Aucun avis pour l\'instant.</div>'; return; }
  el.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-top">
        <div><div class="review-name">${r.reviewerName}</div><div class="review-product">${r.productName} · ${r.sellerName||''}</div></div>
        <div class="review-stars">${starsHtml(r.rating)}</div>
      </div>
      <div class="review-text">${r.text}</div>
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

  const p = allProducts.find(x => x.id === pid);
  showLoader(true);
  await dbInsertReview({ sellerId:p?.sellerId, productId:pid, productName:p?.name||'—', sellerName:p?.sellerName||'—', reviewerName:name, rating:parseInt(star.value), text });
  if (p) {
    const rv = await dbGetReviews({ productId:pid });
    const avg = rv.reduce((s,r)=>s+r.rating,0)/rv.length;
    await dbUpdateProduct(pid, { rating:Math.round(avg*10)/10, votes:rv.length });
    allProducts = await dbGetProducts({ available:true });
    renderProducts();
  }
  showLoader(false);
  closeModal('reviewModal');
  showToast('Avis publié','Merci pour ton retour ! 🙏');
  await loadReviews();
  document.getElementById('rvName').value='';document.getElementById('rvText').value='';
  document.querySelectorAll('input[name="rv"]').forEach(r=>r.checked=false);
}

/* ── AUTH ── */
function initAuth() {
  document.getElementById('goRegister').addEventListener('click', () => { document.getElementById('viewLogin').style.display='none'; document.getElementById('viewRegister').style.display=''; });
  document.getElementById('goLogin').addEventListener('click', () => { document.getElementById('viewRegister').style.display='none'; document.getElementById('viewLogin').style.display=''; });
  document.getElementById('userPill').addEventListener('click', () => { if (!getSession()) openModal('authModal'); });
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
}

async function handleLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  if (!email||!pass) { showToast('Champs manquants','Email et mot de passe requis.','var(--red)'); return; }
  showLoader(true);
  const r = await dbLoginUser(email, pass);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  setSession(r.user); closeModal('authModal'); syncSessionUI();
  showToast('Connecté', `Bienvenue ${r.user.firstName} !`);
}

async function handleRegister() {
  const first = document.getElementById('rFirst').value.trim();
  const last  = document.getElementById('rLast').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const filiere = document.getElementById('rFiliere').value;
  const pass  = document.getElementById('rPass').value;
  if (!first||!email||!pass) { showToast('Champs manquants','Prénom, email et mot de passe requis.','var(--red)'); return; }
  if (pass.length<6) { showToast('Mot de passe trop court','Minimum 6 caractères.','var(--red)'); return; }
  showLoader(true);
  const r = await dbCreateUser(first, last, email, phone, pass, filiere);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  setSession(r.user); closeModal('authModal'); syncSessionUI();
  showToast('Compte créé !', `Bienvenue ${first} 🎉`);
  // Email de bienvenue
  if (typeof sendWelcomeEmail !== 'undefined') {
    sendWelcomeEmail(r.user).then(res => {
      if (res.ok) showToast('Email envoyé', 'Vérifie ta boîte mail 📧');
    });
  }
}

function syncSessionUI() {
  const u = getSession();
  if (u) {
    document.getElementById('userAvatar').textContent = u.firstName[0].toUpperCase();
    document.getElementById('userName').textContent   = u.name;
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
