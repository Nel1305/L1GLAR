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
function renderRooms() {
  const el = document.getElementById('chatRooms');
  if (!el) return;

  // General + Admin channel + other sellers (or all sellers if admin)
  const rooms = [{ id:'general', name:'Canal général', icon:'📢', sub:'Annonces & discussions' }];

  // If seller → add room to chat admin
  if (!chatUser.isAdmin) {
    rooms.push({ id:'admin', name:'Support admin', icon:'👑', sub:'Conversation avec l\'admin' });
  }

  // Other sellers (for seller → seller chat; admin sees all)
  chatUsers.filter(u => chatUser.isAdmin || u.id !== chatUser.id).forEach(u => {
    rooms.push({ id: String(u.id), name: u.name, icon: u.name[0].toUpperCase(), sub: 'Vendeur' });
  });

  el.innerHTML = rooms.map(r => `
    <div class="chat-room ${chatRoom===r.id?'active':''}" data-room="${esc(r.id)}">
      <div class="chat-room-av">${esc(r.icon)}</div>
      <div style="flex:1;min-width:0">
        <div class="chat-room-name">${esc(r.name)}</div>
        <div class="chat-room-last">${esc(r.sub)}</div>
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.chat-room[data-room]').forEach(div =>
    div.addEventListener('click', () => openChatRoom(div.dataset.room)));
}

async function openChatRoom(roomId) {
  chatRoom = roomId;
  renderRooms();

  const hd   = document.getElementById('chatHeaderName');
  const sub  = document.getElementById('chatHeaderSub');

  if (roomId === 'general') {
    if (hd)  hd.textContent  = '📢 Canal général';
    if (sub) sub.textContent = 'Visible par tous les vendeurs';
  } else if (roomId === 'admin') {
    if (hd)  hd.textContent  = '👑 Support admin';
    if (sub) sub.textContent = 'Conversation privée';
  } else {
    const u = chatUsers.find(x => String(x.id) === roomId);
    if (hd)  hd.textContent  = u ? u.name : 'Conversation';
    if (sub) sub.textContent = 'Conversation privée';
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

async function renderMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;

  if (!msgs.length) {
    el.innerHTML = `<div class="chat-empty"><span>💬</span><span>Aucun message</span><span style="font-size:.7rem;color:var(--t4)">Sois le premier à écrire !</span></div>`;
    return;
  }

  // Nouveaux messages : texte clair ; anciens messages (is_plain = false) : déchiffrement de compatibilité
  const decrypted = await Promise.all(msgs.map(async m => ({ ...m, text: m.is_plain ? m.content : await decryptMsg(m.content) })));

  el.innerHTML = decrypted.map(m => {
    const isAdm = m.sender_role === 'admin';
    const mine  = m.sender_role === (chatUser.isAdmin ? 'admin' : 'seller') && m.sender_id === chatUser.id;
    const time  = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="msg-wrap ${mine?'mine':''}">
        ${!mine ? `<div class="msg-av" style="${isAdm?'border-color:var(--orange);color:var(--orange)':''}">${isAdm?'👑':esc((m.sender_name||'?')[0])}</div>` : ''}
        <div>
          ${!mine ? `<div class="msg-name">${esc(m.sender_name)}${isAdm?' <span style="color:var(--orange);font-size:.6rem">ADMIN</span>':''}</div>` : ''}
          <div class="msg-bubble ${isAdm&&!mine?'admin-msg':''}">
            ${esc(m.text).replace(/\n/g, '<br>')}
            <div class="msg-time">${time}</div>
          </div>
        </div>
        ${mine ? `<div class="msg-av">${esc((chatUser.name||'?')[0])}</div>` : ''}
      </div>`;
  }).join('');

  el.scrollTop = el.scrollHeight;
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
  const btn   = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  if (btn   && !btn._bound)   { btn.addEventListener('click', sendMessage);   btn._bound = true; }
  if (input && !input._bound) {
    input.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    input.addEventListener('input',   () => { input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,100)+'px'; });
    input._bound = true;
  }
}
