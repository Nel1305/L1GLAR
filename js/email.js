/* ═══════════════════════════════════════════════════════
   N MARKET — email.js
   Templates :
     1. Bienvenue (inscription)
     2. Facture commission (admin -> vendeur)
     3. Confirmation commande (-> acheteur)
     4. Notification commande (-> vendeur)
======================================================= */

'use strict';

const EMAILJS_TEMPLATE_ORDER_CONFIRM = 'template_order_confirm';
const EMAILJS_TEMPLATE_ORDER_NOTIFY  = 'template_order_notify';

function initEmailJS() {
  if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBLIC_KEY);
}

/* 1. CONFIRMATION DE COMPTE */
async function sendWelcomeEmail(user) {
  if (typeof emailjs === 'undefined') return { ok: false };
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_WELCOME, {
      to_email: user.email, to_name: user.firstName, full_name: user.name,
      platform_name: PLATFORM_NAME, platform_email: PLATFORM_EMAIL,
      login_url: window.location.origin + '/index.html',
      year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) { console.error('sendWelcomeEmail:', err); return { ok: false, error: err.text || err.message }; }
}

/* 2. FACTURE COMMISSION */
async function sendInvoiceEmail(seller, commission) {
  if (typeof emailjs === 'undefined') return { ok: false };
  const periodLabel = commission.period_label || commission.periodLabel || '';
  const revenue     = (commission.revenue || 0).toLocaleString('fr-FR');
  const amountDue   = (commission.amount_due || commission.amountDue || 0).toLocaleString('fr-FR');
  const rawDue      = commission.due_date || commission.dueDate;
  const dueDate     = rawDue
    ? new Date(rawDue).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })
    : 'A definir';
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_INVOICE, {
      to_email: seller.email, to_name: seller.firstName || seller.name, seller_name: seller.name,
      platform_name: PLATFORM_NAME, platform_email: PLATFORM_EMAIL,
      period_label: periodLabel, revenue: revenue + ' FCFA',
      commission_rate: COMMISSION_RATE_PCT + '%', amount_due: amountDue + ' FCFA',
      due_date: dueDate, wave_number: WAVE_NUMBER, wave_name: WAVE_NAME,
      instructions: 'Merci d\'effectuer le paiement Wave de ' + amountDue + ' FCFA au ' + WAVE_NUMBER + ' (' + WAVE_NAME + '), puis envoyer la capture de confirmation dans le chat.',
      year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) { console.error('sendInvoiceEmail:', err); return { ok: false, error: err.text || err.message }; }
}

/* 3. CONFIRMATION COMMANDE -> ACHETEUR
   Variables template EmailJS a creer :
   {{to_email}}, {{to_name}}, {{order_code}},
   {{product_name}}, {{seller_name}}, {{quantity}},
   {{unit_price}}, {{total}}, {{notes}},
   {{platform_name}}, {{platform_email}}, {{order_date}}, {{year}}
*/
async function sendOrderConfirmEmail(order, product) {
  if (typeof emailjs === 'undefined') return { ok: false };
  const orderDate = new Date(order.createdAt || Date.now())
    .toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const unitPrice = product ? product.price : Math.round(order.total / (order.qty || 1));
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ORDER_CONFIRM, {
      to_email: order.buyerEmail, to_name: order.buyerName,
      order_code: order.orderCode || '--',
      product_name: order.productName,
      seller_name: order.sellerName || (product ? product.sellerName : '--'),
      quantity: order.qty,
      unit_price: unitPrice.toLocaleString('fr-FR') + ' FCFA',
      total: order.total.toLocaleString('fr-FR') + ' FCFA',
      notes: order.notes || 'Aucune modification',
      platform_name: PLATFORM_NAME, platform_email: PLATFORM_EMAIL,
      order_date: orderDate, year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) { console.error('sendOrderConfirmEmail:', err); return { ok: false, error: err.text || err.message }; }
}

/* 4. NOTIFICATION -> VENDEUR */
async function sendOrderNotifyEmail(order, sellerEmail, sellerName) {
  if (typeof emailjs === 'undefined' || !sellerEmail) return { ok: false };
  const orderDate = new Date(order.createdAt || Date.now())
    .toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ORDER_NOTIFY, {
      to_email: sellerEmail, to_name: sellerName || order.sellerName,
      order_code: order.orderCode || '--',
      buyer_name: order.buyerName, buyer_phone: order.buyerPhone || 'Non renseigne',
      product_name: order.productName, quantity: order.qty,
      total: order.total.toLocaleString('fr-FR') + ' FCFA',
      notes: order.notes || 'Aucune modification',
      platform_name: PLATFORM_NAME, order_date: orderDate, year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) { console.error('sendOrderNotifyEmail:', err); return { ok: false, error: err.text || err.message }; }
}

document.addEventListener('DOMContentLoaded', initEmailJS);
