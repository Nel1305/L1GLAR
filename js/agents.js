/* ═══════════════════════════════════════════════════════════════
   N MARKET — agents.js : « atelier d'agents IA » (simulation visuelle)
   1) Écran de démarrage : des curseurs-agents construisent la page d'accueil (formes, textes,
      images générées ou « récupérées sur le web »), avec des lasers. Si le réseau est mauvais,
      un agent écrit le message.
   2) Après le chargement : un agent par boutique pose ses articles sur la page, son nom affiché.
   Tout est décoratif (aucune IA réelle) ; transformations/opacité uniquement ; coupé si
   « réduire les animations ».
═══════════════════════════════════════════════════════════════ */
(function () {
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAN = !REDUCED && Element.prototype.animate;
  var CSS = '#splash{color:#111}html[data-theme=dark] #splash{color:#f2f2f2}@media (prefers-color-scheme:dark){:root:not([data-theme=light]) #splash{color:#f2f2f2}}' +
    '#splash.ag-on>img,#splash.ag-on .sp-bar{opacity:0;pointer-events:none;position:absolute;transition:opacity .35s}' +
    '#splash.ag-on .sp-msg{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
    '#splash.ag-on .sp-err{position:absolute;bottom:7vh;z-index:5}' +
    '.ag-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .5s}.ag-on .ag-stage{opacity:1}' +
    '.ag-stage.dim .ag-frame{opacity:.28;filter:blur(1.5px)}' +
    '.ag-frame{position:relative;width:min(92vw,640px);height:min(66vh,440px);border:1.5px solid currentColor;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 50px rgba(0,0,0,.14);transition:opacity .4s,filter .4s;overflow:hidden;background:rgba(128,128,128,.05)}' +
    '.ag-frame::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(128,128,128,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(128,128,128,.12) 1px,transparent 1px);background-size:22px 22px;pointer-events:none}' +
    '.ag-t{opacity:0;position:relative}.ag-t.d{opacity:1}' +
    '.ag-bar{display:flex;align-items:center;gap:10px;height:12%;min-height:34px;border:1.5px solid currentColor;border-radius:12px;padding:0 10px}' +
    '.ag-logo{width:26px;height:26px;border-radius:50%;background:currentColor;flex:0 0 26px}' +
    '.ag-title{font:800 15px/1 system-ui,sans-serif;letter-spacing:-.01em;flex:1;min-width:0}' +
    '.ag-dots{display:flex;gap:5px}.ag-dots i{width:9px;height:9px;border-radius:50%;border:1.5px solid currentColor}' +
    '.ag-search{height:9%;min-height:28px;border:1.5px solid currentColor;border-radius:99px;padding:0 14px;display:flex;align-items:center;font:500 12px system-ui,sans-serif;opacity:.0}.ag-search.d{opacity:.85}' +
    '.ag-chips{display:flex;gap:7px;height:7%;min-height:22px}.ag-chip{flex:0 0 auto;padding:0 12px;border:1.5px solid currentColor;border-radius:99px;display:flex;align-items:center;font:600 11px system-ui,sans-serif;min-width:44px}' +
    '.ag-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:10px}' +
    '.ag-card{border:1.5px solid currentColor;border-radius:12px;padding:7px;display:flex;flex-direction:column;gap:5px;min-height:0;overflow:hidden}' +
    '.ag-img{flex:1;min-height:0;border-radius:8px;background:rgba(128,128,128,.16);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}' +
    '.ag-img .ic{width:46%;height:46%;max-width:40px;max-height:40px;animation:agPop .35s cubic-bezier(.2,1.4,.4,1) both}' +
    '.ag-img.gen::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,var(--c,#22d3ee) 50%,transparent 70%);opacity:.55;animation:agScan .7s linear infinite}' +
    '.ag-t2{position:absolute;top:3px;right:3px;font:700 8px system-ui,sans-serif;padding:2px 5px;border-radius:99px;background:var(--c);color:#111;z-index:2;letter-spacing:.03em}' +
    '.ag-n{font:600 10.5px/1.15 system-ui,sans-serif;height:12px;white-space:nowrap;overflow:hidden}.ag-p{font:800 10.5px system-ui,sans-serif;height:15px;width:58px;border-radius:99px;display:flex;align-items:center;padding:0 7px;background:#111;color:#fff}' +
    'html[data-theme=dark] .ag-p{background:#f2f2f2;color:#111}@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .ag-p{background:#f2f2f2;color:#111}}' +
    '.ag-typing::after{content:"";display:inline-block;width:1.5px;height:1em;margin-left:1px;background:var(--c,currentColor);vertical-align:-2px;animation:agBlink .5s steps(1) infinite}' +
    '.ag-cur{position:absolute;left:0;top:0;z-index:20;pointer-events:none;will-change:transform}.ag-cur svg{display:block;width:20px;height:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}' +
    '.ag-tag{position:absolute;left:16px;top:16px;white-space:nowrap;font:700 10.5px/1 system-ui,sans-serif;padding:4px 8px;border-radius:99px;background:var(--c);color:#111;box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
    '.ag-laser{position:absolute;height:2px;transform-origin:0 50%;z-index:19;pointer-events:none;border-radius:2px;background:var(--c);box-shadow:0 0 6px 1px var(--c),0 0 14px 3px var(--c);will-change:transform,opacity}' +
    '.ag-spark{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid var(--c);z-index:19;pointer-events:none}' +
    '.ag-bubble{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;max-width:min(86vw,360px);padding:14px 18px;border-radius:16px;background:#111;color:#fff;font:600 14px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35);border:2px solid var(--c)}' +
    'html[data-theme=dark] .ag-bubble{background:#f2f2f2;color:#111}@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .ag-bubble{background:#f2f2f2;color:#111}}' +
    '.ag-bubble small{display:block;font-weight:500;opacity:.75;margin-top:4px;font-size:12px}' +
    '.ag-skip{position:absolute;right:14px;top:14px;z-index:40;font:600 12px system-ui,sans-serif;padding:8px 14px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;opacity:.7;cursor:pointer}' +
    '#agLayer{position:fixed;inset:0;z-index:9990;pointer-events:none;overflow:hidden}#agLayer .ag-cur{position:absolute}' +
    '@keyframes agBlink{50%{opacity:0}}@keyframes agScan{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@keyframes agPop{from{transform:scale(.2);opacity:0}}' +
    '@media (max-width:560px){.ag-grid{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr)}.ag-frame{height:min(72vh,520px);padding:10px}.ag-card:nth-child(n+7){display:none}}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  var speed = 1, aborted = false;
  var AG = [{ n: 'Agent Structure', c: '#22d3ee' }, { n: 'Agent Texte', c: '#f472b6' }, { n: 'Agent Images', c: '#a3e635' }, { n: 'Agent Style', c: '#fbbf24' }];
  var ARROW = '<svg viewBox="0 0 20 20"><path d="M2 2l6.5 16 2.4-6.6L17.5 9z" fill="var(--c)" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms * speed)); }); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function icon(n) { return typeof ic === 'function' ? ic(n) : ''; }

  /* ── briques communes : curseur, laser, étincelle ── */
  function cursor(box, a, x, y) {
    var c = h('div', 'ag-cur', ARROW + '<span class="ag-tag">' + a.n + '</span>');
    c.style.setProperty('--c', a.c); c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; c._x = x; c._y = y; box.appendChild(c); return c;
  }
  function move(c, x, y, ms) {
    var x0 = c._x, y0 = c._y; c._x = x; c._y = y;
    if (!CAN || speed < .05) { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; return Promise.resolve(); }
    var an = c.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }], { duration: Math.max(40, ms * speed), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    return an.finished.then(function () { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; an.cancel(); }, function () {});
  }
  function laser(box, c, x2, y2, ms) {
    if (!CAN || speed < .05) return;
    var x1 = c._x + 3, y1 = c._y + 3, dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
    var l = h('div', 'ag-laser'); l.style.cssText = 'left:' + x1 + 'px;top:' + y1 + 'px;width:' + d + 'px;--c:' + c.style.getPropertyValue('--c') + ';transform:rotate(' + Math.atan2(dy, dx) + 'rad)';
    var s = h('div', 'ag-spark'); s.style.cssText = 'left:' + x2 + 'px;top:' + y2 + 'px;--c:' + c.style.getPropertyValue('--c');
    box.appendChild(l); box.appendChild(s);
    var t = Math.max(60, ms * speed), rot = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
    l.animate([{ transform: rot + ' scaleX(0)', opacity: 1 }, { transform: rot + ' scaleX(1)', opacity: 1, offset: .45 }, { transform: rot + ' scaleX(1)', opacity: 0 }], { duration: t, easing: 'ease-out' }).onfinish = function () { l.remove(); };
    s.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(2.2)', opacity: 0 }], { duration: t, delay: t * .35, fill: 'backwards' }).onfinish = function () { s.remove(); };
  }
  function pos(el, box, fx, fy) { var r = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return [r.left - b.left + r.width * fx, r.top - b.top + r.height * fy]; }

  /* ═════ 1) ATELIER PENDANT LE CHARGEMENT ═════ */
  var A = { stage: null, frame: null, curs: [], started: 0, shown: null, shownRes: null, net: null, built: {}, splash: null, min: 2200, scriptDone: false };

  function start(el) {
    if (!CAN || A.stage) return;
    A.splash = el; A.started = Date.now();
    var seen = false; try { seen = sessionStorage.getItem('nm_ag') === '1'; sessionStorage.setItem('nm_ag', '1'); } catch (e) {}
    if (seen) { speed = .5; A.min = 900; }
    A.shown = new Promise(function (r) { A.shownRes = r; });
    var narrow = innerWidth <= 560, cards = narrow ? 6 : 6;
    var stage = h('div', 'ag-stage'), fr = h('div', 'ag-frame');
    var chips = '', grid = '', i;
    for (i = 0; i < 5; i++) chips += '<i class="ag-chip ag-t" data-id="chip' + i + '"><span data-id="chipt' + i + '"></span></i>';
    for (i = 0; i < cards; i++) grid += '<div class="ag-card ag-t" data-id="card' + i + '"><div class="ag-img" data-id="img' + i + '"></div><span class="ag-n" data-id="n' + i + '"></span><span class="ag-p ag-t" data-id="p' + i + '"><span data-id="pt' + i + '"></span></span></div>';
    fr.innerHTML = '<div class="ag-bar ag-t" data-id="bar"><i class="ag-logo ag-t" data-id="logo"></i><b class="ag-title" data-id="title"></b><span class="ag-dots ag-t" data-id="dots"><i></i><i></i><i></i></span></div>' +
      '<div class="ag-search ag-t" data-id="search"><span data-id="stext"></span></div><div class="ag-chips">' + chips + '</div><div class="ag-grid">' + grid + '</div>';
    stage.appendChild(fr);
    var skip = h('button', 'ag-skip', 'Passer'); skip.type = 'button'; skip.hidden = true; skip.addEventListener('click', function () { speed = .02; A.min = 0; });
    stage.appendChild(skip); setTimeout(function () { skip.hidden = false; }, 1200);
    el.appendChild(stage); A.stage = stage; A.frame = fr;
    setTimeout(function () { el.classList.add('ag-on'); run(); }, seen ? 250 : 800);          // d'abord le logo, puis l'atelier
    if (!navigator.onLine) net('Pas de connexion', 'Connecte-toi à internet pour charger N Market.');
    window.addEventListener('offline', function () { net('Pas de connexion', 'Connecte-toi à internet pour charger N Market.'); });
  }
  function q(id) { return A.frame.querySelector('[data-id="' + id + '"]'); }
  function ready(id) { return A.built[id] || (A.built[id] = new Promise(function (r) { A.built['_' + id] = r; })); }
  function done(id) { ready(id); A.built['_' + id](); }
  function reveal(el) {
    el.classList.add('d');
    if (CAN && speed >= .05) el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 260 * speed, easing: 'ease-out' });
  }
  function typeInto(el, text, a) {
    el.classList.add('ag-typing'); el.style.setProperty('--c', a.c);
    return new Promise(function (res) {
      var i = 0; (function step() { if (aborted) return res(); el.textContent = text.slice(0, ++i); if (i >= text.length) { el.classList.remove('ag-typing'); return res(); } setTimeout(step, 22 * speed); })();
    });
  }
  async function run() {
    var f = A.frame, box = A.stage, i;
    var cs = AG.map(function (a, k) { var c = cursor(box, a, [16, box.clientWidth - 130, 16, box.clientWidth - 130][k], [box.clientHeight * .12, box.clientHeight * .16, box.clientHeight - 70, box.clientHeight - 50][k]); A.curs.push(c); return c; });
    var tick = function () { return aborted; };
    var NAMES = ['Sac à dos', 'Gâteau maison', 'Casque audio', 'T-shirt ESTM', 'Cahier A4', 'Montre', 'Jus bissap'], ICONS = ['bag', 'cake', 'headphones', 'shirt', 'book', 'watch', 'drink'], PRICES = ['4 500 F', '2 000 F', '12 000 F', '6 500 F', '800 F', '9 000 F', '500 F'];
    var cardsN = f.querySelectorAll('.ag-card').length;
    /* Agent Structure : dessine les formes, avec le laser */
    var shapes = ['bar', 'logo', 'dots', 'search'].concat([0, 1, 2, 3, 4].map(function (n) { return 'chip' + n; }), Array.apply(null, Array(cardsN)).map(function (_, n) { return 'card' + n; }));
    var P1 = (async function () {
      for (var s of shapes) { if (tick()) return; var el = q(s), p = pos(el, box, 0, 0), c = pos(el, box, .5, .5);
        await move(cs[0], p[0], p[1], 130); laser(box, cs[0], c[0], c[1], 220); reveal(el); done(s); await sleep(110); }
      await move(cs[0], pos(f, box, .5, 1.02)[0], pos(f, box, .5, 1.02)[1], 300);
    })();
    /* Agent Texte : écrit les textes */
    var P2 = (async function () {
      var jobs = [['bar', 'title', 'N Market'], ['search', 'stext', 'Rechercher un produit…']].concat(['Tout', 'Mode', 'Food', 'Tech', 'Beauté'].map(function (t, n) { return ['chip' + n, 'chipt' + n, t]; }), Array.apply(null, Array(cardsN)).map(function (_, n) { return ['card' + n, 'n' + n, NAMES[n]]; }));
      for (var j of jobs) { if (tick()) return; await ready(j[0]); var el = q(j[1]), p = pos(el, box, 0, 1);
        await move(cs[1], p[0] + 4, p[1] + 2, 110); laser(box, cs[1], p[0] + 10, p[1] - 4, 130); await typeInto(el, j[2], AG[1]); }
    })();
    /* Agent Images : génère ou récupère les images */
    var P3 = (async function () {
      for (var n = 0; n < cardsN; n++) { if (tick()) return; await ready('card' + n); var el = q('img' + n), web = n % 2 === 1;
        var p = pos(el, box, .5, .5); el.classList.add('gen'); el.style.setProperty('--c', AG[2].c);
        var tg = h('em', 'ag-t2', web ? 'WEB' : 'IA'); tg.style.setProperty('--c', AG[2].c); el.appendChild(tg);
        await move(cs[2], p[0] - 10, p[1] - 8, 120);
        if (web) { var top = pos(f, box, .9, 0); laser(box, { _x: top[0], _y: top[1] - 6, style: cs[2].style }, p[0], p[1], 420); }
        laser(box, cs[2], p[0], p[1], 360); await sleep(380);
        el.classList.remove('gen'); tg.remove(); el.insertAdjacentHTML('afterbegin', icon(ICONS[n % ICONS.length])); done('img' + n); await sleep(60); }
    })();
    /* Agent Style : colore les prix et finalise */
    var P4 = (async function () {
      for (var n = 0; n < cardsN; n++) { if (tick()) return; await ready('img' + n); var el = q('p' + n), p = pos(el, box, 0, .5);
        await move(cs[3], p[0] - 12, p[1] - 6, 110); laser(box, cs[3], p[0] + 20, p[1], 160); reveal(el); await typeInto(q('pt' + n), PRICES[n], AG[3]); }
    })();
    await Promise.all([P1, P2, P3, P4]);
    A.scriptDone = true; A.shownRes();
    /* tant que ça charge : les agents peaufinent (images régénérées) */
    var loop = 0;
    while (!aborted) {
      var n2 = Math.floor(rnd(0, cardsN)), el2 = q('img' + n2); if (!el2) break;
      var p2 = pos(el2, box, .5, .5); await move(cs[2], p2[0] - 10, p2[1] - 8, 450); el2.classList.add('gen'); laser(box, cs[2], p2[0], p2[1], 500); await sleep(600);
      el2.classList.remove('gen'); var ic2 = el2.querySelector('.ic'); if (ic2) ic2.outerHTML = icon(ICONS[Math.floor(rnd(0, ICONS.length))]);
      var tgt = pos(q('card' + Math.floor(rnd(0, cardsN))), box, rnd(.2, .8), rnd(.2, .8)); await move(cs[0], tgt[0], tgt[1], 500); laser(box, cs[0], tgt[0] + 8, tgt[1] + 8, 300);
      if (++loop > 40) break;
    }
  }
  /* un agent écrit un message réseau au centre de l'atelier */
  function net(title, sub) {
    if (!A.stage) return;
    var a = { n: 'Agent Réseau', c: '#ef4444' };
    if (A.net && A.net.b) { A.net.b.querySelector('b').textContent = title; A.net.b.querySelector('small').textContent = sub; return; }
    A.splash.classList.add('ag-on'); A.stage.classList.add('dim');
    var box = A.stage, b = h('div', 'ag-bubble', '<b></b><small></small>'); b.style.setProperty('--c', a.c); box.appendChild(b);
    var c = cursor(box, a, -40, box.clientHeight / 2); A.net = { b: b, c: c };
    var cx = box.clientWidth / 2, cy = box.clientHeight / 2;
    b.style.opacity = 0;
    move(c, cx - 150, cy + 42, 700).then(function () {
      b.style.opacity = 1; laser(box, c, cx, cy, 300);
      typeInto(b.querySelector('b'), title, a).then(function () { b.querySelector('small').textContent = sub; });
    });
  }
  function netClear() { if (!A.net) return; A.net.b.remove(); A.net.c.remove(); A.net = null; if (A.stage) A.stage.classList.remove('dim'); }
  /* appelé par splash.js quand les données sont là : on laisse finir le show, puis on rend la main */
  function finish() {
    netClear();
    if (!A.stage) return Promise.resolve();
    var wait = Math.max(0, A.min - (Date.now() - A.started));
    return new Promise(function (res) {
      setTimeout(function () { speed = Math.min(speed, .25); A.shown.then(function () { setTimeout(function () { aborted = true; res(); }, 250); }); }, wait);
    });
  }

  /* ═════ 2) UN AGENT PAR BOUTIQUE POSE LES ARTICLES ═════ */
  var SELLER_COL = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa'];
  function deliver(cards, nameOf) {
    if (!CAN || !cards.length) return;
    var layer = h('div', ''); layer.id = 'agLayer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
    var N = Math.min(3, cards.length), lanes = []; for (var k = 0; k < N; k++) lanes.push([]);
    cards.forEach(function (c, i) { c.style.opacity = '0'; lanes[i % N].push(c); });
    speed = 1;
    var alive = N;
    lanes.forEach(function (list, k) {
      (async function () {
        var cur = cursor(layer, { n: '', c: SELLER_COL[k % SELLER_COL.length] }, k % 2 ? innerWidth + 20 : -40, -40 + k * 30);
        cur.style.setProperty('--c', SELLER_COL[k % SELLER_COL.length]);
        await sleep(k * 130);
        for (var card of list) {
          var r = card.getBoundingClientRect(), nm = nameOf(card) || 'Boutique';
          cur.querySelector('.ag-tag').textContent = nm;
          await move(cur, r.left + 10, r.top + 8, 380);
          laser(layer, cur, r.left + r.width / 2, r.top + r.height / 2, 300);
          card.style.opacity = '';
          card.animate([{ clipPath: 'inset(0 100% 0 0 round 14px)', opacity: 0 }, { clipPath: 'inset(0 0 0 0 round 14px)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
          card.animate([{ transform: 'translateY(8px) scale(.97)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
          await sleep(170);
        }
        await move(cur, k % 2 ? innerWidth + 40 : -50, innerHeight * (.3 + k * .2), 450);
        cur.remove(); if (--alive === 0) setTimeout(function () { layer.remove(); }, 100);
      })();
    });
    setTimeout(function () { cards.forEach(function (c) { c.style.opacity = ''; }); layer.remove(); }, 6000);     // sécurité
  }

  /* L'atelier de démarrage (cinématique + bouton « Passer ») est retiré : seul reste le dépôt des articles par les agents. */
  window.NMAgents = { net: function () {}, netClear: function () {}, finish: function () { return Promise.resolve(); }, deliver: deliver, enabled: !!CAN };
})();
