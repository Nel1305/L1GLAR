// /boutique/3-nom-de-la-boutique → l'appli + SEO de la boutique (liste de ses produits, liens crawlables)
const { esc, productPath, shopPath, safeHttps, clip, fmt, renderShell, origin, rest, indexHtml, SITE_NAME } = require('./_lib');

module.exports = async (req, res) => {
  const base = origin(req);
  let html;
  try { html = indexHtml(); } catch (e) { res.statusCode = 500; return res.end('index.html introuvable'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const m = String(req.query && req.query.slug || '').match(/^(\d{1,12})/);
  let s = null, items = [];
  if (m) {
    try {
      [s, items] = await Promise.all([
        rest(`public_sellers?id=eq.${m[1]}&select=id,name,bio,verified,shop_open&limit=1`).then(r => r[0]),
        rest(`products?seller_id=eq.${m[1]}&available=eq.true&select=id,name,price,photo_url,category&order=created_at.desc&limit=60`)
      ]);
    } catch (e) { s = null; }
  }
  if (!s || !s.shop_open || !items.length) {
    res.statusCode = 404; res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.end(renderShell(html, { noindex: true, title: `Boutique introuvable | ${SITE_NAME}`, desc: 'Cette boutique n\'est pas disponible.', image: base + '/assets/logo-black.png' }));
  }
  const canonicalPath = shopPath(s);
  if ('/boutique/' + req.query.slug !== canonicalPath) {
    res.statusCode = 301; res.setHeader('Location', canonicalPath); res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.end();
  }
  const url = base + canonicalPath;
  const first = items.find(x => safeHttps(x.photo_url));
  const img = first ? safeHttps(first.photo_url) : base + '/assets/logo-black.png';
  const n = items.length;
  const title = clip(`Boutique ${s.name} – ${n} produit${n > 1 ? 's' : ''} | ${SITE_NAME} ESTM Dakar`, 72);
  const desc = clip(`${s.bio ? s.bio + ' — ' : ''}Découvre les ${n} produit${n > 1 ? 's' : ''} de ${s.name} sur ${SITE_NAME}, la marketplace des étudiants de l'ESTM à Dakar : ${items.slice(0, 4).map(x => x.name).join(', ')}.`, 300);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Boutique ${s.name}`, url, description: desc, inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: base + '/' },
    mainEntity: { '@type': 'ItemList', numberOfItems: n, itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: base + productPath(x), name: x.name })) }
  }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: base + '/' }, { '@type': 'ListItem', position: 2, name: s.name, item: url } ] }];
  const body = `<section id="seoPage" class="seo-page">
<nav aria-label="Fil d'Ariane"><a href="/">${SITE_NAME}</a> › <span>${esc(s.name)}</span></nav>
<h1>Boutique ${esc(s.name)}</h1>
${s.bio ? `<p>${esc(s.bio)}</p>` : ''}
<p>${n} produit${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''} sur ${SITE_NAME}, la marketplace des étudiants de l'ESTM (Dakar).</p>
<ul>${items.map(x => `<li><a href="${esc(productPath(x))}">${esc(x.name)}</a> — ${fmt(x.price)} FCFA</li>`).join('')}</ul>
<p><a href="/">Voir tous les produits</a> · <a href="/mentions-legales">Mentions légales</a> · <a href="/conditions">Conditions générales</a> · <a href="/confidentialite">Confidentialité</a></p>
</section>`;
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.end(renderShell(html, { title, desc, canonical: url, image: img, imageIsPhoto: !!first, imageAlt: `Boutique ${s.name}`, ld, body }));
};
