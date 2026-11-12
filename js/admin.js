/* ═══════════════════════════════════════════════════
   N MARKET — admin.js  (espace vendeur)
═══════════════════════════════════════════════════ */

let currentUser  = null;
let addPhoto     = null;
let editPhoto    = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await initSession();      // session Supabase Auth (JWT) + profil
  if (!currentUser) {
    document.getElementById('lockedScreen').style.display = '';
    showLoader(false); return;
  }
  document.getElementById('appShell').style.display = '';
  document.getElementById('shopName').textContent    = currentUser.name;
  document.getElementById('shopNameMobile').textContent = currentUser.name;
  document.getElementById('userAvatar').textContent  = currentUser.firstName[0].toUpperCase();
  document.getElementById('userName').textContent    = currentUser.name;
  await loadCategories();
  await loadFilieres();
  populateCategorySelects();
  populateFiliereSelect();
  bindNav();
  document.getElementById('logoutBtn').addEventListener('click', async () => { await clearSession(); window.location.href='../index.html'; });
  document.getElementById('apPhoto').addEventListener('change', function() { handlePhoto(this,'apPhotoPreview','apPhotoPlaceholder', d=>{ addPhoto=d; }); });
  document.getElementById('editPhoto').addEventListener('change', function() { handlePhoto(this,'editPhotoPreview','editPhotoPlaceholder', d=>{ editPhoto=d; }); });
  document.getElementById('saveProductBtn').addEventListener('click', saveNewProduct);
  document.getElementById('saveEditBtn').addEventListener('click', saveEditProduct);
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('openTermsLink').addEventListener('click', (e) => { e.preventDefault(); openModal('termsModal'); });
  document.getElementById('acceptReturnBtn').addEventListener('click', () => respondReturn('accepted'));
  document.getElementById('rejectReturnBtn').addEventListener('click', () => respondReturn('rejected'));
  document.getElementById('pfToggle').addEventListener('click', function(){ this.classList.toggle('on'); });
  document.getElementById('apTrackStock').addEventListener('click', function(){ this.classList.toggle('on'); document.getElementById('apStockFields').style.display = this.classList.contains('on') ? '' : 'none'; });
  document.getElementById('editTrackStock').addEventListener('click', function(){ this.classList.toggle('on'); document.getElementById('editStockFields').style.display = this.classList.contains('on') ? '' : 'none'; });
  document.getElementById('apShowStock').addEventListener('click', function(){ this.classList.toggle('on'); });
  document.getElementById('editShowStock').addEventListener('click', function(){ this.classList.toggle('on'); });
  document.getElementById('orderStatusFilter').addEventListener('change', renderOrders);
  document.getElementById('markAllReadBtn').addEventListener('click', markAllNotificationsRead);
  renderVerifBanner();
  if (verifState(currentUser).code === 'expired') { await goPage('verify'); }
  else await renderDashboard();
  checkPendingReturns();
  await refreshNotifDot();
  setInterval(() => { if (!document.hidden) refreshNotifDot(); }, 45000);
  NMCache.startAutoRefresh(() => goPage(currentPageName), 60000,
    () => ['dashboard','orders','returns','products','notifications'].includes(currentPageName));
  showLoader(false);
});

/* ── RETOURS (notification globale) ── */
async function checkPendingReturns() {
  const returns = await dbGetReturns({ sellerId: currentUser.id });
  document.getElementById('returnsDot').style.display = returns.some(r=>r.status==='pending') ? '' : 'none';
}

