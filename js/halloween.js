// Halloween touches for the big screen: gnarled foreground trees, an owl,
// a dangling spider, jack-o'-lanterns, a haunted house, a witch crossing
// the moon, a mist ghost, will-o'-the-wisps, bat flocks and wind-blown leaves.
// Everything is drawn in code; static parts are pre-rendered once.

import { rng } from './layout.js';
import { makeGlow, GLOW_WARM, wobble } from './lamp-art.js';

const SIL = '#020205';      // silhouette colour
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

// ---------- Trees ----------
function seg(g, x1, y1, x2, y2, w) {
  g.lineWidth = Math.max(0.6, w);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

// A thin twisting branch that ends in a hooked, claw-like tip.
function twig(g, x, y, ang, len, wid, depth, curl, rand) {
  const segs = 6;
  let a = ang, px = x, py = y;
  for (let i = 0; i < segs; i++) {
    a += curl + (rand() - 0.5) * 0.45;
    if (i === segs - 1) a += curl * 3; // hook at the end
    const nx = px + Math.cos(a) * len / segs;
    const ny = py + Math.sin(a) * len / segs;
    const w = wid * (1 - ((i + 1) / segs) * 0.85);
    seg(g, px, py, nx, ny, w);
    if (depth > 0 && i > 0 && i < segs - 1 && rand() < 0.4) {
      const side = rand() < 0.5 ? -1 : 1;
      twig(g, nx, ny, a + side * (0.5 + rand() * 0.7), len * (0.35 + rand() * 0.3), w * 0.95, depth - 1, (rand() - 0.5) * 0.45, rand);
    }
    px = nx; py = ny;
  }
}

// Catmull-Rom path through waypoints → many small points.
function smoothPath(pts, steps = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A main limb along waypoints, tapering, with random twigs sprouting off it.
function limb(g, pts, w0, w1, rand, H, twigs = true) {
  const path = smoothPath(pts);
  for (let i = 1; i < path.length; i++) {
    const f = i / (path.length - 1);
    const w = lerp(w0, w1, Math.pow(f, 0.8)) * (1 + 0.12 * Math.sin(i * 1.7)); // knobbly
    const [x1, y1] = path[i - 1], [x2, y2] = path[i];
    seg(g, x1, y1, x2, y2, w);
    if (twigs && i > 3 && rand() < 0.16) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      let side = rand() < 0.5 ? -1 : 1;
      const na = a + side * (0.6 + rand() * 0.6);
      twig(g, x2, y2, na, H * (0.04 + rand() * 0.07) * (1 - f * 0.5), w * 0.55, 2, (rand() - 0.5) * 0.35, rand);
    }
  }
  // Claw-like fingers at the tip
  const [ex, ey] = path[path.length - 1];
  const [qx, qy] = path[path.length - 3];
  const a = Math.atan2(ey - qy, ex - qx);
  for (let k = 0; k < 3; k++) twig(g, ex, ey, a + (k - 1) * 0.55, H * (0.025 + rand() * 0.03), w1 * 1.2, 1, (k - 1) * 0.12 + 0.1, rand);
  return path;
}

function pointAlong(path, f) {
  return path[Math.min(path.length - 1, Math.round(f * (path.length - 1)))];
}

function renderTree(W, H, side) {
  const x0 = side === 'left' ? 0 : Math.floor(W * 0.5);
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * 0.5); c.height = H;
  const g = c.getContext('2d');
  g.translate(-x0, 0);
  g.strokeStyle = SIL;
  g.fillStyle = SIL;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rand = rng(side === 'left' ? 404 : 1031);
  const P = pts => pts.map(([x, y]) => [x * W, y * H]);
  const info = { canvas: c, x0, base: null, perch: null, spider: null };

  if (side === 'left') {
    info.base = [0.035 * W, H];
    const trunk = limb(g, P([[0.03, 1.03], [0.045, 0.86], [0.033, 0.71], [0.055, 0.56], [0.048, 0.43], [0.07, 0.3]]), W * 0.05, W * 0.022, rand, H, false);
    // Roots and knots on the trunk
    for (const [f, a, l] of [[0.03, Math.PI * 0.95, 0.06], [0.05, -0.15, 0.05], [0.35, -0.6, 0.06], [0.6, Math.PI + 0.5, 0.05]]) {
      const p = pointAlong(trunk, f);
      twig(g, p[0], p[1], a, H * l, W * 0.012, 1, 0.15, rand);
    }
    const A = limb(g, P([[0.05, 0.45], [0.11, 0.4], [0.17, 0.385], [0.23, 0.33], [0.27, 0.275], [0.3, 0.245], [0.322, 0.258]]), W * 0.018, W * 0.003, rand, H);
    const B = limb(g, P([[0.068, 0.31], [0.1, 0.2], [0.15, 0.12], [0.22, 0.065], [0.3, 0.03], [0.37, 0.022]]), W * 0.02, W * 0.003, rand, H);
    limb(g, P([[0.07, 0.31], [0.05, 0.19], [0.062, 0.09], [0.035, -0.03]]), W * 0.017, W * 0.007, rand, H);
    limb(g, P([[0.06, 0.37], [0.0, 0.3], [-0.02, 0.28]]), W * 0.012, W * 0.006, rand, H, false);
    info.perch = pointAlong(A, 0.33);
    info.spider = pointAlong(B, 0.72);
  } else {
    info.base = [0.975 * W, H];
    const trunk = limb(g, P([[0.978, 1.03], [0.966, 0.8], [0.976, 0.63], [0.956, 0.47], [0.952, 0.32]]), W * 0.045, W * 0.02, rand, H, false);
    for (const [f, a, l] of [[0.03, -0.1, 0.05], [0.4, Math.PI + 0.7, 0.05], [0.7, -0.5, 0.04]]) {
      const p = pointAlong(trunk, f);
      twig(g, p[0], p[1], a, H * l, W * 0.01, 1, -0.15, rand);
    }
    // This limb crosses in front of the moon.
    limb(g, P([[0.957, 0.42], [0.9, 0.355], [0.84, 0.29], [0.785, 0.228], [0.735, 0.19], [0.695, 0.183], [0.66, 0.158]]), W * 0.016, W * 0.0028, rand, H);
    limb(g, P([[0.952, 0.33], [0.932, 0.2], [0.95, 0.1], [0.925, 0.0], [0.905, -0.04]]), W * 0.018, W * 0.006, rand, H);
    limb(g, P([[0.95, 0.35], [0.885, 0.25], [0.865, 0.15], [0.84, 0.075]]), W * 0.011, W * 0.003, rand, H);
  }
  return info;
}

