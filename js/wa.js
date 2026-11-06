/* ═══════════════════════════════════════════════════
   N MARKET — wa.js
   Boîte WhatsApp (vendeur + super admin) : conversations avec les clients,
   contexte de commande (code de reçu, position), réponse depuis la plateforme.
   Lecture : table wa_messages (RLS : chaque vendeur ne voit que ses clients).
   Envoi   : Edge Function « wa-send » (le jeton Meta reste côté serveur).
═══════════════════════════════════════════════════ */

const WA = { isAdmin: false, msgs: [], orders: [], current: null, sub: null, inited: false, notifOn: true };

function waNorm(p) {
  const d = String(p || '').replace(/\D/g, ''); const cc = (typeof WHATSAPP_DEFAULT_CC !== 'undefined' ? WHATSAPP_DEFAULT_CC : '221');
  if (!d) return ''; if (d.startsWith('00')) return d.slice(2); if (d.length <= 9) return cc + d.replace(/^0+/, ''); return d;
}
function waSeenKey(phone) { return 'nm_wa_seen_' + phone; }
function waGetSeen(phone) { try { return Number(localStorage.getItem(waSeenKey(phone))) || 0; } catch (e) { return 0; } }
function waSetSeen(phone, t) { try { localStorage.setItem(waSeenKey(phone), String(t)); } catch (e) {} }

function waThreads() {
  const map = new Map();
  for (const m of WA.msgs) {                                   // WA.msgs : du plus récent au plus ancien
    if (!map.has(m.buyer_phone)) map.set(m.buyer_phone, { phone: m.buyer_phone, name: '', last: m, msgs: [], unread: 0 });
    const t = map.get(m.buyer_phone); t.msgs.push(m);
    if (!t.name && m.buyer_name) t.name = m.buyer_name;
  }
  for (const t of map.values()) {
    const seen = waGetSeen(t.phone);
    t.unread = t.msgs.filter(m => m.direction === 'in' && new Date(m.created_at).getTime() > seen).length;
    t.msgs.reverse();
  }
  return [...map.values()].sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
}
function waWindowOpen(t) {
  const lastIn = [...t.msgs].reverse().find(m => m.direction === 'in');
  return !!lastIn && Date.now() - new Date(lastIn.created_at).getTime() < 24 * 3600 * 1000;
}
function waTime(iso) {
  const d = new Date(iso), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
const WA_STATUS_ICON = { queued: '🕓', sent: '✓', delivered: '✓✓', read: '✓✓', received: '', failed: '⚠' };

async function mountWhatsApp(isAdmin) {
  WA.isAdmin = !!isAdmin;
  const root = document.getElementById('page-whatsapp'); if (!root) return;
  if (typeof WHATSAPP_ENABLED === 'undefined' || !WHATSAPP_ENABLED) {
    root.innerHTML = `<div class="page-header"><div><div class="page-title">WhatsApp</div><div class="page-desc">Conversations avec tes clients</div></div></div>
      <div class="wa-setup"><strong>WhatsApp n'est pas encore activé sur la plateforme.</strong><p>L'administrateur doit déployer les fonctions Meta puis passer <code>WHATSAPP_ENABLED</code> à <code>true</code> dans <code>js/config.js</code> (voir WHATSAPP_MAPS_LISEZMOI.md).</p></div>`;
    return;
  }
  if (!WA.inited) {
    root.innerHTML = `
      <div class="page-header"><div><div class="page-title">WhatsApp</div><div class="page-desc">${isAdmin ? 'Toutes les conversations clients' : 'Tes conversations avec tes clients — reçus, suivi et questions'}</div></div>
        ${isAdmin ? '' : `<label class="check-row" style="margin:0"><input type="checkbox" id="waNotifToggle"><span>Recevoir mes nouvelles commandes sur WhatsApp</span></label>`}</div>
      <div class="chat-wrap wa-wrap">
        <div class="chat-sidebar"><div class="chat-sidebar-hd">Clients</div><div class="chat-rooms" id="waThreads"></div></div>
        <div class="chat-main">
          <div class="chat-header"><div class="chat-header-info"><div class="chat-header-name" id="waHeadName">Sélectionne une conversation</div><div class="chat-header-sub" id="waHeadSub"></div></div><a class="btn-ghost" id="waOpenApp" style="display:none;font-size:.72rem" target="_blank" rel="noopener noreferrer">Ouvrir dans WhatsApp ↗</a></div>
          <div class="wa-ctx" id="waCtx" style="display:none"></div>
          <div class="chat-messages" id="waMessages"><div class="chat-empty"><span>💬</span><span>Sélectionne une conversation</span></div></div>
          <div class="wa-closed" id="waClosed" style="display:none">⏳ Le client n'a pas écrit depuis plus de 24 h : WhatsApp n'autorise pas de message libre. Attends sa réponse ou appelle-le.</div>
          <div class="chat-input-area" id="waCompose">
            <textarea class="chat-input" id="waInput" placeholder="Écrire au client… (Entrée pour envoyer)" rows="1" maxlength="1500"></textarea>
            <button class="chat-send" id="waSendBtn">↑</button>
          </div>
        </div>
      </div>`;
    document.getElementById('waSendBtn').addEventListener('click', waSend);
    const inp = document.getElementById('waInput');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waSend(); } });
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 100) + 'px'; });
    const tg = document.getElementById('waNotifToggle');
    if (tg) {
      const { data } = await db.from('users').select('wa_notifications').maybeSingle();
      tg.checked = !data || data.wa_notifications !== false;
      tg.addEventListener('change', async () => {
        const { error } = await db.rpc('fn_set_wa_notifications', { p_on: tg.checked });
        if (error) { tg.checked = !tg.checked; showToast('Erreur', error.message, 'var(--red)'); }
        else showToast(tg.checked ? 'Notifications activées' : 'Notifications coupées', tg.checked ? 'Tu recevras tes commandes sur WhatsApp.' : '', 'var(--green)');
      });
    }
    WA.sub = db.channel('wa-live').on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, () => {
      clearTimeout(waReload._t); waReload._t = setTimeout(waReload, 250);
    }).subscribe();
    WA.inited = true;
  }
  await waReload();
}