/* ── NOTIFICATIONS (centre de notifications in-app) ── */
async function refreshNotifDot() {
  const count = await dbGetUnreadNotificationCount('seller', currentUser.id);
  document.getElementById('notifDot').style.display = count > 0 ? '' : 'none';
}
async function renderNotificationsPage() {
  showLoader(true);
  const notifs = await dbGetNotifications('seller', currentUser.id);
  showLoader(false);
  const list = document.getElementById('notifList');
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.isRead?'':'unread'}" data-id="${n.id}">
      <div class="notif-ico">${notifIcon(n.type)}</div>
      <div class="notif-body"><div class="notif-title">${esc(n.title)}</div><div class="notif-text">${esc(n.body||'')}</div><div class="notif-time">${timeAgo(n.createdAt)}</div></div>
    </div>`).join('') || `<div class="table-empty">Aucune notification pour le moment.</div>`;
  list.querySelectorAll('.notif-item.unread').forEach(el => {
    el.addEventListener('click', async () => {
      await dbMarkNotificationRead(el.dataset.id);
      el.classList.remove('unread');
      refreshNotifDot();
    });
  });
}
async function markAllNotificationsRead() {
  await dbMarkAllNotificationsRead('seller', currentUser.id);
  await renderNotificationsPage();
  await refreshNotifDot();
}

/* ── CATEGORIES ── */
function populateCategorySelects() {
  const opts = getCategories().map(c => `<option value="${esc(c.slug)}">${esc(c.emoji)} ${esc(c.label)}</option>`).join('');
  document.getElementById('apCat').innerHTML  = opts;
  document.getElementById('editCat').innerHTML = opts;
}

/* ── FILIÈRES ── */
function populateFiliereSelect() {
  const opts = '<option value="">— Sélectionner —</option>' + getFilieres().map(f => `<option value="${esc(f.slug)}">${esc(f.label)}</option>`).join('');
  document.getElementById('pfFiliere').innerHTML = opts;
  document.getElementById('pfFiliere').value = currentUser.filiere || '';
}

/* ── NAV ── */
function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goPage(btn.dataset.page));
  });
}
let currentPageName = 'dashboard';
async function goPage(name) {
  currentPageName = name; NMCache.beginPage();
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.remove('active'));
  const b=document.querySelector(`.nav-item[data-page="${name}"]`); if(b) b.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if (name==='dashboard')  await renderDashboard();
  if (name==='notifications') await renderNotificationsPage();
  if (name==='orders')     await renderOrders();
  if (name==='returns')    await renderReturnsPage();
  if (name==='products')   await renderProductsTable();
  if (name==='addproduct') resetAddForm();
  if (name==='promote')    await renderPromotePage();
  if (name==='profile')    loadProfile();
  if (name==='ticketstyle') await renderTicketStylePage();
  if (name==='verify')     await renderVerifyPage();
  if (name==='whatsapp')   await mountWhatsApp(false);
  if (name==='chat' && !chatInited) await initChat(currentUser, false);
}

/* ── DASHBOARD ── */
async function renderDashboard() {
  showLoader(true);
  const [products, orders] = await Promise.all([
    dbGetProducts({ sellerId: currentUser.id }),
    dbGetOrders({ sellerId: currentUser.id }).then(groupInvoices)      // une ligne = une FACTURE (un client, un panier)
  ]);
  showLoader(false);

  const revenue = orders.filter(o=>o.status==='done').reduce((s,o)=>s+o.total,0);
  const pending = orders.filter(o=>o.status==='new').length;
  const rated   = products.filter(p=>p.votes>0);
  const avg     = rated.length ? (rated.reduce((s,p)=>s+p.rating,0)/rated.length).toFixed(1) : '—';

  document.getElementById('dashTitle').textContent = `Bonjour, ${currentUser.firstName}`;
  document.getElementById('dashDesc').textContent  = 'Voici l\'état de ta boutique.';

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card c-white"><div class="stat-value">${products.length}</div><div class="stat-label">Produits</div></div>
    <div class="stat-card c-emerald"><div class="stat-value">${revenue.toLocaleString()}</div><div class="stat-label">Revenus (FCFA)</div></div>
    <div class="stat-card c-blue"><div class="stat-value">${orders.length}</div><div class="stat-label">Commandes</div></div>
    <div class="stat-card c-amber"><div class="stat-value">${pending}</div><div class="stat-label">En attente</div></div>
    <div class="stat-card c-amber"><div class="stat-value">${avg}${avg!=='—'?'★':''}</div><div class="stat-label">Note moyenne</div></div>
  `;

  document.getElementById('dashOrders').innerHTML = orders.slice(0,5).map(o=>`
    <tr>
      <td><span style="font-weight:500">${esc(o.buyerName)}</span></td>
      <td>${invoiceLinesHtml(o)}</td>
      <td>${o.qty}</td>
      <td style="font-weight:500">${o.total.toLocaleString()} FCFA</td>
      <td><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></td>
    </tr>`).join('') || `<tr><td colspan="5" class="table-empty">Aucune commande</td></tr>`;

  document.getElementById('dashProducts').innerHTML = products.length
    ? products.slice(0,6).map(p=>`
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r2);overflow:hidden">
          <div style="height:72px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:1.8rem;position:relative;overflow:hidden">
            ${safeImg(p.photo)?`<img src="${safeImg(p.photo)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" alt="">`:esc(p.emoji)}
            ${!p.available?`<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--red);font-weight:600;letter-spacing:.04em">INDISPO</div>`:''}
          </div>
          <div style="padding:10px">
            <div style="font-size:.78rem;font-weight:500;margin-bottom:2px">${esc(p.name)}</div>
            <div style="font-size:.68rem;color:var(--t3)">${p.price.toLocaleString()} FCFA</div>
          </div>
        </div>`).join('')
    : `<div style="color:var(--t3);font-size:.78rem;padding:16px 0">Aucun produit. <a style="color:var(--t1);cursor:pointer;text-decoration:underline" onclick="goPage('addproduct')">Ajouter →</a></div>`;
}

/* ── ORDERS ── */
async function renderOrders() {
  showLoader(true);
  const filter = document.getElementById('orderStatusFilter').value;
  const orders = groupInvoices(await dbGetOrders({ sellerId:currentUser.id, status:filter }));
  showLoader(false);
  const tbody = document.getElementById('ordersBody');
  if (!orders.length) { tbody.innerHTML=`<tr><td colspan="10" class="table-empty">Aucune commande</td></tr>`; return; }
  tbody.innerHTML = orders.map(o=>`
    <tr>
      <td style="color:var(--t3);font-size:.7rem;white-space:nowrap">${o.receiptCode?`<span class="receipt-code">${esc(o.receiptCode)}</span>`:'#'+o.id}</td>
      <td><span style="font-weight:500">${esc(o.buyerName)}</span><div style="font-size:.68rem;color:var(--t3)">${formatDate(o.createdAt)}</div></td>
      <td style="font-size:.72rem;color:var(--t2)">📞 ${esc(o.buyerPhone||'—')}</td>
      <td>${invoiceLinesHtml(o)}</td>
      <td>${o.qty}</td>
      <td style="font-weight:500">${o.total.toLocaleString()} FCFA</td>
      <td style="font-size:.72rem">
        <div style="font-weight:500">${formatDeliveryDateTime(o)}</div>
        <div style="color:var(--t3)">${o.deliveryType==='external'?'📍 Hors campus':'🏫 Sur le campus'}</div>
      </td>
      <td style="max-width:120px">${invoiceNotes(o)?`<span style="font-size:.72rem;color:var(--t2);font-style:italic">${esc(invoiceNotes(o).substring(0,60))}${invoiceNotes(o).length>60?'…':''}</span>`:`<span style="color:var(--t4)">—</span>`}</td>
      <td>
        <select class="select-sm" style="font-size:.72rem" ${o.status==='cancel'?'disabled title="Une commande annulée est définitive"':''} onchange="updateStatus('${o.ids.map(Number).join(',')}',this.value)">
          <option value="new"    ${o.status==='new'   ?'selected':''}>Nouvelle</option>
          <option value="done"   ${o.status==='done'  ?'selected':''}>Livrée</option>
          <option value="cancel" ${o.status==='cancel'?'selected':''}>Annulée</option>
        </select>
      </td>
      <td style="white-space:nowrap"><button class="icon-btn edit" onclick="viewOrder('${esc(o.key)}')" title="Voir">👁</button> <button class="icon-btn wa" onclick="openWaSend('${esc(o.key)}')" title="Écrire sur WhatsApp" aria-label="Écrire sur WhatsApp">💬</button></td>
    </tr>`).join('');
}

/* Une facture = plusieurs lignes : le statut s'applique à toute la facture */
function invoiceLinesHtml(o) {
  return o.lines.map(l => `<div class="inv-line"><strong>${Number(l.qty)}×</strong> ${esc(l.productName)}${(l.itemOptions||[]).length?`<div class="inv-opts">${esc(optsText(l.itemOptions, true))}</div>`:''}</div>`).join('');
}
function invoiceNotes(o) { return o.lines.map(l => l.itemNote ? (o.lines.length > 1 ? l.productName + ' : ' : '') + l.itemNote : '').filter(Boolean).join(' · '); }
async function findInvoice(key) {
  const inv = groupInvoices(await dbGetOrders({ sellerId: currentUser.id })).find(x => x.key === key);
  return inv || null;
}
async function updateStatus(idList, status) {
  const ids = String(idList).split(',').map(Number).filter(Boolean);
  const res = await dbUpdateOrderStatus(ids, status);
  if (res.error) { showToast('Erreur', res.error, 'var(--red)'); await renderOrders(); return; }
  // Le recrédit du stock à l'annulation est fait par la base (trigger) — une annulation est définitive.
  showToast('Statut mis à jour', status==='done'?'Commande livrée ✓':status==='cancel'?'Commande annulée — stock recrédité':'En attente', status==='done'?'var(--green)':status==='cancel'?'var(--red)':null);
  await renderDashboard();
}

/* ── RETOURS / LITIGES ── */
async function renderReturnsPage() {
  showLoader(true);
  const returns = await dbGetReturns({ sellerId: currentUser.id });
  showLoader(false);
  const tbody = document.getElementById('returnsBody');
  if (!returns.length) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Aucune demande de retour pour le moment</td></tr>`; return; }
  tbody.innerHTML = returns.map(r => `
    <tr>
      <td style="color:var(--t3);font-size:.7rem">#${r.orderId}</td>
      <td><span style="font-weight:500">${esc(r.buyerName||'—')}</span><div style="font-size:.68rem;color:var(--t3)">📞 ${esc(r.buyerPhone||'—')}</div></td>
      <td>${esc(r.productName||'—')}</td>
      <td style="max-width:220px;font-size:.78rem">${esc(r.reason)}</td>
      <td><span class="status-badge ${r.status==='accepted'?'status-done':r.status==='rejected'?'status-cancel':'status-new'}" style="font-size:.65rem">${r.status==='accepted'?'Acceptée':r.status==='rejected'?'Refusée':'En attente'}</span></td>
      <td style="font-size:.72rem;color:var(--t3)">${formatDate(r.createdAt)}</td>
      <td>${r.status==='pending'?`<button class="icon-btn edit" onclick="openReturnModal(${r.id})" title="Répondre">↩</button>`:`<span style="font-size:.7rem;color:var(--t3)">Traitée</span>`}</td>
    </tr>`).join('');
  const pendingCount = returns.filter(r=>r.status==='pending').length;
  document.getElementById('returnsDot').style.display = pendingCount ? '' : 'none';
}

