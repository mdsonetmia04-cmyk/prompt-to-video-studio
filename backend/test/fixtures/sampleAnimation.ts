/** Render-pipeline test fixture (not user-facing demo content). */
// Sample animation: "Verdant" logo reveal (test fixture).
// Fully deterministic: seeded PRNG, renderFrame(t) is a pure function of t.
// Adapts to any viewport size. Used when no AI key is configured and for tests.
export const SAMPLE_SOURCE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body { margin:0; padding:0; width:100vw; height:100vh; overflow:hidden; background:#0c0e11; }
  canvas { display:block; width:100vw; height:100vh; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, CX = 0, CY = 0, S = 1;
  var DURATION = 12;

  // Deterministic PRNG (mulberry32)
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var particles = [];
  function buildParticles() {
    var rnd = mulberry32(20261012);
    particles = [];
    var n = 240;
    for (var i = 0; i < n; i++) {
      var ang = rnd() * Math.PI * 2;
      var startR = (0.55 + rnd() * 0.75) * Math.max(W, H);
      var endR = (0.16 + rnd() * 0.30) * Math.min(W, H);
      particles.push({
        a0: ang, a1: ang + (rnd() - 0.5) * 1.6,
        r0: startR, r1: endR,
        size: 1 + rnd() * 2.6,
        delay: rnd() * 1.6,
        speed: 0.5 + rnd() * 0.9,
        hue: 140 + rnd() * 25,
        alpha: 0.35 + rnd() * 0.55
      });
    }
  }

  function easeInOutCubic(x) { return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }

  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    CX = W / 2; CY = H / 2;
    S = Math.min(W, H);
    var dpr = 1; // fixed for deterministic raster output
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBackground(t) {
    var g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#11151a');
    g.addColorStop(0.55, '#0c0e11');
    g.addColorStop(1, '#060708');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // vignette
    var v = ctx.createRadialGradient(CX, CY, Math.min(W,H)*0.35, CX, CY, Math.max(W,H)*0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawParticles(t) {
    var converge = easeInOutCubic(seg(t, 0, 3.2));
    var i, p, ang, r, x, y, tw;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      var local = easeInOutCubic(clamp01((t - p.delay) / 2.2));
      ang = p.a0 + (p.a1 - p.a0) * local + t * 0.12 * p.speed;
      r = p.r0 + (p.r1 - p.r0) * local;
      // after lockup, gentle orbital drift around center
      var drift = seg(t, 3.2, 12) * 0.35 * Math.sin(t * p.speed + i);
      x = CX + Math.cos(ang) * (r + drift * S * 0.02);
      y = CY + Math.sin(ang) * (r + drift * S * 0.02);
      tw = 0.6 + 0.4 * Math.sin(t * 2.2 * p.speed + i * 1.7);
      var fadeIn = seg(t, p.delay * 0.4, p.delay * 0.4 + 0.8);
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.5 + converge * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + p.hue + ', 65%, 55%, ' + (p.alpha * tw * fadeIn * 0.9).toFixed(3) + ')';
      ctx.fill();
    }
    // central glow grows with convergence
    var glowR = S * (0.10 + converge * 0.22);
    var glowA = 0.10 + converge * 0.16 + 0.03 * Math.sin(t * 1.4);
    var g = ctx.createRadialGradient(CX, CY, 0, CX, CY, glowR * 3);
    g.addColorStop(0, 'rgba(63, 185, 110, ' + glowA.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(63, 185, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(CX - glowR * 3, CY - glowR * 3, glowR * 6, glowR * 6);
  }

  function drawMark(t) {
    var reveal = easeOutCubic(seg(t, 2.0, 3.4));
    if (reveal <= 0) return;
    var R = S * 0.13 * (0.6 + 0.4 * reveal);
    var y = CY - S * 0.16;
    ctx.save();
    ctx.globalAlpha = reveal;
    // outer thin ring, drawn progressively
    ctx.beginPath();
    ctx.arc(CX, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reveal);
    ctx.strokeStyle = '#3fb96e';
    ctx.lineWidth = Math.max(2, S * 0.004);
    ctx.stroke();
    // inner play triangle fades/scales in
    var tri = easeOutCubic(seg(t, 2.8, 3.8));
    if (tri > 0) {
      var tr = R * 0.42 * (0.7 + 0.3 * tri);
      ctx.save();
      ctx.globalAlpha = tri;
      ctx.beginPath();
      ctx.moveTo(CX - tr * 0.55, y - tr * 0.72);
      ctx.lineTo(CX + tr * 0.85, y);
      ctx.lineTo(CX - tr * 0.55, y + tr * 0.72);
      ctx.closePath();
      ctx.fillStyle = '#e8f5ec';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWord(t) {
    var baseY = CY + S * 0.10;
    var word = 'VERDANT';
    var fs = S * 0.085;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // staggered letters
    var total = word.length;
    for (var i = 0; i < total; i++) {
      var lt = easeOutCubic(seg(t, 2.6 + i * 0.12, 3.4 + i * 0.12));
      if (lt <= 0) continue;
      var ls = fs * 0.42; // letter spacing
      var wordW = total * fs * 0.72 + (total - 1) * ls;
      var x = CX - wordW / 2 + i * (fs * 0.72 + ls) + fs * 0.36;
      var rise = (1 - lt) * S * 0.05;
      ctx.save();
      ctx.globalAlpha = lt;
      ctx.font = '600 ' + fs + 'px -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#f2f5f3';
      ctx.fillText(word[i], x, baseY + rise);
      ctx.restore();
    }
    // tagline
    var tag = easeOutCubic(seg(t, 4.2, 5.2));
    if (tag > 0) {
      ctx.save();
      ctx.globalAlpha = tag;
      ctx.font = '500 ' + (S * 0.028) + 'px -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#3fb96e';
      var spaced = 'M O T I O N   S T U D I O';
      ctx.fillText(spaced, CX, baseY + S * 0.085);
      ctx.restore();
    }
    // underline sweep
    var ul = easeInOutCubic(seg(t, 4.6, 5.8));
    if (ul > 0) {
      var uw = S * 0.34 * ul;
      var grad = ctx.createLinearGradient(CX - uw / 2, 0, CX + uw / 2, 0);
      grad.addColorStop(0, 'rgba(63,185,110,0)');
      grad.addColorStop(0.5, 'rgba(63,185,110,0.9)');
      grad.addColorStop(1, 'rgba(63,185,110,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(CX - uw / 2, baseY + S * 0.135, uw, Math.max(2, S * 0.004));
    }
    // shimmer sweep across the word during hold
    var sh = seg(t, 6.0, 7.2);
    if (sh > 0 && sh < 1) {
      var sx = CX - S * 0.4 + sh * S * 0.8;
      var sg = ctx.createLinearGradient(sx - S * 0.12, 0, sx + S * 0.12, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.20)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalAlpha = Math.sin(sh * Math.PI);
      ctx.fillStyle = sg;
      ctx.fillRect(CX - S * 0.45, baseY - S * 0.07, S * 0.9, S * 0.14);
      ctx.restore();
    }
    ctx.restore();
  }

  function onResize() { layout(); buildParticles(); }

  window.anim = {
    init: function () {
      layout();
      buildParticles();
      window.addEventListener('resize', onResize);
    },
    renderFrame: function (t) {
      t = Math.max(0, Math.min(DURATION, t));
      drawBackground(t);
      drawParticles(t);
      drawMark(t);
      drawWord(t);
    },
    dispose: function () {
      window.removeEventListener('resize', onResize);
    }
  };
})();
</scr` + `ipt>
</body>
</html>`;

export const SAMPLE_META = {
  name: "Verdant — logo reveal (test fixture)",
  description:
    "12-second sample: elegant green particle logo reveal on charcoal. Fully deterministic — for preview and rendering tests.",
  duration: 12 as const,
};