// ---------- Jack-o'-lanterns ----------
function facePath(g, cx, cy, rx, ry, style) {
  g.beginPath();
  const ex = rx * 0.36, ey = cy - ry * 0.18;
  const ew = rx * 0.22, eh = ry * 0.3;
  for (const d of [-1, 1]) {
    if (style === 1) { // round, startled eyes
      g.moveTo(cx + d * ex + ew * 0.8, ey);
      g.ellipse(cx + d * ex, ey, ew * 0.8, eh * 0.6, 0, 0, Math.PI * 2);
    } else { // angry slanted triangles
      g.moveTo(cx + d * (ex - ew), ey + eh * 0.45);
      g.lineTo(cx + d * (ex + ew), ey + eh * 0.45);
      g.lineTo(cx + d * (ex - ew * (style === 2 ? 0.6 : 0.1)), ey - eh * 0.6);
      g.closePath();
    }
  }
  // nose
  g.moveTo(cx, cy - ry * 0.02);
  g.lineTo(cx - rx * 0.08, cy + ry * 0.12);
  g.lineTo(cx + rx * 0.08, cy + ry * 0.12);
  g.closePath();
  // jagged grin with teeth
  const mw = rx * 0.62, my = cy + ry * 0.3;
  g.moveTo(cx - mw, my - ry * 0.06);
  const teeth = 5;
  for (let i = 0; i <= teeth * 2; i++) {
    const t = i / (teeth * 2);
    const x = cx - mw + t * mw * 2;
    const arc = Math.sin(t * Math.PI) * ry * 0.18;
    const tooth = i % 2 === 0 ? 0 : ry * 0.1;
    g.lineTo(x, my + arc - tooth - ry * 0.02);
  }
  for (let i = teeth * 2; i >= 0; i--) {
    const t = i / (teeth * 2);
    const x = cx - mw + t * mw * 2;
    const arc = Math.sin(t * Math.PI) * ry * 0.42;
    const tooth = i % 2 === 1 && i > 2 && i < teeth * 2 - 2 ? -ry * 0.1 : 0;
    g.lineTo(x, my + arc + tooth);
  }
  g.closePath();
}