async function openReturnModal(id) {
  const returns = await dbGetReturns({ sellerId: currentUser.id });
  const r = returns.find(x=>x.id===id); if (!r) return;
  document.getElementById('returnId').value = r.id;
  document.getElementById('returnModalSub').textContent = `Commande #${r.orderId} · ${formatDate(r.createdAt)}`;
  document.getElementById('returnModalContent').innerHTML = `
    <div style="font-size:.78rem;color:var(--t2);margin-bottom:6px"><strong>Client :</strong> ${esc(r.buyerName||'—')} · 📞 ${esc(r.buyerPhone||'—')}</div>
    <div style="font-size:.78rem;color:var(--t2);margin-bottom:6px"><strong>Produit :</strong> ${esc(r.productName||'—')}</div>
    <div style="background:var(--g1);border:1px solid var(--gb1);border-radius:var(--r);padding:10px 12px;font-size:.78rem;color:var(--t2);font-style:italic;margin-top:8px">${esc(r.reason)}</div>`;
  document.getElementById('returnResponse').value = '';
  openModal('returnModal');
}

async function respondReturn(status) {
  const id = parseInt(document.getElementById('returnId').value);
  const response = document.getElementById('returnResponse').value.trim();
  showLoader(true);
  const r = await dbUpdateReturn(id, { status, sellerResponse: response });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  closeModal('returnModal');
  showToast(status==='accepted'?'Retour accepté':'Retour refusé','', status==='accepted'?'var(--green)':'var(--red)');
  await renderReturnsPage();
}

