/* Tableaux → cartes sur téléphone : chaque cellule reçoit le titre de sa colonne (data-label),
   le CSS (≤768px) affiche alors chaque ligne comme une fiche lisible, sans défilement horizontal. */
(function () {
  function label(table) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var tds = tr.children;
      if (tds.length === 1 && tds[0].hasAttribute('colspan')) { tr.classList.add('tc-empty'); return; }
      for (var i = 0; i < tds.length; i++) {
        if (heads[i] !== undefined && !tds[i].hasAttribute('data-label')) {
          tds[i].setAttribute('data-label', heads[i]);
          if (!heads[i]) tds[i].classList.add('tc-actions');
        }
      }
    });
  }
  function init() {
    document.querySelectorAll('table.data-table').forEach(function (t) {
      label(t);
      var tb = t.querySelector('tbody'); if (!tb) return;
      new MutationObserver(function () { label(t); }).observe(tb, { childList: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
