/* ════════════════════════════════════════════════════════════════
   N MARKET — ticket de commande (affichage, téléchargement, personnalisation vendeur)
   Le même code dessine le ticket à l'écran, dans l'image téléchargée et dans l'aperçu vendeur :
   couleurs FIXES (jamais celles du thème du site, sinon illisible en mode sombre).
════════════════════════════════════════════════════════════════ */
const TICKET_DEFAULT = {
  accent: '#151515',      // bandeau d'en-tête + total
  paper: '#ffffff',       // fond du ticket
  ink: '#1a1a1a',         // texte
  align: 'center',        // alignement de l'en-tête : left | center | right
  header: 'band',         // en-tête : band (bandeau plein) | line (simple trait)
  showShop: true,         // afficher le nom de la boutique
  title: 'Ticket de commande',
  footer: ''              // message libre du vendeur (remerciement, horaires…)
};
const TICKET_ALIGNS = ['left', 'center', 'right'];
const TICKET_HEADERS = ['band', 'line'];

function _hex(v, d) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : d; }
function sanitizeTicketStyle(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    accent: _hex(s.accent, TICKET_DEFAULT.accent), paper: _hex(s.paper, TICKET_DEFAULT.paper), ink: _hex(s.ink, TICKET_DEFAULT.ink),
    align: TICKET_ALIGNS.includes(s.align) ? s.align : TICKET_DEFAULT.align,
    header: TICKET_HEADERS.includes(s.header) ? s.header : TICKET_DEFAULT.header,
    showShop: s.showShop === undefined ? true : !!s.showShop,
    title: String(s.title == null ? TICKET_DEFAULT.title : s.title).trim().slice(0, 40) || TICKET_DEFAULT.title,
    footer: String(s.footer || '').trim().slice(0, 140)
  };
}
function _rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function _mix(a, b, t) { const x = _rgb(a), y = _rgb(b); return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join(''); }
function _lum(h) { const [r, g, b] = _rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }
function _onColor(bg) { return _lum(bg) > .45 ? '#111111' : '#ffffff'; }
function _tkEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* d = { platform, shops[], ids[], codes[], date, name, phone, classe, items[{name,qty,total,seller,note,code}], delivery, place, address, notes, total } */
function ticketHTML(d, style) {
  const st = sanitizeTicketStyle(style);
  const muted = _mix(st.ink, st.paper, .45), line = _mix(st.ink, st.paper, .78), soft = _mix(st.ink, st.paper, .93);
  const onAccent = _onColor(st.accent), al = st.align;
  const jc = al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center';
  const base = `font-family:'Poppins',system-ui,sans-serif;color:${st.ink};`;
  const row = (k, v, big) => v ? `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:${big ? '.9rem' : '.78rem'}"><span style="color:${muted}">${_tkEsc(k)}</span><span style="font-weight:600;text-align:right;max-width:62%;word-break:break-word">${_tkEsc(v)}</span></div>` : '';
  const sep = `<div style="border-top:1px dashed ${line};margin:10px 0"></div>`;
  const shop = st.showShop && d.shops && d.shops.length ? d.shops.join(' · ') : '';
  const head = st.header === 'band'
    ? `<div style="background:${st.accent};color:${onAccent};text-align:${al};padding:20px 20px 16px"><div style="font-weight:700;font-size:1.05rem;letter-spacing:.01em">${_tkEsc(d.platform || 'N Market')}</div>${shop ? `<div style="font-size:.8rem;opacity:.9;margin-top:2px">${_tkEsc(shop)}</div>` : ''}<div style="font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-top:6px">${_tkEsc(st.title)}</div></div>`
    : `<div style="text-align:${al};padding:20px 20px 12px;border-bottom:3px solid ${st.accent}"><div style="font-weight:700;font-size:1.05rem">${_tkEsc(d.platform || 'N Market')}</div>${shop ? `<div style="font-size:.8rem;color:${muted};margin-top:2px">${_tkEsc(shop)}</div>` : ''}<div style="font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:${muted};margin-top:6px">${_tkEsc(st.title)}</div></div>`;
  const ids = d.ids && d.ids.length ? (d.ids.length > 1 ? `#${d.ids[0]} – #${d.ids[d.ids.length - 1]}` : `#${d.ids[0]}`) : '';
  const codes = (d.codes || []).filter(Boolean);
  const codeBox = codes.length ? `<div style="background:${soft};border:1px solid ${line};border-radius:12px;padding:10px 12px;margin-bottom:12px;text-align:center"><div style="font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:${muted}">Facture n°</div>${codes.map(c => `<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:1.15rem;letter-spacing:.06em;margin-top:3px;color:${st.ink}">${_tkEsc(c)}</div>`).join('')}</div>` : '';
  const items = (d.items || []).map(it => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:.82rem"><span style="font-weight:600;max-width:65%">${_tkEsc(it.name)} <span style="color:${muted};font-weight:500">×${Number(it.qty)}</span>${it.options ? `<div style="font-size:.7rem;color:${muted};font-weight:500;line-height:1.4">${_tkEsc(it.options)}</div>` : ''}${it.note ? `<div style="font-size:.68rem;color:${muted};font-weight:400">${_tkEsc(it.note)}</div>` : ''}</span><span style="font-weight:600;white-space:nowrap">${Number(it.total).toLocaleString('fr-FR')} FCFA</span></div>`).join('');
  return `<div class="tk2" style="${base}background:${st.paper};width:100%;max-width:380px;margin:0 auto;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.18);box-sizing:border-box">
    ${head}
    <div style="height:4px;background:linear-gradient(90deg,#18428A 50%,#008F3D 50%)"></div>
    <div style="padding:16px 20px 18px">
      ${codeBox}
      ${row('Date', d.date)}
      ${sep}${row('Client', d.name)}${row('Téléphone', d.phone)}${row('Classe / Filière', d.classe)}
      ${sep}${items}${d.notes ? row('Modifications', d.notes) : ''}
      ${sep}${row('Livraison', d.delivery)}${row('Lieu', d.place)}${row('Adresse', d.address)}
      ${sep}
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:1.1rem"><span>Total</span><span style="color:${_lum(st.paper) > .5 ? st.accent : st.ink}">${Number(d.total || 0).toLocaleString('fr-FR')} FCFA</span></div>
      <div style="display:flex;justify-content:${jc};margin-top:10px"><span style="font-size:.66rem;font-weight:600;padding:4px 10px;border-radius:999px;background:${soft};border:1px solid ${line};color:${st.ink}">⏳ En attente de confirmation</span></div>
      ${st.footer ? `<div style="margin-top:12px;font-size:.78rem;text-align:${al};line-height:1.5">${_tkEsc(st.footer)}</div>` : ''}
      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed ${line};font-size:.62rem;color:${muted};text-align:center;line-height:1.55">Conserve ce ticket comme preuve de ta commande. Le numéro de facture te permettra de signaler un retour si besoin.</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px"><img src="/assets/estm-logo.svg" alt="ESTM" height="26" style="height:26px;width:auto"><span style="font-size:.6rem;color:${muted}">Pour les étudiants de l'ESTM</span></div>
    </div></div>`;
}

/* données d'exemple pour l'aperçu vendeur */
function ticketSample(shopName) {
  return { platform: 'N Market', shops: [shopName || 'Ma boutique'], ids: [128], codes: ['NM-8ZTW-EJT2'], date: '10 nov. 2026, 13:14', name: 'Awa Diop', phone: '77 123 45 67',
           classe: 'L2 · Génie Logiciel et Administration Réseaux (GLAR)', items: [{ name: 'Robe wax', qty: 1, total: 17000, options: 'Taille : M · Couleur : Bleu · Broderie' }, { name: 'Sac en tissu', qty: 2, total: 5000 }],
           delivery: '12 nov. 2026 à 11:00', place: 'Sur le campus', total: 22000 };
}

/* ticket → image PNG : dessiné hors écran à largeur fixe (identique sur tous les appareils, quel que soit le thème) */
async function ticketToBlob(d, style) {
  if (typeof html2canvas === 'undefined') return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:380px;z-index:-1;pointer-events:none;background:transparent';
  host.innerHTML = ticketHTML(d, style);
  document.body.appendChild(host);
  try {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = host.firstElementChild; el.style.boxShadow = 'none'; el.style.maxWidth = '380px'; el.style.borderRadius = '0';
    const canvas = await html2canvas(el, { scale: 3, backgroundColor: sanitizeTicketStyle(style).paper, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 420 });
    if (!canvas.width || !canvas.height) return null;
    return await new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
  } catch (e) { return null; }
  finally { host.remove(); }
}
