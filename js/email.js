/* ═══════════════════════════════════════════════════════
   N MARKET — email.js
   Envoi d'emails via EmailJS
   → Confirmation de compte
   → Facture de commission avec numéro Wave
═══════════════════════════════════════════════════════ */

/* ── Init EmailJS ── */
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }
}

/* ════════════════════════════════════════
   1. EMAIL DE CONFIRMATION DE COMPTE
   Envoyé à l'inscription
════════════════════════════════════════ */
async function sendWelcomeEmail(user) {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS non chargé');
    return { ok: false };
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_WELCOME, {
      // Variables utilisées dans le template EmailJS
      to_email:       user.email,
      to_name:        user.firstName,
      full_name:      user.name,
      platform_name:  PLATFORM_NAME,
      platform_email: PLATFORM_EMAIL,
      login_url:      window.location.origin + '/index.html',
      year:           new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) {
    console.error('sendWelcomeEmail error:', err);
    return { ok: false, error: err.text || err.message };
  }
}

/* ════════════════════════════════════════
   2. EMAIL DE FACTURE DE COMMISSION
   Envoyé quand l'admin génère les factures
════════════════════════════════════════ */
async function sendInvoiceEmail(seller, commission) {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS non chargé');
    return { ok: false };
  }

  const periodLabel  = commission.period_label  || commission.periodLabel;
  const revenue      = (commission.revenue      || 0).toLocaleString('fr-FR');
  const amountDue    = (commission.amount_due   || commission.amountDue || 0).toLocaleString('fr-FR');
  const dueDate      = commission.due_date      || commission.dueDate
    ? new Date(commission.due_date || commission.dueDate)
        .toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })
    : 'À définir';

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_INVOICE, {
      // Variables utilisées dans le template EmailJS
      to_email:        seller.email,
      to_name:         seller.firstName || seller.name,
      seller_name:     seller.name,
      platform_name:   PLATFORM_NAME,
      platform_email:  PLATFORM_EMAIL,

      // Détails de la facture
      period_label:    periodLabel,
      revenue:         revenue + ' FCFA',
      commission_rate: COMMISSION_RATE_PCT + '%',
      amount_due:      amountDue + ' FCFA',
      due_date:        dueDate,

      // Paiement Wave
      wave_number:     WAVE_NUMBER,
      wave_name:       WAVE_NAME,

      // Instructions
      instructions: `Merci d'effectuer le paiement Wave de ${amountDue} FCFA au ${WAVE_NUMBER} (${WAVE_NAME}), puis d'envoyer la capture de confirmation dans le chat avec l'administrateur sur la plateforme.`,

      year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) {
    console.error('sendInvoiceEmail error:', err);
    return { ok: false, error: err.text || err.message };
  }
}

/* ════════════════════════════════════════
   3. EMAIL DE NOTIFICATION NOUVELLE COMMANDE
   Envoyé au vendeur quand il reçoit une commande
   (le client ne fournit plus d'email — seul le vendeur
    reçoit des emails, pour ses factures et notifications)
════════════════════════════════════════ */
async function sendSellerOrderNotifEmail(seller, order, product) {
  if (typeof emailjs === 'undefined') return { ok: false };

  const deliveryDateLabel = order.deliveryDate
    ? new Date(order.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    : '—';
  const deliveryTypeLbl = order.deliveryType === 'external' ? 'Livraison hors campus' : 'Livraison sur le campus';

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_SELLER_NOTIF, {
      to_email:       seller.email,
      to_name:        seller.firstName || seller.name,
      platform_name:  PLATFORM_NAME,
      platform_email: PLATFORM_EMAIL,
      admin_url:      window.location.origin + '/pages/admin.html',

      order_id:       order.id,
      product_name:   order.productName,
      quantity:       order.qty,
      total:          (order.total || 0).toLocaleString('fr-FR') + ' FCFA',
      notes:          order.notes || 'Aucune modification',

      buyer_name:     order.buyerName,
      buyer_phone:    order.buyerPhone || '—',

      delivery_date:    deliveryDateLabel,
      delivery_time:    order.deliveryTime || '—',
      delivery_type:    deliveryTypeLbl,
      delivery_address: order.deliveryType === 'external' ? (order.deliveryAddress || '—') : 'Sur le campus de l\'école',
      delivery_address_block: order.deliveryType === 'external'
        ? `Adresse de livraison : ${order.deliveryAddress || '—'}`
        : 'Récupération / livraison sur le campus de l\'école.',

      year: new Date().getFullYear(),
    });
    return { ok: true };
  } catch (err) {
    console.error('sendSellerOrderNotifEmail error:', err);
    return { ok: false, error: err.text || err.message };
  }
}

/* Init au chargement */
document.addEventListener('DOMContentLoaded', initEmailJS);
