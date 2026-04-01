/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — superadmin.js
═══════════════════════════════════════════════════ */

let adminSession = null;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => showLoader(false), 5000); // Safety
  adminSession = JSON.parse(sessionStorage.getItem('glar_admin')||'null');
  if (adminSession) { showApp(); }
  else { document.getElementById('loginScreen').style.display=''; showLoader(false); }
  document.getElementById('adminLoginBtn').addEventListener('click', handleLogin);
  document.getElementById('adminLogoutBtn').addEventListener('click', () => { sessionStorage.removeItem('glar_admin'); window.location.reload(); });
  document.getElementById('previewBtn').addEventListener('click', previewGen);
  document.getElementById('generateBtn').addEventListener('click', doGenerate);
  document.getElementById('savePaymentBtn').addEventListener('click', savePayment);
  document.getElementById('confirmBlockBtn').addEventListener('click', confirmBlock);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('commStatusFilter').addEventListener('change', renderCommissions);
  document.getElementById('sellerStatusFilter').addEventListener('change', renderSellers);
  document.getElementById('allOrdersFilter').addEventListener('change', renderAllOrders);
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const now=new Date(), fd=new Date(now.getFullYear(),now.getMonth(),1), ld=new Date(now.getFullYear(),now.getMonth()+1,0), dd=new Date(now.getFullYear(),now.getMonth()+1,7);
  document.getElementById('genStart').value=fd.toISOString().split('T')[0];
  document.getElementById('genEnd').value=ld.toISOString().split('T')[0];
  document.getElementById('genDue').value=dd.toISOString().split('T')[0];
});

async function handleLogin() {
  const email=document.getElementById('aEmail').value.trim();
  const pass =document.getElementById('aPass').value;
  if(!email||!pass){showToast('Champs manquants','','var(--red)');return;}
  showLoader(true);
  const r=await dbAdminLogin(email,pass);
  showLoader(false);
  if(r.error){showToast('Erreur',r.error,'var(--red)');return;}
  sessionStorage.setItem('glar_admin',JSON.stringify(r.admin));
  adminSession=r.admin; showApp();
}

function showApp() {
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appShell').style.display='';
  document.getElementById('adminName').textContent=adminSession.name||'Admin';
  showLoader(false);
  bindNav();
  renderDashboard();
}

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
  if (name==='dashboard')   await renderDashboard();
  if (name==='commissions') await renderCommissions();
  if (name==='sellers')     await renderSellers();
  if (name==='network')     await renderNetwork();
  if (name==='products')    await renderAllProducts();
  if (name==='orders')      await renderAllOrders();
  if (name==='chat' && !chatInited) {
    await initChat({ id: adminSession.id, name: adminSession.name||'Admin', firstName: 'Admin' }, true);
  }
}