/* ── PUBLICITÉ (vendeur) ── */
let selectedPromoPlanId = null;
async function renderPromotePage() {
  showLoader(true);
  const [products, plans, myPromos] = await Promise.all([
    dbGetProducts({ sellerId: currentUser.id }),
    dbGetPromoPlans(true),
    dbGetPromotions({ sellerId: currentUser.id })
  ]);
  showLoader(false);

  // Sélecteur de produit
  document.getElementById('promoProduct').innerHTML =
    products.length ? products.map(p => `<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('')
                     : '<option value="">Aucun produit publié</option>';

  // Formules
  selectedPromoPlanId = plans.length ? plans[0].id : null;
  document.getElementById('promoPlans').innerHTML = plans.map(pl => `
    <div class="promo-plan-card${pl.id===selectedPromoPlanId?' selected':''}" data-plan="${pl.id}">
      <div class="pp-label">${esc(pl.label)}</div>
      <div class="pp-price">${pl.price.toLocaleString()} FCFA</div>
      <div class="pp-duration">${pl.durationDays} jour${pl.durationDays>1?'s':''}</div>
    </div>`).join('') || '<div class="table-empty">Aucune formule disponible pour le moment.</div>';

  document.querySelectorAll('.promo-plan-card[data-plan]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.promo-plan-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPromoPlanId = parseInt(card.dataset.plan);
    });
  });

  // Mes demandes
  const wrap = document.getElementById('myPromosList');
  if (!myPromos.length) { wrap.innerHTML = '<div class="table-empty">Aucune demande de mise en avant pour le moment.</div>'; }
  else {
    wrap.innerHTML = myPromos.map(pr => `
      <div class="promo-item">
        <div class="pi-info">
          <div class="pi-name">${esc(pr.productName)}</div>
          <div class="pi-meta">${esc(pr.planLabel||'')} · ${formatDate(pr.createdAt)}${pr.status==='active'&&pr.endsAt?` · jusqu'au ${formatDate(pr.endsAt)}`:''}</div>
        </div>
        <div class="pi-price">${pr.price.toLocaleString()} FCFA</div>
        <span class="status-badge ${pr.status==='active'?'status-done':pr.status==='rejected'||pr.status==='expired'?'status-cancel':'status-new'}">${pr.status==='active'?'Active':pr.status==='rejected'?'Refusée':pr.status==='expired'?'Terminée':'En attente'}</span>
      </div>`).join('');
  }

  document.getElementById('submitPromoBtn').onclick = submitPromoRequest;
  document.getElementById('promoSuccess').classList.remove('show');
}

async function submitPromoRequest() {
  const productId = parseInt(document.getElementById('promoProduct').value);
  if (!productId) { showToast('Aucun produit', 'Publie d\'abord un produit avant de le mettre en avant.', 'var(--err)'); return; }
  if (!selectedPromoPlanId) { showToast('Formule manquante', 'Choisis une formule de mise en avant.', 'var(--err)'); return; }

  showLoader(true);
  const plans = await dbGetPromoPlans(true);
  const plan = plans.find(p => p.id === selectedPromoPlanId);
  const products = await dbGetProducts({ sellerId: currentUser.id });
  const product = products.find(p => p.id === productId);
  if (!plan || !product) { showLoader(false); showToast('Erreur', 'Données introuvables.', 'var(--err)'); return; }

  const r = await dbInsertPromotion({
    productId: product.id, sellerId: currentUser.id, sellerName: currentUser.name, productName: product.name,
    planId: plan.id, planLabel: plan.label, durationDays: plan.durationDays, price: plan.price
  });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--err)'); return; }
  document.getElementById('promoSuccess').classList.add('show');
  showToast('Demande envoyée', 'Le Super Admin va la valider.', 'var(--ok)');
  await renderPromotePage();
}

async function viewOrder(key) {
  const o = await findInvoice(key); if (!o) return;
  document.getElementById('orderDetailSub').textContent = `${o.receiptCode ? 'Facture ' + o.receiptCode : 'Commande #' + o.id} · ${formatDate(o.createdAt)}`;
  const row = (k,v) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:.78rem"><span style="color:var(--t2)">${k}</span><span style="font-weight:500">${v}</span></div>`;
  document.getElementById('orderDetailContent').innerHTML =
    row('Client', esc(o.buyerName)) + row('Téléphone', esc(o.buyerPhone||'—')) +
    `<div class="inv-detail">${o.lines.map(l => `<div class="inv-d-line"><div><strong>${Number(l.qty)}×</strong> ${esc(l.productName)}${(l.itemOptions||[]).length?`<div class="inv-opts">${esc(optsText(l.itemOptions, true))}</div>`:''}${l.itemNote?`<div class="inv-opts" style="font-style:italic">↳ ${esc(l.itemNote)}</div>`:''}</div><span>${Number(l.total).toLocaleString()} FCFA</span></div>`).join('')}</div>` +
    row('Total', `<span style="color:var(--green);font-weight:600">${o.total.toLocaleString()} FCFA</span>`) +
    row('Statut', `<span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>`) +
    row('Date/heure souhaitées', formatDeliveryDateTime(o)) +
    row('Lieu de livraison', deliveryTypeLabel(o.deliveryType)) +
    (o.deliveryType==='external' && o.deliveryAddress ? row('Adresse', esc(o.deliveryAddress)) : '') +
    (o.receiptCode ? row('Code de reçu', `<span class="receipt-code">${esc(o.receiptCode)}</span>`) : '') +
    (o.deliveryType==='external' && o.deliveryLat && o.deliveryLng ? `<div class="gmap-box gmap-view" id="orderMapBox"></div>${mapLinksHtml(o.deliveryLat, o.deliveryLng)}` : '') +
    (o.deliveryType==='campus' && typeof CAMPUS!=='undefined' && CAMPUS.lat!=null ? `<div class="gmap-box gmap-view" id="orderMapBox"></div>${mapLinksHtml(CAMPUS.lat, CAMPUS.lng)}` : '') +
    (o.deliveryType==='campus' && (o.buyerClasse||o.buyerFiliere) ? row('Classe / Filière', `${esc(o.buyerClasse||'—')} · ${esc(getFiliereLabel(o.buyerFiliere)||'—')}`) : '') +
    (o.notes?`<div style="margin-top:14px"><div style="font-size:.68rem;color:var(--t3);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">Instructions générales</div><div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px;font-size:.78rem;color:var(--t2);font-style:italic;border:1px solid var(--b1)">${esc(o.notes)}</div></div>`:'') +
    (false?`<div style="margin-top:14px"><div style="font-size:.68rem;color:var(--t3);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">Précision pour ce produit</div><div style="background:var(--accent-dim);border-radius:var(--r);padding:10px 12px;font-size:.78rem;color:var(--t1);font-style:italic;border:1px solid var(--accent-bdr)">${esc(o.itemNote)}</div></div>`:'');
  openModal('orderDetailModal');
  if (o.deliveryType==='external' && o.deliveryLat && o.deliveryLng) showMapInto('orderMapBox', o.deliveryLat, o.deliveryLng, o.deliveryPlaceName||o.buyerName);
  else if (o.deliveryType==='campus' && typeof CAMPUS!=='undefined' && CAMPUS.lat!=null) showMapInto('orderMapBox', CAMPUS.lat, CAMPUS.lng, CAMPUS.name);
}

/* ── PRODUCTS TABLE ── */
async function renderProductsTable() {
  showLoader(true);
  const products = await dbGetProducts({ sellerId: currentUser.id });
  showLoader(false);
  const tbody = document.getElementById('productsBody');
  if (!products.length) { tbody.innerHTML=`<tr><td colspan="8" class="table-empty">Aucun produit. <a style="color:var(--t1);cursor:pointer;text-decoration:underline" onclick="goPage('addproduct')">Ajouter →</a></td></tr>`; return; }
  tbody.innerHTML = products.map(p=>`
    <tr>
      <td><div class="prod-thumb">${safeImg(p.photo)?`<img src="${safeImg(p.photo)}" alt="">`:esc(p.emoji)}</div></td>
      <td><div style="font-weight:500">${esc(p.name)}</div><div style="font-size:.7rem;color:var(--t2);margin-top:2px">${esc((p.desc||'').substring(0,50))}${(p.desc||'').length>50?'…':''}</div></td>
      <td>${catBadge(p.cat)}</td>
      <td style="font-weight:500">${p.price.toLocaleString()} FCFA</td>
      <td>${p.trackStock ? (p.stock<=0?`<span class="stock-badge out" style="margin:0">Rupture</span>`:`<span style="font-weight:500">${p.stock}</span>`) : `<span style="color:var(--t4)">Illimité</span>`}</td>
      <td>${p.votes?`<div style="display:flex;align-items:center;gap:3px">${starsHtml(p.rating,'.74rem')}<span style="font-size:.68rem;color:var(--t3);margin-left:2px">(${p.votes})</span></div>`:`<span style="color:var(--t4)">—</span>`}</td>
      <td><button class="toggle ${p.available?'on':''}" onclick="toggleAvail(${Number(p.id)},${p.available?'true':'false'})"></button></td>
      <td><div class="td-actions"><button class="icon-btn edit" onclick="openEditProduct(${p.id})" title="Modifier">✏</button><button class="icon-btn del" onclick="deleteProd(${p.id})" title="Supprimer">✕</button></div></td>
    </tr>`).join('');
}

async function toggleAvail(id, current) {
  await dbUpdateProduct(id, { available: !current });
  showToast(!current?'Produit disponible':'Produit indisponible', !current?'Visible sur la marketplace':'Masqué', !current?'var(--green)':'var(--orange)');
  await renderProductsTable();
}

let apOpt = null, editOpt = null;
function optEditors() {
  if (!apOpt) apOpt = createOptionsEditor(document.getElementById('apOptions'));
  if (!editOpt) editOpt = createOptionsEditor(document.getElementById('editOptions'));
}
async function openEditProduct(id) {
  showLoader(true);
  const products = await dbGetProducts({ sellerId: currentUser.id });
  showLoader(false);
  const p = products.find(x=>x.id===id); if (!p) return;
  document.getElementById('editId').value    = id;
  document.getElementById('editName').value  = p.name;
  document.getElementById('editDesc').value  = p.desc||'';
  document.getElementById('editCat').value   = p.cat;
  document.getElementById('editPrice').value = p.price;
  document.getElementById('editEmoji').value = p.emoji||'';
  document.getElementById('editStock').value = p.stock||0;
  if (p.trackStock) { document.getElementById('editTrackStock').classList.add('on'); document.getElementById('editStockFields').style.display=''; }
  else { document.getElementById('editTrackStock').classList.remove('on'); document.getElementById('editStockFields').style.display='none'; }
  p.showStock ? document.getElementById('editShowStock').classList.add('on') : document.getElementById('editShowStock').classList.remove('on');
  optEditors(); editOpt.set(p.options);
  editPhoto = null;
  const prev = document.getElementById('editPhotoPreview');
  if (p.photo) { prev.src=p.photo; prev.style.display='block'; document.getElementById('editPhotoPlaceholder').style.display='none'; }
  else { prev.style.display='none'; document.getElementById('editPhotoPlaceholder').style.display=''; }
  openModal('editProductModal');
}

async function deleteProd(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  showLoader(true); await dbDeleteProduct(id); showLoader(false);
  showToast('Produit supprimé','','var(--red)');
  await renderProductsTable(); await renderDashboard();
}

/* ── ADD PRODUCT ── */
function resetAddForm() {
  optEditors(); apOpt.set([]);
  ['apName','apDesc','apPrice','apEmoji','apStock'].forEach(id=>document.getElementById(id).value='');
  const cats = getCategories();
  document.getElementById('apCat').value = cats.length ? cats[0].slug : 'food';
  document.getElementById('apPhotoPreview').style.display='none';
  document.getElementById('apPhotoPlaceholder').style.display='';
  document.getElementById('addSuccess').classList.remove('show');
  document.getElementById('apTrackStock').classList.remove('on');
  document.getElementById('apShowStock').classList.add('on');
  document.getElementById('apStockFields').style.display='none';
  addPhoto=null;
}

async function saveNewProduct() {
  const name  = document.getElementById('apName').value.trim();
  const desc  = document.getElementById('apDesc').value.trim();
  const cat   = document.getElementById('apCat').value;
  const price = parseInt(document.getElementById('apPrice').value);
  const emoji = document.getElementById('apEmoji').value.trim()||'🛍️';
  const trackStock = document.getElementById('apTrackStock').classList.contains('on');
  const stock      = parseInt(document.getElementById('apStock').value)||0;
  const showStock  = document.getElementById('apShowStock').classList.contains('on');
  if (!name) { showToast('Nom manquant','','var(--red)'); return; }
  if (!price||price<1) { showToast('Prix invalide','Le prix doit être supérieur à 0.','var(--red)'); return; }
  if (trackStock && stock<0) { showToast('Stock invalide','','var(--red)'); return; }
  optEditors(); let options; try { options = apOpt.get(); } catch (e) { showToast('Options', e.message, 'var(--red)'); return; }
  showLoader(true);
  const r = await dbInsertProduct(currentUser.id, currentUser.name, { name, desc, cat, price, emoji, photo:addPhoto, trackStock, stock, showStock, options });
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  document.getElementById('addSuccess').classList.add('show');
  resetAddForm(); document.getElementById('addSuccess').classList.add('show');
  showToast('Produit publié !', `"${name}" est visible. 🎉`,'var(--green)');
}

async function saveEditProduct() {
  const id    = parseInt(document.getElementById('editId').value);
  const name  = document.getElementById('editName').value.trim();
  const desc  = document.getElementById('editDesc').value.trim();
  const cat   = document.getElementById('editCat').value;
  const price = parseInt(document.getElementById('editPrice').value);
  const emoji = document.getElementById('editEmoji').value.trim();
  const trackStock = document.getElementById('editTrackStock').classList.contains('on');
  const stock      = parseInt(document.getElementById('editStock').value)||0;
  const showStock  = document.getElementById('editShowStock').classList.contains('on');
  if (!name||!price) { showToast('Champs manquants','Nom et prix requis.','var(--red)'); return; }
  if (trackStock && stock<0) { showToast('Stock invalide','','var(--red)'); return; }
  optEditors(); let options; try { options = editOpt.get(); } catch (e) { showToast('Options', e.message, 'var(--red)'); return; }
  const fields = { name, desc, cat, price, emoji, trackStock, stock, showStock, options };
  if (editPhoto) fields.photo = editPhoto;
  showLoader(true);
  const r = await dbUpdateProduct(id, fields);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error, 'var(--red)'); return; }
  closeModal('editProductModal');
  showToast('Modifié', 'Changements enregistrés.', 'var(--green)');
  await renderProductsTable(); await renderDashboard();
}

