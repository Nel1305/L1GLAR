/* ═══════════════════════════════════════════════════
   N MARKET — admin.js (espace vendeur)
   Sécurisé : XSS mitigé via esc()
═══════════════════════════════════════════════════ */

'use strict';

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

let currentUser  = null;
let addPhoto     = null;
let editPhoto    = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = getSession();
  if (!currentUser) {
    document.getElementById('lockedScreen').style.display = '';
    showLoader(false); return;
  }
  document.getElementById('appShell').style.display = '';
  document.getElementById('shopName').textContent    = currentUser.name;
  document.getElementById('userAvatar').textContent  = currentUser.firstName[0].toUpperCase();
  document.getElementById('userName').textContent    = currentUser.name;
  bindNav();
  document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); window.location.href='../index.html'; });
  document.getElementById('apPhoto').addEventListener('change', function() { handlePhoto(this,'apPhotoPreview','apPhotoPlaceholder', d=>{ addPhoto=d; }); });
  document.getElementById('editPhoto').addEventListener('change', function() { handlePhoto(this,'editPhotoPreview','editPhotoPlaceholder', d=>{ editPhoto=d; }); });
  document.getElementById('saveProductBtn').addEventListener('click', saveNewProduct);
  document.getElementById('saveEditBtn').addEventListener('click', saveEditProduct);
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('pfToggle').addEventListener('click', function(){ this.classList.toggle('on'); });
  document.getElementById('orderStatusFilter').addEventListener('change', renderOrders);
  await renderDashboard();
  showLoader(false);
});

/* ── NAV ── */
function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goPage(btn.dataset.page));
  });
}
async function goPage(name) {
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.remove('active'));
  const b=document.querySelector(`.nav-item[data-page="${name}"]`); if(b) b.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if (name==='dashboard')  await renderDashboard();
  if (name==='orders')     await renderOrders();
  if (name==='products')   await renderProductsTable();
  if (name==='addproduct') resetAddForm();
  if (name==='profile')    loadProfile();
  if (name==='chat' && !chatInited) await initChat(currentUser, false);
}