/* ── DASHBOARD ── */
async function renderDashboard() {
  showLoader(true);
  let users=[],products=[],orders=[],commissions=[];
  try {
    [users,products,orders,commissions] = await Promise.all([dbGetAllUsers(),dbGetProducts(),dbGetOrders(),dbGetCommissions()]);
  } catch(e) { showToast('Erreur','Impossible de charger les données.','var(--red)'); }
  showLoader(false);

  const revenue  = orders.filter(o=>o.status==='done').reduce((s,o)=>s+o.total,0);
  const totalDue = commissions.filter(c=>c.status!=='paid').reduce((s,c)=>s+(c.amount_due-c.amount_paid),0);
  const collected= commissions.reduce((s,c)=>s+c.amount_paid,0);
  const overdue  = commissions.filter(c=>c.status==='overdue').length;
  const blocked  = users.filter(u=>u.isBlocked).length;

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card c-white"><div class="stat-value">${users.length}</div><div class="stat-label">Vendeurs inscrits</div></div>
    <div class="stat-card c-green"><div class="stat-value">${revenue.toLocaleString()}</div><div class="stat-label">CA global (FCFA)</div></div>
    <div class="stat-card c-orange"><div class="stat-value">${totalDue.toLocaleString()}</div><div class="stat-label">Commissions dues</div></div>
    <div class="stat-card c-blue"><div class="stat-value">${collected.toLocaleString()}</div><div class="stat-label">Perçues (FCFA)</div></div>
    <div class="stat-card c-red"><div class="stat-value">${overdue}</div><div class="stat-label">Retards</div></div>
    <div class="stat-card c-red"><div class="stat-value">${blocked}</div><div class="stat-label">Comptes bloqués</div></div>
  `;

  const overdueC = commissions.filter(c=>c.status==='overdue');
  const alert = document.getElementById('alertSection');
  if (overdueC.length) {
    alert.style.display='';
    document.getElementById('alertList').innerHTML = overdueC.map(c=>`
      <div class="alert-row">
        <div><span class="alert-name">${c.seller_name}</span> <span style="color:var(--t3);font-size:.72rem">${c.period_label}</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="alert-amount">${(c.amount_due-c.amount_paid).toLocaleString()} FCFA</span>
          <button class="btn-ghost" style="font-size:.72rem;padding:4px 10px" onclick="openPayment(${c.id})">Enregistrer paiement</button>
        </div>
      </div>`).join('');
  } else { alert.style.display='none'; }

  document.getElementById('recentOrders').innerHTML = orders.slice(0,5).map(o=>`
    <div class="mini-row">
      <div><div style="font-weight:500;font-size:.78rem">${o.buyerName}</div><div style="font-size:.68rem;color:var(--t3)">${o.productName}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:.78rem;font-weight:500">${o.total.toLocaleString()} FCFA</span>
        <span class="status-badge status-${o.status}" style="font-size:.65rem">${statusLabel(o.status)}</span>
      </div>
    </div>`).join('') || '<div style="color:var(--t3);font-size:.76rem;padding:12px 0">Aucune commande</div>';

  const pending = commissions.filter(c=>c.status!=='paid').slice(0,4);
  document.getElementById('recentCommissions').innerHTML = pending.map(c=>`
    <div class="mini-row">
      <div><div style="font-weight:500;font-size:.78rem">${c.seller_name}</div><div style="font-size:.68rem;color:var(--t3)">${c.period_label}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:.78rem;font-weight:500;color:var(--orange)">${c.amount_due.toLocaleString()} FCFA</span>
        <button class="icon-btn edit" onclick="openPayment(${c.id})" title="Enregistrer">💳</button>
      </div>
    </div>`).join('') || '<div style="color:var(--t3);font-size:.76rem;padding:12px 0">Aucune commission en attente ✓</div>';
}

/* ── COMMISSIONS ── */
async function renderCommissions() {
  showLoader(true);
  const f = document.getElementById('commStatusFilter').value;
  const comms = await dbGetCommissions({ status:f });
  showLoader(false);
  const tbody = document.getElementById('commissionsBody');
  if (!comms.length) { tbody.innerHTML=`<tr><td colspan="9" class="table-empty">Aucune commission</td></tr>`; return; }
  tbody.innerHTML = comms.map(c=>{
    const reste=c.amount_due-c.amount_paid;
    const pct=c.amount_due>0?Math.min(100,Math.round(c.amount_paid/c.amount_due*100)):0;
    return `<tr>
      <td style="font-weight:500">${c.seller_name}</td>
      <td style="font-size:.72rem;color:var(--t2)">${c.period_label}</td>
      <td>${c.revenue.toLocaleString()} FCFA</td>
      <td>${c.rate}%</td>
      <td style="font-weight:500">${c.amount_due.toLocaleString()} FCFA</td>
      <td style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</td>
      <td style="color:${reste>0?'var(--red)':'var(--green)'};font-weight:500">${reste.toLocaleString()} FCFA</td>
      <td>
        <span class="status-badge comm-${c.status}" style="font-size:.65rem">${cLabel(c.status)}</span>
        ${c.amount_due>0?`<div class="progress-wrap"><div class="progress-bg"><div class="progress-fill" style="width:${pct}%;background:${pct===100?'var(--green)':'var(--blue)'}"></div></div><div class="progress-lbl">${pct}%</div></div>`:''}
      </td>
      <td>${c.status!=='paid'?`<button class="icon-btn edit" onclick="openPayment(${c.id})">💳</button>`:`<span style="color:var(--green);font-size:.72rem">Soldé</span>`}</td>
    </tr>`;
  }).join('');
}

/* ── GENERATE ── */
async function previewGen() {
  const start=document.getElementById('genStart').value, end=document.getElementById('genEnd').value;
  const rate=parseFloat(document.getElementById('genRate').value)||5;
  if (!start||!end) { showToast('Dates manquantes','','var(--red)'); return; }
  showLoader(true);
  const users=await dbGetAllUsers(), orders=await dbGetOrders();
  showLoader(false);
  const preview=[];
  for (const u of users) {
    const myOrders=orders.filter(o=>o.sellerId===u.id&&o.status==='done'&&o.createdAt>=start&&o.createdAt<=end);
    const revenue=myOrders.reduce((s,o)=>s+o.total,0);
    if (revenue>0) preview.push({ sellerId:u.id, sellerName:u.name, revenue, amountDue:Math.round(revenue*rate/100), rate });
  }
  const pLabel = new Date(start).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const tbody = document.getElementById('genPreviewBody');
  if (!preview.length) { tbody.innerHTML=`<tr><td colspan="4" class="table-empty">Aucun vendeur avec des ventes sur cette période</td></tr>`; document.getElementById('genPreview').style.display=''; document.getElementById('generateBtn').disabled=true; return; }
  tbody.innerHTML = preview.map(p=>`<tr><td style="font-weight:500">${p.sellerName}</td><td style="color:var(--t2);font-size:.74rem">${pLabel}</td><td>${p.revenue.toLocaleString()} FCFA</td><td style="font-weight:500;color:var(--orange)">${p.amountDue.toLocaleString()} FCFA</td></tr>`).join('');
  const total=preview.reduce((s,p)=>s+p.amountDue,0);
  document.getElementById('genTotal').innerHTML=`<span>${preview.length} vendeur(s) · <span style="color:var(--t2)">${pLabel}</span></span><strong>${total.toLocaleString()} FCFA</strong>`;
  document.getElementById('genPreview').style.display='';
  document.getElementById('generateBtn').disabled=false;
  document.getElementById('generateBtn').dataset.p=JSON.stringify(preview);
  document.getElementById('generateBtn').dataset.start=start;
  document.getElementById('generateBtn').dataset.end=end;
  document.getElementById('generateBtn').dataset.due=document.getElementById('genDue').value;
  document.getElementById('generateBtn').dataset.label=pLabel;
  document.getElementById('generateBtn').dataset.type=document.getElementById('genType').value;
}

async function doGenerate() {
  const btn=document.getElementById('generateBtn');
  const preview=JSON.parse(btn.dataset.p||'[]');
  if (!preview.length) return;
  showLoader(true);
  for (const p of preview) {
    await dbInsertCommission({ seller_id:p.sellerId, seller_name:p.sellerName, period_label:btn.dataset.label, period_type:btn.dataset.type, period_start:btn.dataset.start, period_end:btn.dataset.end, revenue:p.revenue, rate:p.rate, amount_due:p.amountDue, amount_paid:0, status:'pending', due_date:btn.dataset.due||null });
  }
  showLoader(false);
  const total=preview.reduce((s,p)=>s+p.amountDue,0);
  document.getElementById('genSuccessText').innerHTML=`${preview.length} factures · Total : <strong>${total.toLocaleString()} FCFA</strong>`;
  document.getElementById('genSuccess').classList.add('show');
  btn.disabled=true;
  showToast('Factures générées !',`${preview.length} vendeurs facturés`,'var(--green)');

  // Envoyer les emails de facture à chaque vendeur
  if (typeof sendInvoiceEmail !== 'undefined') {
    const allUsers = await dbGetAllUsers();
    let emailsSent = 0;
    for (const p of preview) {
      const seller = allUsers.find(u => u.id === p.sellerId);
      if (!seller || !seller.email) continue;
      const commData = {
        period_label: btn.dataset.label,
        revenue:      p.revenue,
        amount_due:   p.amountDue,
        rate:         p.rate,
        due_date:     btn.dataset.due || null,
      };
      const res = await sendInvoiceEmail(seller, commData);
      if (res.ok) emailsSent++;
    }
    if (emailsSent > 0) {
      showToast('Emails envoyés', `${emailsSent} vendeur(s) notifié(s) par email 📧`, 'var(--green)');
    }
  }
}

/* ── PAYMENT ── */
async function openPayment(commId) {
  const comms=await dbGetCommissions(); const c=comms.find(x=>x.id===commId); if(!c) return;
  const reste=c.amount_due-c.amount_paid;
  document.getElementById('payCommId').value=commId;
  document.getElementById('paymentSub').textContent=`${c.seller_name} · ${c.period_label}`;
  const row=(k,v)=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:.76rem"><span style="color:var(--t2)">${k}</span><span style="font-weight:500">${v}</span></div>`;
  document.getElementById('paymentInfo').innerHTML=row('CA réalisé',`${c.revenue.toLocaleString()} FCFA`)+row(`Commission (${c.rate}%)`,`${c.amount_due.toLocaleString()} FCFA`)+row('Déjà reçu',`<span style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</span>`)+row('Reste à payer',`<span style="color:var(--red);font-weight:600">${reste.toLocaleString()} FCFA</span>`);
  document.getElementById('payAmount').value=reste;
  document.getElementById('payNote').value='';
  openModal('paymentModal');
}

