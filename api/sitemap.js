// /sitemap.xml — accueil + une page par produit disponible (mis à jour automatiquement)
const { esc, productPath, origin, rest } = require('./_lib');

module.exports = async (req, res) => {
  const base = origin(req);
  let rows = [];
  try { rows = await rest('products?available=eq.true&select=id,name,created_at&order=created_at.desc&limit=5000'); } catch (e) { rows = []; }
  const urls = [`<url><loc>${esc(base)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`]
    .concat(rows.map(p => `<url><loc>${esc(base + productPath(p))}</loc>${p.created_at ? `<lastmod>${esc(String(p.created_at).slice(0, 10))}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority></url>`));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
};