/* ── DASHBOARD ── */
async function renderDashboard() {
  showLoader(true);
  const [products, orders] = await Promise.all([
    dbGetProducts({ sellerId: currentUser.id }),
    dbGetOrders({ sellerId: currentUser.id })
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
      <td><span style="font-weight:500">${o.buyerName}</span></td>
      <td>${o.productName}</td>
      <td>${o.qty}</td>
      <td style="font-weight:500">${o.total.toLocaleString()} FCFA</td>
      <td><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></td>
    </tr>`).join('') || `<tr><td colspan="5" class="table-empty">Aucune commande</td></tr>`;

  document.getElementById('dashProducts').innerHTML = products.length
    ? products.slice(0,6).map(p=>`
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r2);overflow:hidden">
          <div style="height:72px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:1.8rem;position:relative;overflow:hidden">
            ${p.photo?`<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" alt="">`:p.emoji}
            ${!p.available?`<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--red);font-weight:600;letter-spacing:.04em">INDISPO</div>`:''}
          </div>
          <div style="padding:10px">
            <div style="font-size:.78rem;font-weight:500;margin-bottom:2px">${p.name}</div>
            <div style="font-size:.68rem;color:var(--t3)">${p.price.toLocaleString()} FCFA</div>
          </div>
        </div>`).join('')
    : `<div style="color:var(--t3);font-size:.78rem;padding:16px 0">Aucun produit. <a style="color:var(--t1);cursor:pointer;text-decoration:underline" onclick="goPage('addproduct')">Ajouter →</a></div>`;
}

/* ── ORDERS ── */
async function renderOrders() {
  showLoader(true);
  const filter = document.getElementById('orderStatusFilter').value;
  const orders = await dbGetOrders({ sellerId:currentUser.id, status:filter });
  showLoader(false);
  const tbody = document.getElementById('ordersBody');
  if (!orders.length) { tbody.innerHTML=`<tr><td colspan="9" class="table-empty">Aucune commande</td></tr>`; return; }
  tbody.innerHTML = orders.map(o=>`
    <tr>
      <td>
        <div style="color:var(--t3);font-size:.7rem">#${o.id}</div>
        ${o.orderCode ? `<span class="order-code-tag">${esc(o.orderCode)}</span>` : ''}
      </td>
      <td><span style="font-weight:500">${esc(o.buyerName)}</span><div style="font-size:.68rem;color:var(--t3)">${formatDate(o.createdAt)}</div></td>
      <td style="font-size:.72rem;color:var(--t2)">${esc(o.buyerEmail)}<br>${esc(o.buyerPhone||'')}</td>
      <td>${esc(o.productName)}</td>
      <td>${o.qty}</td>
      <td style="font-weight:500">${o.total.toLocaleString()} FCFA</td>
      <td style="max-width:120px">${o.notes?`<span style="font-size:.72rem;color:var(--t2);font-style:italic">${esc(o.notes).substring(0,45)}${o.notes.length>45?'…':''}</span>`:`<span style="color:var(--t3)">—</span>`}</td>
      <td>
        <select class="select-sm" style="font-size:.72rem" onchange="updateStatus(${o.id},this.value)">
          <option value="new"    ${o.status==='new'   ?'selected':''}>Nouvelle</option>
          <option value="done"   ${o.status==='done'  ?'selected':''}>Livrée</option>
          <option value="cancel" ${o.status==='cancel'?'selected':''}>Annulée</option>
        </select>
      </td>
      <td><button class="icon-btn edit" onclick="viewOrder(${o.id})" title="Voir">👁</button></td>
    </tr>`).join('');
}

async function updateStatus(id, status) {
  await dbUpdateOrderStatus(id, status);
  showToast('Statut mis à jour', status==='done'?'Commande livrée ✓':status==='cancel'?'Commande annulée':'En attente', status==='done'?'var(--green)':status==='cancel'?'var(--red)':null);
  await renderDashboard();
}

async function viewOrder(id) {
  const orders = await dbGetOrders({ sellerId: currentUser.id });
  const o = orders.find(x=>x.id===id); if (!o) return;
  document.getElementById('orderDetailSub').textContent = `Commande #${o.id} · ${formatDate(o.createdAt)}`;
  const row = (k,v) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--gb1);font-size:.78rem"><span style="color:var(--t2)">${k}</span><span style="font-weight:500">${v}</span></div>`;
  document.getElementById('orderDetailContent').innerHTML =
    (o.orderCode ? `<div style="text-align:center;margin-bottom:16px;padding:14px;background:var(--gold-dim);border:1px solid rgba(201,168,76,0.25);border-radius:var(--r-lg)"><div style="font-size:.6rem;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">Code de commande</div><div style="font-family:monospace;font-size:1.3rem;font-weight:800;color:var(--gold-l);letter-spacing:.1em">${esc(o.orderCode)}</div></div>` : '') +
    row('Client', esc(o.buyerName)) + row('Email', esc(o.buyerEmail||'—')) + row('Téléphone', esc(o.buyerPhone||'—')) +
    row('Produit', esc(o.productName)) + row('Quantité', o.qty) +
    row('Total', `<span style="color:var(--green);font-weight:600">${o.total.toLocaleString()} FCFA</span>`) +
    row('Statut', `<span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>`) +
    (o.notes?`<div style="margin-top:14px"><div style="font-size:.68rem;color:var(--t3);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em">Modification demandée</div><div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px;font-size:.78rem;color:var(--t2);font-style:italic;border:1px solid var(--gb1)">${esc(o.notes)}</div></div>`:'');
  openModal('orderDetailModal');
}