function renderPumpkin(size, style, seed) {
  const w = Math.ceil(size * 1.5), h = Math.ceil(size * 1.4);
  const cx = w / 2, cy = h * 0.6;
  const rx = size * 0.62, ry = size * 0.46;
  const rand = rng(seed);
  const body = document.createElement('canvas');
  body.width = w; body.height = h;
  const g = body.getContext('2d');
  // Ribs: back ones first
  const ribs = [-2, 2, -1, 1, 0];
  for (const k of ribs) {
    const rcx = cx + k * rx * 0.3;
    const rrx = rx * (0.5 - Math.abs(k) * 0.05);
    const grad = g.createRadialGradient(rcx - rrx * 0.2, cy - ry * 0.3, 1, rcx, cy, Math.max(rrx, ry) * 1.05);
    grad.addColorStop(0, '#a64a10');
    grad.addColorStop(0.55, '#6e2b08');
    grad.addColorStop(1, '#1e0902');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(rcx, cy, rrx, ry * (1 - Math.abs(k) * 0.04), 0, 0, Math.PI * 2);
    g.fill();
  }
  // Stem
  g.fillStyle = '#25220c';
  g.beginPath();
  g.moveTo(cx - size * 0.05, cy - ry * 0.85);
  g.quadraticCurveTo(cx - size * 0.02, cy - ry * 1.35, cx + size * 0.12 + rand() * size * 0.05, cy - ry * 1.5);
  g.lineTo(cx + size * 0.14, cy - ry * 1.38);
  g.quadraticCurveTo(cx + size * 0.05, cy - ry * 1.2, cx + size * 0.06, cy - ry * 0.85);
  g.closePath();
  g.fill();
  // Dark carved holes (seen when the candle dips)
  facePath(g, cx, cy, rx, ry, style);
  g.fillStyle = '#2a0c02';
  g.fill();

  // The candle light shining through the carved face
  const face = document.createElement('canvas');
  face.width = w; face.height = h;
  const f = face.getContext('2d');
  f.shadowColor = 'rgba(255,150,40,0.9)';
  f.shadowBlur = size * 0.12;
  facePath(f, cx, cy, rx, ry, style);
  const fg = f.createRadialGradient(cx, cy, 1, cx, cy, rx);
  fg.addColorStop(0, '#fff6c0');
  fg.addColorStop(0.45, '#ffc040');
  fg.addColorStop(1, '#e8620c');
  f.fillStyle = fg;
  f.fill();
  return { body, face, w, h, cx, cy, ox: w / 2, oy: cy + ry, size };
}

// ---------- Characters ----------
function drawWitch(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06 + Math.sin(t * 2.1) * 0.05);
  ctx.fillStyle = SIL;
  ctx.strokeStyle = SIL;
  ctx.lineCap = 'round';
  // Broomstick
  ctx.lineWidth = s * 0.05;
  ctx.beginPath(); ctx.moveTo(-s * 1.05, s * 0.06); ctx.lineTo(s * 1.05, -s * 0.08); ctx.stroke();
  // Bristles
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, s * 0.02);
  ctx.lineTo(-s * 1.55, -s * 0.2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-s * (1.6 + (i % 2) * 0.08), -s * 0.2 + i * s * 0.08);
  ctx.lineTo(-s * 0.95, s * 0.12);
  ctx.closePath();
  ctx.fill();
  // Flowing cloak
  const flap = Math.sin(t * 6);
  ctx.beginPath();
  ctx.moveTo(s * 0.1, -s * 0.55);
  ctx.quadraticCurveTo(-s * 0.35, -s * (0.55 + flap * 0.12), -s * 0.85, -s * (0.25 + flap * 0.15));
  ctx.quadraticCurveTo(-s * 0.55, -s * 0.12, -s * 0.15, -s * 0.02);
  ctx.lineTo(s * 0.18, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.02);
  ctx.lineTo(s * 0.06, -s * 0.6);
  ctx.lineTo(s * 0.26, -s * 0.58);
  ctx.lineTo(s * 0.28, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  // Arm to the broom
  ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.45); ctx.lineTo(s * 0.5, -s * 0.06); ctx.stroke();
  // Legs and pointy boots
  ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.02); ctx.lineTo(s * 0.22, s * 0.28); ctx.lineTo(s * 0.4, s * 0.26); ctx.stroke();
  // Head with a long nose
  ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.7, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.72); ctx.lineTo(s * 0.44, -s * 0.66); ctx.lineTo(s * 0.3, -s * 0.66); ctx.fill();
  // Hat
  ctx.beginPath(); ctx.ellipse(s * 0.18, -s * 0.8, s * 0.26, s * 0.05, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.04, -s * 0.8);
  ctx.quadraticCurveTo(s * 0.14, -s * 1.15, -s * 0.12, -s * (1.32 + flap * 0.03));
  ctx.quadraticCurveTo(s * 0.26, -s * 1.08, s * 0.32, -s * 0.82);
  ctx.closePath();
  ctx.fill();
  // Hair streaming back
  ctx.lineWidth = s * 0.025;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * (0.72 - i * 0.04));
    ctx.quadraticCurveTo(-s * 0.1, -s * (0.68 + flap * 0.05 - i * 0.03), -s * (0.25 + i * 0.03), -s * (0.6 - i * 0.05));
    ctx.stroke();
  }
  // Little cat riding behind
  ctx.beginPath(); ctx.ellipse(-s * 0.62, -s * 0.06, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-s * 0.5, -s * 0.18, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.22); ctx.lineTo(-s * 0.54, -s * 0.31); ctx.lineTo(-s * 0.49, -s * 0.24); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.47, -s * 0.23); ctx.lineTo(-s * 0.44, -s * 0.31); ctx.lineTo(-s * 0.42, -s * 0.21); ctx.fill();
  ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.moveTo(-s * 0.74, -s * 0.06); ctx.quadraticCurveTo(-s * 0.9, -s * (0.25 + flap * 0.05), -s * 0.8, -s * 0.32); ctx.stroke();
  ctx.restore();
}

