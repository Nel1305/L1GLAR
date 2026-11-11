// /p/12-nom-du-produit  →  la vraie appli (index.html) + balises SEO propres à CE produit.
// Google et les IA lisent le titre, la description, les données structurées (schema.org/Product)
// et le texte du produit ; les visiteurs, eux, retrouvent l'appli normale avec la fiche ouverte.
const { esc, jsonScript, productPath, origin, rest, indexHtml, SITE_NAME } = require('./_lib');

const CATS = { other: 'Autre' };
const safeHttps = u => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

module.exports = async (req, res) => {
  const base = origin(req);
  let html;
  try { html = indexHtml(); } catch (e) { res.statusCode = 500; return res.end('index.html introuvable'); }

  const m = String(req.query && req.query.slug || '').match(/^(\d{1,12})/);
  let p = null;
  if (m) {
    try {
      const rows = await rest(`products?id=eq.${m[1]}&available=eq.true&select=id,seller_name,name,description,category,price,emoji,photo_url,rating,votes,track_stock,stock,created_at&limit=1`);
      p = rows && rows[0];
    } catch (e) { p = null; }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!p) {   // produit retiré / inexistant : on sert l'appli, sans l'indexer
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    html = html.replace('<head>', `<head><base href="/"><meta name="robots" content="noindex">`);
    return res.end(html);
  }

  const url = base + productPath(p);
  const price = Math.round(Number(p.price) || 0);
  const priceTxt = price.toLocaleString('fr-FR').replace(/ | /g, ' ');
  const inStock = !(p.track_stock && p.stock <= 0);
  const img = safeHttps(p.photo_url);
  const title = clip(`${p.name} – ${priceTxt} FCFA | ${SITE_NAME}`, 70);
  const desc = clip(`${p.name} à ${priceTxt} FCFA, vendu par ${p.seller_name} sur ${SITE_NAME}, la marketplace des étudiants. ${p.description || ''}`, 300);

  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, description: clip(p.description || desc, 500), url,
    sku: String(p.id), category: CATS[p.category] || p.category,
    brand: { '@type': 'Brand', name: p.seller_name },
    offers: {
      '@type': 'Offer', url, priceCurrency: 'XOF', price: String(price),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: p.seller_name }
    }
  };
  if (img) ld.image = [img];
  if (Number(p.votes) > 0 && Number(p.rating) > 0) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: String(p.votes) };

  const head = `<base href="/">
<link rel="canonical" href="${esc(url)}">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : `<meta property="og:image" content="${esc(base)}/assets/logo-black.png">`}
<meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="XOF">
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${jsonScript(ld)}</script>`;

  // Texte lisible sans JavaScript (robots, IA, aperçus) — l'appli le remplace dès qu'elle démarre
  const body = `<noscript><main style="max-width:680px;margin:40px auto;padding:0 16px;font-family:system-ui,sans-serif">
<h1>${esc(p.name)}</h1>
<p><strong>${esc(priceTxt)} FCFA</strong> · ${inStock ? 'En stock' : 'Rupture de stock'}</p>
<p>Vendu par ${esc(p.seller_name)} sur ${SITE_NAME}.</p>
${p.description ? `<p>${esc(p.description)}</p>` : ''}
${img ? `<p><img src="${esc(img)}" alt="${esc(p.name)}" style="max-width:100%"></p>` : ''}
<p><a href="/">Voir tous les produits sur ${SITE_NAME}</a></p></main></noscript>`;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
             .replace('<head>', '<head>' + head)
             .replace(/<body([^>]*)>/, (s) => s + body);

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.end(html);
};
