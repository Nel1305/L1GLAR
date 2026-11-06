/* ═══════════════════════════════════════════════════════
   N MARKET — _shared/wa.ts
   Logique WhatsApp PURE (sans accès réseau ni base) : testable avec Node.
   Les Edge Functions (wa-notify, wa-send, wa-webhook) s'en servent.
═══════════════════════════════════════════════════════ */

export type Cfg = {
  cc: string;            // indicatif pays par défaut (221 = Sénégal)
  lang: string;          // langue des modèles Meta
  siteUrl: string;
  platform: string;
  tpl: Record<string, string>;   // noms des modèles approuvés chez Meta
};

/* Modèles : le texte ci-dessous doit être IDENTIQUE à celui créé dans Meta Business Manager
   (catégorie « Utilitaire », langue français). {{n}} = variables, dans cet ordre. */
export const TEMPLATES: Record<string, { name: string; body: string }> = {
  receipt:      { name: 'nm_order_receipt',
                  body: 'Bonjour {{1}}, ta commande {{2}} est bien reçue. Total : {{3}} FCFA. Code(s) de reçu : {{4}}. Garde ce code : il te servira pour un retour. Vendeur : {{5}}.' },
  seller_new:   { name: 'nm_new_order_seller',
                  body: 'Nouvelle commande : {{1}} — {{2}} FCFA. Client : {{3}} ({{4}}). Livraison : {{5}}. Détails dans ton espace vendeur.' },
  status:       { name: 'nm_order_status',
                  body: 'Bonjour {{1}}, ta commande {{2}} ({{3}}) est maintenant : {{4}}.' },
  return_ack:   { name: 'nm_return_ack',
                  body: 'Ta demande de retour pour {{1}} a bien été transmise au vendeur. Tu recevras sa réponse ici.' },
  return_seller:{ name: 'nm_return_seller',
                  body: 'Demande de retour pour {{1}} (client : {{2}}, {{3}}). Motif : {{4}}. Réponds depuis ton espace vendeur.' },
  return_status:{ name: 'nm_return_status',
                  body: 'Ta demande de retour pour {{1}} est {{2}}. Réponse du vendeur : {{3}}. Merci de ta confiance !' },
};

export type Plan = {
  to: string;                 // numéro destinataire (international, sans +)
  peer: 'buyer' | 'seller';
  tplKey: string;
  params: string[];
  text: string;               // texte rendu (journal + repli)
  sellerId: number | null;
  orderId: number | null;
  logPhone: string;           // numéro du fil de discussion (client) ou du vendeur
  name: string;
};

/* ── Utilitaires ── */
export function normPhone(p: unknown, cc = '221'): string {
  const d = String(p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (d.length <= 9) return cc + d.replace(/^0+/, '');
  return d;
}
export function isValidWaNumber(n: string): boolean { return /^[1-9]\d{7,14}$/.test(n); }

/* Meta refuse : retours à la ligne, tabulations, > 4 espaces d'affilée, variable vide */
export function cleanParam(v: unknown, max = 200): string {
  let s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s || '—';
}
export function render(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? '');
}
const fcfa = (n: unknown) => Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const firstName = (n: string) => cleanParam(String(n || '').trim().split(/\s+/)[0] || 'client', 40);
const statusFr = (s: string) => s === 'done' ? 'livrée ✅' : s === 'cancel' ? 'annulée' : s === 'new' ? 'en cours' : s;
const returnFr = (s: string) => s === 'accepted' ? 'acceptée' : s === 'rejected' ? 'refusée' : 'en attente';

function mapsLink(o: any): string {
  return (o.delivery_lat != null && o.delivery_lng != null)
    ? `https://www.google.com/maps?q=${Number(o.delivery_lat)},${Number(o.delivery_lng)}` : '';
}
function deliveryText(o: any): string {
  const when = `${String(o.delivery_date || '').split('-').reverse().slice(0, 2).join('/')} à ${o.delivery_time || ''}`;
  if (o.delivery_type === 'external') {
    const link = mapsLink(o);
    return cleanParam(`${when} · hors campus${o.delivery_address ? ' : ' + o.delivery_address : ''}${link ? ' · ' + link : ''}`, 300);
  }
  return cleanParam(`${when} · campus${o.buyer_classe ? ' · ' + o.buyer_classe : ''}`, 200);
}
function mk(cfg: Cfg, to: string, peer: 'buyer' | 'seller', tplKey: string, params: string[],
            o: { sellerId: number | null; orderId: number | null; logPhone: string; name: string }): Plan {
  const clean = params.map(p => cleanParam(p, 300));
  return { to, peer, tplKey, params: clean, text: render(TEMPLATES[tplKey].body, clean),
           sellerId: o.sellerId, orderId: o.orderId, logPhone: o.logPhone, name: o.name };
}

/* ── Planification des messages selon l'événement ── */