/* ── PROFILE ── */
function loadProfile() {
  document.getElementById('pfFirst').value    = currentUser.firstName||'';
  document.getElementById('pfLast').value     = currentUser.lastName||'';
  document.getElementById('pfEmail').value    = currentUser.email||'';
  document.getElementById('pfPhone').value    = currentUser.phone||'';
  document.getElementById('pfShopName').value = currentUser.name||'';
  document.getElementById('pfBio').value      = currentUser.bio||'';
  populateFiliereSelect();
  currentUser.shopOpen!==false ? document.getElementById('pfToggle').classList.add('on') : document.getElementById('pfToggle').classList.remove('on');
}

async function saveProfile() {
  const first    = document.getElementById('pfFirst').value.trim();
  const last     = document.getElementById('pfLast').value.trim();
  const email    = document.getElementById('pfEmail').value.trim();
  const phone    = document.getElementById('pfPhone').value.trim();
  const shopName = document.getElementById('pfShopName').value.trim();
  const bio      = document.getElementById('pfBio').value.trim();
  const pass     = document.getElementById('pfPass').value;
  const shopOpen = document.getElementById('pfToggle').classList.contains('on');
  const filiere  = document.getElementById('pfFiliere').value;
  if (!first||!email) { showToast('Champs manquants','Prénom et email requis.','var(--red)'); return; }
  if (pass&&pass.length<8) { showToast('Mot de passe trop court','Min. 8 caractères.','var(--red)'); return; }
  const name   = shopName||(first+(last?' '+last[0]+'.':''));
  const fields = { firstName:first, lastName:last, name, email, phone, bio, shopOpen, filiere };
  if (pass) fields.password = pass;
  showLoader(true);
  const r = await dbUpdateUser(currentUser.id, fields);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error,'var(--red)'); return; }
  currentUser = r.user; setSession(currentUser);
  if (r.notice) showToast('Email à confirmer', r.notice, 'var(--orange)');
  document.getElementById('shopName').textContent   = currentUser.name;
  document.getElementById('shopNameMobile').textContent = currentUser.name;
  document.getElementById('userAvatar').textContent = currentUser.firstName[0].toUpperCase();
  document.getElementById('userName').textContent   = currentUser.name;
  showToast('Profil sauvegardé','','var(--green)');
  document.getElementById('pfPass').value='';
}

