/* ═══════════════════════════════════════════════════
   N MARKET — shopstyle.js : boutique personnalisable
   (partagé par la page publique et l'éditeur vendeur)
═══════════════════════════════════════════════════ */
const SHOP_LAYOUTS = [
  { id: 'grid',      name: 'Classique',  hint: 'Tout type de produits' },
  { id: 'vitrine',   name: 'Vitrine',    hint: 'Vêtements, accessoires, bijoux' },
  { id: 'menu',      name: 'Carte',      hint: 'Plats, boissons, pâtisserie' },
  { id: 'catalogue', name: 'Catalogue',  hint: 'Électronique, livres, beaucoup d\'articles' },
  { id: 'mosaic',    name: 'Mosaïque',   hint: 'Créations, déco, photos' }
];
const SHOP_PATTERNS = [['none', 'Aucun'], ['dots', 'Points'], ['grid', 'Quadrillage'], ['diagonal', 'Rayures'], ['checks', 'Damier'], ['zigzag', 'Zigzag'], ['rings', 'Cercles']];
const SHOP_BLOCKS = { announce: 'Annonce', about: 'Présentation', featured: 'Coups de cœur', filters: 'Filtres par catégorie', products: 'Produits' };
const SHOP_ZONES = [['header', 'En-tête'], ['page', 'Fond de page'], ['cards', 'Cartes produits']];
const SHOP_DEFAULT = { color: '#111111', pattern: 'none', patternOn: ['header'], layout: 'grid', logoShape: 'round', headerStyle: 'banner', tagline: '', announce: '', blocks: ['announce', 'about', 'featured', 'filters', 'products'] };
const SHOP_IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function sanitizeShopStyle(s) {
  s = s && typeof s === 'object' ? s : {};
  const D = SHOP_DEFAULT, seen = new Set();
  let blocks = (Array.isArray(s.blocks) ? s.blocks : D.blocks).filter(b => SHOP_BLOCKS[b] && !seen.has(b) && seen.add(b));
  if (!blocks.includes('products')) blocks.push('products');
  return {
    color: /^#[0-9a-fA-F]{6}$/.test(s.color || '') ? s.color.toLowerCase() : D.color,
    pattern: SHOP_PATTERNS.some(p => p[0] === s.pattern) ? s.pattern : D.pattern,
    patternOn: (Array.isArray(s.patternOn) ? s.patternOn : D.patternOn).filter((z, i, a) => SHOP_ZONES.some(x => x[0] === z) && a.indexOf(z) === i),
    layout: SHOP_LAYOUTS.some(l => l.id === s.layout) ? s.layout : D.layout,
    logoShape: s.logoShape === 'square' ? 'square' : 'round',
    headerStyle: ['banner', 'solid', 'minimal'].includes(s.headerStyle) ? s.headerStyle : D.headerStyle,
    tagline: String(s.tagline || '').trim().slice(0, 80),
    announce: String(s.announce || '').trim().slice(0, 160),
    blocks
  };
}
function shopImg(u) { return typeof u === 'string' && u.length < 400000 && SHOP_IMG_RE.test(u) ? u : ''; }
function shopOnColor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  return (.2126 * r + .7152 * g + .0722 * b) > .45 ? '#111111' : '#ffffff';
}
/* Classes + variables CSS de la boutique */
function shopWrapAttrs(st) {
  const z = st.pattern === 'none' ? [] : st.patternOn;
  const cls = ['sh', 'sh-' + st.layout, 'hs-' + st.headerStyle, 'lg-' + st.logoShape, 'pat-' + st.pattern]
    .concat(z.map(x => 'pz-' + x));
  return `class="${cls.join(' ')}" style="--shop:${st.color};--shop-on:${shopOnColor(st.color)}"`;
}

