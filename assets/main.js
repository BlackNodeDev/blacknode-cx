/* BlackNode — small shared script. No dependencies. */
(function () {
  'use strict';

  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('mnav');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Product filters
  var chips = document.querySelectorAll('.fchip');
  if (chips.length) {
    var cards = document.querySelectorAll('.pcard[data-status]');
    var count = document.getElementById('p-count');
    var apply = function (f) {
      var n = 0;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.filter === f ? 'true' : 'false'); });
      cards.forEach(function (card) {
        var show = f === 'all' || card.dataset.status === f;
        card.hidden = !show;
        if (show) n++;
      });
      if (count) count.textContent = n + (n === 1 ? ' product' : ' products');
    };
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        apply(c.dataset.filter);
        history.replaceState(null, '', c.dataset.filter === 'all' ? location.pathname : '#' + c.dataset.filter);
      });
    });
    var h = location.hash.replace('#', '');
    apply(['live', 'beta', 'wip', 'private'].indexOf(h) > -1 ? h : 'all');
  }

  // Bots page: tiny platformer demo (original, canvas-only)
  var cv = document.getElementById('sandbox');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var narrow = cv.clientWidth && cv.clientWidth < 560;
  var W = narrow ? 400 : 640, H = narrow ? 300 : 360;
  if (narrow) cv.style.aspectRatio = '4 / 3';
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
  var abil = { dbl: false, dash: false, floaty: false, plats: true };
  var keys = { l: false, r: false };
  var p = { x: 30, y: 100, vx: 0, vy: 0, w: 26, h: 26, ground: false, jumps: 0, dashT: 0, face: 1 };
  var basePlats = [{ x: 0, y: H - 40, w: W, h: 40 }];
  var extra = narrow
    ? [{ x: 70, y: 200, w: 90, h: 10 }, { x: 180, y: 145, w: 90, h: 10 }, { x: 290, y: 90, w: 90, h: 10 }]
    : [{ x: 150, y: 250, w: 110, h: 10 }, { x: 320, y: 195, w: 110, h: 10 }, { x: 480, y: 140, w: 110, h: 10 }];
  var hud = document.getElementById('sb-hud');

  function plats() { return abil.plats ? basePlats.concat(extra) : basePlats; }
  function jump() {
    var max = abil.dbl ? 2 : 1;
    if (p.ground || p.jumps < max) { p.vy = -420; p.jumps++; p.ground = false; }
  }
  function dash() { if (abil.dash && p.dashT <= 0) { p.dashT = 0.16; } }

  document.addEventListener('keydown', function (e) {
    if (!inView) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); jump(); }
    if (e.key === 'Shift') dash();
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = false;
  });
  document.querySelectorAll('[data-pad]').forEach(function (b) {
    var k = b.dataset.pad;
    var down = function (e) { e.preventDefault(); b.classList.add('down'); if (k === 'l' || k === 'r') keys[k] = true; if (k === 'j') jump(); if (k === 'x') dash(); };
    var up = function () { b.classList.remove('down'); if (k === 'l' || k === 'r') keys[k] = false; };
    b.addEventListener('pointerdown', down);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, up); });
  });
  document.querySelectorAll('[data-abil]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.abil; abil[a] = !abil[a];
      b.setAttribute('aria-pressed', abil[a] ? 'true' : 'false');
      updHud();
    });
  });
  function updHud() {
    if (!hud) return;
    var on = []; if (abil.dbl) on.push('double jump'); if (abil.dash) on.push('dash'); if (abil.floaty) on.push('floaty gravity');
    hud.textContent = 'abilities: move, jump' + (on.length ? ', ' + on.join(', ') : '');
  }
  updHud();

  var inView = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; }).observe(cv);
  }

  var last = performance.now();
  function step(now) {
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    if (inView) { update(dt); draw(); }
    requestAnimationFrame(step);
  }
  function update(dt) {
    var speed = 220, dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    if (dir) p.face = dir;
    p.vx = dir * speed;
    if (p.dashT > 0) { p.vx = p.face * 620; p.dashT -= dt; }
    var g = abil.floaty ? 620 : 1150;
    if (p.dashT <= 0) p.vy += g * dt;
    p.x += p.vx * dt;
    if (p.x < 0) p.x = 0; if (p.x + p.w > W) p.x = W - p.w;
    var prevY = p.y; p.y += p.vy * dt; p.ground = false;
    plats().forEach(function (q) {
      if (p.x + p.w > q.x && p.x < q.x + q.w && prevY + p.h <= q.y + 1 && p.y + p.h >= q.y && p.vy >= 0) {
        p.y = q.y - p.h; p.vy = 0; p.ground = true; p.jumps = 0;
      }
    });
    if (p.y > H) { p.x = 30; p.y = 100; p.vy = 0; }
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx + .5, 0); ctx.lineTo(gx + .5, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy + .5); ctx.lineTo(W, gy + .5); ctx.stroke(); }
    plats().forEach(function (q, i) {
      ctx.fillStyle = i === 0 ? '#16161f' : '#24243a'; ctx.fillRect(q.x, q.y, q.w, q.h);
      ctx.fillStyle = i === 0 ? '#2f2f3d' : '#3c82f6'; ctx.fillRect(q.x, q.y, q.w, 2);
    });
    if (p.dashT > 0) { ctx.fillStyle = 'rgba(224,36,214,0.25)'; rr(p.x - p.face * 18, p.y, p.w, p.h, 8); ctx.fill(); }
    ctx.shadowColor = 'rgba(84,185,166,0.6)'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#54b9a6'; rr(p.x, p.y, p.w, p.h, 8); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0a0f';
    var o = p.face * 2;
    ctx.fillRect(p.x + 8 + o, p.y + 8, 3, 8); ctx.fillRect(p.x + 15 + o, p.y + 8, 3, 8);
  }
  draw();
  requestAnimationFrame(step);
})();