function drawBat(ctx, x, y, s, flap) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#040408';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.25, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.1);
    ctx.quadraticCurveTo(dir * s * 0.8, -s * (0.6 + flap * 0.9), dir * s * 1.6, -s * flap * 0.5);
    ctx.quadraticCurveTo(dir * s * 1.0, -s * flap * 0.1 + s * 0.15, dir * s * 0.7, s * 0.2);
    ctx.quadraticCurveTo(dir * s * 0.4, s * 0.05, 0, s * 0.15);
    ctx.fill();
  }
  ctx.restore();
}

function ghostPath(ctx, s, t) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.48, 0);
  ctx.bezierCurveTo(-s * 0.5, -s * 0.75, s * 0.5, -s * 0.75, s * 0.48, 0);
  ctx.quadraticCurveTo(s * 0.52, s * 0.4, s * 0.55, s * 0.62);
  const waves = 5;
  for (let i = 0; i < waves; i++) {
    const x1 = s * 0.55 - (i + 0.5) * (s * 1.1 / waves);
    const x2 = s * 0.55 - (i + 1) * (s * 1.1 / waves);
    const yy = s * 0.62 + Math.sin(t * 3 + i * 1.3) * s * 0.06;
    ctx.quadraticCurveTo(x1, yy + s * 0.12, x2, yy);
  }
  ctx.quadraticCurveTo(-s * 0.52, s * 0.4, -s * 0.48, 0);
  ctx.closePath();
}

// ---------- The Halloween layer ----------
export class Halloween {
  constructor() {
    this.wispGlow = makeGlow(64, [[0, 'rgba(220,255,245,1)'], [0.25, 'rgba(150,240,220,0.45)'], [1, 'rgba(90,200,190,0)']]);
    this.warm = makeGlow(128, GLOW_WARM);
    this.eyeGlow = makeGlow(32, [[0, 'rgba(255,240,170,1)'], [0.35, 'rgba(255,190,60,0.6)'], [1, 'rgba(255,150,30,0)']]);
    this.ghostGlow = makeGlow(128, [[0, 'rgba(210,230,255,0.6)'], [1, 'rgba(180,200,255,0)']]);
    this.gust = 0; this.gustDir = 1; this.gustT = -1; this.nextGust = 25;
    this.leaves = [];
    this.bats = null; this.nextBats = 20 + Math.random() * 15;
    this.witch = null; this.nextWitch = 80 + Math.random() * 40;
    this.ghost = null; this.nextGhost = 45 + Math.random() * 30;
    this.enabled = true;   // set false for the finale (no flying characters)
  }

