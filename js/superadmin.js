/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — superadmin.js
   Panneau Super Admin : commissions, vendeurs, blocage
═══════════════════════════════════════════════════ */

const COMMISSION_RATE = 5; // %
let adminSession = null;

/* ════════════════════════════
   DB HELPERS (admin-specific)
════════════════════════════ */
async function dbAdminLogin(email, password) {
  const hash = btoa(unescape(encodeURIComponent(password)));
  const { data, error } = await db.from('admins').select('*').eq('email', email).eq('password', hash).maybeSingle();
  if (error || !data) return { error: 'Email ou mot de passe incorrect.' };
  return { admin: data };
}

async function dbGetAllUsers() {
  const { data } = await db.from('users').select('*').order('created_at', { ascending: false });
  return (data || []).map(normalizeUser);
}

async function dbGetCommissions(filters = {}) {
  let q = db.from('commissions').select('*').order('period_start', { ascending: false });
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.sellerId) q = q.eq('seller_id', filters.sellerId);
  const { data } = await q;
  return data || [];
}

async function dbInsertCommission(c) {
  const { data, error } = await db.from('commissions').insert(c).select().single();
  if (error) return { error: error.message };
  return { commission: data };
}

async function dbUpdateCommission(id, fields) {
  const { data, error } = await db.from('commissions').update(fields).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { commission: data };
}

async function dbBlockUser(userId, block, reason) {
  const { error } = await db.from('users').update({ is_blocked: block, blocked_reason: reason || null }).eq('id', userId);
  return error ? { error: error.message } : { ok: true };
}

async function dbUpdateUserBilling(userId, period) {
  const { error } = await db.from('users').update({ billing_period: period }).eq('id', userId);
  return error ? { error: error.message } : { ok: true };
}

/* ════════════════════════════
   INIT
════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  adminSession = JSON.parse(sessionStorage.getItem('glar_admin') || 'null');

  if (adminSession) {
    showApp();
  } else {
    document.getElementById('loginScreen').style.display = '';
    showLoader(false);
  }

  document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
  document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
  bindNav();
  bindFilters();
  bindGenerate();
  bindPaymentModal();
  bindBlockModal();
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

  // Date actuelle
  document.getElementById('dashDate').textContent =
    new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Dates par défaut pour génération
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dueDay   = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  document.getElementById('genStart').value = firstDay.toISOString().split('T')[0];
  document.getElementById('genEnd').value   = lastDay.toISOString().split('T')[0];
  document.getElementById('genDue').value   = dueDay.toISOString().split('T')[0];
});

async function handleAdminLogin() {
  const email = document.getElementById('aEmail').value.trim();
  const pass  = document.getElementById('aPass').value;
  if (!email || !pass) { showToast('Champs manquants', '', 'var(--red)'); return; }
  showLoader(true);
  const result = await dbAdminLogin(email, pass);
  showLoader(false);
  if (result.error) { showToast('Erreur', result.error, 'var(--red)'); return; }
  sessionStorage.setItem('glar_admin', JSON.stringify(result.admin));
  adminSession = result.admin;
  showApp();
}

function handleAdminLogout() {
  sessionStorage.removeItem('glar_admin');
  window.location.reload();
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = '';
  document.getElementById('adminName').textContent     = adminSession.name || 'Admin';
  showLoader(false);
  renderDashboard();
}

/* ════════════════════════════
   NAVIGATION
════════════════════════════ */
function bindNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => goPage(btn.dataset.page));
  });
}

async function goPage(name) {
  document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'dashboard')   await renderDashboard();
  if (name === 'commissions') await renderCommissions();
  if (name === 'sellers')     await renderSellers();
  if (name === 'products')    await renderAllProducts();
  if (name === 'orders')      await renderAllOrders();
}

