/* Écran de démarrage : l'interface reste cachée tant que la base de données n'a pas répondu.
   main.js appelle NMSplash.ready(true) quand le catalogue est chargé (ou ready(false) si la base est injoignable).
   Connexion lente : message à 6 s ; au bout de 25 s, bouton « Réessayer ». Retour du réseau : rechargement automatique. */
(function () {
  var el = document.getElementById('splash');
  if (!el) { window.NMSplash = { ready: function () { document.dispatchEvent(new Event('nm:ready')); } }; return; }
  var msg = el.querySelector('#spMsg'), err = el.querySelector('#spErr'), retry = el.querySelector('#spRetry');
  var t0 = Date.now(), done = false, failed = false;
  function say(t) { if (msg) { msg.textContent = t; msg.hidden = false; } }
  function fail(t) { failed = true; el.classList.add('fail'); say(t); if (err) err.hidden = false; }
  var t1 = setTimeout(function () { if (!done && !failed) say('Connexion lente… on charge encore, garde la page ouverte.'); }, 6000);
  var t2 = setTimeout(function () { if (!done) fail('Le serveur met trop de temps à répondre.'); }, 25000);
  if (retry) retry.addEventListener('click', function () { location.reload(); });
  window.addEventListener('online', function () { if (!done) location.reload(); });
  window.NMSplash = {
    ready: function (ok) {
      if (done) return;
      if (ok === false) { clearTimeout(t1); clearTimeout(t2); fail('Impossible de joindre la base de données. Vérifie ta connexion puis réessaie.'); return; }
      done = true; clearTimeout(t1); clearTimeout(t2);
      var wait = Math.max(0, 350 - (Date.now() - t0));
      var css = document.getElementById('mainCss'), tw = Date.now();
      (function go() {                                   // on attend aussi que la feuille de style soit appliquée (pas d'interface « nue »)
        if (css && css.media !== 'all' && Date.now() - tw < 10000) return setTimeout(go, 60);
      setTimeout(function () {
        el.classList.add('hide');
        document.dispatchEvent(new Event('nm:ready'));
        setTimeout(function () { el.remove(); }, 450);
      }, wait);
      })();
    }
  };
})();
