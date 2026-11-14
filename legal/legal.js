(function(){
  var c = window.LEGAL_CONFIG || {};
  document.querySelectorAll('[data-lc]').forEach(function(el){
    var v = c[el.getAttribute('data-lc')];
    if (v == null) return;
    el.textContent = v;
    if (/^À compléter/.test(String(v))) el.classList.add('todo');
  });
  var t = document.getElementById('themeBtn');
  try {
    var s = localStorage.getItem('nmarket_theme');
    if (s === 'light' || s === 'dark') document.documentElement.setAttribute('data-theme', s);
  } catch(e){}
})();