/* ════════════════════════════
   DASHBOARD
════════════════════════════ */
async function renderDashboard() {
  showLoader(true);
  const [users, products, orders, commissions] = await Promise.all([
    dbGetAllUsers(),
    dbGetProducts(),
    dbGetOrders(),
    dbGetCommissions(),
  ]);
  showLoader(false);

  const totalRevenue    = orders.filter(o => o.status === 'done').reduce((s, o) => s + o.total, 0);
  const totalDue        = commissions.filter(c => c.status !== 'paid').reduce((s, c) => s + (c.amount_due - c.amount_paid), 0);
  const totalCollected  = commissions.filter(c => c.status === 'paid' || c.status === 'partial').reduce((s, c) => s + c.amount_paid, 0);
  const overdueCount    = commissions.filter(c => c.status === 'overdue').length;
  const blockedCount    = users.filter(u => u.isBlocked).length;

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card c-accent"><div class="stat-value">${users.length}</div><div class="stat-label">Vendeurs inscrits</div></div>
    <div class="stat-card c-green"><div class="stat-value">${totalRevenue.toLocaleString()}</div><div class="stat-label">CA global (FCFA)</div></div>
    <div class="stat-card c-orange"><div class="stat-value">${totalDue.toLocaleString()}</div><div class="stat-label">Commissions dues</div></div>
    <div class="stat-card c-yellow"><div class="stat-value">${totalCollected.toLocaleString()}</div><div class="stat-label">Commissions perçues</div></div>
    <div class="stat-card c-red"><div class="stat-value">${overdueCount}</div><div class="stat-label">Paiements en retard</div></div>
    <div class="stat-card"><div class="stat-value" style="color:var(--red)">${blockedCount}</div><div class="stat-label">Comptes bloqués</div></div>
  `;

  // Alertes retards
  const overdueComms = commissions.filter(c => c.status === 'overdue');
  const alertSection = document.getElementById('alertSection');
  if (overdueComms.length) {
    alertSection.style.display = '';
    document.getElementById('alertList').innerHTML = overdueComms.map(c => `
      <div class="alert-row">
        <div>
          <span class="alert-name">${c.seller_name}</span>
          <span style="color:var(--text2);font-size:0.78rem;margin-left:8px">${c.period_label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="alert-amount">${(c.amount_due - c.amount_paid).toLocaleString()} FCFA dus</span>
          <button class="btn-danger" style="font-size:0.75rem;padding:5px 10px" onclick="openPayment(${c.id})">Enregistrer paiement</button>
        </div>
      </div>
    `).join('');
  } else {
    alertSection.style.display = 'none';
  }

  // Commissions en attente (5 dernières)
  const pending = commissions.filter(c => c.status !== 'paid').slice(0, 5);
  const tbody = document.getElementById('dashCommissions');
  tbody.innerHTML = pending.length
    ? pending.map(c => `
        <tr>
          <td><strong>${c.seller_name}</strong></td>
          <td style="font-size:0.78rem;color:var(--text2)">${c.period_label}</td>
          <td>${c.revenue.toLocaleString()} FCFA</td>
          <td style="font-weight:700;color:var(--orange)">${c.amount_due.toLocaleString()} FCFA</td>
          <td><span class="status-badge comm-${c.status}">${commStatusLabel(c.status)}</span></td>
          <td><button class="icon-btn edit" onclick="openPayment(${c.id})" title="Enregistrer paiement">💳</button></td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="table-empty">Aucune commission en attente ✅</td></tr>`;
}

/* ════════════════════════════
   COMMISSIONS
════════════════════════════ */
function bindFilters() {
  document.getElementById('commStatusFilter').addEventListener('change', renderCommissions);
  document.getElementById('commPeriodFilter').addEventListener('change', renderCommissions);
  document.getElementById('sellerStatusFilter').addEventListener('change', renderSellers);
  document.getElementById('allOrdersFilter').addEventListener('change', renderAllOrders);
}

async function renderCommissions() {
  showLoader(true);
  const statusF = document.getElementById('commStatusFilter').value;
  const periodF = document.getElementById('commPeriodFilter').value;
  let comms = await dbGetCommissions({ status: statusF });
  if (periodF !== 'all') comms = comms.filter(c => c.period_type === periodF);
  showLoader(false);

  const tbody = document.getElementById('commissionsBody');
  if (!comms.length) { tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Aucune commission trouvée</td></tr>`; return; }

  tbody.innerHTML = comms.map(c => {
    const reste = c.amount_due - c.amount_paid;
    const pct   = c.amount_due > 0 ? Math.min(100, Math.round(c.amount_paid / c.amount_due * 100)) : 0;
    return `
      <tr>
        <td><strong>${c.seller_name}</strong></td>
        <td style="font-size:0.78rem;color:var(--text2)">${c.period_label}</td>
        <td>${c.revenue.toLocaleString()} FCFA</td>
        <td>${c.rate}%</td>
        <td style="font-weight:700">${c.amount_due.toLocaleString()} FCFA</td>
        <td style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</td>
        <td style="color:${reste > 0 ? 'var(--red)' : 'var(--green)'}; font-weight:600">${reste.toLocaleString()} FCFA</td>
        <td>
          <span class="status-badge comm-${c.status}">${commStatusLabel(c.status)}</span>
          ${c.amount_due > 0 ? `
            <div class="progress-wrap">
              <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:${pct===100?'var(--green)':'var(--accent)'}"></div></div>
              <div class="progress-label"><span>${pct}% payé</span></div>
            </div>` : ''}
        </td>
        <td>
          <div class="td-actions">
            ${c.status !== 'paid' ? `<button class="icon-btn edit" onclick="openPayment(${c.id})" title="Enregistrer paiement">💳</button>` : ''}
            ${c.status === 'paid' ? `<span style="color:var(--green);font-size:0.8rem">✅ Soldé</span>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ════════════════════════════
   GÉNÉRER FACTURES
════════════════════════════ */
function bindGenerate() {
  document.getElementById('previewBtn').addEventListener('click', previewGenerate);
  document.getElementById('generateBtn').addEventListener('click', doGenerate);
}

async function previewGenerate() {
  const start = document.getElementById('genStart').value;
  const end   = document.getElementById('genEnd').value;
  const rate  = parseFloat(document.getElementById('genRate').value) || 5;
  const type  = document.getElementById('genType').value;

  if (!start || !end) { showToast('Dates manquantes', '', 'var(--red)'); return; }

  showLoader(true);
  const users  = await dbGetAllUsers();
  const orders = await dbGetOrders();
  showLoader(false);

  // Filtrer les vendeurs (pas les bloqués) et calculer leur CA sur la période
  const preview = [];
  for (const u of users) {
    if (u.billing_period && u.billing_period !== type && type !== 'all') continue;
    const myOrders = orders.filter(o =>
      o.sellerId === u.id &&
      o.status === 'done' &&
      o.createdAt >= start &&
      o.createdAt <= end
    );
    const revenue = myOrders.reduce((s, o) => s + o.total, 0);
    if (revenue > 0) {
      preview.push({
        sellerId:   u.id,
        sellerName: u.name,
        revenue,
        amountDue:  Math.round(revenue * rate / 100),
        rate,
      });
    }
  }

  const tbody = document.getElementById('genPreviewBody');
  const periodLabel = type === 'monthly'
    ? new Date(start).toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
    : `${start} → ${end}`;

  if (!preview.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Aucun vendeur avec des ventes sur cette période</td></tr>`;
    document.getElementById('genPreview').style.display = '';
    document.getElementById('generateBtn').disabled = true;
    return;
  }

  tbody.innerHTML = preview.map(p => `
    <tr>
      <td><strong>${p.sellerName}</strong></td>
      <td style="font-size:0.78rem;color:var(--text2)">${periodLabel}</td>
      <td>${p.revenue.toLocaleString()} FCFA</td>
      <td style="font-weight:700;color:var(--orange)">${p.amountDue.toLocaleString()} FCFA</td>
    </tr>
  `).join('');

  const totalDue = preview.reduce((s, p) => s + p.amountDue, 0);
  document.getElementById('genTotal').innerHTML = `
    <span>${preview.length} vendeur(s) · Période : <strong>${periodLabel}</strong></span>
    <span>Total à collecter : <strong>${totalDue.toLocaleString()} FCFA</strong></span>
  `;

  document.getElementById('genPreview').style.display = '';
  document.getElementById('generateBtn').disabled = false;
  // Stocker preview pour génération
  document.getElementById('generateBtn').dataset.preview = JSON.stringify(preview);
  document.getElementById('generateBtn').dataset.start   = start;
  document.getElementById('generateBtn').dataset.end     = end;
  document.getElementById('generateBtn').dataset.due     = document.getElementById('genDue').value;
  document.getElementById('generateBtn').dataset.type    = type;
  document.getElementById('generateBtn').dataset.label   = periodLabel;
}

async function doGenerate() {
  const btn     = document.getElementById('generateBtn');
  const preview = JSON.parse(btn.dataset.preview || '[]');
  const start   = btn.dataset.start;
  const end     = btn.dataset.end;
  const due     = btn.dataset.due;
  const type    = btn.dataset.type;
  const label   = btn.dataset.label;

  if (!preview.length) return;

  showLoader(true);
  let created = 0;
  for (const p of preview) {
    await dbInsertCommission({
      seller_id:    p.sellerId,
      seller_name:  p.sellerName,
      period_label: label,
      period_type:  type,
      period_start: start,
      period_end:   end,
      revenue:      p.revenue,
      rate:         p.rate,
      amount_due:   p.amountDue,
      amount_paid:  0,
      status:       'pending',
      due_date:     due || null,
    });
    created++;
  }
  showLoader(false);

  const totalDue = preview.reduce((s, p) => s + p.amountDue, 0);
  document.getElementById('genSuccessText').innerHTML =
    `${created} factures générées · Total à collecter : <strong>${totalDue.toLocaleString()} FCFA</strong>`;
  document.getElementById('genSuccess').classList.add('show');
  btn.disabled = true;
  showToast('Factures générées !', `${created} vendeurs facturés`, 'var(--green)');
}

/* ════════════════════════════
   PAIEMENT MODAL
════════════════════════════ */
function bindPaymentModal() {
  document.getElementById('savePaymentBtn').addEventListener('click', savePayment);
}

async function openPayment(commId) {
  const comms = await dbGetCommissions();
  const c = comms.find(x => x.id === commId);
  if (!c) return;

  const reste = c.amount_due - c.amount_paid;
  document.getElementById('payCommId').value   = commId;
  document.getElementById('paymentSub').textContent = `${c.seller_name} · ${c.period_label}`;
  document.getElementById('paymentInfo').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text2)">CA réalisé</span><strong>${c.revenue.toLocaleString()} FCFA</strong></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text2)">Commission due (${c.rate}%)</span><strong>${c.amount_due.toLocaleString()} FCFA</strong></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text2)">Déjà reçu</span><strong style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</strong></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:6px"><span style="color:var(--text2)">Reste à payer</span><strong style="color:var(--red)">${reste.toLocaleString()} FCFA</strong></div>
    </div>
  `;
  document.getElementById('payAmount').value = reste;
  document.getElementById('payNote').value   = '';
  openModal('paymentModal');
}

async function savePayment() {
  const commId = parseInt(document.getElementById('payCommId').value);
  const amount = parseInt(document.getElementById('payAmount').value);
  const note   = document.getElementById('payNote').value.trim();

  if (!amount || amount < 1) { showToast('Montant invalide', '', 'var(--red)'); return; }

  const comms = await dbGetCommissions();
  const c = comms.find(x => x.id === commId);
  if (!c) return;

  const newPaid = c.amount_paid + amount;
  const reste   = c.amount_due - newPaid;
  let newStatus = reste <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

  showLoader(true);
  await dbUpdateCommission(commId, {
    amount_paid: newPaid,
    status:      newStatus,
    note:        note || c.note,
    paid_at:     newStatus === 'paid' ? new Date().toISOString() : null,
  });
  showLoader(false);

  closeModal('paymentModal');
  showToast('Paiement enregistré', `${amount.toLocaleString()} FCFA reçus ✅`, 'var(--green)');
  await renderDashboard();
  if (document.getElementById('page-commissions').classList.contains('active')) await renderCommissions();
}

/* ════════════════════════════
   SELLERS
════════════════════════════ */
async function renderSellers() {
  showLoader(true);
  const filter   = document.getElementById('sellerStatusFilter').value;
  const users    = await dbGetAllUsers();
  const orders   = await dbGetOrders();
  const comms    = await dbGetCommissions();
  showLoader(false);

  let list = users;
  if (filter === 'active')  list = users.filter(u => !u.isBlocked);
  if (filter === 'blocked') list = users.filter(u => u.isBlocked);

  const grid = document.getElementById('sellersGrid');
  if (!list.length) { grid.innerHTML = '<div class="table-empty">Aucun vendeur trouvé</div>'; return; }

  grid.innerHTML = list.map(u => {
    const myOrders  = orders.filter(o => o.sellerId === u.id && o.status === 'done');
    const revenue   = myOrders.reduce((s, o) => s + o.total, 0);
    const myComms   = comms.filter(c => c.seller_id === u.id);
    const totalDue  = myComms.filter(c => c.status !== 'paid').reduce((s, c) => s + (c.amount_due - c.amount_paid), 0);
    const period    = u.billingPeriod || 'monthly';

    return `
      <div class="seller-card ${u.isBlocked ? 'blocked' : ''}">
        <div class="seller-top">
          <div class="seller-avatar">${u.firstName[0].toUpperCase()}</div>
          <div>
            <div class="seller-name">
              ${u.name}
              ${u.isBlocked ? `<span class="blocked-badge">🚫 Bloqué</span>` : ''}
            </div>
            <div class="seller-email">${u.email}</div>
            <div class="seller-period">
              <span class="period-badge period-${period}">${period === 'monthly' ? '📅 Mensuel' : '📆 Hebdo'}</span>
            </div>
          </div>
        </div>
        <div class="seller-stats">
          <div class="seller-stat">
            <div class="seller-stat-val" style="color:var(--accent)">${myOrders.length}</div>
            <div class="seller-stat-label">Commandes</div>
          </div>
          <div class="seller-stat">
            <div class="seller-stat-val" style="color:var(--green)">${revenue.toLocaleString()}</div>
            <div class="seller-stat-label">CA (FCFA)</div>
          </div>
          <div class="seller-stat">
            <div class="seller-stat-val" style="color:${totalDue > 0 ? 'var(--red)' : 'var(--green)'}">${totalDue.toLocaleString()}</div>
            <div class="seller-stat-label">Dû (FCFA)</div>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:0.72rem;color:var(--text3);display:block;margin-bottom:5px">Période de facturation</label>
          <select class="select-sm" style="width:100%;font-size:0.78rem" onchange="changeBilling(${u.id}, this.value)">
            <option value="monthly" ${period==='monthly'?'selected':''}>📅 Mensuel</option>
            <option value="weekly"  ${period==='weekly' ?'selected':''}>📆 Hebdomadaire</option>
          </select>
        </div>
        <div class="seller-actions">
          ${!u.isBlocked
            ? `<button class="btn-primary" style="background:var(--red-bg);color:var(--red);border:1px solid var(--red);font-size:0.78rem;padding:8px" onclick="openBlock(${u.id},'${u.name}',true)">🚫 Bloquer</button>`
            : `<button class="btn-primary" style="background:var(--green-bg);color:var(--green);border:1px solid var(--green);font-size:0.78rem;padding:8px" onclick="openBlock(${u.id},'${u.name}',false)">✅ Débloquer</button>`
          }
          <button class="btn-ghost" style="font-size:0.78rem;padding:8px" onclick="viewSellerCommissions(${u.id})">💰 Commissions</button>
        </div>
      </div>
    `;
  }).join('');
}

async function changeBilling(userId, period) {
  await dbUpdateUserBilling(userId, period);
  showToast('Période mise à jour', period === 'monthly' ? 'Facturation mensuelle' : 'Facturation hebdomadaire', 'var(--accent)');
}

async function viewSellerCommissions(sellerId) {
  goPage('commissions');
  // Filtrer sur ce vendeur (simplification : on filtre côté rendu)
  showLoader(true);
  const comms = await dbGetCommissions({ sellerId });
  showLoader(false);
  const tbody = document.getElementById('commissionsBody');
  if (!comms.length) { tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Aucune commission pour ce vendeur</td></tr>`; return; }
  // Re-render avec filtre vendeur
  document.getElementById('commissionsBody').innerHTML = comms.map(c => {
    const reste = c.amount_due - c.amount_paid;
    const pct   = c.amount_due > 0 ? Math.min(100, Math.round(c.amount_paid / c.amount_due * 100)) : 0;
    return `
      <tr>
        <td><strong>${c.seller_name}</strong></td>
        <td style="font-size:0.78rem;color:var(--text2)">${c.period_label}</td>
        <td>${c.revenue.toLocaleString()} FCFA</td>
        <td>${c.rate}%</td>
        <td style="font-weight:700">${c.amount_due.toLocaleString()} FCFA</td>
        <td style="color:var(--green)">${c.amount_paid.toLocaleString()} FCFA</td>
        <td style="color:${reste>0?'var(--red)':'var(--green)'};font-weight:600">${reste.toLocaleString()} FCFA</td>
        <td><span class="status-badge comm-${c.status}">${commStatusLabel(c.status)}</span></td>
        <td>${c.status !== 'paid' ? `<button class="icon-btn edit" onclick="openPayment(${c.id})">💳</button>` : '✅'}</td>
      </tr>`;
  }).join('');
}

/* ════════════════════════════
   BLOCK MODAL
════════════════════════════ */
function bindBlockModal() {
  document.getElementById('confirmBlockBtn').addEventListener('click', confirmBlock);
}

function openBlock(userId, name, block) {
  document.getElementById('blockSellerId').value = userId;
  document.getElementById('blockAction').value   = block ? 'block' : 'unblock';
  document.getElementById('blockTitle').textContent = block ? `Bloquer ${name}` : `Débloquer ${name}`;
  document.getElementById('blockSub').textContent   = block
    ? 'Sa boutique sera masquée et il ne pourra plus vendre.'
    : 'Sa boutique redeviendra visible immédiatement.';
  document.getElementById('blockReason').value = '';
  openModal('blockModal');
}

async function confirmBlock() {
  const userId = parseInt(document.getElementById('blockSellerId').value);
  const action = document.getElementById('blockAction').value;
  const reason = document.getElementById('blockReason').value.trim();
  const block  = action === 'block';

  showLoader(true);
  // Bloquer aussi tous ses produits
  const products = await dbGetProducts({ sellerId: userId });
  await Promise.all(products.map(p => dbUpdateProduct(p.id, { available: !block })));
  await dbBlockUser(userId, block, reason);
  showLoader(false);

  closeModal('blockModal');
  showToast(block ? 'Vendeur bloqué 🚫' : 'Vendeur débloqué ✅', block ? 'Ses produits sont masqués' : 'Ses produits sont visibles', block ? 'var(--red)' : 'var(--green)');
  await renderSellers();
}

/* ════════════════════════════
   ALL PRODUCTS
════════════════════════════ */
async function renderAllProducts() {
  showLoader(true);
  const products = await dbGetProducts();
  showLoader(false);
  const tbody = document.getElementById('allProductsBody');
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><div class="prod-thumb">${p.photo?`<img src="${p.photo}" alt="">`:p.emoji}</div></td>
      <td><div style="font-weight:600">${p.name}</div><div style="font-size:0.74rem;color:var(--text2)">${(p.desc||'').substring(0,50)}${(p.desc||'').length>50?'…':''}</div></td>
      <td>${p.sellerName}</td>
      <td><span class="badge badge-${p.cat}">${catLabel(p.cat)}</span></td>
      <td style="font-weight:700">${p.price.toLocaleString()} FCFA</td>
      <td>${p.votes?starsHtml(p.rating,'0.8rem'):'—'}</td>
      <td><span class="status-badge ${p.available?'status-done':'status-cancel'}">${p.available?'✅ Dispo':'❌ Indispo'}</span></td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="table-empty">Aucun produit</td></tr>`;
}

/* ════════════════════════════
   ALL ORDERS
════════════════════════════ */
async function renderAllOrders() {
  showLoader(true);
  const filter = document.getElementById('allOrdersFilter').value;
  let orders = await dbGetOrders();
  if (filter !== 'all') orders = orders.filter(o => o.status === filter);
  showLoader(false);

  const tbody = document.getElementById('allOrdersBody');
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="color:var(--text3);font-size:0.76rem">#${o.id}</td>
      <td><strong>${o.buyerName}</strong><div style="font-size:0.72rem;color:var(--text3)">${o.buyerEmail}</div></td>
      <td>${o.productName}</td>
      <td style="color:var(--text2)">${o.sellerName || '—'}</td>
      <td style="font-weight:700">${o.total.toLocaleString()} FCFA</td>
      <td><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></td>
      <td style="font-size:0.78rem;color:var(--text3)">${formatDate(o.createdAt)}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="table-empty">Aucune commande</td></tr>`;
}

/* ════════════════════════════
   SETTINGS
════════════════════════════ */
async function saveSettings() {
  const pass = document.getElementById('newAdminPass').value;
  if (pass && pass.length < 6) { showToast('Mot de passe trop court', 'Min. 6 caractères.', 'var(--red)'); return; }
  if (pass) {
    const hash = btoa(unescape(encodeURIComponent(pass)));
    await db.from('admins').update({ password: hash }).eq('id', adminSession.id);
    document.getElementById('newAdminPass').value = '';
  }
  showToast('Paramètres sauvegardés', '', 'var(--green)');
}

/* ════════════════════════════
   HELPERS
════════════════════════════ */
function commStatusLabel(s) {
  return s==='pending'?'⏳ En attente':s==='overdue'?'🔴 En retard':s==='partial'?'🟡 Partiel':'✅ Payé';
}

// normalizeUser étendu pour is_blocked et billing_period
const _origNorm = normalizeUser;
function normalizeUser(r) {
  const u = _origNorm ? _origNorm(r) : { id:r.id, firstName:r.first_name, lastName:r.last_name, name:r.name, email:r.email, phone:r.phone, bio:r.bio, shopOpen:r.shop_open, createdAt:r.created_at };
  u.isBlocked     = r.is_blocked     || false;
  u.blockedReason = r.blocked_reason || '';
  u.billingPeriod = r.billing_period || 'monthly';
  return u;
}
