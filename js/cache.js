/* ═══════════════════════════════════════════════════
   N MARKET — cache.js
   Cache des lectures de la base (à charger APRÈS db.js) :
   • chaque lecture est gardée en mémoire pendant un TTL (court pour commandes/retours, long pour le catalogue)
   • les requêtes identiques simultanées sont fusionnées en une seule
   • toute écriture (ajout, modification, suppression, commande…) invalide ce qui est concerné
   • actualisation PÉRIODIQUE en arrière-plan : seules les données de la page affichée sont relues,
     et la page n'est redessinée QUE si quelque chose a changé (pas de rechargement, pas de clignotement)
   • pause quand l'onglet est caché, hors-ligne, ou pendant qu'on saisit / qu'une fenêtre est ouverte
   • le catalogue public est aussi gardé dans sessionStorage (un rechargement ne retélécharge pas tout)
═══════════════════════════════════════════════════ */
const NMCache = (() => {
  const MIN = 60 * 1000;
  /* durée de validité (ms) de chaque lecture */
  const TTL = {
    dbGetProducts: MIN, dbGetOrders: 30000, dbGetReturns: 30000, dbGetReviews: 2 * MIN,
    dbGetCategories: 10 * MIN, dbGetFilieres: 10 * MIN, dbGetAdBanners: 5 * MIN, dbGetPromoPlans: 10 * MIN,
    dbGetPromotions: MIN, dbGetCommissions: MIN, dbGetActivePromotedProductIds: 2 * MIN,
    dbGetPublicSellers: 5 * MIN, dbGetAllUsers: MIN, dbGetSellerReports: MIN,
    dbGetNotifications: 30000, dbGetUnreadNotificationCount: 30000, dbGetConnections: MIN,
  };
  /* données publiques : conservées aussi dans sessionStorage (jamais commandes / retours / notifications) */
  const PERSIST = new Set(['dbGetProducts', 'dbGetCategories', 'dbGetFilieres', 'dbGetAdBanners', 'dbGetPromoPlans',
                           'dbGetActivePromotedProductIds', 'dbGetPublicSellers', 'dbGetReviews']);
  /* lectures peu changeantes : épargnées par les invalidations génériques */
  const STATIC = new Set(['dbGetCategories', 'dbGetFilieres', 'dbGetAdBanners', 'dbGetPromoPlans']);
  const SS_PREFIX = 'nm_cache_v1:';

  const store = new Map();      // clé → { t, json, data, fn, args }
  const inflight = new Map();
  const pageKeys = new Set();   // lectures utilisées par la page affichée
  const origs = {};
  let timer = null, lastRun = 0;

  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const keyOf = (name, args) => name + ':' + JSON.stringify(args);
  const now = () => Date.now();

  function ssGet(key) {
    try { const raw = sessionStorage.getItem(SS_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function ssSet(key, entry) {
    try { if (entry.json.length < 1.5e6) sessionStorage.setItem(SS_PREFIX + key, JSON.stringify({ t: entry.t, json: entry.json })); } catch (e) {}
  }
  function ssClear(prefixName) {
    try { Object.keys(sessionStorage).filter(k => k.startsWith(SS_PREFIX + (prefixName || ''))).forEach(k => sessionStorage.removeItem(k)); } catch (e) {}
  }

  function put(name, key, args, data) {
    const json = JSON.stringify(data);
    // résultat vide : durée très courte (une erreur réseau renvoie [] et ne doit pas rester en cache)
    const empty = Array.isArray(data) && !data.length;
    const t = empty ? now() - (TTL[name] || MIN) + 8000 : now();
    const entry = { t, json, data, fn: name, args };
    store.set(key, entry);
    if (PERSIST.has(name) && !empty) ssSet(key, entry);
    return entry;
  }

  async function load(name, key, args) {
    if (inflight.has(key)) return inflight.get(key);
    const p = origs[name](...args).then(data => { put(name, key, args, data); return data; })
                                  .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  function wrapRead(name) {
    const orig = window[name]; if (typeof orig !== 'function') return;
    origs[name] = orig;
    window[name] = async function (...args) {
      const key = keyOf(name, args);
      pageKeys.add(key);
      let e = store.get(key);
      if (!e && PERSIST.has(name)) {                       // rechargement de page : reprend la copie de session
        const s = ssGet(key);
        if (s && now() - s.t < (TTL[name] || MIN)) { e = { t: s.t, json: s.json, data: JSON.parse(s.json), fn: name, args }; store.set(key, e); }
      }
      if (e && now() - e.t < (TTL[name] || MIN)) return clone(e.data);
      return clone(await load(name, key, args));
    };
  }

  /* écritures : invalident ce qui peut avoir changé */
  function wrapWrite(name) {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = async function (...args) {
      try { return await orig(...args); }
      finally {
        const catalog = /Categor|Filiere|AdBanner|PromoPlan/.test(name);
        invalidate(catalog ? null : '*volatile');
        if (catalog) invalidate('*all');
      }
    };
  }

  /* invalidate('dbGetOrders') | '*volatile' (tout sauf catalogue statique) | '*all' */
  function invalidate(what) {
    for (const [k, e] of [...store]) {
      if (what === '*all' || (what === '*volatile' && !STATIC.has(e.fn)) || what === e.fn) store.delete(k);
    }
    if (what === '*all') ssClear(); else if (what && what !== '*volatile') ssClear(what); else if (what === '*volatile') ssClear('dbGetProducts');
    if (what === '*volatile') { ssClear('dbGetReviews'); ssClear('dbGetActivePromotedProductIds'); ssClear('dbGetPublicSellers'); }
  }

  function install() {
    Object.keys(TTL).forEach(wrapRead);
    Object.getOwnPropertyNames(window)
      .filter(n => /^db(Insert|Update|Delete|Block|PlaceOrder|Mark|Send|Create|AdminSave|AdminRemove)/.test(n) && typeof window[n] === 'function')
      .forEach(wrapWrite);
  }

  /* À appeler quand on change de page : on ne suit que les lectures de la page affichée */
  function beginPage() { pageKeys.clear(); }

  const isTyping = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  const modalOpen = () => !!document.querySelector('.modal-overlay.show, .modal-bg.show, .overlay.show, [id$="Modal"].show');

  /* Relit en arrière-plan les données de la page affichée ; redessine seulement si elles ont changé */
  async function refreshNow(renderFn) {
    lastRun = now();
    const keys = [...pageKeys]; if (!keys.length) return false;
    const changed = await Promise.all(keys.map(async k => {
      const e = store.get(k); if (!e || !origs[e.fn]) return false;
      try {
        const data = await origs[e.fn](...e.args);
        const before = e.json; const fresh = put(e.fn, k, e.args, data);
        return fresh.json !== before;
      } catch (err) { return false; }
    }));
    if (changed.some(Boolean) && renderFn) {
      window.NM_SILENT = true; const y = window.scrollY;
      try { await renderFn(); } finally { window.NM_SILENT = false; window.scrollTo(0, y); }
      return true;
    }
    return false;
  }

  /* intervalMs : fréquence ; renderFn : redessine la page courante (appelée seulement si les données ont changé) ;
     canRefresh : (optionnel) renvoie false pour ignorer ce tour (ex. page-formulaire) */
  function startAutoRefresh(renderFn, intervalMs, canRefresh) {
    stopAutoRefresh();
    const tick = async () => {
      if (document.hidden || !navigator.onLine || isTyping() || modalOpen()) return;
      if (canRefresh && !canRefresh()) return;
      await refreshNow(renderFn);
    };
    timer = setInterval(tick, intervalMs || 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && now() - lastRun > (intervalMs || 60000) / 2) tick();     // retour sur l'onglet : mise à jour immédiate
    });
    window.addEventListener('online', tick);
  }
  function stopAutoRefresh() { if (timer) clearInterval(timer); timer = null; }

  install();
  return { invalidate, beginPage, startAutoRefresh, stopAutoRefresh, refreshNow, _store: store };
})();
window.NM_SILENT = false;