async function savePayment() {
  const id=parseInt(document.getElementById('payCommId').value);
  const amount=parseInt(document.getElementById('payAmount').value);
  const note=document.getElementById('payNote').value.trim();
  if (!amount||amount<1) { showToast('Montant invalide','','var(--red)'); return; }
  const comms=await dbGetCommissions(); const c=comms.find(x=>x.id===id); if(!c) return;
  const newPaid=c.amount_paid+amount, reste=c.amount_due-newPaid;
  const newStatus=reste<=0?'paid':newPaid>0?'partial':'pending';
  showLoader(true);
  await dbUpdateCommission(id,{ amount_paid:newPaid, status:newStatus, note:note||c.note, paid_at:newStatus==='paid'?new Date().toISOString():null });
  showLoader(false);
  closeModal('paymentModal');
  showToast('Paiement enregistré',`${amount.toLocaleString()} FCFA reçus`,'var(--green)');
  await renderDashboard();
  if (document.getElementById('page-commissions').classList.contains('active')) await renderCommissions();
}

/* ── SELLERS ── */
async function renderSellers() {
  showLoader(true);
  const f=document.getElementById('sellerStatusFilter').value;
  let [users,orders,comms] = await Promise.all([dbGetAllUsers(),dbGetOrders(),dbGetCommissions()]);
  showLoader(false);
  if (f==='active')  users=users.filter(u=>!u.isBlocked);
  if (f==='blocked') users=users.filter(u=>u.isBlocked);
  const grid=document.getElementById('sellersGrid');
  if (!users.length) { grid.innerHTML='<div class="table-empty">Aucun vendeur</div>'; return; }
  grid.innerHTML = users.map(u=>{
    const myO=orders.filter(o=>o.sellerId===u.id&&o.status==='done');
    const revenue=myO.reduce((s,o)=>s+o.total,0);
    const due=comms.filter(c=>c.seller_id===u.id&&c.status!=='paid').reduce((s,c)=>s+(c.amount_due-c.amount_paid),0);
    const period=u.billingPeriod||'monthly';
    return `<div class="seller-card ${u.isBlocked?'blocked':''}">
      <div class="seller-top">
        <div class="seller-av">${u.firstName[0].toUpperCase()}</div>
        <div>
          <div class="seller-name">${u.name}${u.isBlocked?`<span class="blocked-tag">Bloqué</span>`:''}</div>
          <div class="seller-email">${u.email}</div>
          <div class="period-tag period-${period}">${period==='monthly'?'Mensuel':'Hebdomadaire'}</div>
        </div>
      </div>
      <div class="seller-stats">
        <div class="seller-stat"><div class="seller-stat-val" style="color:var(--blue)">${myO.length}</div><div class="seller-stat-label">Commandes</div></div>
        <div class="seller-stat"><div class="seller-stat-val" style="color:var(--green)">${revenue.toLocaleString()}</div><div class="seller-stat-label">CA (FCFA)</div></div>
        <div class="seller-stat"><div class="seller-stat-val" style="color:${due>0?'var(--red)':'var(--green)'}">${due.toLocaleString()}</div><div class="seller-stat-label">Dû</div></div>
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:.66rem;color:var(--t3);display:block;margin-bottom:4px">Facturation</label>
        <select class="select-sm" style="width:100%" onchange="changeBilling(${u.id},this.value)">
          <option value="monthly" ${period==='monthly'?'selected':''}>Mensuel</option>
          <option value="weekly"  ${period==='weekly' ?'selected':''}>Hebdomadaire</option>
        </select>
      </div>
      <div class="seller-actions">
        ${!u.isBlocked
          ?`<button class="btn-ghost" style="font-size:.72rem;padding:6px;color:var(--red);border-color:rgba(239,68,68,.3)" onclick="openBlock(${u.id},'${u.name.replace(/'/g,"\\'")}',true)">Bloquer</button>`
          :`<button class="btn-ghost" style="font-size:.72rem;padding:6px;color:var(--green);border-color:rgba(34,197,94,.3)" onclick="openBlock(${u.id},'${u.name.replace(/'/g,"\\'")}',false)">Débloquer</button>`}
        <button class="btn-ghost" style="font-size:.72rem;padding:6px" onclick="viewSellerComm(${u.id})">Commissions</button>
      </div>
    </div>`;
  }).join('');
}

async function changeBilling(id, period) {
  await dbUpdateUserBilling(id, period);
  showToast('Période mise à jour', period==='monthly'?'Mensuel':'Hebdomadaire');
}

async function viewSellerComm(sellerId) {
  goPage('commissions');
  showLoader(true);
  const comms=await dbGetCommissions({ sellerId });
  showLoader(false);
  const tbody=document.getElementById('commissionsBody');
  if (!comms.length) { tbody.innerHTML=`<tr><td colspan="9" class="table-empty">Aucune commission pour ce vendeur</td></tr>`; return; }
  tbody.innerHTML=comms.map(c=>{
    const reste=c.amount_due-c.amount_paid;
    return `<tr><td style="font-weight:500">${c.seller_name}</td><td style="font-size:.72rem;color:var(--t2)">${c.period_label}</td><td>${c.revenue.toLocaleString()} FCFA</td><td>${c.rate}%</td><td style="font-weight:500">${c.amount_due.toLocaleString()} FCFA</td><td style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</td><td style="color:${reste>0?'var(--red)':'var(--green)'}; font-weight:500">${reste.toLocaleString()} FCFA</td><td><span class="status-badge comm-${c.status}" style="font-size:.65rem">${cLabel(c.status)}</span></td><td>${c.status!=='paid'?`<button class="icon-btn edit" onclick="openPayment(${c.id})">💳</button>`:'✓'}</td></tr>`;
  }).join('');
}

/* ── BLOCK ── */
function openBlock(id, name, block) {
  document.getElementById('blockSellerId').value=id;
  document.getElementById('blockAction').value=block?'block':'unblock';
  document.getElementById('blockTitle').textContent=block?`Bloquer ${name}`:`Débloquer ${name}`;
  document.getElementById('blockSub').textContent=block?'Sa boutique sera masquée et il ne pourra plus se connecter.':'Sa boutique redeviendra accessible immédiatement.';
  document.getElementById('blockReason').value='';
  openModal('blockModal');
}
async function confirmBlock() {
  const id=parseInt(document.getElementById('blockSellerId').value);
  const block=document.getElementById('blockAction').value==='block';
  const reason=document.getElementById('blockReason').value.trim();
  showLoader(true);
  const products=await dbGetProducts({ sellerId:id });
  await Promise.all(products.map(p=>dbUpdateProduct(p.id,{ available:!block })));
  await dbBlockUser(id, block, reason);
  showLoader(false);
  closeModal('blockModal');
  showToast(block?'Vendeur bloqué':'Vendeur débloqué', block?'Ses produits sont masqués':'Ses produits sont à nouveau visibles', block?'var(--red)':'var(--green)');
  await renderSellers();
}

/* ── NETWORK ── */
async function renderNetwork() {
  showLoader(true);
  const conns = await dbGetConnections();
  showLoader(false);

  // Table
  const tbody = document.getElementById('connectionsBody');
  tbody.innerHTML = conns.length
    ? conns.map(c=>`
        <tr>
          <td style="font-weight:500">${c.seller_a_name}</td>
          <td style="font-weight:500">${c.seller_b_name}</td>
          <td><span class="conn-badge">En contact</span></td>
          <td style="color:var(--t3);font-size:.74rem">${formatDate(c.last_contact)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="table-empty">Aucune conversation entre vendeurs pour l'instant</td></tr>`;

  // Canvas graph
  const canvas = document.getElementById('graphCanvas');
  if (!canvas || !conns.length) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 720;
  canvas.height = 320;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Build nodes
  const nodeMap = {};
  conns.forEach(c => {
    if (!nodeMap[c.seller_a_id]) nodeMap[c.seller_a_id] = { id:c.seller_a_id, name:c.seller_a_name };
    if (!nodeMap[c.seller_b_id]) nodeMap[c.seller_b_id] = { id:c.seller_b_id, name:c.seller_b_name };
  });
  const nodes = Object.values(nodeMap);
  const cx = canvas.width/2, cy = canvas.height/2;
  const r  = Math.min(cx, cy) - 55;
  nodes.forEach((n,i) => {
    const a = (2*Math.PI*i/nodes.length) - Math.PI/2;
    n.x = cx + r*Math.cos(a); n.y = cy + r*Math.sin(a);
  });

  // Edges — just show if they speak (simple line)
  conns.forEach(c => {
    const a = nodes.find(n=>n.id===c.seller_a_id);
    const b = nodes.find(n=>n.id===c.seller_b_id);
    if (!a||!b) return;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
    ctx.strokeStyle='rgba(34,197,94,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
  });

  // Nodes
  nodes.forEach(n => {
    ctx.beginPath(); ctx.arc(n.x,n.y,16,0,Math.PI*2);
    ctx.fillStyle='#161616'; ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ededed'; ctx.font='600 12px Geist,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(n.name[0].toUpperCase(), n.x, n.y);
    ctx.textBaseline='alphabetic';
    ctx.fillStyle='#6b6b6b'; ctx.font='11px Geist,sans-serif';
    ctx.fillText(n.name, n.x, n.y+28);
  });
}

/* ── ALL PRODUCTS ── */
async function renderAllProducts() {
  showLoader(true); const products=await dbGetProducts(); showLoader(false);
  const tbody=document.getElementById('allProductsBody');
  tbody.innerHTML=products.map(p=>`<tr><td><div class="prod-thumb">${p.photo?`<img src="${p.photo}" alt="">`:p.emoji}</div></td><td><div style="font-weight:500">${p.name}</div><div style="font-size:.7rem;color:var(--t2);margin-top:1px">${(p.desc||'').substring(0,50)}${(p.desc||'').length>50?'…':''}</div></td><td style="color:var(--t2)">${p.sellerName}</td><td><span class="badge badge-${p.cat}">${catLabel(p.cat)}</span></td><td style="font-weight:500">${p.price.toLocaleString()} FCFA</td><td>${p.votes?starsHtml(p.rating,'.74rem'):'—'}</td><td><span class="status-badge ${p.available?'status-done':'status-cancel'}" style="font-size:.65rem">${p.available?'Disponible':'Indispo'}</span></td></tr>`).join('')||`<tr><td colspan="7" class="table-empty">Aucun produit</td></tr>`;
}

/* ── ALL ORDERS ── */
async function renderAllOrders() {
  showLoader(true); const f=document.getElementById('allOrdersFilter').value; let orders=await dbGetOrders(); showLoader(false);
  if(f!=='all') orders=orders.filter(o=>o.status===f);
  const tbody=document.getElementById('allOrdersBody');
  tbody.innerHTML=orders.map(o=>`<tr><td style="color:var(--t3);font-size:.7rem">#${o.id}</td><td><span style="font-weight:500">${o.buyerName}</span><div style="font-size:.68rem;color:var(--t3)">${o.buyerEmail}</div></td><td>${o.productName}</td><td style="color:var(--t2)">${o.sellerName||'—'}</td><td style="font-weight:500">${o.total.toLocaleString()} FCFA</td><td><span class="status-badge status-${o.status}" style="font-size:.65rem">${statusLabel(o.status)}</span></td><td style="font-size:.72rem;color:var(--t3)">${formatDate(o.createdAt)}</td></tr>`).join('')||`<tr><td colspan="7" class="table-empty">Aucune commande</td></tr>`;
}

/* ── SETTINGS ── */
async function saveSettings() {
  const pass=document.getElementById('newAdminPass').value;
  if(pass&&pass.length<6){showToast('Trop court','Min. 6 caractères.','var(--red)');return;}
  if(pass){const hash=btoa(unescape(encodeURIComponent(pass)));await db.from('admins').update({password:hash}).eq('id',adminSession.id);document.getElementById('newAdminPass').value='';}
  showToast('Sauvegardé','','var(--green)');
}

/* ── HELPERS ── */
function cLabel(s){return s==='pending'?'En attente':s==='overdue'?'En retard':s==='partial'?'Partiel':'Payé';}
