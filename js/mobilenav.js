/* ═══════════════════════════════════════════════════
   N MARKET — mobilenav.js
   Barre d'onglets en bas (smartphone) construite à partir du menu latéral :
   les onglets principaux + un petit menu « Plus » pour le reste.
   <body data-bnav="shop | seller | admin"> active la barre sur la page.
   Elle flotte au-dessus de la zone sûre (barre d'accueil iPhone) et de la barre
   d'adresse placée en bas par Safari / Samsung Internet / Chrome.
═══════════════════════════════════════════════════ */
(function () {
  const CFG = {
    shop:   { primary: ['products', 'cart'], account: true },
    seller: { primary: ['dashboard', 'orders', 'products'] },
    admin:  { primary: ['dashboard', 'sellers', 'orders'] },
  };
  const SHORT = { dashboard: 'Accueil', products: 'Produits', cart: 'Panier', orders: 'Commandes', sellers: 'Vendeurs',
                  returns: 'Retours', reviews: 'Avis', notifications: 'Alertes' };
  const ICON  = { dashboard: '🏠', products: '🛍', cart: '🛒', orders: '📦', sellers: '👥' };

  function init() {
    const mode = document.body.dataset.bnav; const cfg = CFG[mode];
    if (!cfg) return;
    const navItems = () => [...document.querySelectorAll('.sidebar .nav-item[data-page]')];
    if (!navItems().length) return;

    const labelOf = b => SHORT[b.dataset.page] || ([...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() || b.dataset.page);
    const iconOf  = b => ICON[b.dataset.page] || (b.querySelector('.icon') ? b.querySelector('.icon').textContent : '•');
    const btnFor  = page => document.querySelector(`.sidebar .nav-item[data-page="${page}"]`);

    /* ── DOM ── */
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Navigation principale');
    const pop = document.createElement('div'); pop.className = 'bn-pop'; pop.hidden = true;
    document.body.append(nav, pop);

    function tab(cls, icon, label, attrs) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'bn-item ' + cls;
      if (attrs) Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
      b.innerHTML = `<span class="bn-ico">${icon}</span><span class="bn-lbl">${label}</span><span class="bn-badge" hidden></span>`;
      return b;
    }

    function build() {
      nav.innerHTML = '';
      cfg.primary.forEach(page => {
        const o = btnFor(page); if (!o) return;
        const t = tab('bn-page', iconOf(o), labelOf(o), { 'data-page': page });
        t.addEventListener('click', () => { closePop(); o.click(); window.scrollTo({ top: 0 }); });
        nav.appendChild(t);
      });
      const more = tab('bn-more', '⋯', 'Plus', { 'aria-haspopup': 'true', 'aria-expanded': 'false' });
      more.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? openPop() : closePop(); });
      nav.appendChild(more);
      if (cfg.account) {
        const pill = document.getElementById('userPill');
        const t = tab('bn-account', '👤', 'Compte');
        t.addEventListener('click', () => { closePop(); pill && pill.click(); });
        nav.appendChild(t);
      }
    }

    /* ── menu « Plus » ── */
    function popItems() {
      const items = [];
      navItems().filter(b => !cfg.primary.includes(b.dataset.page) && getComputedStyle(b).display !== 'none')
        .forEach(b => items.push({ icon: iconOf(b), label: labelOf(b), dot: hasDot(b), run: () => b.click() }));
      if (mode === 'shop') {
        /* le compte vendeur s'ouvre depuis l'onglet « Compte » */
      } else {
        items.push({ icon: '↩', label: 'Retour au site', run: () => { location.href = '../index.html'; } });
        const lo = document.getElementById('logoutBtn') || document.getElementById('adminLogoutBtn');
        if (lo) items.push({ icon: '⎋', label: 'Se déconnecter', run: () => lo.click() });
      }
      return items;
    }
    function openPop() {
      const items = popItems();
      pop.innerHTML = items.map((it, i) => `<button type="button" class="bn-pop-item" data-i="${i}"><span class="bn-pop-ico">${it.icon}</span><span>${it.label}</span>${it.dot ? '<span class="bn-pop-dot"></span>' : ''}</button>`).join('');
      pop.querySelectorAll('.bn-pop-item').forEach(el => el.addEventListener('click', () => { const it = items[+el.dataset.i]; closePop(); it.run(); window.scrollTo({ top: 0 }); }));
      pop.hidden = false; nav.querySelector('.bn-more').setAttribute('aria-expanded', 'true');
    }
    function closePop() { pop.hidden = true; const m = nav.querySelector('.bn-more'); if (m) m.setAttribute('aria-expanded', 'false'); }
    document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) closePop(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

    /* ── état : onglet actif, pastilles ── */
    function hasDot(b) {
      const d = b.querySelector('.dot'); if (d && getComputedStyle(d).display !== 'none') return true;
      const c = b.querySelector('.cart-count'); return !!(c && getComputedStyle(c).display !== 'none' && c.textContent.trim() !== '0');
    }
    function sync() {
      const active = (document.querySelector('.sidebar .nav-item.active') || {}).dataset;
      const page = active && active.page;
      nav.querySelectorAll('.bn-page').forEach(t => {
        const o = btnFor(t.dataset.page); t.classList.toggle('active', t.dataset.page === page);
        const badge = t.querySelector('.bn-badge'); const c = o && o.querySelector('.cart-count');
        if (c && c.textContent.trim() !== '0' && getComputedStyle(c).display !== 'none') { badge.textContent = c.textContent.trim(); badge.hidden = false; badge.classList.remove('dot-only'); }
        else if (o && hasDot(o)) { badge.textContent = ''; badge.hidden = false; badge.classList.add('dot-only'); }
        else badge.hidden = true;
      });
      const more = nav.querySelector('.bn-more');
      if (more) {
        const others = navItems().filter(b => !cfg.primary.includes(b.dataset.page));
        more.classList.toggle('active', !!page && !cfg.primary.includes(page));
        const mb = more.querySelector('.bn-badge'); mb.textContent = ''; mb.classList.add('dot-only'); mb.hidden = !others.some(hasDot);
      }
      const acc = nav.querySelector('.bn-account');
      if (acc) {
        const nm = (document.getElementById('userName') || {}).textContent || '';
        const logged = nm && nm.trim() !== 'Se connecter';
        acc.querySelector('.bn-lbl').textContent = logged ? (nm.trim().split(' ')[0].slice(0, 9)) : 'Connexion';
        acc.querySelector('.bn-ico').textContent = logged ? ((document.getElementById('userAvatar') || {}).textContent || '👤') : '👤';
        acc.classList.toggle('logged', !!logged);
      }
    }
    let raf = 0; const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); };
    build(); sync();
    const mo = new MutationObserver(schedule);
    const sb = document.querySelector('.sidebar');
    mo.observe(sb, { subtree: true, attributes: true, childList: true, characterData: true, attributeFilter: ['class', 'style'] });

    /* ── clavier ouvert : on masque la barre (sinon elle remonte au-dessus du clavier) ── */
    const isField = el => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit)$/.test(el.type || '');
    document.addEventListener('focusin',  e => { if (isField(e.target)) document.body.classList.add('kb-open'); });
    document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kb-open'); }, 120));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
