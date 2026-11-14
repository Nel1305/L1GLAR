// /p/12-nom-du-produit  →  la vraie appli (index.html) + SEO propre à CE produit :
// titre, description, schema.org Product + fil d'Ariane, texte lisible par les robots, liens vers les produits voisins.
const { esc, productPath, shopPath, catLabel, safeHttps, clip, fmt, renderShell, origin, rest, indexHtml, SITE_NAME } = require('./_lib');

const SEL = 'id,seller_id,seller_name,name,description,category,price,photo_url,rating,votes,track_stock,stock,created_at';

module.exports = async (req, res) => {
  const base = origin(req);
  let html;
  try { html = indexHtml(); } catch (e) { res.statusCode = 500; return res.end('index.html introuvable'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const m = String(req.query && req.query.slug || '').match(/^(\d{1,12})/);
  let p = null;
  if (m) { try { p = (await rest(`products?id=eq.${m[1]}&available=eq.true&select=${SEL}&limit=1`))[0]; } catch (e) { p = null; } }

  if (!p) {                                      // retiré / inexistant : l'appli s'ouvre, mais la page n'est pas indexée
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.end(renderShell(html, { noindex: true, title: `Produit introuvable | ${SITE_NAME}`, desc: 'Ce produit n\'est plus disponible.', image: base + '/assets/logo-black.png' }));
  }

  // une seule adresse par produit : /p/12 ou /p/12-ancien-nom → 301 vers /p/12-nom-actuel (évite les doublons dans Google)
  const canonicalPath = productPath(p);
  if ('/p/' + req.query.slug !== canonicalPath) {
    res.statusCode = 301; res.setHeader('Location', canonicalPath); res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.end();
  }

  // produits voisins (même boutique, même catégorie) : liens internes = les robots découvrent et relient les pages
  let sameShop = [], sameCat = [];
  try {
    [sameShop, sameCat] = await Promise.all([
      rest(`products?available=eq.true&seller_id=eq.${p.seller_id}&id=neq.${p.id}&select=id,name,price&order=created_at.desc&limit=8`),
      rest(`products?available=eq.true&category=eq.${encodeURIComponent(p.category)}&seller_id=neq.${p.seller_id}&select=id,name,price&order=created_at.desc&limit=8`)
    ]);
  } catch (e) { /* page publiée sans les liens voisins */ }

  const url = base + canonicalPath;
  const shopUrl = base + shopPath({ id: p.seller_id, name: p.seller_name });
  const price = Math.round(Number(p.price) || 0);
  const inStock = !(p.track_stock && p.stock <= 0);
  const img = safeHttps(p.photo_url);
  const cat = catLabel(p.category);
  const title = clip(`${p.name} – ${fmt(price)} FCFA | ${SITE_NAME} ESTM Dakar`, 72);
  const desc = clip(`${p.name} à ${fmt(price)} FCFA (${cat.toLowerCase()}), vendu par ${p.seller_name} sur ${SITE_NAME}, la marketplace des étudiants de l'ESTM à Dakar. ${p.description || ''}`, 300);

  const product = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product',
    name: p.name, description: clip(p.description || desc, 500), url, sku: String(p.id), category: cat, inLanguage: 'fr',
    brand: { '@type': 'Brand', name: p.seller_name },
    offers: { '@type': 'Offer', url, priceCurrency: 'XOF', price: String(price),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: p.seller_name, url: shopUrl } }
  };
  if (img) product.image = [img];
  if (Number(p.votes) > 0 && Number(p.rating) > 0) product.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: String(p.votes) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: base + '/' },
    { '@type': 'ListItem', position: 2, name: p.seller_name, item: shopUrl },
    { '@type': 'ListItem', position: 3, name: p.name, item: url } ] };

  const list = arr => arr.length ? `<ul>${arr.map(x => `<li><a href="${esc(productPath(x))}">${esc(x.name)}</a> — ${fmt(x.price)} FCFA</li>`).join('')}</ul>` : '';
  const body = `<section id="seoPage" class="seo-page">
<nav aria-label="Fil d'Ariane"><a href="/">${SITE_NAME}</a> › <a href="${esc(shopPath({ id: p.seller_id, name: p.seller_name }))}">${esc(p.seller_name)}</a> › <span>${esc(p.name)}</span></nav>
<article><h1>${esc(p.name)}</h1>
${img ? `<p><img src="${esc(img)}" alt="${esc(p.name)} – ${esc(p.seller_name)}" width="480" loading="eager"></p>` : ''}
<p><strong>${fmt(price)} FCFA</strong> · ${inStock ? 'En stock' : 'Rupture de stock'} · Catégorie : ${esc(cat)}</p>
<p>Vendu par <a href="${esc(shopPath({ id: p.seller_id, name: p.seller_name }))}">${esc(p.seller_name)}</a> sur ${SITE_NAME}, la marketplace des étudiants de l'ESTM (Dakar).</p>
${p.description ? `<p>${esc(p.description)}</p>` : ''}
</article>
${sameShop.length ? `<h2>Autres produits de ${esc(p.seller_name)}</h2>${list(sameShop)}` : ''}
${sameCat.length ? `<h2>Dans la même catégorie : ${esc(cat)}</h2>${list(sameCat)}` : ''}
<p><a href="/">Voir tous les produits</a> · <a href="/mentions-legales">Mentions légales</a> · <a href="/conditions">Conditions générales</a> · <a href="/confidentialite">Confidentialité</a></p>
</section>`;

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.end(renderShell(html, { title, desc, canonical: url, ogType: 'product', image: img || base + '/assets/logo-black.png', imageIsPhoto: !!img, imageAlt: `${p.name} – ${p.seller_name}`,
    meta: [`<meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="XOF">`], ld: [product, crumbs], body }));
};