/* ── PHOTO ── */
function handlePhoto(input, previewId, placeholderId, cb) {
  const file = input.files[0]; if (!file) return;
  if (file.size>5*1024*1024) { showToast('Fichier trop lourd','Max 5 Mo.','var(--red)'); return; }
  compressImageFile(file, 900, 0.8).then(data => { cb(data); const p=document.getElementById(previewId); p.src=data; p.style.display='block'; document.getElementById(placeholderId).style.display='none'; })
    .catch(() => showToast('Image illisible','Choisis une photo JPG ou PNG.','var(--red)'));
}


/* ══════════ VÉRIFICATION DU COMPTE ══════════ */
function renderVerifBanner() {
  const b = document.getElementById('verifBanner'); if (!b) return;
  const st = verifState(currentUser);
  document.body.classList.toggle('acct-locked', st.code === 'expired');
  document.getElementById('verifDot').style.display = (st.code === 'active' || st.code === 'rejected' || st.code === 'expired') ? '' : 'none';
  const go = '<button type="button" class="vb-btn" onclick="goPage(\'verify\')">Vérifier mon compte</button>';
  if (st.code === 'verified') { b.style.display = 'none'; return; }
  b.className = 'verif-banner' + (st.code === 'expired' ? ' danger' : '');
  b.style.display = '';
  if (st.code === 'expired') b.innerHTML = `<span><strong>Compte désactivé.</strong> Tes produits sont masqués. Envoie ta pièce d'identité pour le réactiver.</span>${go}`;
  else if (st.code === 'pending') b.innerHTML = `<span><strong>Dossier en cours d'examen</strong> (24 à 48 h). Ton compte reste actif pendant l'examen.</span>`;
  else b.innerHTML = `<span><strong>Compte non vérifié</strong> · 5 produits maximum · il te reste <strong>${fmtLeft(st.msLeft)}</strong> pour envoyer ton dossier.</span>${go}`;
}

