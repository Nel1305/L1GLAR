// /sitemap.xml — accueil, pages légales, boutiques, produits (+ photos). Mis à jour automatiquement.
const { esc, productPath, shopPath, safeHttps, origin, rest } = require('./_lib');

module.exports = async (req, res) => {
  const base = origin(req);
  let prods = [], shops = [];
  try { prods = await rest('products?available=eq.true&select=id,name,seller_id,photo_url,created_at&order=created_at.desc&limit=5000'); } catch (e) { prods = []; }
  try {
    const ids = [...new Set(prods.map(p => p.seller_id))].slice(0, 500);
    if (ids.length) shops = await rest(`public_sellers?id=in.(${ids.join(',')})&shop_open=eq.true&select=id,name`);
  } catch (e) { shops = []; }
  const U = (loc, extra = '', freq = 'weekly', pr = '0.6') => `<url><loc>${esc(base + loc)}</loc>${extra}<changefreq>${freq}</changefreq><priority>${pr}</priority></url>`;
  const urls = [
    U('/', '', 'daily', '1.0'),
    U('/mentions-legales', '', 'yearly', '0.2'), U('/conditions', '', 'yearly', '0.2'), U('/confidentialite', '', 'yearly', '0.2')
  ].concat(shops.map(s => U(shopPath(s), '', 'weekly', '0.7')))
   .concat(prods.map(p => {
     const img = safeHttps(p.photo_url);
     const extra = (p.created_at ? `<lastmod>${esc(String(p.created_at).slice(0, 10))}</lastmod>` : '') + (img ? `<image:image><image:loc>${esc(img)}</image:loc><image:title>${esc(p.name)}</image:title></image:image>` : '');
     return U(productPath(p), extra, 'weekly', '0.8');
   }));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>`);
};
