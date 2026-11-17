/* ═══════════════════════════════════════════════════
   N MARKET — chat.js
   Canal général + conversations privées.
   Sécurité : l'accès aux messages est contrôlé par la base (RLS + JWT) et le trafic est
   chiffré en TLS. L'ancien « chiffrement de bout en bout » côté navigateur a été retiré :
   sa clé était publique dans le code, il n'apportait aucune protection.
═══════════════════════════════════════════════════ */

let chatUser    = null;
let chatRoom    = 'general'; // 'general' | 'admin' | userId string
let chatSub     = null;
let chatUsers   = [];
let chatInited  = false;

async function initChat(user, isAdmin) {
  chatUser  = { ...user, isAdmin };
  chatInited = true;

  // Liste des vendeurs (vitrine publique : ni email ni téléphone)
  chatUsers = (await dbGetPublicSellers()).map(u => ({ id: u.id, name: u.name }));

  renderRooms();
  await openChatRoom('general');
  bindChatEvents();
  startRealtime();
}

/* ── ROOMS ── */
let chatFilter = '';
function roomList() {
  const rooms = [{ id:'general', name:'Canal général', ico:ic('megaphone'), sub:'Annonces et discussions', group:'Canaux' }];
  if (!chatUser.isAdmin) rooms.push({ id:'admin', name:'Support admin', ico:ic('crown'), sub:'Conversation avec l\'administration', group:'Canaux' });
  chatUsers.filter(u => chatUser.isAdmin || u.id !== chatUser.id).forEach(u =>
    rooms.push({ id:String(u.id), name:u.name, ico:esc((u.name || '?')[0].toUpperCase()), sub:'Vendeur', group:'Vendeurs' }));
  return rooms;
}
function renderRooms() {
  const el = document.getElementById('chatRooms');
  if (!el) return;
  const q = chatFilter.trim().toLowerCase();
  const rooms = roomList().filter(r => !q || r.name.toLowerCase().includes(q));
  if (!rooms.length) { el.innerHTML = '<div class="cm-none">Aucun résultat</div>'; return; }
  let last = '', html = '';
  rooms.forEach(r => {
    if (r.group !== last) { html += `<div class="cm-group">${r.group}</div>`; last = r.group; }
    html += `<button type="button" class="cm-room${chatRoom === r.id ? ' active' : ''}" data-room="${esc(r.id)}">
      <span class="cm-av${r.group === 'Canaux' ? ' ch' : ''}">${r.ico}</span>
      <span class="cm-room-t"><span class="cm-room-name">${esc(r.name)}</span><span class="cm-room-sub">${esc(r.sub)}</span></span>
    </button>`;
  });
  el.innerHTML = html;
  el.querySelectorAll('.cm-room[data-room]').forEach(b =>
    b.addEventListener('click', () => { openChatRoom(b.dataset.room); const w = document.getElementById('chatWrap'); if (w) w.classList.add('in-thread'); }));
}

async function openChatRoom(roomId) {
  chatRoom = roomId;
  renderRooms();
  const hd = document.getElementById('chatHeaderName'), sub = document.getElementById('chatHeaderSub'), av = document.getElementById('chatHeaderAv');
  if (roomId === 'general') {
    if (hd) hd.textContent = 'Canal général';
    if (sub) sub.textContent = 'Visible par tous les vendeurs';
    if (av) { av.innerHTML = ic('megaphone'); av.classList.add('ch'); }
  } else if (roomId === 'admin') {
    if (hd) hd.textContent = 'Support admin';
    if (sub) sub.textContent = 'Conversation privée avec l\'administration';
    if (av) { av.innerHTML = ic('crown'); av.classList.add('ch'); }
  } else {
    const u = chatUsers.find(x => String(x.id) === roomId);
    if (hd) hd.textContent = u ? u.name : 'Conversation';
    if (sub) sub.textContent = 'Conversation privée';
    if (av) { av.textContent = u ? (u.name || '?')[0].toUpperCase() : '?'; av.classList.remove('ch'); }
  }
  await loadMessages();
}

/* ── MESSAGES ── */
async function loadMessages() {
  let msgs;
  if (chatRoom === 'general')    msgs = await dbGetMessages({ general: true }, chatUser);
  else if (chatRoom === 'admin') msgs = await dbGetMessages({ support: true }, chatUser);
  else                           msgs = await dbGetMessages({ sellerId: parseInt(chatRoom) }, chatUser);
  await renderMessages(msgs);
}