async function renderVerifyPage() {
  const root = document.getElementById('page-verify');
  const st = verifState(currentUser);
  const hist = await dbGetMyVerifications();
  const statusTxt = { pending: 'En examen', approved: 'Validé', rejected: 'Refusé' };
  let top = '';
  if (st.code === 'verified') top = `<div class="vf-card ok"><div class="vf-ico">✓</div><div><strong>Compte vérifié</strong><p>Le badge « Vérifié » s'affiche sur ta boutique et sur tes produits. Aucune limite de produits.</p></div></div>`;
  else if (st.code === 'pending') top = `<div class="vf-card"><div class="vf-ico">⏳</div><div><strong>Dossier en cours d'examen</strong><p>Le Super Admin valide sous 24 à 48 h. Tu seras notifié ici. Ton compte reste actif pendant l'examen.</p></div></div>`;
  else if (st.code === 'expired') top = `<div class="vf-card bad"><div class="vf-ico">!</div><div><strong>Compte désactivé</strong><p>Le délai de vérification est dépassé. Tes produits sont masqués du catalogue. Envoie ton dossier : ton compte sera réactivé dès sa validation.</p></div></div>`;
  else {
    const rej = hist.find(h => h.status === 'rejected');
    top = `<div class="vf-card"><div class="vf-ico">🛡</div><div><strong>${st.code === 'rejected' ? 'Dossier refusé — nouvel essai possible' : 'Fais vérifier ton compte'}</strong>
      <p>${st.code === 'rejected' && rej && rej.admin_note ? 'Motif : ' + esc(rej.admin_note) + '. ' : ''}Sans vérification : <strong>5 produits maximum</strong> et le compte est <strong>désactivé dans ${fmtLeft(st.msLeft)}</strong>. Une fois vérifié : badge « Vérifié », plus de limite.</p></div></div>`;
  }
  const canSend = st.code !== 'verified' && st.code !== 'pending';
  const form = !canSend ? '' : `
    <div class="form-wrap" style="max-width:520px">
      <div class="f-section">
        <span class="f-label">Ton dossier</span>
        <div class="field"><label>Type de pièce</label>
          <select id="vfType"><option value="cni">Carte nationale d'identité</option><option value="passeport">Passeport</option><option value="carte_etudiant">Carte d'étudiant</option><option value="permis">Permis de conduire</option></select></div>
        <div class="field"><label>Photo de la pièce (recto, lisible)</label><input type="file" id="vfId" accept="image/*"></div>
        <div class="field"><label>Selfie : ton visage, bien éclairé, sans lunettes de soleil</label><input type="file" id="vfSelfie" accept="image/*" capture="user"></div>
        <div class="vf-prev"><img id="vfIdPrev" alt="" hidden><img id="vfSelfiePrev" alt="" hidden></div>
        <label class="check-row"><input type="checkbox" id="vfConsent"><span>J'accepte que N Market utilise ces images <strong>uniquement pour vérifier mon identité</strong>. Elles sont visibles du seul Super Admin et <strong>supprimées après validation</strong>.</span></label>
      </div>
      <button class="btn-primary" id="vfSend">Envoyer mon dossier</button>
    </div>`;
  const history = hist.length ? `<div style="margin-top:26px"><div class="f-label" style="margin-bottom:8px">Historique</div>${hist.map(h => `<div class="vf-row"><span>${new Date(h.submitted_at).toLocaleDateString('fr-FR')}</span><span>${esc(statusTxt[h.status] || h.status)}${h.admin_note ? ' — ' + esc(h.admin_note) : ''}</span></div>`).join('')}</div>` : '';
  root.innerHTML = `<div class="page-header"><div><div class="page-title">Vérification</div><div class="page-desc">Badge « Vérifié » et levée des limites</div></div></div>${top}${form}${history}`;

  if (!canSend) return;
  const prev = (inp, img) => inp.addEventListener('change', () => { const f = inp.files[0]; if (!f) { img.hidden = true; return; } img.src = URL.createObjectURL(f); img.hidden = false; });
  prev(document.getElementById('vfId'), document.getElementById('vfIdPrev'));
  prev(document.getElementById('vfSelfie'), document.getElementById('vfSelfiePrev'));
  document.getElementById('vfSend').addEventListener('click', async () => {
    const idF = document.getElementById('vfId').files[0], sF = document.getElementById('vfSelfie').files[0];
    if (!idF || !sF) { showToast('Fichiers manquants', 'Ajoute la photo de la pièce ET ton selfie.', 'var(--red)'); return; }
    if (!document.getElementById('vfConsent').checked) { showToast('Accord requis', 'Coche la case pour continuer.', 'var(--red)'); return; }
    const btn = document.getElementById('vfSend'); btn.disabled = true; btn.textContent = 'Envoi…';
    const r = await dbSubmitVerification(document.getElementById('vfType').value, idF, sF);
    if (r.error) { btn.disabled = false; btn.textContent = 'Envoyer mon dossier'; showToast('Envoi impossible', r.error, 'var(--red)'); return; }
    currentUser = await initSession() || currentUser;
    renderVerifBanner(); await renderVerifyPage();
    showToast('Dossier envoyé', 'Réponse sous 24 à 48 h.', 'var(--green)');
  });
}


