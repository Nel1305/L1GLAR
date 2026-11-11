/* Écran de démarrage : logo + petite barre de chargement, affiché une fois par session (visite), disparaît quand la page est prête */
(function () {
  var el = document.getElementById('splash'); if (!el) return;
  var seen = false; try { seen = sessionStorage.getItem('nm_splash') === '1'; } catch (e) {}
  if (seen) { el.remove(); return; }
  var t0 = Date.now(), done = false;
  function hide() {
    if (done) return; done = true;
    try { sessionStorage.setItem('nm_splash', '1'); } catch (e) {}
    var wait = Math.max(0, 900 - (Date.now() - t0));             // visible au moins 0,9 s (pas de flash)
    setTimeout(function () { el.classList.add('hide'); setTimeout(function () { el.remove(); }, 450); }, wait);
  }
  if (document.readyState === 'complete') hide(); else window.addEventListener('load', hide);
  setTimeout(hide, 4000);                                         // filet de sécurité
})();
