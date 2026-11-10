/* Empêche le zoom par pincement / double-tap (iOS Safari ignore user-scalable=no) */
(function () {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  var last = 0;
  document.addEventListener('touchend', function (e) { var n = Date.now(); if (n - last < 300) e.preventDefault(); last = n; }, { passive: false });
  document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });   // Ctrl + molette (PC)
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].indexOf(e.key) > -1) e.preventDefault(); });
})();