/* ── WHATSAPP : messages prêts à envoyer (lien wa.me) ── */
let _waTpl = [], _waOrder = null;
async function openWaSend(key) {
  const o = await findInvoice(key); if (!o) return;
  _waOrder = o; _waTpl = await dbGetWaTemplates(currentUser.id);
  document.getElementById('waSendSub').textContent = `${o.buyerName} · 📞 ${o.buyerPhone || '—'} · ${o.receiptCode || '#' + o.id}`;
  const box = document.getElementById('waSendChoices');
  box.innerHTML = _waTpl.map((t, i) => `<button type="button" class="wa-choice${i === 0 ? ' on' : ''}" data-i="${i}">${esc(t.label)}</button>`).join('');
  const pick = i => { box.querySelectorAll('.wa-choice').forEach(b => b.classList.toggle('on', +b.dataset.i === i)); document.getElementById('waSendText').value = waFill(_waTpl[i].text, o, currentUser.name); };
  box.querySelectorAll('.wa-choice').forEach(b => b.addEventListener('click', () => pick(+b.dataset.i)));
  pick(0);
  const ok = !!waPhone(o.buyerPhone), warn = document.getElementById('waSendWarn');
  warn.hidden = ok; warn.textContent = ok ? '' : 'Numéro du client invalide : impossible d\'ouvrir WhatsApp.';
  const go = document.getElementById('waSendGo'); go.disabled = !ok;
  go.onclick = () => { const url = waLink(o.buyerPhone, document.getElementById('waSendText').value); if (url) window.open(url, '_blank', 'noopener'); };
  closeModal('waTplModal'); openModal('waSendModal');
}
async function openWaTemplates() {
  _waTpl = await dbGetWaTemplates(currentUser.id);
  const list = document.getElementById('waTplList');
  list.innerHTML = _waTpl.map((t, i) => `<div class="wa-tpl"><input class="wa-tpl-label" data-i="${i}" maxlength="40" value="${esc(t.label)}" aria-label="Nom du modèle"><textarea class="wa-text" data-i="${i}" rows="4" maxlength="800">${esc(t.text)}</textarea></div>`).join('');
  let last = null; list.addEventListener('focusin', e => { if (e.target.tagName === 'TEXTAREA') last = e.target; });
  document.getElementById('waTagChips').innerHTML = WA_TAGS.map(([t, d]) => `<button type="button" class="wa-chip" data-tag="${t}" title="${esc(d)}">${t}</button>`).join('');
  document.querySelectorAll('#waTagChips .wa-chip').forEach(c => c.addEventListener('click', () => {
    const ta = last || list.querySelector('textarea'); if (!ta) return;
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    ta.value = ta.value.slice(0, a) + c.dataset.tag + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + c.dataset.tag.length;
  }));
  document.getElementById('waTplSave').onclick = async () => {
    const out = _waTpl.map((t, i) => ({ key: t.key, label: (list.querySelector(`.wa-tpl-label[data-i="${i}"]`).value.trim() || t.label).slice(0, 40), text: (list.querySelector(`textarea[data-i="${i}"]`).value.trim() || t.text).slice(0, 800) }));
    const r = await dbSaveWaTemplates(currentUser.id, out);
    showToast(r.ok ? 'Messages enregistrés' : 'Enregistrés sur cet appareil', r.ok ? 'Tes modèles WhatsApp sont à jour.' : 'Base non mise à jour (exécute secure_10_wa_templates.sql pour les garder sur tous tes appareils).', r.ok ? 'var(--green)' : 'var(--orange)');
    closeModal('waTplModal');
  };
  document.getElementById('waTplReset').onclick = async () => { await dbSaveWaTemplates(currentUser.id, WA_DEFAULTS.map(d => ({ ...d }))); showToast('Modèles rétablis', '', 'var(--green)'); openWaTemplates(); };
  closeModal('waSendModal'); openModal('waTplModal');
}


/* ── MON TICKET : personnalisation + aperçu en direct ── */
let _ts = null;
async function renderTicketStylePage() {
  const { data } = await db.from('users').select('ticket_style').eq('id', currentUser.id).maybeSingle().then(r => r, () => ({ data: null }));
  _ts = sanitizeTicketStyle(data && data.ticket_style);
  const $ = id => document.getElementById(id);
  const paint = () => { $('tsPreview').innerHTML = ticketHTML(ticketSample(currentUser.name), _ts); };
  const sync = () => {
    $('tsAccent').value = _ts.accent; $('tsPaper').value = _ts.paper; $('tsInk').value = _ts.ink;
    $('tsShowShop').checked = _ts.showShop; $('tsTitle').value = _ts.title; $('tsFooter').value = _ts.footer;
    document.querySelectorAll('#tsAlign button').forEach(b => b.classList.toggle('on', b.dataset.v === _ts.align));
    document.querySelectorAll('#tsHeader button').forEach(b => b.classList.toggle('on', b.dataset.v === _ts.header));
    paint();
  };
  if (!renderTicketStylePage._bound) {
    renderTicketStylePage._bound = true;
    [['tsAccent', 'accent'], ['tsPaper', 'paper'], ['tsInk', 'ink']].forEach(([id, k]) => $(id).addEventListener('input', e => { _ts[k] = e.target.value; paint(); }));
    $('tsShowShop').addEventListener('change', e => { _ts.showShop = e.target.checked; paint(); });
    $('tsTitle').addEventListener('input', e => { _ts.title = e.target.value; paint(); });
    $('tsFooter').addEventListener('input', e => { _ts.footer = e.target.value; paint(); });
    document.querySelectorAll('#tsAlign button').forEach(b => b.addEventListener('click', () => { _ts.align = b.dataset.v; sync(); }));
    document.querySelectorAll('#tsHeader button').forEach(b => b.addEventListener('click', () => { _ts.header = b.dataset.v; sync(); }));
    $('tsReset').addEventListener('click', () => { _ts = sanitizeTicketStyle(null); sync(); });
    $('tsSave').addEventListener('click', async () => {
      _ts = sanitizeTicketStyle(_ts);
      const r = await dbSaveTicketStyle(_ts);
      if (r.ok) showToast('Ticket enregistré', 'Tes clients le verront à leur prochaine commande.', 'var(--green)');
      else showToast('Enregistrement impossible', /function|does not exist|schema cache/i.test(r.error) ? 'Exécute secure_12_ticket_style.sql dans Supabase.' : r.error, 'var(--red)');
    });
  }
  sync();
}
