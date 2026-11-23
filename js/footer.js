/* Pied de page fixe, identique sur toutes les pages (boutique : déjà dans le HTML ; espaces vendeur/admin : injecté ici) */
(function () {
  function add() {
    if (document.querySelector('.site-footer')) return;
    var f = document.createElement('footer');
    f.className = 'site-footer';
    f.innerHTML = '<div class="sf-inner">' +
      '<nav class="sf-links" aria-label="Informations légales"><a href="/mentions-legales">Mentions légales</a><a href="/conditions">Conditions</a><a href="/confidentialite">Confidentialité</a></nav>' +
      '<p class="sf-copy">© ' + new Date().getFullYear() + ' N Market</p>' +
      '<p class="sf-partner"><span class="sf-pt">En partenariat avec</span> <img class="sf-logo" src="/assets/estm-logo-light.svg" alt="ESTM" width="42" height="20"></p></div>';
    document.body.appendChild(f);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