/* ── PRODUCTS TABLE ── */
async function renderProductsTable() {
  showLoader(true);
  const products = await dbGetProducts({ sellerId: currentUser.id });
  showLoader(false);
  const tbody = document.getElementById('productsBody');
  if (!products.length) { tbody.innerHTML=`<tr><td colspan="7" class="table-empty">Aucun produit. <a style="color:var(--t1);cursor:pointer;text-decoration:underline" onclick="goPage('addproduct')">Ajouter →</a></td></tr>`; return; }
  tbody.innerHTML = products.map(p=>`
    <tr>
      <td><div class="prod-thumb">${p.photo?`<img src="${p.photo}" alt="">`:p.emoji}</div></td>
      <td><div style="font-weight:500">${p.name}</div><div style="font-size:.7rem;color:var(--t2);margin-top:2px">${(p.desc||'').substring(0,50)}${(p.desc||'').length>50?'…':''}</div></td>
      <td><span class="badge badge-${p.cat}">${catLabel(p.cat)}</span></td>
      <td style="font-weight:500">${p.price.toLocaleString()} FCFA</td>
      <td>${p.votes?`<div style="display:flex;align-items:center;gap:3px">${starsHtml(p.rating,'.74rem')}<span style="font-size:.68rem;color:var(--t3);margin-left:2px">(${p.votes})</span></div>`:`<span style="color:var(--t4)">—</span>`}</td>
      <td><button class="toggle ${p.available?'on':''}" onclick="toggleAvail(${p.id},${p.available})"></button></td>
      <td><div class="td-actions"><button class="icon-btn edit" onclick="openEditProduct(${p.id})" title="Modifier">✏</button><button class="icon-btn del" onclick="deleteProd(${p.id})" title="Supprimer">✕</button></div></td>
    </tr>`).join('');
}

async function toggleAvail(id, current) {
  await dbUpdateProduct(id, { available: !current });
  showToast(!current?'Produit disponible':'Produit indisponible', !current?'Visible sur la marketplace':'Masqué', !current?'var(--green)':'var(--orange)');
  await renderProductsTable();
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
  ['apName','apDesc','apPrice','apEmoji'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('apCat').value='food';
  document.getElementById('apPhotoPreview').style.display='none';
  document.getElementById('apPhotoPlaceholder').style.display='';
  document.getElementById('addSuccess').classList.remove('show');
  addPhoto=null;
}

async function saveNewProduct() {
  const name  = document.getElementById('apName').value.trim();
  const desc  = document.getElementById('apDesc').value.trim();
  const cat   = document.getElementById('apCat').value;
  const price = parseInt(document.getElementById('apPrice').value);
  const emoji = document.getElementById('apEmoji').value.trim()||'🛍️';
  if (!name) { showToast('Nom manquant','','var(--red)'); return; }
  if (!price||price<1) { showToast('Prix invalide','Le prix doit être supérieur à 0.','var(--red)'); return; }
  showLoader(true);
  const r = await dbInsertProduct(currentUser.id, currentUser.name, { name, desc, cat, price, emoji, photo:addPhoto });
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
  if (!name||!price) { showToast('Champs manquants','Nom et prix requis.','var(--red)'); return; }
  const fields = { name, desc, cat, price, emoji };
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
  if (!first||!email) { showToast('Champs manquants','Prénom et email requis.','var(--red)'); return; }
  if (pass&&pass.length<6) { showToast('Mot de passe trop court','Min. 6 caractères.','var(--red)'); return; }
  const name   = shopName||(first+(last?' '+last[0]+'.':''));
  const fields = { firstName:first, lastName:last, name, email, phone, bio, shopOpen };
  if (pass) fields.password = pass;
  showLoader(true);
  const r = await dbUpdateUser(currentUser.id, fields);
  showLoader(false);
  if (r.error) { showToast('Erreur', r.error,'var(--red)'); return; }
  currentUser = r.user; setSession(currentUser);
  document.getElementById('shopName').textContent   = currentUser.name;
  document.getElementById('userAvatar').textContent = currentUser.firstName[0].toUpperCase();
  document.getElementById('userName').textContent   = currentUser.name;
  const products = await dbGetProducts({ sellerId: currentUser.id });
  await Promise.all(products.map(p => dbUpdateProduct(p.id, { sellerName: currentUser.name })));
  showToast('Profil sauvegardé','','var(--green)');
  document.getElementById('pfPass').value='';
}

/* ── PHOTO ── */
function handlePhoto(input, previewId, placeholderId, cb) {
  const file = input.files[0]; if (!file) return;
  if (file.size>5*1024*1024) { showToast('Fichier trop lourd','Max 5 Mo.','var(--red)'); return; }
  const r = new FileReader();
  r.onload = e => { cb(e.target.result); const p=document.getElementById(previewId); p.src=e.target.result; p.style.display='block'; document.getElementById(placeholderId).style.display='none'; };
  r.readAsDataURL(file);
}