async function waReload() {
  const [{ data: msgs }, orders] = await Promise.all([
    db.from('wa_messages').select('*').eq('peer', 'buyer').order('created_at', { ascending: false }).limit(800),
    dbGetOrders({}),
  ]);
  WA.msgs = (msgs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); WA.orders = orders || [];
  renderWaThreads();
  if (WA.current) renderWaThread(WA.current, false);
  waUpdateDot();
}
function waUpdateDot() {
  const n = waThreads().reduce((a, t) => a + t.unread, 0);
  document.querySelectorAll('.wa-dot').forEach(d => { d.style.display = n ? '' : 'none'; });
}

function renderWaThreads() {
  const el = document.getElementById('waThreads'); if (!el) return;
  const ths = waThreads();
  if (!ths.length) { el.innerHTML = `<div class="chat-empty" style="padding:24px"><span>💬</span><span>Aucune conversation</span><span style="font-size:.7rem;color:var(--t4)">Elles apparaissent quand un client reçoit ou envoie un message.</span></div>`; return; }
  el.innerHTML = ths.map(t => `
    <div class="chat-room ${WA.current === t.phone ? 'active' : ''}" data-phone="${esc(t.phone)}">
      <div class="chat-room-av">${esc((t.name || '#')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="chat-room-name">${esc(t.name || '+' + t.phone)}${t.unread ? ` <span class="wa-badge">${t.unread}</span>` : ''}</div>
        <div class="chat-room-last">${esc((t.last.direction === 'out' ? 'Toi : ' : '') + (t.last.body || '').slice(0, 40))}</div>
      </div>
      <div style="font-size:.62rem;color:var(--t3)">${esc(waTime(t.last.created_at))}</div>
    </div>`).join('');
  el.querySelectorAll('.chat-room[data-phone]').forEach(d => d.addEventListener('click', () => renderWaThread(d.dataset.phone, true)));
}

function renderWaThread(phone, scroll) {
  WA.current = phone;
  const t = waThreads().find(x => x.phone === phone); if (!t) return;
  waSetSeen(phone, Date.now()); t.unread = 0; renderWaThreads(); waUpdateDot();

  document.getElementById('waHeadName').textContent = t.name || '+' + phone;
  document.getElementById('waHeadSub').textContent = '+' + phone;
  const app = document.getElementById('waOpenApp'); app.href = 'https://wa.me/' + encodeURIComponent(phone); app.style.display = '';

  // Contexte : commandes de ce client
  const orders = WA.orders.filter(o => waNorm(o.buyerPhone) === phone).slice(0, 4);
  const ctx = document.getElementById('waCtx');
  ctx.style.display = orders.length ? '' : 'none';
  ctx.innerHTML = orders.map(o => `<div class="wa-ord"><span>#${Number(o.id)} · ${esc(o.productName)} ×${Number(o.qty)} · ${Number(o.total).toLocaleString()} FCFA</span>
      <span class="status-badge status-${esc(o.status)}" style="font-size:.62rem">${esc(statusLabel(o.status))}</span>
      ${o.receiptCode ? `<span class="receipt-code">🔑 ${esc(o.receiptCode)}</span>` : ''}
      ${o.deliveryType === 'external' && o.deliveryLat ? `<a href="${gmapsDirUrl(o.deliveryLat, o.deliveryLng)}" target="_blank" rel="noopener noreferrer">🧭 Itinéraire</a>` : ''}</div>`).join('');

  const box = document.getElementById('waMessages');
  box.innerHTML = t.msgs.map(m => `
    <div class="msg-wrap ${m.direction === 'out' ? 'mine' : ''}"><div>
      <div class="msg-bubble${m.status === 'failed' ? ' wa-failed' : ''}">${esc(m.body).replace(/\n/g, '<br>')}
        <div class="msg-time">${esc(waTime(m.created_at))} ${m.direction === 'out' ? `<span class="wa-tick wa-${esc(m.status)}" title="${esc(m.error || m.status)}">${WA_STATUS_ICON[m.status] || ''}</span>` : ''}</div>
      </div></div></div>`).join('');
  box.scrollTop = box.scrollHeight;

  const open = waWindowOpen(t);
  document.getElementById('waClosed').style.display = open ? 'none' : '';
  document.getElementById('waCompose').style.display = open ? '' : 'none';
}

async function waSend() {
  const input = document.getElementById('waInput'); const text = input.value.trim();
  if (!text || !WA.current) return;
  const btn = document.getElementById('waSendBtn'); btn.disabled = true;
  try {
    const { data: { session } } = await db.auth.getSession();
    const r = await fetch(SUPABASE_URL + '/functions/v1/wa-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : ''), apikey: SUPABASE_KEY },
      body: JSON.stringify({ phone: WA.current, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { showToast('Message non envoyé', j.message || j.error || 'Erreur ' + r.status, 'var(--red)'); }
    else { input.value = ''; input.style.height = 'auto'; await waReload(); }
  } catch (e) { showToast('Message non envoyé', 'Connexion impossible.', 'var(--red)'); }
  btn.disabled = false; input.focus();
}
