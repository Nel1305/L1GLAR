/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — chat.js
   Canal général + conversations privées — AES-256 E2E
═══════════════════════════════════════════════════ */

let chatUser    = null;
let chatRoom    = 'general'; // 'general' | 'admin' | userId string
let chatSub     = null;
let chatUsers   = [];
let chatInited  = false;

async function initChat(user, isAdmin) {
  chatUser  = { ...user, isAdmin };
  chatInited = true;

  // Load all users for room list
  const { data } = await db.from('users').select('id, name, first_name').order('name');
  chatUsers = data || [];

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
  chatUsers.filter(u => u.id !== chatUser.id).forEach(u => {
    rooms.push({ id: String(u.id), name: u.name, icon: u.name[0].toUpperCase(), sub: 'Vendeur' });
  });

  el.innerHTML = rooms.map(r => `
    <div class="chat-room ${chatRoom===r.id?'active':''}" onclick="openChatRoom('${r.id}')">
      <div class="chat-room-av">${r.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="chat-room-name">${r.name}</div>
        <div class="chat-room-last">${r.sub}</div>
      </div>
    </div>
  `).join('');
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
    if (sub) sub.textContent = 'Chiffré de bout en bout';
  } else {
    const u = chatUsers.find(x => String(x.id) === roomId);
    if (hd)  hd.textContent  = u ? u.name : 'Conversation';
    if (sub) sub.textContent = 'Chiffré de bout en bout';
  }

  await loadMessages();
}

/* ── MESSAGES ── */
async function loadMessages() {
  let msgs = [];
  if (chatRoom === 'general') {
    msgs = await dbGetMessages({ isGeneral: true });
  } else {
    const otherId = chatRoom === 'admin' ? (chatUser.adminId || 0) : parseInt(chatRoom);
    msgs = await dbGetMessages({ userA: chatUser.id, userB: otherId });
  }
  await renderMessages(msgs);
}

async function renderMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;

  if (!msgs.length) {
    el.innerHTML = `<div class="chat-empty"><span>💬</span><span>Aucun message</span><span style="font-size:.7rem;color:var(--t3)">Sois le premier à écrire !</span></div>`;
    return;
  }

  const decrypted = await Promise.all(msgs.map(async m => ({ ...m, text: await decryptMsg(m.content) })));

  el.innerHTML = decrypted.map(m => {
    const mine  = m.sender_id === chatUser.id;
    const isAdm = m.sender_role === 'admin';
    const time  = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="msg-wrap ${mine?'mine':''}">
        ${!mine ? `<div class="msg-av" style="${isAdm?'border-color:var(--gold);color:var(--gold)':''}">${isAdm?'👑':m.sender_name[0]}</div>` : ''}
        <div>
          ${!mine ? `<div class="msg-name">${m.sender_name}${isAdm?' <span style="color:var(--gold);font-size:.6rem">ADMIN</span>':''}</div>` : ''}
          <div class="msg-bubble ${isAdm&&!mine?'admin-msg':''}">
            ${m.text}
            <div class="msg-time">${time}</div>
          </div>
        </div>
        ${mine ? `<div class="msg-av">${chatUser.name[0]}</div>` : ''}
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

  const encrypted  = await encryptMsg(text);
  const isGeneral  = chatRoom === 'general';
  let   receiverId = null;

  if (!isGeneral) {
    receiverId = chatRoom === 'admin' ? null : parseInt(chatRoom);
  }

  await dbSendMessage({
    senderId:   chatUser.id,
    senderName: chatUser.name,
    senderRole: chatUser.isAdmin ? 'admin' : 'seller',
    receiverId,
    content:    encrypted,
    isGeneral,
  });

  // Enregistre la connexion si vendeur → vendeur
  if (!isGeneral && !chatUser.isAdmin && receiverId) {
    const other = chatUsers.find(u => u.id === receiverId);
    if (other) await dbUpsertConnection(chatUser.id, chatUser.name, receiverId, other.name);
  }

  input.value = '';
  input.style.height = 'auto';
  btn.disabled = false;
  input.focus();
}

/* ── REALTIME ── */
function startRealtime() {
  if (chatSub) chatSub.unsubscribe();
  chatSub = db.channel('chat-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const m = payload.new;
      const inRoom =
        (chatRoom === 'general' && m.is_general) ||
        (!m.is_general && (
          (m.sender_id === chatUser.id && String(m.receiver_id) === chatRoom) ||
          (m.receiver_id === chatUser.id && String(m.sender_id) === chatRoom) ||
          (chatRoom === 'admin' && (m.sender_id === chatUser.id || m.receiver_id === chatUser.id))
        ));
      if (inRoom) await loadMessages();
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