/** Panier validé : 1 reçu pour le client + 1 notification par vendeur */
export function planOrderGroup(cfg: Cfg, orders: any[], sellers: Record<string, any>): Plan[] {
  if (!orders.length) return [];
  const plans: Plan[] = [];
  const o0 = orders[0];
  const buyer = normPhone(o0.buyer_phone, cfg.cc);

  if (orders.some(o => o.wa_opt_in) && isValidWaNumber(buyer)) {
    const ids = orders.map(o => '#' + o.id).join(' ');
    const codes = orders.map(o => o.receipt_code).join(' · ');
    const total = orders.reduce((a, o) => a + Number(o.total || 0), 0);
    const names = [...new Set(orders.map(o => o.seller_name).filter(Boolean))].join(', ');
    plans.push(mk(cfg, buyer, 'buyer', 'receipt',
      [firstName(o0.buyer_name), ids, fcfa(total), codes, names],
      { sellerId: o0.seller_id, orderId: o0.id, logPhone: buyer, name: o0.buyer_name }));
  }

  const bySeller = new Map<string, any[]>();
  for (const o of orders) { const k = String(o.seller_id); bySeller.set(k, [...(bySeller.get(k) || []), o]); }
  for (const [sid, list] of bySeller) {
    const s = sellers[sid];
    const to = normPhone(s?.phone, cfg.cc);
    if (!s || s.wa_notifications === false || !isValidWaNumber(to)) continue;
    const items = list.map(o => `${o.qty}× ${o.product_name}`).join(', ');
    const total = list.reduce((a, o) => a + Number(o.total || 0), 0);
    plans.push(mk(cfg, to, 'seller', 'seller_new',
      [items, fcfa(total), o0.buyer_name, o0.buyer_phone, deliveryText(list[0])],
      { sellerId: Number(sid), orderId: list[0].id, logPhone: to, name: s.name || '' }));
  }
  return plans;
}

/** Changement de statut de commande → client (si opt-in) */
export function planOrderStatus(cfg: Cfg, o: any): Plan[] {
  const buyer = normPhone(o.buyer_phone, cfg.cc);
  if (!o.wa_opt_in || !isValidWaNumber(buyer) || o.status === 'new') return [];
  return [mk(cfg, buyer, 'buyer', 'status',
    [firstName(o.buyer_name), '#' + o.id, o.product_name, statusFr(o.status)],
    { sellerId: o.seller_id, orderId: o.id, logPhone: buyer, name: o.buyer_name })];
}

/** Demande de retour : accusé au client + alerte au vendeur */
export function planReturnCreated(cfg: Cfg, r: any, order: any, seller: any): Plan[] {
  const plans: Plan[] = [];
  const buyer = normPhone(r.buyer_phone, cfg.cc);
  if (order?.wa_opt_in && isValidWaNumber(buyer)) {
    plans.push(mk(cfg, buyer, 'buyer', 'return_ack', [r.product_name],
      { sellerId: r.seller_id, orderId: r.order_id, logPhone: buyer, name: r.buyer_name }));
  }
  const to = normPhone(seller?.phone, cfg.cc);
  if (seller && seller.wa_notifications !== false && isValidWaNumber(to)) {
    plans.push(mk(cfg, to, 'seller', 'return_seller',
      [r.product_name, r.buyer_name, r.buyer_phone, r.reason],
      { sellerId: r.seller_id, orderId: r.order_id, logPhone: to, name: seller.name || '' }));
  }
  return plans;
}

/** Réponse du vendeur à un retour → client */
export function planReturnStatus(cfg: Cfg, r: any, order: any): Plan[] {
  const buyer = normPhone(r.buyer_phone, cfg.cc);
  if (!order?.wa_opt_in || !isValidWaNumber(buyer) || r.status === 'pending') return [];
  return [mk(cfg, buyer, 'buyer', 'return_status',
    [r.product_name, returnFr(r.status), r.seller_response || '—'],
    { sellerId: r.seller_id, orderId: r.order_id, logPhone: buyer, name: r.buyer_name })];
}

/* ── Appels Graph API (Meta Cloud API) ── */
export function templatePayload(cfg: Cfg, p: Plan) {
  const t = TEMPLATES[p.tplKey];
  return {
    messaging_product: 'whatsapp', to: p.to, type: 'template',
    template: {
      name: cfg.tpl[p.tplKey] || t.name, language: { code: cfg.lang },
      components: [{ type: 'body', parameters: p.params.map(text => ({ type: 'text', text })) }],
    },
  };
}
export function textPayload(to: string, body: string) {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: body.slice(0, 4000) } };
}

/* ── Webhook entrant ── */
export async function verifySignature(raw: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !appSecret || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, header.slice(7));
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type Inbound = { id: string; from: string; name: string; body: string };
export type StatusUpd = { id: string; status: string; error: string | null };

export function parseWebhook(payload: any): { messages: Inbound[]; statuses: StatusUpd[] } {
  const messages: Inbound[] = []; const statuses: StatusUpd[] = [];
  for (const entry of payload?.entry || []) for (const ch of entry?.changes || []) {
    const v = ch?.value || {};
    const names: Record<string, string> = {};
    for (const c of v.contacts || []) names[c.wa_id] = c?.profile?.name || '';
    for (const m of v.messages || []) {
      let body = '';
      switch (m.type) {
        case 'text': body = m.text?.body || ''; break;
        case 'button': body = m.button?.text || ''; break;
        case 'interactive': body = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''; break;
        case 'image': case 'video': case 'audio': case 'document': case 'sticker':
          body = `[${m.type}]${m[m.type]?.caption ? ' ' + m[m.type].caption : ''}`; break;
        case 'location': body = `[position] https://www.google.com/maps?q=${m.location?.latitude},${m.location?.longitude}`; break;
        default: body = `[${m.type || 'message'}]`;
      }
      messages.push({ id: String(m.id), from: String(m.from), name: names[m.from] || '', body: body.slice(0, 4000) });
    }
    for (const s of v.statuses || []) {
      statuses.push({ id: String(s.id), status: String(s.status), error: s.errors?.[0] ? `${s.errors[0].code}: ${s.errors[0].title || s.errors[0].message || ''}` : null });
    }
  }
  return { messages, statuses };
}