function shopHeaderHtml(seller, st, imgs, info) {
  const logo = shopImg(imgs && imgs.logo), banner = shopImg(imgs && imgs.banner);
  const initial = esc((seller.name || '?')[0].toUpperCase());
  return `<header class="sh-head">
    ${st.headerStyle === 'minimal' ? '' : `<div class="sh-cover">${banner && st.headerStyle === 'banner' ? `<img src="${banner}" alt="">` : ''}</div>`}
    <div class="sh-id">
      <div class="sh-logo">${logo ? `<img src="${logo}" alt="Logo ${esc(seller.name)}">` : `<span>${initial}</span>`}</div>
      <div class="sh-txt">
        <div class="shop-name">${esc(seller.name)}${info.badge || ''}</div>
        ${st.tagline ? `<div class="sh-tag">${esc(st.tagline)}</div>` : ''}
        <div class="shop-meta">${info.meta || ''}</div>
        ${info.rating ? `<div class="shop-rating">★ ${info.rating} note moyenne</div>` : ''}
      </div>
      ${info.actions ? `<div class="shop-actions">${info.actions}</div>` : ''}
    </div>
  </header>`;
}

/* Liste de produits selon le modèle choisi (cardHtml(p, sponsored) fournit la carte habituelle) */
function shopProductsHtml(list, st, cardHtml, catLabel, promoted) {
  if (!list.length) return '<div class="empty">Aucun produit dans cette catégorie.</div>';
  const cards = a => a.map(p => cardHtml(p, promoted.includes(p.id))).join('');
  if (st.layout === 'menu') {
    const by = new Map(); list.forEach(p => { const k = p.cat || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(p); });
    return [...by].map(([k, a]) => `<section class="sh-sec"><h4 class="sh-cat"><span>${esc(catLabel(k) || 'Autres')}</span><em>${a.length}</em></h4><div class="grid">${cards(a)}</div></section>`).join('');
  }
  if (st.layout === 'mosaic') return `<div class="sh-masonry">${cards(list)}</div>`;
  return `<div class="grid">${cards(list)}</div>`;
}

/* Assemble la page boutique : en-tête puis blocs dans l'ordre choisi.
   opts: { seller, style, imgs, products, promoted, cardHtml, catLabel, info } → { html, bind(root, onAfter) } */
function renderShopPage(o) {
  const st = sanitizeShopStyle(o.style);
  const cats = [...new Set(o.products.map(p => p.cat).filter(Boolean))];
  const featured = [...o.products].filter(p => o.promoted.includes(p.id) || (p.rating || 0) >= 4.5).slice(0, 3);
  const parts = st.blocks.map(b => {
    if (b === 'announce') return st.announce ? `<div class="sh-announce" role="note">${ic('megaphone')}<span>${esc(st.announce)}</span></div>` : '';
    if (b === 'about') return o.seller.bio ? `<section class="sh-about"><h4 class="sh-h">À propos</h4><p>${esc(o.seller.bio)}</p></section>` : '';
    if (b === 'featured') return featured.length >= 1 && o.products.length > 3 ? `<section class="sh-sec sh-feat"><h4 class="sh-h">Coups de cœur</h4><div class="grid">${featured.map(p => o.cardHtml(p, o.promoted.includes(p.id))).join('')}</div></section>` : '';
    if (b === 'filters') return cats.length > 1 ? `<div class="sh-filters" role="group" aria-label="Catégories"><button type="button" class="filter-btn active" data-shcat="">Tout</button>${cats.map(c => `<button type="button" class="filter-btn" data-shcat="${esc(c)}">${esc(o.catLabel(c) || c)}</button>`).join('')}</div>` : '';
    if (b === 'products') return `<section class="sh-sec"><div id="shopProductsGrid">${shopProductsHtml(o.products, st, o.cardHtml, o.catLabel, o.promoted)}</div></section>`;
    return '';
  });
  const html = `<div ${shopWrapAttrs(st)}>${shopHeaderHtml(o.seller, st, o.imgs, o.info)}<div class="sh-body">${parts.join('')}</div></div>`;
  const bind = (root, after) => {
    root.querySelectorAll('[data-shcat]').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('[data-shcat]').forEach(x => x.classList.toggle('active', x === b));
      const c = b.dataset.shcat, list = c ? o.products.filter(p => p.cat === c) : o.products;
      const box = root.querySelector('#shopProductsGrid');
      box.innerHTML = shopProductsHtml(list, st, o.cardHtml, o.catLabel, o.promoted);
      after && after(box);
    }));
    after && after(root);
  };
  return { html, bind };
}