function chatDayLabel(d) {
  const t = new Date(); t.setHours(0,0,0,0);
  const x = new Date(d); x.setHours(0,0,0,0);
  const diff = Math.round((t - x) / 86400000);
  if (diff === 0) return 'Aujourd\'hui';
  if (diff === 1) return 'Hier';
  return x.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
}

async function renderMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;

  if (!msgs.length) {
    el.innerHTML = `<div class="chat-empty">${ic('chat')}<strong>Aucun message</strong><span>Écris le premier message de cette conversation.</span></div>`;
    return;
  }

  // Nouveaux messages : texte clair ; anciens messages (is_plain = false) : déchiffrement de compatibilité
  const list = await Promise.all(msgs.map(async m => ({ ...m, text: m.is_plain ? m.content : await decryptMsg(m.content) })));
  const myRole = chatUser.isAdmin ? 'admin' : 'seller';
  let html = '', lastDay = '', prev = null;
  list.forEach((m, i) => {
    const d = new Date(m.created_at), day = d.toDateString();
    if (day !== lastDay) { html += `<div class="cm-day"><span>${esc(chatDayLabel(d))}</span></div>`; lastDay = day; prev = null; }
    const isAdm = m.sender_role === 'admin';
    const mine  = m.sender_role === myRole && m.sender_id === chatUser.id;
    const time  = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const key   = m.sender_role + ':' + m.sender_id;
    const first = !prev || prev.key !== key || (d - prev.d) > 5 * 60000;
    const nx    = list[i + 1];
    const last  = !nx || (nx.sender_role + ':' + nx.sender_id) !== key || new Date(nx.created_at).toDateString() !== day || (new Date(nx.created_at) - d) > 5 * 60000;
    prev = { key, d };
    html += `<div class="cm-row${mine ? ' mine' : ''}${first ? ' first' : ''}${last ? ' last' : ''}">
      ${!mine ? `<span class="cm-av sm${isAdm ? ' ch' : ''}${last ? '' : ' ghost'}">${last ? (isAdm ? ic('crown') : esc((m.sender_name || '?')[0].toUpperCase())) : ''}</span>` : ''}
      <div class="cm-col">
        ${!mine && first ? `<div class="cm-name">${esc(m.sender_name)}${isAdm ? ' <span class="cm-tag">Admin</span>' : ''}</div>` : ''}
        <div class="cm-bub${isAdm && !mine ? ' adm' : ''}">${esc(m.text).replace(/\n/g, '<br>')}<span class="cm-time">${time}</span></div>
      </div>
    </div>`;
  });
  const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 120 || !el._shown;
  el.innerHTML = html;
  if (atEnd) el.scrollTop = el.scrollHeight;
  el._shown = true;
}

/* ── SEND ── */
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text || !chatUser) return;

  const btn = document.getElementById('chatSendBtn');
  btn.disabled = true;

  const isGeneral = chatRoom === 'general';
  let receiverRole = null, receiverId = null;
  if (!isGeneral) {
    if (chatRoom === 'admin') { receiverRole = 'admin'; }
    else { receiverRole = 'seller'; receiverId = parseInt(chatRoom); }
  }

  // L'identité de l'expéditeur est fixée par le serveur (JWT), pas par le client.
  const r = await dbSendMessage({ receiverRole, receiverId, content: text, isGeneral });
  if (r.error) { showToast('Message non envoyé', r.error, 'var(--red)'); btn.disabled = false; return; }

  input.value = '';
  input.style.height = 'auto';
  btn.disabled = false;
  input.focus();
}

/* ── REALTIME ── */
function startRealtime() {
  if (chatSub) chatSub.unsubscribe();
  chatSub = db.channel('chat-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      clearTimeout(startRealtime._t);
      startRealtime._t = setTimeout(loadMessages, 150);   // la base ne livre que les messages autorisés (RLS)
    })
    .subscribe();
}

/* ── BIND ── */
function bindChatEvents() {
  const se = document.getElementById('chatSearch');
  if (se && !se._bound) { se.addEventListener('input', () => { chatFilter = se.value; renderRooms(); }); se._bound = true; }
  const bk = document.getElementById('chatBack');
  if (bk && !bk._bound) { bk.addEventListener('click', () => { const w = document.getElementById('chatWrap'); if (w) w.classList.remove('in-thread'); }); bk._bound = true; }
  const btn   = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  if (btn   && !btn._bound)   { btn.addEventListener('click', sendMessage);   btn._bound = true; }
  if (input && !input._bound) {
    input.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    input.addEventListener('input',   () => { input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,100)+'px'; });
    input._bound = true;
  }
}