  resize(W, H, hy, shoreY, moon) {
    this.W = W; this.H = H; this.hy = hy; this.moon = moon; this.shoreY = shoreY;
    this.left = renderTree(W, H, 'left');
    this.right = renderTree(W, H, 'right');

    // Near bank (bottom-left) with jack-o'-lanterns
    const bank = document.createElement('canvas');
    bank.width = Math.ceil(W * 0.32); bank.height = Math.ceil(H * 0.2);
    const g = bank.getContext('2d');
    const by = H * 0.8;
    g.translate(0, -by);
    g.fillStyle = SIL;
    g.beginPath();
    g.moveTo(-2, H * 0.85);
    g.bezierCurveTo(W * 0.1, H * 0.84, W * 0.2, H * 0.9, W * 0.29, H + 2);
    g.lineTo(-2, H + 2);
    g.closePath();
    g.fill();
    const r = rng(12);
    g.strokeStyle = SIL;
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = r() * W * 0.27;
      const t = x / (W * 0.29);
      const yTop = H * (0.85 + 0.15 * Math.pow(t, 2.2)) + 2;
      const h = H * (0.012 + r() * 0.03);
      g.lineWidth = 1 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, yTop + 3);
      g.quadraticCurveTo(x + (r() - 0.5) * h * 0.4, yTop - h * 0.6, x + (r() - 0.5) * h * 0.8, yTop - h);
      g.stroke();
    }
    this.bank = { canvas: bank, y: by };

    this.pumpkins = [
      { x: W * 0.045, y: H * 0.905, ...renderPumpkin(H * 0.045, 1, 3) },
      { x: W * 0.105, y: H * 0.952, ...renderPumpkin(H * 0.085, 0, 5) },
      { x: W * 0.19, y: H * 0.978, ...renderPumpkin(H * 0.056, 2, 8) },
    ].map((p, i) => ({ ...p, seed: i * 7.3 }));

    // Tiny jack-o'-lanterns along the far shore
    this.farPumpkins = [0.21, 0.37, 0.505, 0.6, 0.885].map((fx, i) => {
      const x = W * fx;
      const p = renderPumpkin(H * 0.012, i % 3, 20 + i);
      return { x, y: shoreY(x) + H * 0.004, ...p, seed: 3 + i * 5.1 };
    });

    // Wisps over the water
    const wr = rng(66);
    this.wisps = Array.from({ length: 5 }, () => ({
      x: W * (0.15 + wr() * 0.7), y: H * (0.52 + wr() * 0.26),
      ax: W * (0.03 + wr() * 0.06), ay: H * (0.01 + wr() * 0.02),
      fx: 0.03 + wr() * 0.05, fy: 0.05 + wr() * 0.07, ph: wr() * 6.28, pf: 0.2 + wr() * 0.4,
    }));
  }

  // Window lights of the haunted house (drawn into the far-shore canvas).
  renderHouse(g, x, base, H) {
    const s = H * 0.05;
    g.fillStyle = '#03040a';
    // Main house, slightly crooked
    g.beginPath();
    g.moveTo(x - s * 0.5, base);
    g.lineTo(x - s * 0.5, base - s * 0.5);
    g.lineTo(x - s * 0.05, base - s * 0.92);
    g.lineTo(x + s * 0.48, base - s * 0.55);
    g.lineTo(x + s * 0.5, base);
    g.closePath();
    g.fill();
    // Tower
    g.fillRect(x - s * 0.82, base - s * 0.95, s * 0.3, s * 0.95);
    g.beginPath();
    g.moveTo(x - s * 0.88, base - s * 0.95);
    g.lineTo(x - s * 0.7, base - s * 1.5);
    g.lineTo(x - s * 0.47, base - s * 0.95);
    g.closePath();
    g.fill();
    // Chimney
    g.fillRect(x + s * 0.22, base - s * 0.85, s * 0.09, s * 0.25);
    this.windows = [
      { x: x - s * 0.67, y: base - s * 0.7, w: s * 0.1, h: s * 0.14, ph: 1 },
      { x: x + s * 0.1, y: base - s * 0.35, w: s * 0.14, h: s * 0.12, ph: 2.4 },
    ];
    // Window frames (dark, the light is added live)
    g.fillStyle = '#1a1006';
    for (const wdw of this.windows) g.fillRect(wdw.x - wdw.w / 2, wdw.y - wdw.h / 2, wdw.w, wdw.h);
  }

  update(t, dt, L) {
    // Wind gusts every 25–45 s
    this.nextGust -= dt;
    if (this.nextGust <= 0 && this.gustT < 0) {
      this.gustT = 0;
      this.gustDir = Math.random() < 0.6 ? 1 : -1;
      this.nextGust = 25 + Math.random() * 20;
      const n = 8 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        this.leaves.push({
          x: this.gustDir > 0 ? -20 - Math.random() * this.W * 0.3 : this.W + 20 + Math.random() * this.W * 0.3,
          y: this.H * (0.05 + Math.random() * 0.85),
          vx: this.gustDir * this.W * (0.18 + Math.random() * 0.12),
          vy: this.H * (Math.random() - 0.3) * 0.04,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8,
          s: this.H * (0.006 + Math.random() * 0.006),
        });
      }
    }
    if (this.gustT >= 0) {
      this.gustT += dt;
      const D = 4;
      this.gust = Math.sin(clamp01(this.gustT / D) * Math.PI) ** 2;
      if (this.gustT > D) { this.gustT = -1; this.gust = 0; }
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      l.x += l.vx * dt * (0.4 + this.gust);
      l.y += l.vy * dt + Math.sin(t * 3 + l.rot) * 0.6;
      l.rot += l.vr * dt;
      if (l.x < -this.W * 0.4 || l.x > this.W * 1.4) this.leaves.splice(i, 1);
    }

    if (!this.enabled) return;
    // Bat flocks
    if (!this.bats) {
      this.nextBats -= dt;
      if (this.nextBats <= 0) this.launchBats();
    }
    // Witch
    if (!this.witch) {
      this.nextWitch -= dt;
      if (this.nextWitch <= 0) this.launchWitch();
    }
    // Ghost (only while the lake is still dark-ish)
    if (!this.ghost) {
      this.nextGhost -= dt;
      if (this.nextGhost <= 0 && L < 0.85) this.launchGhost();
    }
  }

  launchBats() {
    const n = 3 + Math.floor(Math.random() * 5);
    const ltr = Math.random() < 0.5;
    this.bats = {
      t: 0, dur: 7 + Math.random() * 3, ltr,
      y0: this.moon.y + (Math.random() - 0.4) * this.H * 0.15,
      list: Array.from({ length: n }, () => ({
        dx: (Math.random() - 0.5) * this.W * 0.12, dy: (Math.random() - 0.5) * this.H * 0.08,
        ph: Math.random() * 6.28, s: this.H * (0.008 + Math.random() * 0.008), wav: 6 + Math.random() * 6,
      })),
    };
    this.nextBats = 30 + Math.random() * 30;
  }

  launchWitch() {
    if (this.witch) return;
    const ltr = Math.random() < 0.7;
    this.witch = { t: 0, dur: 11, ltr };
    this.nextWitch = 200 + Math.random() * 120;
  }

  launchGhost() {
    const ltr = Math.random() < 0.5;
    this.ghost = { t: 0, dur: 26, ltr, y: this.hy + this.H * (0.04 + Math.random() * 0.06) };
    this.nextGhost = 80 + Math.random() * 60;
  }

  // Sky layer: witch and bats (behind the foreground trees).
  drawSky(ctx, t, dt) {
    const { W, H, moon } = this;
    if (this.witch) {
      const w = this.witch;
      w.t += dt;
      const p = w.t / w.dur;
      if (p >= 1) this.witch = null;
      else {
        const x = w.ltr ? lerp(-W * 0.1, W * 1.1, p) : lerp(W * 1.1, -W * 0.1, p);
        const y = moon.y + (x - moon.x) * (w.ltr ? 0.12 : -0.12) + Math.sin(p * 10) * H * 0.008;
        ctx.save();
        if (!w.ltr) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        drawWitch(ctx, x, y, H * 0.05, t);
        ctx.restore();
      }
    }
    if (this.bats) {
      const b = this.bats;
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) this.bats = null;
      else {
        const cx = b.ltr ? lerp(-W * 0.15, W * 1.15, p) : lerp(W * 1.15, -W * 0.15, p);
        for (const bat of b.list) {
          const x = cx + bat.dx + Math.sin(t * 1.3 + bat.ph) * W * 0.01;
          const y = b.y0 + bat.dy + Math.sin(p * bat.wav + bat.ph) * H * 0.025;
          drawBat(ctx, x, y, bat.s, Math.sin(t * 20 + bat.ph));
        }
      }
    }
  }

  // Lights on the far shore (pumpkins + haunted house windows) and their
  // reflections in the water. Called right after the far shore is drawn.
  drawFarLights(ctx, t) {
    ctx.save();
    for (const p of this.farPumpkins) ctx.drawImage(p.body, p.x - p.ox, p.y - p.oy);
    ctx.globalCompositeOperation = 'lighter';
    const lights = [
      ...this.farPumpkins.map(p => ({ x: p.x, y: p.y - p.size * 0.45, r: p.size, seed: p.seed, face: p })),
      ...(this.windows || []).map(w => ({ x: w.x, y: w.y, r: w.w * 1.4, seed: w.ph, win: w })),
    ];
    for (const l of lights) {
      const fl = 0.75 + 0.25 * wobble(t * 0.8, l.seed);
      if (l.face) {
        ctx.globalAlpha = fl;
        ctx.drawImage(l.face.face, l.face.x - l.face.ox, l.face.y - l.face.oy);
      }
      if (l.win) {
        ctx.globalAlpha = 0.8 * fl;
        ctx.fillStyle = 'rgb(255,190,90)';
        ctx.fillRect(l.win.x - l.win.w / 2, l.win.y - l.win.h / 2, l.win.w, l.win.h);
      }
      const g = l.r * 5;
      ctx.globalAlpha = 0.35 * fl;
      ctx.drawImage(this.warm, l.x - g / 2, l.y - g / 2, g, g);
      // Reflection: a shimmering streak below the horizon
      const dy = (this.hy - l.y) * 2;
      for (let i = 0; i < 5; i++) {
        const yy = l.y + dy + i * l.r * 0.5;
        const wv = Math.sin(t * 2 + i * 1.7 + l.seed) * l.r * 0.3;
        ctx.globalAlpha = 0.28 * fl * (1 - i / 5);
        ctx.drawImage(this.warm, l.x - l.r * 0.7 + wv, yy - l.r * 0.12, l.r * 1.4, l.r * 0.24);
      }
    }
    ctx.restore();
  }

  // Over the water: wisps (fade as the lake fills with light) and the ghost.
  drawWater(ctx, t, dt, L) {
    const { W, H } = this;
    const wispA = clamp01(1 - L * 1.3);
    if (wispA > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of this.wisps) {
        const x = w.x + Math.sin(t * w.fx * 6.28 + w.ph) * w.ax;
        const y = w.y + Math.sin(t * w.fy * 6.28 + w.ph * 1.7) * w.ay;
        const pulse = 0.5 + 0.5 * Math.sin(t * w.pf * 6.28 + w.ph);
        const s = H * 0.016 * (0.8 + 0.4 * pulse);
        ctx.globalAlpha = wispA * (0.12 + 0.18 * pulse);
        ctx.drawImage(this.wispGlow, x - s, y - s, s * 2, s * 2);
        ctx.globalAlpha = wispA * (0.45 + 0.4 * pulse);
        ctx.drawImage(this.wispGlow, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6);
        // faint reflection
        ctx.globalAlpha = wispA * 0.12;
        ctx.drawImage(this.wispGlow, x - s * 0.5, y + H * 0.018, s, s * 0.4);
      }
      ctx.restore();
    }
    if (this.ghost) {
      const gh = this.ghost;
      gh.t += dt;
      const p = gh.t / gh.dur;
      if (p >= 1) { this.ghost = null; return; }
      const x = gh.ltr ? lerp(W * 0.15, W * 0.85, p) : lerp(W * 0.85, W * 0.15, p);
      const y = gh.y + Math.sin(t * 0.9) * H * 0.012 - Math.sin(p * Math.PI) * H * 0.02;
      const a = Math.sin(p * Math.PI) ** 2 * 0.11 * clamp01(1.2 - L);
      if (a < 0.003) return;
      const s = H * 0.075;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(this.ghostGlow, x - s * 1.2, y - s * 1.1, s * 2.4, s * 2.4);
      ctx.restore();
      ctx.save();
      ctx.translate(x, y);
      if (!gh.ltr) ctx.scale(-1, 1);
      ctx.rotate(Math.sin(t * 0.7) * 0.06 + 0.08);
      ctx.globalAlpha = a;
      ghostPath(ctx, s, t);
      const grad = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.7);
      grad.addColorStop(0, 'rgba(235,242,255,1)');
      grad.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.fillStyle = 'rgba(10,12,30,1)';
      ctx.globalAlpha = a * 1.6;
      ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.25, s * 0.06, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.25, s * 0.06, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-s * 0.01, -s * 0.05, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Foreground: trees (with owl + spider), bank, pumpkins, leaves.
  // Returns light spots to be added after the vignette.
  drawFront(ctx, t) {
    const { W, H } = this;
    const lights = [];
    for (const [tree, ph] of [[this.left, 0], [this.right, 2.1]]) {
      // Trees bend with the wind gusts (kept still otherwise: cheaper to draw).
      const ang = this.gust * (0.007 + 0.0015 * Math.sin(t * 2.3 + ph)) * this.gustDir;
      ctx.save();
      if (ang !== 0) {
        ctx.translate(tree.base[0], tree.base[1]);
        ctx.rotate(ang);
        ctx.translate(-tree.base[0], -tree.base[1]);
      }
      ctx.drawImage(tree.canvas, tree.x0, 0);
      if (tree.perch) lights.push(...this.drawOwl(ctx, tree.perch[0], tree.perch[1], t));
      if (tree.spider) this.drawSpider(ctx, tree.spider[0], tree.spider[1], t);
      ctx.restore();
    }

    ctx.drawImage(this.bank.canvas, 0, this.bank.y);
    for (const p of this.pumpkins) {
      ctx.drawImage(p.body, p.x - p.ox, p.y - p.oy);
      lights.push({ type: 'pumpkin', p });
    }

    ctx.fillStyle = '#0b0705';
    for (const l of this.leaves) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.beginPath();
      ctx.moveTo(-l.s, 0);
      ctx.quadraticCurveTo(0, -l.s * 0.7, l.s, 0);
      ctx.quadraticCurveTo(0, l.s * 0.7, -l.s, 0);
      ctx.fill();
      ctx.restore();
    }
    return lights;
  }

  // Glows that should shine through the vignette (pumpkin faces, owl eyes).
  drawFrontLights(ctx, t, lights) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.type === 'pumpkin') {
        const p = l.p;
        const fl = 0.72 + 0.28 * wobble(t * 0.9, p.seed) + 0.05 * Math.sin(t * 23 + p.seed);
        ctx.globalAlpha = Math.min(1, fl);
        ctx.drawImage(p.face, p.x - p.ox, p.y - p.oy);
        const g = p.size * 4.2;
        ctx.globalAlpha = 0.32 * fl;
        ctx.drawImage(this.warm, p.x - g / 2, p.y - p.size * 0.45 - g / 2, g, g);
        // light spilling on the ground
        ctx.globalAlpha = 0.18 * fl;
        ctx.drawImage(this.warm, p.x - g * 0.6, p.y - g * 0.12, g * 1.2, g * 0.24);
      } else if (l.type === 'eye') {
        ctx.globalAlpha = l.a;
        const s = l.s * 6;
        ctx.drawImage(this.eyeGlow, l.x - s / 2, l.y - s / 2, s, s);
        ctx.fillStyle = 'rgb(255,214,90)';
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, l.s, l.s * l.open, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawOwl(ctx, x, y, t) {
    const s = this.H * 0.045;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = SIL;
    // Body
    ctx.beginPath(); ctx.ellipse(0, -s * 0.48, s * 0.3, s * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    const look = Math.sin(t * 0.13) > 0.7 ? 0.5 : Math.sin(t * 0.13) < -0.8 ? -0.5 : 0;
    ctx.beginPath(); ctx.ellipse(look * s * 0.04, -s * 0.92, s * 0.28, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    // Ear tufts
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * s * 0.12 + look * s * 0.04, -s * 1.08);
      ctx.lineTo(d * s * 0.3 + look * s * 0.04, -s * 1.28);
      ctx.lineTo(d * s * 0.26 + look * s * 0.04, -s * 0.98);
      ctx.fill();
    }
    // Tail
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.05); ctx.lineTo(0, s * 0.22); ctx.lineTo(s * 0.1, -s * 0.05); ctx.fill();
    ctx.restore();
    // Eyes (glowing, blinking). Converted to screen space for the light pass.
    const cyc = (t + 1.3) % 5.5;
    const open = cyc < 0.18 ? Math.abs(cyc - 0.09) / 0.09 : 1;
    const m = ctx.getTransform();
    const dpr = Math.hypot(m.a, m.b) || 1;
    const toScreen = (px, py) => {
      const sx = (m.a * px + m.c * py + m.e) / dpr;
      const sy = (m.b * px + m.d * py + m.f) / dpr;
      return [sx, sy];
    };
    const eyes = [];
    for (const d of [-1, 1]) {
      const [ex, ey] = toScreen(x + d * s * 0.11 + look * s * 0.06, y - s * 0.93);
      eyes.push({ type: 'eye', x: ex, y: ey, s: s * 0.06, open, a: 0.95 });
    }
    return eyes;
  }

  drawSpider(ctx, ax, ay, t) {
    const H = this.H;
    // Slowly lowers and climbs back up, with pauses.
    const cyc = (t % 40) / 40;
    const k = cyc < 0.4 ? cyc / 0.4 : cyc < 0.55 ? 1 : cyc < 0.95 ? 1 - (cyc - 0.55) / 0.4 : 0;
    const len = H * (0.03 + 0.13 * (0.5 - 0.5 * Math.cos(k * Math.PI)));
    const sway = Math.sin(t * 0.8) * H * 0.004;
    const sx = ax + sway, sy = ay + len;
    ctx.save();
    ctx.strokeStyle = 'rgba(200,205,220,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(sx, sy); ctx.stroke();
    const s = H * 0.008;
    ctx.fillStyle = SIL;
    ctx.strokeStyle = SIL;
    ctx.lineWidth = Math.max(1, s * 0.22);
    ctx.beginPath(); ctx.arc(sx, sy + s * 0.6, s * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy + s * 1.6, s, 0, Math.PI * 2); ctx.fill();
    const wig = Math.sin(t * 6) * 0.15;
    for (let i = 0; i < 4; i++) {
      for (const d of [-1, 1]) {
        const a0 = (i - 1.5) * 0.45 + wig * (i % 2 ? 1 : -1);
        const kx = sx + d * s * 1.4, ky = sy + s * (0.4 + i * 0.35) - s * 0.6;
        ctx.beginPath();
        ctx.moveTo(sx, sy + s * (0.6 + i * 0.12));
        ctx.lineTo(kx, ky + Math.sin(a0) * s);
        ctx.lineTo(sx + d * s * 2.0, sy + s * (0.7 + i * 0.45));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
