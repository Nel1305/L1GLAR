/* ═══════════════════════════════════════════════════
   N MARKET — theme.js
   Gère le mode clair/sombre :
   - Par défaut : suit le réglage de l'appareil (auto)
   - Le bouton ☀/🌙 permet de forcer clair ou sombre
     (mémorisé dans le navigateur)
═══════════════════════════════════════════════════ */
(function () {
  const STORAGE_KEY = 'nmarket_theme'; // 'light' | 'dark' | absent = auto

  function apply(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function current() {
    return localStorage.getItem(STORAGE_KEY); // null = auto
  }

  function systemPrefersLight() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function icon(theme) {
    if (theme === 'light') return '☀️';
    if (theme === 'dark')  return '🌙';
    return systemPrefersLight() ? '☀️' : '🌙';
  }

  // Applique le thème mémorisé dès que possible (avant le rendu)
  apply(current());

  function updateButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = icon(current());
      btn.title = current() === 'light' ? 'Mode clair (cliquer pour sombre)'
                : current() === 'dark'  ? 'Mode sombre (cliquer pour automatique)'
                : 'Mode automatique (cliquer pour forcer un thème)';
    });
  }

  function cycleTheme() {
    const c = current();
    let next;
    if (c === null) next = systemPrefersLight() ? 'dark' : 'light'; // bascule par rapport au système
    else if (c === (systemPrefersLight() ? 'dark' : 'light')) next = (c === 'light' ? 'dark' : 'light');
    else next = null; // retour à auto
    if (next === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    updateButtons();
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateButtons();
    document.querySelectorAll('.theme-toggle').forEach(btn => btn.addEventListener('click', cycleTheme));
    initMobileNav();
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', updateButtons);
  }

  /* ── NAVIGATION MOBILE (tiroir latéral) ── */
  function initMobileNav() {
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const burger   = document.getElementById('hamburgerBtn');
    if (!sidebar || !burger) return;

    function openDrawer()  { sidebar.classList.add('open'); backdrop && backdrop.classList.add('show'); }
    function closeDrawer() { sidebar.classList.remove('open'); backdrop && backdrop.classList.remove('show'); }

    burger.addEventListener('click', openDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    // Ferme le tiroir après un clic sur un lien de nav (mobile)
    sidebar.querySelectorAll('.nav-item, .admin-btn, #userPill, a').forEach(el => {
      el.addEventListener('click', closeDrawer);
    });

    // Raccourci panier (page publique) : ouvre directement la page Panier
    const cartBtn = document.querySelector('.mobile-cart-btn[data-page]');
    if (cartBtn) {
      cartBtn.addEventListener('click', () => {
        const target = document.querySelector(`.nav-item[data-page="${cartBtn.dataset.page}"]`);
        if (target) target.click();
      });
    }
  }
})();
