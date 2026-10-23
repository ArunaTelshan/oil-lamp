// Halloween touches for the big screen: gnarled foreground trees (new ones
// every time), owls that come and go, a dangling spider, jack-o'-lanterns, a
// haunted house, a witch crossing the moon, a mist ghost, will-o'-the-wisps,
// bat flocks, wind-blown leaves, and a skeleton that walks into the lake.
// Everything is drawn in code; static parts are pre-rendered once.

import { rng } from './layout.js';
import { makeGlow, GLOW_WARM, wobble } from './lamp-art.js';

const SIL = '#020205';      // silhouette colour
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease3 = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- Trees ----------
let BOUNDS = null;   // while set, every stroke grows this box (to crop branch layers)
function seg(g, x1, y1, x2, y2, w) {
  g.lineWidth = Math.max(0.6, w);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  if (BOUNDS) {
    const m = w + 2;
    BOUNDS.x1 = Math.min(BOUNDS.x1, x1 - m, x2 - m); BOUNDS.y1 = Math.min(BOUNDS.y1, y1 - m, y2 - m);
    BOUNDS.x2 = Math.max(BOUNDS.x2, x1 + m, x2 + m); BOUNDS.y2 = Math.max(BOUNDS.y2, y1 + m, y2 + m);
  }
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

// Branch points that are roughly level and up in the sky: where owls can sit.
function findPerches(paths, W, H, moon) {
  const out = [];
  for (const { path, limb } of paths) {
    for (let i = 3; i < path.length - 3; i += 2) {
      const [x1, y1] = path[i - 2], [x2, y2] = path[i + 2];
      const dx = x2 - x1, dy = y2 - y1;
      if (Math.abs(dx) < 1 || Math.abs(dy / dx) > 0.45) continue;
      const [x, y] = path[i];
      if (y < H * 0.1 || y > H * 0.42 || x < W * 0.05 || x > W * 0.95) continue;
      if (moon && Math.hypot(x - moon.x, y - moon.y) < moon.r * 1.7) continue;
      if (out.some(p => Math.hypot(p.x - x, p.y - y) < W * 0.07)) continue;
      out.push({ x, y, limb });
    }
  }
  return out;
}

// Each tree is generated from a seed, so every screen opening shows new,
// different trees — always framing the lake, one branch always across the moon.
// The trunk is one picture; every main branch is its own small picture that
// sways on its own around the point where it joins the trunk.
function renderTree(W, H, side, seed, moon) {
  const x0 = side === 'left' ? 0 : Math.floor(W * 0.5);
  // Work area (a little bigger than the tree's half of the screen).
  const X0 = x0 - Math.ceil(W * 0.06), Y0 = -Math.ceil(H * 0.12);
  const work = document.createElement('canvas');
  work.width = Math.ceil(W * 0.62); work.height = Math.ceil(H * 1.13);
  const wg = work.getContext('2d');
  const rand = rng(seed);
  const J = (v, a) => v + (rand() - 0.5) * 2 * a;
  const P = pts => pts.map(([x, y]) => [x * W, y * H]);
  const mx = moon.x / W, my = moon.y / H, mr = moon.r / H;
  const info = { trunk: null, limbs: [], perches: [], spider: null, base: null };

  // Draw something on the work canvas and cut out just the part it covers.
  const capture = fn => {
    wg.setTransform(1, 0, 0, 1, 0, 0);
    wg.clearRect(0, 0, work.width, work.height);
    wg.setTransform(1, 0, 0, 1, -X0, -Y0);
    wg.strokeStyle = SIL; wg.fillStyle = SIL; wg.lineCap = 'round'; wg.lineJoin = 'round';
    BOUNDS = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    const ret = fn(wg);
    const b = BOUNDS; BOUNDS = null;
    const bx = Math.max(X0, Math.floor(b.x1)), by = Math.max(Y0, Math.floor(b.y1));
    const bx2 = Math.min(X0 + work.width, Math.ceil(b.x2)), by2 = Math.min(Y0 + work.height, Math.ceil(b.y2));
    const c = document.createElement('canvas');
    c.width = Math.max(1, bx2 - bx); c.height = Math.max(1, by2 - by);
    c.getContext('2d').drawImage(work, bx - X0, by - Y0, c.width, c.height, 0, 0, c.width, c.height);
    return { canvas: c, x: bx, y: by, ret };
  };
  // A swaying branch layer, pivoting where it leaves the trunk.
  const branch = (pts, w0, w1, twigs = true, pxPts = false) => {
    const pp = pxPts ? pts : P(pts);
    const L = capture(g => limb(g, pp, w0, w1, rand, H, twigs));
    L.path = L.ret;
    L.px = pp[0][0]; L.py = pp[0][1];
    L.sway = { amp: 0.004 + rand() * 0.005, f1: 0.55 + rand() * 0.5, f2: 1.4 + rand() * 0.9, ph: rand() * 6.28, gust: 0.008 + rand() * 0.008 };
    info.limbs.push(L);
    return info.limbs.length - 1;
  };

  let trunk, tp;
  if (side === 'left') {
    const bx = J(0.032, 0.01);
    info.base = [bx * W, H];
    tp = [[bx, 1.03], [J(bx + 0.013, 0.008), 0.86], [J(bx, 0.01), 0.71], [J(bx + 0.02, 0.01), 0.56], [J(bx + 0.016, 0.008), 0.44], [J(bx + 0.037, 0.012), J(0.3, 0.03)]];
    const T = capture(g => {
      const tr = limb(g, P(tp), W * J(0.05, 0.007), W * 0.022, rand, H, false);
      for (let k = 0; k < 4; k++) {
        const p = pointAlong(tr, [0.03, 0.06, 0.35, 0.6][k]);
        twig(g, p[0], p[1], [Math.PI * 0.95, -0.15, -0.6, Math.PI + 0.5][k] + J(0, 0.25), H * J(0.055, 0.015), W * 0.012, 1, 0.15, rand);
      }
      return tr;
    });
    info.trunk = T; trunk = T.ret;
    const top = tp[5], mid = tp[4];
    const aEx = J(0.3, 0.035), aEy = J(0.255, 0.035);
    branch([[mid[0], 0.445], [J(0.11, 0.015), J(0.405, 0.015)], [J(0.17, 0.02), J(0.38, 0.025)], [J(0.23, 0.02), J(0.33, 0.03)], [aEx - 0.03, aEy + 0.025], [aEx, aEy], [aEx + 0.022, aEy + 0.015]], W * 0.018, W * 0.003);
    const bi = branch([top, [J(0.1, 0.02), J(0.2, 0.03)], [J(0.15, 0.025), J(0.125, 0.025)], [J(0.22, 0.03), J(0.065, 0.02)], [J(0.3, 0.03), J(0.035, 0.015)], [J(0.37, 0.03), 0.02]], W * 0.02, W * 0.003);
    branch([top, [J(0.05, 0.015), 0.19], [J(0.062, 0.015), 0.09], [J(0.035, 0.015), -0.03]], W * 0.017, W * 0.007);
    branch([[mid[0] + 0.01, 0.37], [0.0, J(0.3, 0.03)], [-0.02, 0.28]], W * 0.012, W * 0.006, false);
    const extra = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < extra; k++) {
      const s = pointAlong(trunk, 0.78 + rand() * 0.17);
      const ex = J(0.19, 0.06), ey = J(0.2, 0.07);
      branch([s, [(s[0] + ex * W) / 2, Math.min(s[1], ey * H) - H * J(0.04, 0.03)], [ex * W, ey * H]], W * 0.011, W * 0.0025, true, true);
    }
    const sp = pointAlong(info.limbs[bi].path, 0.6 + rand() * 0.2);
    info.spider = { x: sp[0], y: sp[1], limb: bi };
  } else {
    const bx = J(0.976, 0.01);
    info.base = [bx * W, H];
    tp = [[bx, 1.03], [J(bx - 0.01, 0.008), 0.8], [J(bx, 0.01), 0.63], [J(bx - 0.02, 0.01), 0.47], [J(bx - 0.024, 0.01), J(0.32, 0.03)]];
    const T = capture(g => {
      const tr = limb(g, P(tp), W * J(0.045, 0.006), W * 0.02, rand, H, false);
      for (let k = 0; k < 3; k++) {
        const p = pointAlong(tr, [0.03, 0.4, 0.7][k]);
        twig(g, p[0], p[1], [-0.1, Math.PI + 0.7, -0.5][k] + J(0, 0.25), H * J(0.045, 0.012), W * 0.01, 1, -0.15, rand);
      }
      return tr;
    });
    info.trunk = T; trunk = T.ret;
    // The branch across the moon (passes through its lower half).
    const s = pointAlong(trunk, 0.82);
    branch([[s[0] / W, s[1] / H], [J(0.9, 0.012), J(0.355, 0.02)], [J(0.84, 0.015), J(0.29, 0.02)], [mx + 0.055, my + mr * 0.95], [mx, my + mr * J(0.32, 0.22)], [mx - 0.04, my + mr * J(0.1, 0.15)], [mx - 0.075, my - 0.008]], W * 0.016, W * 0.0028);
    const top = tp[4];
    branch([top, [J(0.932, 0.012), 0.2], [J(0.95, 0.012), 0.1], [J(0.925, 0.012), 0.0], [0.905, -0.04]], W * 0.018, W * 0.006);
    branch([[top[0] - 0.002, top[1] + 0.03], [J(0.885, 0.015), J(0.25, 0.02)], [J(0.865, 0.012), J(0.15, 0.02)], [J(0.84, 0.012), 0.075]], W * 0.011, W * 0.003);
    const extra = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < extra; k++) {
      const p = pointAlong(trunk, 0.7 + rand() * 0.2);
      const ex = J(0.86, 0.035), ey = J(0.38, 0.04);
      branch([p, [(p[0] + ex * W) / 2, Math.min(p[1], ey * H) - H * 0.03], [ex * W, ey * H]], W * 0.01, W * 0.0025, true, true);
    }
  }
  info.perches = findPerches(info.limbs.map((L, i) => ({ path: L.path, limb: i })), W, H, moon);
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
// look (0..1): how far she has turned her head to stare at the audience.
// face(ctx, s): draws her front-facing head, centred on the neck.
function drawWitch(ctx, x, y, s, t, look = 0, flip = false, face = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-0.06 + Math.sin(t * 2.1) * 0.05) * (1 - look * 0.8));
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
  // Head with a long nose, and the hat (in profile; fades as she turns)
  const prof = 1 - clamp01(look * 2.2);
  if (prof > 0) {
    ctx.globalAlpha = prof;
    ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.7, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.72); ctx.lineTo(s * 0.44, -s * 0.66); ctx.lineTo(s * 0.3, -s * 0.66); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.18, -s * 0.8, s * 0.26, s * 0.05, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.04, -s * 0.8);
    ctx.quadraticCurveTo(s * 0.14, -s * 1.15, -s * 0.12, -s * (1.32 + flap * 0.03));
    ctx.quadraticCurveTo(s * 0.26, -s * 1.08, s * 0.32, -s * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
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
  // Front-facing head, drawn un-mirrored so the face always reads the same way
  if (look > 0 && face) {
    ctx.save();
    ctx.translate(s * 0.19, -s * 0.66);
    if (flip) ctx.scale(-1, 1);
    face(ctx, s);
    ctx.restore();
  }
  ctx.restore();
}

// The witch's face, seen from the front, pre-rendered once (she turns her
// head to stare at the audience). Canvas units: head centre at FACE.cx/cy,
// half the face width = FACE.hw. Eyes are left empty: they glow live.
const FACE = { w: 340, h: 520, cx: 170, cy: 300, hw: 76, eyes: [[138, 288], [202, 288]] };
function renderWitchFace() {
  const c = document.createElement('canvas');
  c.width = FACE.w; c.height = FACE.h;
  const g = c.getContext('2d');
  const { cx } = FACE;
  const canBlur = 'filter' in g;
  const blur = px => { if (canBlur) g.filter = px ? `blur(${px}px)` : 'none'; };
  const r = rng(1031);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Long stringy hair behind the face, a few strands caught by the moon.
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const x0 = cx + side * (30 + r() * 45), y0 = 205 + r() * 30;
    const x1 = cx + side * (78 + r() * 40), y1 = 320 + r() * 50;
    const x2 = cx + side * (55 + r() * 85), y2 = 410 + r() * 100;
    g.lineWidth = 1.5 + r() * 4;
    g.strokeStyle = r() < 0.22 ? 'rgba(150,160,175,0.55)' : r() < 0.5 ? '#1b1c22' : '#0c0c10';
    g.beginPath();
    g.moveTo(x0, y0);
    g.bezierCurveTo(x1 + side * 10, y1 - 70, x1 - side * r() * 25, y1, x2, y2);
    g.stroke();
  }

  // Gaunt face: high cheekbones, hollow cheeks, long crooked chin.
  const face = new Path2D();
  face.moveTo(cx, 206);
  face.bezierCurveTo(cx + 62, 206, cx + 80, 250, cx + 76, 300);
  face.bezierCurveTo(cx + 73, 340, cx + 52, 360, cx + 40, 386);
  face.bezierCurveTo(cx + 28, 412, cx + 14, 432, cx + 4, 436);
  face.bezierCurveTo(cx - 9, 432, cx - 26, 410, cx - 38, 384);
  face.bezierCurveTo(cx - 52, 358, cx - 74, 340, cx - 76, 300);
  face.bezierCurveTo(cx - 80, 250, cx - 62, 206, cx, 206);
  const skin = g.createRadialGradient(cx - 26, 272, 8, cx - 8, 300, 170);
  skin.addColorStop(0, '#a9bd94');
  skin.addColorStop(0.4, '#64804f');
  skin.addColorStop(1, '#172214');
  g.fillStyle = skin;
  g.fill(face);

  g.save();
  g.clip(face);
  // Blotchy, aged skin
  blur(5);
  for (let i = 0; i < 70; i++) {
    const x = cx - 75 + r() * 150, y = 210 + r() * 220, rr = 3 + r() * 11;
    g.fillStyle = r() < 0.6 ? `rgba(20,30,14,${0.12 + r() * 0.18})` : `rgba(200,220,170,${0.06 + r() * 0.1})`;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  blur(0);
  // Shadow side (away from the moon) and the hat's shadow on the forehead
  let sh = g.createLinearGradient(cx - 10, 0, cx + 80, 0);
  sh.addColorStop(0, 'rgba(8,16,8,0)');
  sh.addColorStop(1, 'rgba(8,16,8,0.6)');
  g.fillStyle = sh; g.fillRect(0, 0, FACE.w, FACE.h);
  sh = g.createLinearGradient(0, 206, 0, 250);
  sh.addColorStop(0, 'rgba(5,8,5,0.85)');
  sh.addColorStop(1, 'rgba(5,8,5,0)');
  g.fillStyle = sh; g.fillRect(0, 200, FACE.w, 60);
  // Sunken cheeks and temples
  blur(9);
  g.fillStyle = 'rgba(14,24,12,0.6)';
  for (const d of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + d * 50, 352, 17, 30, d * 0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + d * 70, 262, 10, 22, 0, 0, Math.PI * 2); g.fill();
  }
  // Moonlit cheekbones, brow and chin
  g.fillStyle = 'rgba(225,245,205,0.38)';
  g.beginPath(); g.ellipse(cx - 46, 318, 20, 9, -0.35, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx - 30, 254, 26, 8, 0.15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx - 6, 418, 12, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(225,245,205,0.16)';
  g.beginPath(); g.ellipse(cx + 46, 318, 16, 7, 0.35, 0, Math.PI * 2); g.fill();
  // Deep eye sockets
  g.fillStyle = 'rgba(4,7,4,0.92)';
  for (const [ex, ey] of FACE.eyes) {
    const d = ex < cx ? -1 : 1;
    g.beginPath(); g.ellipse(ex, ey - 1, 28, 19, d * 0.2, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(4,7,4,0.5)';                    // shadow under the brow ridge
  g.fillRect(cx - 70, 262, 140, 18);
  blur(3);
  g.fillStyle = '#020302';
  for (const [ex, ey] of FACE.eyes) {
    const d = ex < cx ? -1 : 1;
    g.beginPath(); g.ellipse(ex, ey, 19, 11, d * 0.18, 0, Math.PI * 2); g.fill();
  }
  // Bags under the eyes
  blur(0);
  for (const [ex, ey] of FACE.eyes) {
    g.strokeStyle = 'rgba(10,18,8,0.7)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(ex - 18, ey + 14); g.quadraticCurveTo(ex, ey + 24, ex + 18, ey + 14); g.stroke();
    g.strokeStyle = 'rgba(210,235,190,0.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(ex - 16, ey + 18); g.quadraticCurveTo(ex, ey + 28, ex + 16, ey + 18); g.stroke();
  }
  // Forehead wrinkles (dark crease with a lit edge under it)
  for (let i = 0; i < 4; i++) {
    const y = 232 + i * 7, wv = 30 - i * 3;
    g.strokeStyle = 'rgba(10,16,8,0.65)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(cx - wv - 10, y + 2); g.bezierCurveTo(cx - 10, y - 4, cx + 10, y + 4, cx + wv + 8, y - 1); g.stroke();
    g.strokeStyle = 'rgba(215,240,195,0.22)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(cx - wv - 8, y + 4.5); g.bezierCurveTo(cx - 10, y - 1.5, cx + 10, y + 6.5, cx + wv + 6, y + 1.5); g.stroke();
  }
  // Frown lines between the brows, crow's feet
  g.strokeStyle = 'rgba(8,14,6,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 6, 262); g.quadraticCurveTo(cx - 9, 274, cx - 5, 286); g.stroke();
  g.beginPath(); g.moveTo(cx + 7, 263); g.quadraticCurveTo(cx + 10, 275, cx + 6, 286); g.stroke();
  g.lineWidth = 1.4;
  for (const d of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(cx + d * 62, 288 + i * 7); g.lineTo(cx + d * 74, 286 + i * 11); g.stroke();
    }
  }
  // Nose-to-mouth folds
  g.strokeStyle = 'rgba(8,14,6,0.7)'; g.lineWidth = 2.6;
  for (const d of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + d * 22, 362); g.quadraticCurveTo(cx + d * 40, 378, cx + d * 40, 400); g.stroke();
  }
  g.restore();

  // Heavy angry brows slanting down towards the nose
  g.fillStyle = '#0b0d0a';
  for (const d of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + d * 66, 262);
    g.quadraticCurveTo(cx + d * 40, 250, cx + d * 9, 275);
    g.quadraticCurveTo(cx + d * 38, 262, cx + d * 66, 268);
    g.closePath(); g.fill();
    g.strokeStyle = '#121410'; g.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const u = i / 8, bx = cx + d * (64 - u * 52), by = 262 - Math.sin(u * Math.PI) * 6 + u * 9;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + d * (r() * 6 - 3), by - 4 - r() * 4); g.stroke();
    }
  }

  // Long hooked nose: lit bridge, shadowed side, drooping bulbous tip.
  const nose = new Path2D();
  nose.moveTo(cx - 7, 276);
  nose.bezierCurveTo(cx - 11, 312, cx - 17, 340, cx - 21, 358);
  nose.quadraticCurveTo(cx - 14, 368, cx - 4, 364);
  nose.quadraticCurveTo(cx + 5, 376, cx + 13, 364);
  nose.quadraticCurveTo(cx + 24, 368, cx + 26, 356);
  nose.bezierCurveTo(cx + 19, 336, cx + 12, 312, cx + 9, 276);
  nose.closePath();
  const ng = g.createLinearGradient(cx - 20, 0, cx + 26, 0);
  ng.addColorStop(0, '#a8bf90');
  ng.addColorStop(0.45, '#7f9a68');
  ng.addColorStop(1, '#26341f');
  g.fillStyle = ng; g.fill(nose);
  g.save(); g.clip(nose);
  blur(3);
  g.fillStyle = 'rgba(235,250,215,0.55)';
  g.beginPath(); g.ellipse(cx - 3, 315, 4, 32, -0.08, 0, Math.PI * 2); g.fill();
  blur(0);
  g.restore();
  // tip, hooked down past the nostrils
  const tip = g.createRadialGradient(cx - 2, 352, 2, cx + 4, 358, 18);
  tip.addColorStop(0, '#b9cf9f'); tip.addColorStop(0.6, '#728c5c'); tip.addColorStop(1, '#2c3b24');
  g.fillStyle = tip;
  g.beginPath(); g.ellipse(cx + 4, 360, 15, 14, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0d08';
  g.beginPath(); g.ellipse(cx - 10, 368, 5, 3.2, 0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + 18, 368, 5, 3.2, -0.4, 0, Math.PI * 2); g.fill();
  // Warts with a few hairs
  const wart = (x, y, rr) => {
    const wg = g.createRadialGradient(x - rr * 0.4, y - rr * 0.4, 0.5, x, y, rr);
    wg.addColorStop(0, '#c8d6a8'); wg.addColorStop(0.5, '#6a7d4e'); wg.addColorStop(1, '#2a3320');
    g.fillStyle = wg;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#151610'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x, y - rr * 0.5); g.lineTo(x + (i - 1) * 4, y - rr - 5 - r() * 3); g.stroke(); }
  };
  wart(cx + 13, 326, 5);
  wart(cx - 16, 420, 6);
  wart(cx + 52, 340, 3.5);

  // Sneering mouth: crooked grin full of rotten, uneven teeth.
  const mouth = new Path2D();
  mouth.moveTo(cx - 38, 392);
  mouth.quadraticCurveTo(cx - 8, 382, cx + 12, 386);
  mouth.quadraticCurveTo(cx + 30, 384, cx + 42, 382);
  mouth.quadraticCurveTo(cx + 22, 410, cx - 2, 410);
  mouth.quadraticCurveTo(cx - 24, 409, cx - 38, 392);
  mouth.closePath();
  g.fillStyle = '#0d0505';
  g.fill(mouth);
  g.save(); g.clip(mouth);
  const teeth = [[-30, 6, 9, 0.2], [-22, 7, 12, -0.1], [-13, 6, 8, 0.15], [-2, 7, 14, 0.05], [16, 6, 10, -0.2], [26, 7, 13, 0.1], [35, 5, 8, -0.15]];
  for (const [tx, tw, th, rot] of teeth) {
    g.save();
    g.translate(cx + tx, 385);
    g.rotate(rot);
    const tg = g.createLinearGradient(0, 0, 0, th);
    tg.addColorStop(0, '#d8cf9a'); tg.addColorStop(1, '#6e6235');
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(-tw / 2, -2); g.lineTo(tw / 2, -2); g.lineTo(tw * 0.3, th); g.quadraticCurveTo(0, th + 2, -tw * 0.35, th - 1); g.closePath(); g.fill();
    g.restore();
  }
  for (const [tx, th] of [[-17, 7], [8, 9]]) {          // a few lower teeth
    g.fillStyle = '#8f8452';
    g.beginPath(); g.moveTo(cx + tx - 3, 410); g.lineTo(cx + tx + 3, 410); g.lineTo(cx + tx, 410 - th); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle = '#2c2a22'; g.lineWidth = 2.4;
  g.stroke(mouth);
  g.strokeStyle = 'rgba(215,240,195,0.3)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(cx - 30, 414); g.quadraticCurveTo(cx, 420, cx + 26, 410); g.stroke();

  // Moonlight rim along the left edge of the face
  const rim = g.createLinearGradient(cx - 80, 0, cx, 0);
  rim.addColorStop(0, 'rgba(205,225,255,0.8)');
  rim.addColorStop(1, 'rgba(205,225,255,0)');
  g.strokeStyle = rim; g.lineWidth = 3;
  g.stroke(face);

  // Strands of hair falling over the face edges
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const x0 = cx + side * (34 + r() * 30), y0 = 210;
    g.lineWidth = 1.2 + r() * 2.4;
    g.strokeStyle = r() < 0.25 ? 'rgba(160,170,185,0.6)' : '#101014';
    g.beginPath();
    g.moveTo(x0, y0);
    g.bezierCurveTo(x0 + side * (16 + r() * 10), 260, x0 + side * (10 + r() * 20), 330, x0 + side * (14 + r() * 30), 380 + r() * 80);
    g.stroke();
  }

  // Hat: wide floppy brim, band with a dull buckle, bent cone.
  g.fillStyle = '#0a0910';
  g.beginPath();
  g.moveTo(cx - 64, 206);
  g.bezierCurveTo(cx - 70, 150, cx - 30, 90, cx + 6, 52);
  g.quadraticCurveTo(cx + 40, 20, cx + 92, 14);
  g.quadraticCurveTo(cx + 56, 40, cx + 40, 80);
  g.bezierCurveTo(cx + 34, 120, cx + 58, 160, cx + 66, 206);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(190,205,255,0.5)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(cx - 62, 196); g.bezierCurveTo(cx - 66, 150, cx - 28, 92, cx + 6, 54); g.quadraticCurveTo(cx + 40, 22, cx + 90, 15); g.stroke();
  g.fillStyle = '#26163a';
  g.beginPath(); g.moveTo(cx - 64, 180); g.quadraticCurveTo(cx, 170, cx + 64, 180); g.lineTo(cx + 66, 200); g.quadraticCurveTo(cx, 190, cx - 64, 200); g.closePath(); g.fill();
  g.strokeStyle = '#7d7356'; g.lineWidth = 3;
  g.strokeRect(cx - 10, 178, 20, 17);
  const brim = g.createLinearGradient(0, 180, 0, 236);
  brim.addColorStop(0, '#16141e'); brim.addColorStop(1, '#050408');
  g.fillStyle = brim;
  g.beginPath();
  g.moveTo(cx - 168, 214);
  g.quadraticCurveTo(cx - 100, 186, cx, 190);
  g.quadraticCurveTo(cx + 100, 186, cx + 166, 206);
  g.quadraticCurveTo(cx + 100, 236, cx, 232);
  g.quadraticCurveTo(cx - 100, 238, cx - 168, 214);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(190,205,255,0.45)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 166, 212); g.quadraticCurveTo(cx - 100, 185, cx, 189); g.stroke();
  return c;
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

// An owl in flight, seen from below: broad rounded wings with "finger" tips.
function drawFlyingOwl(ctx, x, y, s, flap, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = SIL;
  for (const d of [-1, 1]) {
    const f = flap * (d === 1 ? 1 : 0.92);
    ctx.beginPath();
    ctx.moveTo(d * s * 0.1, -s * 0.12);
    ctx.quadraticCurveTo(d * s * 0.55, -s * (0.42 + f * 0.55), d * s * 1.12, -s * (0.18 + f * 0.75));
    ctx.lineTo(d * s * 1.2, -s * (0.1 + f * 0.65));
    ctx.lineTo(d * s * 1.08, -s * (0.06 + f * 0.6));
    ctx.lineTo(d * s * 1.15, s * (0.02 - f * 0.55));
    ctx.lineTo(d * s * 1.02, s * (0.04 - f * 0.5));
    ctx.quadraticCurveTo(d * s * 0.6, s * (0.16 - f * 0.22), d * s * 0.1, s * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.19, s * 0.33, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.36, s * 0.19, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.05 + d * s * 0.08, -s * 0.47);
    ctx.lineTo(s * 0.05 + d * s * 0.2, -s * 0.6);
    ctx.lineTo(s * 0.05 + d * s * 0.17, -s * 0.42);
    ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(-s * 0.14, s * 0.25); ctx.lineTo(0, s * 0.48); ctx.lineTo(s * 0.14, s * 0.25); ctx.fill();
  ctx.restore();
}

// ---------- The skeleton ----------
// Pose: phase drives the walk; all sizes relative to height S (feet → skull top).
function drawSkeleton(ctx, x, y, S, phase, walking, lookBack, t) {
  const BONE = '#e3dcc8', DARK = '#0a0806';
  const sw = Math.sin(phase);
  const bob = 0;
  const hipY = -S * 0.5;
  const leg = S * 0.25;
  const legs = walking ? [sw * 0.5, -sw * 0.5] : [0.05, -0.05];
  const knees = walking ? [Math.max(0, -Math.cos(phase)) * 0.7, Math.max(0, Math.cos(phase)) * 0.7] : [0, 0];
  // Keep the lowest foot on the ground.
  const footY = k => hipY + Math.cos(legs[k]) * leg + Math.cos(legs[k] - knees[k]) * leg;
  const lift = -Math.max(footY(0), footY(1));
  ctx.save();
  ctx.translate(x, y + lift);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BONE;
  ctx.fillStyle = BONE;
  const bone = (x1, y1, x2, y2, w) => {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x1, y1, w * 0.75, 0, Math.PI * 2); ctx.arc(x2, y2, w * 0.75, 0, Math.PI * 2); ctx.fill();
  };
  const limbPair = (ox, oy, a1, a2, l1, l2, w) => {
    const kx = ox + Math.sin(a1) * l1, ky = oy + Math.cos(a1) * l1;
    const ex = kx + Math.sin(a2) * l2, ey = ky + Math.cos(a2) * l2;
    bone(ox, oy, kx, ky, w);
    bone(kx, ky, ex, ey, w * 0.85);
    return [ex, ey];
  };
  const w = S * 0.028;
  // Far leg + arm first (a little darker), near ones last.
  for (const k of [1, 0]) {
    ctx.globalAlpha = k === 1 ? 0.7 : 1;
    const [fx, fy] = limbPair(0, hipY, legs[k], legs[k] - knees[k], leg, leg, w);
    bone(fx, fy, fx + S * 0.07, fy + S * 0.005, w * 0.8); // foot
  }
  ctx.globalAlpha = 1;
  // Spine
  const neckX = S * 0.03, neckY = -S * 0.83 + bob * -1;
  ctx.lineWidth = w * 0.8;
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.quadraticCurveTo(-S * 0.03, -S * 0.68, neckX, neckY); ctx.stroke();
  for (let i = 1; i < 6; i++) {
    const vy = lerp(hipY, neckY, i / 6);
    ctx.beginPath(); ctx.arc(-S * 0.015 * Math.sin(i), vy, w * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // Pelvis
  ctx.beginPath(); ctx.ellipse(S * 0.01, hipY, S * 0.06, S * 0.035, 0.2, 0, Math.PI * 2); ctx.fill();
  // Ribcage
  ctx.lineWidth = w * 0.55;
  for (let i = 0; i < 5; i++) {
    const ry = -S * 0.77 + i * S * 0.045 + bob * -1;
    const rw = S * (0.085 - Math.abs(i - 1.5) * 0.008);
    ctx.beginPath();
    ctx.ellipse(S * 0.04, ry, rw, S * 0.025, 0.15, -Math.PI * 0.75, Math.PI * 0.55);
    ctx.stroke();
  }
  // Arms (swinging opposite to legs, stiff and jerky)
  const shY = -S * 0.78 + bob * -1;
  const arms = walking ? [-sw * 0.55 + Math.sin(t * 13) * 0.05, sw * 0.55] : [0.25, -0.15];
  for (const k of [1, 0]) {
    ctx.globalAlpha = k === 1 ? 0.7 : 1;
    const [hx, hy] = limbPair(S * 0.03, shY, Math.PI * 0 + arms[k], arms[k] + 0.35, S * 0.17, S * 0.16, w * 0.85);
    ctx.beginPath(); ctx.arc(hx, hy, w * 1.1, 0, Math.PI * 2); ctx.fill(); // hand
  }
  ctx.globalAlpha = 1;
  // Skull (turns towards the viewer when peering at the lake)
  const sx = neckX + S * 0.03, sy = neckY - S * 0.08;
  const r = S * 0.075;
  ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.05, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + r * 0.25, sy + r * 0.8, r * 0.6, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); // jaw
  ctx.fillStyle = DARK;
  const look = lookBack ? -0.35 : 0.35;
  ctx.beginPath(); ctx.ellipse(sx + r * look, sy - r * 0.05, r * 0.26, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + r * (look + 0.55), sy - r * 0.05, r * 0.22, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx + r * (look + 0.3), sy + r * 0.25); ctx.lineTo(sx + r * (look + 0.18), sy + r * 0.45); ctx.lineTo(sx + r * (look + 0.42), sy + r * 0.45); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = DARK;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx + r * (-0.05 + i * 0.2), sy + r * 0.62); ctx.lineTo(sx + r * (-0.05 + i * 0.2), sy + r * 0.82); ctx.stroke(); }
  ctx.restore();
  return { eyes: [[x + sx + r * look, y + lift + sy - r * 0.05], [x + sx + r * (look + 0.55), y + lift + sy - r * 0.05]], r };
}

// ---------- The Halloween layer ----------
const RIM = 'rgba(170,190,255,0.6)';   // moonlit edge around flying silhouettes

export class Halloween {
  constructor(seed = 1) {
    this.seed = seed;
    this.wispGlow = makeGlow(64, [[0, 'rgba(220,255,245,1)'], [0.25, 'rgba(150,240,220,0.45)'], [1, 'rgba(90,200,190,0)']]);
    this.warm = makeGlow(128, GLOW_WARM);
    this.eyeGlow = makeGlow(32, [[0, 'rgba(255,240,170,1)'], [0.35, 'rgba(255,190,60,0.6)'], [1, 'rgba(255,150,30,0)']]);
    this.ghostGlow = makeGlow(128, [[0, 'rgba(210,230,255,0.6)'], [1, 'rgba(180,200,255,0)']]);
    this.witchEyeGlow = makeGlow(64, [[0, 'rgba(250,255,210,1)'], [0.22, 'rgba(210,255,90,0.7)'], [0.55, 'rgba(150,240,50,0.22)'], [1, 'rgba(110,220,30,0)']]);
    this.witchFace = renderWitchFace();
    this.skullGlow = makeGlow(32, [[0, 'rgba(190,255,200,1)'], [0.4, 'rgba(120,255,160,0.5)'], [1, 'rgba(80,220,120,0)']]);
    this.drop = makeGlow(16, [[0, 'rgba(230,240,255,1)'], [1, 'rgba(200,220,255,0)']]);
    this.gust = 0; this.gustDir = 1; this.gustT = -1; this.nextGust = 25;
    this.leaves = [];
    this.bats = null; this.nextBats = 20 + Math.random() * 15;
    this.witch = null; this.nextWitch = 80 + Math.random() * 40;
    this.ghost = null; this.nextGhost = 45 + Math.random() * 30;
    this.owls = []; this.nextOwl = 12 + Math.random() * 10;
    this.skel = null; this.nextSkel = 100 + Math.random() * 50;
    this.spiders = []; this.nextSpider = 12 + Math.random() * 15;
    this.splash = null;
    this.onEvent = null;     // (name) → screen plays a sound
    this.enabled = true;     // false during the finale (no new flying characters)
  }

  resize(W, H, hy, shoreY, moon) {
    this.W = W; this.H = H; this.hy = hy; this.moon = moon; this.shoreY = shoreY;
    this.left = renderTree(W, H, 'left', this.seed * 3 + 1, moon);
    this.right = renderTree(W, H, 'right', this.seed * 7 + 2, moon);
    this.treeSpiderSize = 0.011 + Math.random() * 0.02;     // the resident spider: a new size each load
    this.perches = [
      ...this.left.perches.map(p => ({ ...p, tree: 'left' })),
      ...this.right.perches.map(p => ({ ...p, tree: 'right' })),
    ];
    // Start with one or two owls already sitting in the trees.
    this.owls = [];
    const free = this.perches.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (let k = 0; k < Math.min(2, free.length); k++) this.owls.push(this.newOwl(free[k]));

    // Near bank (bottom-left) with jack-o'-lanterns; also the skeleton's field.
    const bank = document.createElement('canvas');
    const bx0 = -Math.ceil(W * 0.05);
    bank.width = Math.ceil(W * 0.37); bank.height = Math.ceil(H * 0.2);
    const g = bank.getContext('2d');
    const by = H * 0.8;
    g.translate(-bx0, -by);
    g.fillStyle = SIL;
    g.beginPath();
    g.moveTo(bx0, H * 0.85);
    g.bezierCurveTo(W * 0.1, H * 0.84, W * 0.2, H * 0.9, W * 0.29, H + 2);
    g.lineTo(bx0, H + 2);
    g.closePath();
    g.fill();
    const r = rng(12);
    g.strokeStyle = SIL;
    g.lineCap = 'round';
    for (let i = 0; i < 100; i++) {
      const x = bx0 + r() * (W * 0.27 - bx0);
      const yTop = this.bankY(Math.max(0, x)) + 2;
      const h = H * (0.012 + r() * 0.03);
      g.lineWidth = 1 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, yTop + 3);
      g.quadraticCurveTo(x + (r() - 0.5) * h * 0.4, yTop - h * 0.6, x + (r() - 0.5) * h * 0.8, yTop - h);
      g.stroke();
    }
    this.bank = { canvas: bank, x: bx0, y: by };

    // A second bank at the bottom-right with more jack-o'-lanterns.
    const rb = document.createElement('canvas');
    const rx0 = Math.floor(W * 0.6);
    rb.width = Math.ceil(W * 0.46); rb.height = Math.ceil(H * 0.14);
    const rg = rb.getContext('2d');
    const ry = H * 0.86;
    rg.translate(-rx0, -ry);
    rg.fillStyle = SIL;
    rg.beginPath();
    rg.moveTo(W * 0.62, H + 2);
    rg.bezierCurveTo(W * 0.68, H * 0.97, W * 0.76, H * 0.945, W * 0.86, H * 0.93);
    rg.bezierCurveTo(W * 0.95, H * 0.92, W * 1.0, H * 0.915, W * 1.06, H * 0.915);
    rg.lineTo(W * 1.06, H + 2);
    rg.closePath();
    rg.fill();
    rg.strokeStyle = SIL;
    rg.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = W * (0.64 + r() * 0.42);
      const yTop = (x < W * 0.86 ? H * (1 - (x - W * 0.62) / (W * 0.24) * 0.07) : H * 0.925) + 2;
      const h = H * (0.012 + r() * 0.028);
      rg.lineWidth = 1 + r() * 1.6;
      rg.beginPath();
      rg.moveTo(x, yTop + 3);
      rg.quadraticCurveTo(x + (r() - 0.5) * h * 0.4, yTop - h * 0.6, x + (r() - 0.5) * h * 0.8, yTop - h);
      rg.stroke();
    }
    this.rbank = { canvas: rb, x: rx0, y: ry };

    this.pumpkins = [
      { x: W * 0.012, y: H * 0.878, ...renderPumpkin(H * 0.04, 2, 2) },
      { x: W * 0.045, y: H * 0.905, ...renderPumpkin(H * 0.045, 1, 3) },
      { x: W * 0.105, y: H * 0.952, ...renderPumpkin(H * 0.085, 0, 5) },
      { x: W * 0.19, y: H * 0.978, ...renderPumpkin(H * 0.056, 2, 8) },
      { x: W * 0.238, y: H * 0.997, ...renderPumpkin(H * 0.036, 1, 9) },
      // right side: one big lantern is enough
      { x: W * 0.755, y: H * 0.985, ...renderPumpkin(H * 0.07, 0, 13) },
    ].map((p, i) => ({ ...p, seed: i * 7.3 }));

    this.web = this.renderWeb(W, H);

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

  // A cobweb in one of the top corners, among the branches.
  renderWeb(W, H) {
    const right = Math.random() < 0.5;
    const R = H * (0.16 + Math.random() * 0.05);
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(R * 1.15);
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(220,226,245,0.5)';
    g.lineWidth = 1;
    const spokes = 8;
    const ang = i => (i / (spokes - 1)) * Math.PI / 2;
    for (let i = 0; i < spokes; i++) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang(i)) * R, Math.sin(ang(i)) * R); g.stroke();
    }
    const glints = [];
    for (let k = 1; k <= 10; k++) {
      const rr = (R * k) / 10.5;
      g.globalAlpha = 0.35 + 0.4 * (k / 10);
      g.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a = ang(i), x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else {
          const am = (ang(i - 1) + a) / 2, sag = rr * 0.88;    // threads sag between spokes
          g.quadraticCurveTo(Math.cos(am) * sag, Math.sin(am) * sag, x, y);
        }
        if (Math.random() < 0.25) glints.push([x, y, Math.random() * 6.28]);
      }
      g.stroke();
    }
    return { canvas: c, right, glints, R };
  }

  // Top edge of the near bank at x (same curve as the drawn bank).
  bankY(x) {
    const { W, H } = this;
    const P0 = [-W * 0.05, H * 0.85], P1 = [W * 0.1, H * 0.84], P2 = [W * 0.2, H * 0.9], P3 = [W * 0.29, H];
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2, u = 1 - m;
      const bx = u * u * u * P0[0] + 3 * u * u * m * P1[0] + 3 * u * m * m * P2[0] + m * m * m * P3[0];
      if (bx < x) lo = m; else hi = m;
    }
    const m = (lo + hi) / 2, u = 1 - m;
    return u * u * u * P0[1] + 3 * u * u * m * P1[1] + 3 * u * m * m * P2[1] + m * m * m * P3[1];
  }

  // ---------- Owls ----------
  newOwl(perch) {
    return { state: 'perched', perch, s: this.H * (0.04 + Math.random() * 0.012), blink: Math.random() * 5, look: Math.random() * 10 };
  }

  freePerches() {
    return this.perches.map((_, i) => i).filter(i => !this.owls.some(o => o.perch === i));
  }

  owlArrive() {
    const free = this.freePerches();
    if (!free.length) return;
    const pi = free[Math.floor(Math.random() * free.length)];
    const p = this.perches[pi];
    const { W, H } = this;
    const fromTop = Math.random() < 0.5;
    const sx = fromTop ? W * (0.15 + Math.random() * 0.7) : (p.x < W / 2 ? W * 1.08 : -W * 0.08);
    const sy = fromTop ? -H * 0.1 : H * (0.04 + Math.random() * 0.2);
    const o = this.newOwl(pi);
    o.state = 'arriving';
    o.fly = { sx, sy, tx: p.x, ty: p.y, cx: (sx + p.x) / 2, cy: Math.min(sy, p.y) + H * 0.12, t: 0, dur: 5 + Math.random() * 2 };
    this.owls.push(o);
  }

  owlLeave(o) {
    const p = this.perches[o.perch];
    const { W, H } = this;
    const dir = p.x < W / 2 ? 1 : -1;  // fly off across the sky
    const tx = Math.random() < 0.5 ? (dir > 0 ? W * 1.1 : -W * 0.1) : W * (0.3 + Math.random() * 0.4);
    const ty = tx > W || tx < 0 ? H * (0.05 + Math.random() * 0.2) : -H * 0.12;
    o.state = 'leaving';
    o.fly = { sx: p.x, sy: p.y, tx, ty, cx: p.x + dir * W * 0.18, cy: p.y + H * 0.06, t: 0, dur: 4.5 + Math.random() * 1.5 };
  }

  owlFlightPos(o) {
    const f = o.fly;
    const k = clamp01(f.t / f.dur);
    // arriving: slow down to land; leaving: drop off the branch, then speed up
    const e = o.state === 'arriving' ? 1 - Math.pow(1 - k, 2.2) : Math.pow(k, 1.6);
    const u = 1 - e;
    return {
      x: u * u * f.sx + 2 * u * e * f.cx + e * e * f.tx,
      y: u * u * f.sy + 2 * u * e * f.cy + e * e * f.ty,
      k, dir: Math.sign((f.tx - f.sx) || 1),
    };
  }

  // ---------- Skeleton ----------
  spawnSpider() {
    const { W, H } = this;
    // Sizes vary: tiny, medium or a big hairy one (never two of the same kind at once).
    const used = this.spiders.map(o => o.size);
    const kinds = ['small', 'medium', 'big'].filter(k => !used.includes(k));
    const size = kinds[Math.floor(Math.random() * kinds.length)] || 'medium';
    const s = H * (size === 'small' ? 0.008 + Math.random() * 0.005 : size === 'medium' ? 0.015 + Math.random() * 0.007 : 0.028 + Math.random() * 0.012);
    const sp = { t: 0, down: 5 + Math.random() * 3, pause: 4 + Math.random() * 5, up: 5, len: H * (0.1 + Math.random() * 0.2) * (size === 'big' ? 1.2 : 1), s, size, ph: Math.random() * 6 };
    // Hang from a high branch point of a foreground tree, or from the top edge.
    const cands = [];
    for (const [tree, side] of [[this.left, 'left'], [this.right, 'right']]) {
      tree.limbs.forEach((L, idx) => {
        for (let i = 4; i < L.path.length; i += 6) {
          const [x, y] = L.path[i];
          if (y > H * 0.04 && y < H * 0.36 && x > W * 0.05 && x < W * 0.95 && Math.hypot(x - this.moon.x, y - this.moon.y) > this.moon.r * 1.6) cands.push({ side, limb: idx, x, y });
        }
      });
    }
    if (cands.length && Math.random() < 0.7) Object.assign(sp, cands[Math.floor(Math.random() * cands.length)]);
    else Object.assign(sp, { top: true, x: W * (0.15 + Math.random() * 0.7), y: -4 });
    this.spiders.push(sp);
  }

  launchSkeleton() {
    if (this.skel) return;
    this.skel = { t: 0, x0: this.W * 0.07, edge: this.W * 0.215, phase: 0 };
    this.nextSkel = 200 + Math.random() * 120;
    this.onEvent && this.onEvent('rise');
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

    // Owls come and go: every 14–36 s one arrives or one flies away (0–3 owls).
    this.nextOwl -= dt;
    if (this.nextOwl <= 0) {
      this.nextOwl = 14 + Math.random() * 22;
      const perched = this.owls.filter(o => o.state === 'perched');
      const arrive = this.owls.length === 0 || (this.owls.length < 3 && Math.random() < 0.55);
      if (arrive && this.enabled) this.owlArrive();
      else if (perched.length) this.owlLeave(perched[Math.floor(Math.random() * perched.length)]);
    }
    for (let i = this.owls.length - 1; i >= 0; i--) {
      const o = this.owls[i];
      if (o.state === 'perched') continue;
      o.fly.t += dt;
      if (o.fly.t >= o.fly.dur) {
        if (o.state === 'arriving') { o.state = 'perched'; o.fly = null; } else this.owls.splice(i, 1);
      }
    }

    this.updateGhost(dt);

    // Spiders: one or two drop down now and then at random spots.
    for (let i = this.spiders.length - 1; i >= 0; i--) {
      const sp = this.spiders[i];
      sp.t += dt;
      if (sp.t > sp.down + sp.pause + sp.up) this.spiders.splice(i, 1);
    }
    this.nextSpider -= dt;
    if (this.nextSpider <= 0) {
      this.nextSpider = 18 + Math.random() * 30;
      if (this.spiders.length < 2) this.spawnSpider();
    }

    // Skeleton
    if (this.skel) {
      const s = this.skel;
      s.t += dt;
      if (s.t >= 3.6 && s.t < 12.5) {
        const before = Math.sin(s.phase);
        s.phase += dt * 5.2;
        if (before * Math.sin(s.phase) <= 0) this.onEvent && this.onEvent('rattle'); // each step
      }
      if (s.t > 22) this.skel = null;
    } else if (this.enabled) {
      this.nextSkel -= dt;
      if (this.nextSkel <= 0) this.launchSkeleton();
    }
    if (this.splash) {
      this.splash.t += dt;
      for (const d of this.splash.drops) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += this.H * 1.4 * dt; }
      if (this.splash.t > 6) this.splash = null;
    }

    if (!this.enabled) return;
    if (!this.bats) {
      this.nextBats -= dt;
      if (this.nextBats <= 0) this.launchBats();
    }
    if (!this.witch) {
      this.nextWitch -= dt;
      if (this.nextWitch <= 0) this.launchWitch();
    }
    if (!this.ghost) {
      this.nextGhost -= dt;
      if (this.nextGhost <= 0 && L < 0.85) this.launchGhost();
    }
  }

  launchBats() {
    const n = 3 + Math.floor(Math.random() * 5);
    const ltr = Math.random() < 0.5;
    this.bats = {
      t: 0, dur: 8 + Math.random() * 3, ltr,
      y0: this.moon.y + (Math.random() - 0.3) * this.H * 0.14,
      list: Array.from({ length: n }, () => ({
        dx: (Math.random() - 0.5) * this.W * 0.14, dy: (Math.random() - 0.5) * this.H * 0.09,
        ph: Math.random() * 6.28, s: this.H * (0.012 + Math.random() * 0.01), wav: 6 + Math.random() * 6,
      })),
    };
    this.nextBats = 30 + Math.random() * 30;
  }

  // The witch flies a different way each time:
  //  across   — over the sky, past the moon, growing a little as she comes closer
  //  approach — from far away near the horizon, swooping towards the audience
  //  orbit    — circles the moon, then flies off into the night
  launchWitch() {
    if (this.witch) return;
    const { W, H } = this;
    const r = Math.random();
    const w = { t: 0, kind: r < 0.4 ? 'across' : r < 0.8 ? 'approach' : 'orbit' };
    if (w.kind === 'across') {
      w.dur = 10 + Math.random() * 3; w.ltr = Math.random() < 0.6;
      w.y0 = H * (0.15 + Math.random() * 0.2); w.amp = H * (0.03 + Math.random() * 0.05);
      w.s0 = H * (0.07 + Math.random() * 0.045); w.grow = 1.15 + Math.random() * 0.4;
    } else if (w.kind === 'approach') {
      w.dur = 7.5 + Math.random() * 2.5;
      w.sx = W * (0.3 + Math.random() * 0.4); w.sy = H * (0.3 + Math.random() * 0.07);
      const side = Math.random() < 0.5 ? -1 : 1;
      w.ex = side > 0 ? W * 1.3 : -W * 0.3; w.ey = H * (0.05 + Math.random() * 0.3);
      w.cx = w.sx + side * W * 0.18; w.cy = H * (0.14 + Math.random() * 0.12);
      w.s0 = H * 0.024; w.s1 = H * (0.22 + Math.random() * 0.12);
    } else {
      w.dur = 11; w.r = this.moon.r * (2.4 + Math.random() * 0.6); w.a0 = Math.random() * 6.28;
      w.turns = (Math.random() < 0.5 ? -1 : 1) * 1.1; w.s0 = H * (0.055 + Math.random() * 0.025);
    }
    // About halfway she slows, turns her head and stares at the audience.
    w.lookAt = w.kind === 'approach' ? 0.6 : 0.45 + Math.random() * 0.1;
    w.look = null; w.m = 0; w.rate = 1;
    this.witch = w;
    this.nextWitch = 180 + Math.random() * 120;
  }

  witchPos(w, p) {
    const { W, H, moon } = this;
    if (w.kind === 'across') {
      const x = w.ltr ? lerp(-W * 0.12, W * 1.12, p) : lerp(W * 1.12, -W * 0.12, p);
      const y = w.y0 - Math.sin(p * Math.PI) * w.amp + Math.sin(p * 9) * H * 0.008;
      return { x, y, s: w.s0 * lerp(1, w.grow, p) };
    }
    if (w.kind === 'approach') {
      const e = Math.pow(p, 2.1), u = 1 - e;      // slow while far, rushing past at the end
      return {
        x: u * u * w.sx + 2 * u * e * w.cx + e * e * w.ex,
        y: u * u * w.sy + 2 * u * e * w.cy + e * e * w.ey + Math.sin(p * 12) * H * 0.005,
        s: lerp(w.s0, w.s1, Math.pow(p, 2.4)),
      };
    }
    const k = Math.min(1, p / 0.8);
    const a = w.a0 + w.turns * 2 * Math.PI * k;
    let x = moon.x + Math.cos(a) * w.r, y = moon.y + Math.sin(a) * w.r * 0.6;
    if (p > 0.8) {
      const q = (p - 0.8) / 0.2;
      x += q * q * W * 0.8 * Math.sign(-Math.sin(a) * w.turns || 1);
      y -= q * q * H * 0.15;
    }
    return { x, y, s: w.s0 * (1 + 0.18 * Math.sin(a)) };
  }

  // Draws the witch if she belongs to this layer (big + close = in front of the trees).
  drawWitchLayer(ctx, t, front) {
    const w = this.witch;
    if (!w) return;
    const p = Math.min(0.999, w.t / w.dur);
    const a = this.witchPos(w, p), b = this.witchPos(w, Math.min(1, p + 0.01));
    const isFront = w.kind === 'approach' && a.s > this.H * 0.1;
    if (isFront !== front) return;
    // While staring she swoops a little closer and stays fully on screen.
    const m = w.m || 0;
    let { x, y, s } = a;
    if (m > 0) {
      s = lerp(s, Math.max(s, this.H * 0.18), m);
      x = lerp(x, Math.max(this.W * 0.18, Math.min(this.W * 0.82, x)), m);
      y = lerp(y, Math.max(y, s * 1.5 + this.H * 0.02), m);
    }
    const flip = b.x < a.x;
    ctx.save();
    ctx.shadowColor = RIM;
    ctx.shadowBlur = s * 0.28;
    if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    drawWitch(ctx, x, y, s, t, m, flip, m > 0 ? (c, sz) => this.drawWitchFace(c, sz, w, t) : null);
    ctx.restore();
  }

  // Her look: ease in (0.6 s), stare (~2.4 s), ease back (0.6 s).
  updateWitchLook(w, dt) {
    if (!w.look && w.t / w.dur >= w.lookAt) {
      w.look = { t: 0, dur: 3.6 };
      const px = this.witchPos(w, w.t / w.dur).x / this.W;
      this.onEvent && this.onEvent('cackle', Math.max(-0.8, Math.min(0.8, (px - 0.5) * 1.4)));
    }
    let m = 0;
    const L = w.look;
    if (L && L.t < L.dur) {
      L.t += dt;
      const k = L.t;
      m = k < 0.6 ? ease3(k / 0.6) : k > L.dur - 0.6 ? ease3(clamp01((L.dur - k) / 0.6)) : 1;
    }
    w.m = m;
    w.rate = 1 - 0.9 * m;
  }

  // The front-facing head: pre-rendered face plus live glowing eyes.
  drawWitchFace(ctx, s, w, t) {
    const m = w.m;
    const a = clamp01(m * 2.2 - 0.1);
    if (a <= 0) return;
    const sc = (s * 0.2) / FACE.hw;
    const since = w.look ? w.look.t : 0;
    const open = clamp01((m - 0.55) / 0.3);                   // eyes snap open once she faces you
    const flare = since > 0.5 ? Math.exp(-(since - 0.5) * 2.4) : 0;
    const pulse = 0.85 + 0.15 * Math.sin(t * 9) + flare;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.scale(sc * lerp(0.35, 1, m), sc);                    // squashed while turning
    ctx.translate(-FACE.cx, -FACE.cy);
    ctx.globalAlpha = a;
    ctx.drawImage(this.witchFace, 0, 0);
    if (open > 0) {
      for (const [ex, ey] of FACE.eyes) {
        const o = ex < FACE.cx ? -1 : 1;
        const ig = ctx.createRadialGradient(ex, ey, 0, ex, ey, 17);
        ig.addColorStop(0, '#ffffe8');
        ig.addColorStop(0.35, '#efff70');
        ig.addColorStop(1, '#58a812');
        ctx.fillStyle = ig;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(ex + o * 17, ey - 5);
        ctx.quadraticCurveTo(ex + o * 4, ey - 3 - 9 * open, ex - o * 14, ey + 3);
        ctx.quadraticCurveTo(ex - o * 1, ey + 3 + 8 * open, ex + o * 17, ey - 5);
        ctx.fill();
        ctx.fillStyle = '#0a0602';                            // cat-like slit pupil
        ctx.beginPath(); ctx.ellipse(ex + o * 1, ey, 2.4, 7 * open, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      const ga = a * open;
      ctx.globalAlpha = ga * 0.35;                            // eye light spilling onto her face
      ctx.drawImage(this.witchEyeGlow, FACE.cx - 120, FACE.eyes[0][1] - 100, 240, 200);
      for (const [ex, ey] of FACE.eyes) {
        const R = 44 * pulse;
        ctx.globalAlpha = Math.min(1, ga * pulse);
        ctx.drawImage(this.witchEyeGlow, ex - R, ey - R, R * 2, R * 2);
        if (flare > 0.02) {                                   // a sharp glint as her eyes flash
          ctx.globalAlpha = ga * flare;
          ctx.drawImage(this.witchEyeGlow, ex - 110 * flare - 20, ey - 5, (110 * flare + 20) * 2, 10);
        }
      }
    }
    ctx.restore();
  }

  // The ghost wanders over the lake in depth (z: 0 far … 1 right in front),
  // hides (fades away and pops up somewhere else, often beside a tree),
  // and now and then drifts right up towards the audience.
  launchGhost() {
    if (this.ghost) return;
    const fromTree = Math.random() < 0.5;
    const g = {
      t: 0, life: 30 + Math.random() * 18, vis: 0, fade: 1, dir: 1,
      x: fromTree ? this.W * (Math.random() < 0.5 ? 0.1 : 0.92) : this.W * (0.2 + Math.random() * 0.6),
      z: fromTree ? 0.45 + Math.random() * 0.2 : 0.08 + Math.random() * 0.1,
    };
    g.act = { kind: 'drift', t: 0, dur: 0.01, fx: g.x, fz: g.z, tx: g.x, tz: g.z };
    this.ghost = g;
    this.nextGhost = 70 + Math.random() * 60;
  }

  ghostNextAct(g) {
    const W = this.W;
    const r = Math.random();
    const spot = () => Math.random() < 0.4
      ? { x: W * (Math.random() < 0.5 ? 0.1 : 0.92), z: 0.4 + Math.random() * 0.3 }     // beside a tree
      : { x: W * (0.15 + Math.random() * 0.7), z: 0.1 + Math.random() * 0.55 };
    if (g.t > g.life) return { kind: 'leave', t: 0, dur: 1.6 };
    if (r < 0.5) { const s = spot(); return { kind: 'drift', t: 0, dur: 4 + Math.random() * 4, fx: g.x, fz: g.z, tx: s.x, tz: s.z }; }
    if (r < 0.78) { const s = spot(); return { kind: 'hide', t: 0, dur: 3 + Math.random() * 2.5, nx: s.x, nz: s.z }; }
    return { kind: 'approach', t: 0, dur: 7, fx: g.x, fz: g.z, tx: W * (0.35 + Math.random() * 0.3), tz: 0.9 };
  }

  updateGhost(dt) {
    const g = this.ghost;
    if (!g) return;
    g.t += dt;
    const a = g.act;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const px = g.x;
    if (a.kind === 'drift') {
      const e = ease3(k);
      g.x = lerp(a.fx, a.tx, e); g.z = lerp(a.fz, a.tz, e); g.fade = 1;
    } else if (a.kind === 'hide') {
      // Fade out (from however visible it is now), move only once it is
      // truly invisible, then fade back in somewhere else.
      const f0 = a.f0 ?? 1;
      if (k < 0.25) g.fade = f0 * (1 - k / 0.25);
      else if (k < 0.75) {
        g.fade = 0;
        if (!a.moved && g.vis < 0.004) { g.x = a.nx; g.z = a.nz; a.moved = true; }
      } else {
        if (!a.moved) { g.vis = 0; g.x = a.nx; g.z = a.nz; a.moved = true; }
        g.fade = ease3((k - 0.75) / 0.25);
      }
    } else if (a.kind === 'approach') {
      // Glides up close, stops and stares at you, then slowly dissolves.
      if (k < 0.55) {
        const e = ease3(k / 0.55);
        g.x = lerp(a.fx, a.tx, e); g.z = lerp(a.fz, a.tz, e); g.fade = 1;
      } else if (k < 0.8) {
        g.z = a.tz + (k - 0.55) * 0.12; g.fade = 1;
      } else {
        const q = (k - 0.8) / 0.2;
        g.z = a.tz + 0.03 + q * 0.06;
        g.fade = 1 - ease3(q);
      }
      g.stare = k < 0.5 ? 0 : k < 0.6 ? (k - 0.5) / 0.1 : 1;
    } else if (a.kind === 'leave') {
      g.fade = 1 - k;
      if (k >= 1) { this.ghost = null; return; }
    }
    if (Math.abs(g.x - px) > 0.5) g.dir = g.x > px ? 1 : -1;
    g.vis += ((g.t < 1.5 ? g.t / 1.5 : 1) * g.fade - g.vis) * Math.min(1, dt * 6);
    if (a.kind !== 'approach') g.stare = Math.max(0, (g.stare || 0) - dt * 2);
    if (k >= 1) {
      g.act = this.ghostNextAct(g);
      if (a.kind === 'approach') {
        g.act = { kind: 'hide', t: 0, dur: 3, f0: 0, nx: this.W * (0.2 + Math.random() * 0.6), nz: 0.1 + Math.random() * 0.2 };
      } else if (g.act.kind === 'hide') g.act.f0 = g.fade;
    }
  }

  drawGhost(ctx, t, L) {
    const g = this.ghost;
    if (!g || g.vis < 0.01) return;
    const { H, hy } = this;
    const z = g.z;
    const s = H * (0.05 + 0.32 * Math.pow(z, 1.5));
    const water = hy + (H - hy) * (0.05 + z * 0.85);
    const x = g.x, y = water - s * 0.95 + Math.sin(t * 0.9) * s * 0.06;
    const close = z > 0.75 ? lerp(1, 0.6, (z - 0.75) / 0.25) : 1;
    const a = g.vis * 0.26 * (1 - L * 0.45) * close;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.9;
    ctx.drawImage(this.ghostGlow, x - s * 1.3, y - s * 1.2, s * 2.6, s * 2.6);
    ctx.globalAlpha = a * 0.5;                                   // faint reflection on the water
    ctx.drawImage(this.ghostGlow, x - s * 0.8, water - s * 0.06, s * 1.6, s * 0.3);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    if (g.dir < 0) ctx.scale(-1, 1);
    ctx.rotate(Math.sin(t * 0.7) * 0.06 + 0.08);
    ctx.globalAlpha = a;
    ghostPath(ctx, s, t);
    const grad = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.7);
    grad.addColorStop(0, 'rgba(240,245,255,1)');
    grad.addColorStop(1, 'rgba(205,220,255,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    // Face: undo the mirror so it always looks straight out at the audience.
    if (g.dir < 0) ctx.scale(-1, 1);
    this.drawGhostFace(ctx, g, s, a, x, t, L);
    ctx.restore();
  }

  // Dark hollow eyes, facing straight out at the audience: slanted
  // teardrop shapes (drooping at the outer corners), and a moaning mouth.
  drawGhostFace(ctx, g, s, a, x, t, L) {
    const stare = g.stare || 0;
    const blinkT = (t + (g.life || 0)) % 4.7;
    const lid = stare > 0.5 ? 1 : blinkT < 0.16 ? Math.max(0.12, Math.abs(blinkT - 0.08) / 0.08) : 1;
    const eyeY = -s * 0.25, ex = s * 0.14;
    const w = s * (0.068 + stare * 0.01), h = s * (0.095 + stare * 0.015) * lid;
    ctx.fillStyle = 'rgba(10,12,30,1)';
    ctx.globalAlpha = Math.min(1, a * 2);
    for (const d of [-1, 1]) {
      const cx = d * ex;
      ctx.beginPath();
      ctx.moveTo(cx - d * w * 0.9, eyeY - h * 0.55);                           // inner top corner
      ctx.bezierCurveTo(cx - d * w * 0.2, eyeY - h * 1.15, cx + d * w * 1.1, eyeY - h * 0.6, cx + d * w * 1.05, eyeY + h * 0.25);
      ctx.bezierCurveTo(cx + d * w * 1.0, eyeY + h * 1.05, cx - d * w * 0.6, eyeY + h * 1.0, cx - d * w * 0.95, eyeY + h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    const mouthH = s * (0.075 + stare * 0.05 + Math.sin(t * 1.3) * 0.01);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.03 + stare * s * 0.02, s * (0.05 + stare * 0.012), mouthH, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Sky layer: witch and bats, with a faint moonlit glow so they stand out.
  drawSky(ctx, t, dt) {
    const { W, H, moon } = this;
    ctx.save();
    ctx.shadowColor = RIM;
    if (this.witch) {
      this.updateWitchLook(this.witch, dt);
      this.witch.t += dt * this.witch.rate;
      if (this.witch.t >= this.witch.dur) this.witch = null;
      else this.drawWitchLayer(ctx, t, false);
    }
    if (this.bats) {
      const b = this.bats;
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) this.bats = null;
      else {
        const cx = b.ltr ? lerp(-W * 0.15, W * 1.15, p) : lerp(W * 1.15, -W * 0.15, p);
        ctx.shadowBlur = H * 0.008;
        for (const bat of b.list) {
          const x = cx + bat.dx + Math.sin(t * 1.3 + bat.ph) * W * 0.01;
          const y = b.y0 + bat.dy + Math.sin(p * bat.wav + bat.ph) * H * 0.025;
          drawBat(ctx, x, y, bat.s, Math.sin(t * 20 + bat.ph));
        }
      }
    }
    ctx.restore();
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
  }

  // Foreground: trees (with owls + spider), flying owls, the bank with the
  // skeleton and pumpkins, splash, leaves. `cam` = parallax offset.
  // Returns light spots to add after the vignette (all in screen coords).
  drawFront(ctx, t, cam = { x: 0, y: 0 }) {
    const { W, H } = this;
    const lights = [];
    ctx.save();
    ctx.translate(cam.x, cam.y);
    for (const [tree, side] of [[this.left, 'left'], [this.right, 'right']]) {
      ctx.drawImage(tree.trunk.canvas, tree.trunk.x, tree.trunk.y);
      // Each branch sways in the breeze on its own rhythm; gusts bend them more.
      tree.limbs.forEach((L, idx) => {
        const sw = L.sway;
        const breeze = Math.sin(t * sw.f1 + sw.ph) + 0.4 * Math.sin(t * sw.f2 + sw.ph * 1.7);
        const ang = sw.amp * breeze * (1 + this.gust * 2.5) + this.gust * this.gustDir * sw.gust;
        ctx.save();
        ctx.translate(L.px, L.py);
        ctx.rotate(ang);
        ctx.translate(-L.px, -L.py);
        ctx.drawImage(L.canvas, L.x, L.y);
        for (const o of this.owls) {
          if (o.state !== 'perched') continue;
          const p = this.perches[o.perch];
          if (p.tree === side && p.limb === idx) lights.push(...this.drawOwl(ctx, o, p.x, p.y - H * 0.004, t));
        }
        if (tree.spider && tree.spider.limb === idx) this.drawSpider(ctx, tree.spider.x, tree.spider.y, t);
        for (const sp of this.spiders) if (sp.side === side && sp.limb === idx) this.drawDropSpider(ctx, sp, t);
        ctx.restore();
      });
    }

    // Owls in flight
    ctx.save();
    ctx.shadowColor = RIM;
    for (const o of this.owls) {
      if (o.state === 'perched') continue;
      const f = this.owlFlightPos(o);
      const landing = o.state === 'arriving' && f.k > 0.86;
      const takeoff = o.state === 'leaving' && f.k < 0.12;
      const glide = !landing && !takeoff && Math.sin(t * 0.9 + o.look) > 0.55;
      const flap = landing ? -0.85 : glide ? 0.12 + 0.05 * Math.sin(t * 3) : Math.sin(t * 9 + o.look);
      const s = o.s * 1.25;
      ctx.shadowBlur = H * 0.01;
      drawFlyingOwl(ctx, f.x, f.y, s, flap, f.dir);
      for (const d of [-1, 1]) lights.push({ type: 'eye', x: f.x + cam.x + f.dir * s * 0.05 + d * s * 0.07, y: f.y + cam.y - s * 0.37, s: s * 0.04, open: 1, a: 0.95 });
    }
    ctx.restore();

    for (const sp of this.spiders) if (sp.top) this.drawDropSpider(ctx, sp, t);
    // Cobweb in a top corner, with twinkling dew
    if (this.web) {
      const wb = this.web;
      ctx.save();
      if (wb.right) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(wb.canvas, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const [gx, gy, ph] of wb.glints) {
        const tw = Math.pow(Math.max(0, Math.sin(t * 1.3 + ph)), 6);
        if (tw < 0.05) continue;
        ctx.globalAlpha = tw;
        ctx.drawImage(this.drop, gx - 4, gy - 4, 8, 8);
      }
      ctx.restore();
    }
    this.drawWitchLayer(ctx, t, true);

    ctx.drawImage(this.bank.canvas, this.bank.x, this.bank.y);
    ctx.drawImage(this.rbank.canvas, this.rbank.x, this.rbank.y);

    // The skeleton: rises from the ground, walks to the edge, falls in.
    if (this.skel) this.drawSkel(ctx, t, cam, lights);
    if (this.splash) this.drawSplash(ctx, t);

    for (const p of this.pumpkins) {
      ctx.drawImage(p.body, p.x - p.ox, p.y - p.oy);
      lights.push({ type: 'pumpkin', p, ox: cam.x, oy: cam.y });
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
    ctx.restore();
    return lights;
  }

  drawSkel(ctx, t, cam, lights) {
    const s = this.skel;
    const { W, H } = this;
    const S = H * 0.13;
    const T = s.t;
    const walkStart = 3.6, walkEnd = 12.5, fallStart = 14.5, fallEnd = 15.3;
    let x = s.x0, walking = false, lookBack = false, rot = 0, dy = 0, shake = 0, alpha = 1;
    if (T < 3) {                       // clawing out of the ground
      const k = T / 3;
      dy = (1 - (1 - Math.pow(1 - k, 2))) * S * 1.05;
      shake = Math.sin(T * 40) * S * 0.012 * (1 - k);
      if (Math.random() < 0.5) this.dirt(s.x0 + (Math.random() - 0.5) * S * 0.3, this.bankY(s.x0));
    } else if (T < walkStart) {
      // stands, looks around
      lookBack = T > 3.25;
    } else if (T < walkEnd) {
      const k = (T - walkStart) / (walkEnd - walkStart);
      x = lerp(s.x0, s.edge, k);
      walking = true;
    } else if (T < fallStart) {
      x = s.edge;
      lookBack = T < walkEnd + 1.1;    // glances at the audience, then at the water
    } else if (T < fallEnd) {
      x = s.edge;
      const k = (T - fallStart) / (fallEnd - fallStart);
      rot = Math.pow(k, 1.8) * 1.7;
      dy = Math.pow(k, 2) * H * 0.02;
    } else {
      if (!s.splashed) {
        s.splashed = true;
        this.makeSplash(s.edge + W * 0.075, this.bankY(s.edge) + H * 0.022);
      }
      alpha = 0;
    }
    const y = this.bankY(x);
    if (alpha > 0) {
      ctx.save();
      if (T < 3) { // only the part above the ground shows
        ctx.beginPath();
        ctx.rect(x - S, y - S * 1.5, S * 2, S * 1.5 + 1);
        ctx.clip();
      }
      ctx.translate(x + shake, y + dy);
      ctx.rotate(rot);
      const r = drawSkeleton(ctx, 0, 0, S, s.phase, walking, lookBack, t);
      ctx.restore();
      if (rot < 0.3) for (const [ex, ey] of r.eyes) lights.push({ type: 'skull', x: ex + x + shake + cam.x, y: ey + y + dy + cam.y, s: r.r * 0.12 });
    }
    // The skull bobs up once after the splash, then sinks.
    if (T > fallEnd + 1.2 && T < fallEnd + 4.5 && this.splash) {
      const k = (T - fallEnd - 1.2) / 3.3;
      const bob = Math.sin(k * Math.PI);
      const sx = this.splash.x + S * 0.05, sy = this.splash.y + S * 0.06 - bob * S * 0.08;
      const r = S * 0.07;
      ctx.save();
      ctx.beginPath(); ctx.rect(sx - r * 2, sy - r * 3, r * 4, r * 3 + (this.splash.y - sy) + r * 0.2); ctx.clip();
      ctx.fillStyle = '#e3dcc8';
      ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.05, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0806';
      ctx.beginPath(); ctx.ellipse(sx - r * 0.3, sy - r * 0.05, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx + r * 0.3, sy - r * 0.05, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (bob > 0.3) for (const d of [-1, 1]) lights.push({ type: 'skull', x: sx + d * r * 0.3 + cam.x, y: sy - r * 0.05 + cam.y, s: r * 0.1 });
    }
  }

  dirt(x, y) {
    if (!this.splash) this.splash = { x, y, t: 0, drops: [], dirtOnly: true };
    if (this.splash.drops.length > 60) return;
    this.splash.drops.push({ x, y, vx: (Math.random() - 0.5) * this.H * 0.15, vy: -this.H * (0.1 + Math.random() * 0.2), dirt: true, life: 0.8 });
  }

  makeSplash(x, y) {
    const drops = [];
    for (let i = 0; i < 46; i++) {
      const up = Math.random();
      drops.push({
        x: x + (Math.random() - 0.5) * this.H * 0.03, y,
        vx: (Math.random() - 0.5) * this.H * (0.6 - up * 0.4), vy: -this.H * (0.25 + up * 0.7),
        life: 1.6, z: this.H * (0.0025 + Math.random() * 0.004),
      });
    }
    this.splash = { x, y, t: 0, drops };
    this.onEvent && this.onEvent('splash');
  }

  drawSplash(ctx, t) {
    const sp = this.splash;
    const H = this.H;
    ctx.save();
    if (!sp.dirtOnly) {
      // Ripple rings spreading over the water
      ctx.strokeStyle = 'rgb(220,228,255)';
      for (let i = 0; i < 3; i++) {
        const k = (sp.t - i * 0.45) / 3.5;
        if (k <= 0 || k >= 1) continue;
        const rx = H * (0.02 + k * 0.16);
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx, rx * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // A flash of white foam on the surface
      if (sp.t < 1.2) {
        const k = sp.t / 1.2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * 0.7;
        const fw = H * (0.03 + k * 0.05);
        ctx.drawImage(this.drop, sp.x - fw, sp.y - fw * 0.18, fw * 2, fw * 0.36);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    for (const d of sp.drops) {
      const k = sp.t / d.life;
      if (k >= 1 || d.y > sp.y + H * 0.01) continue;
      if (d.dirt) {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#120c08';
        ctx.fillRect(d.x, d.y, 3, 3);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k * 0.7;
        const z = d.z;
        ctx.drawImage(this.drop, d.x - z, d.y - z * 1.6, z * 2, z * 3.2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
    if (sp.dirtOnly && sp.t > 1.5) this.splash = null;
  }

  // Glows that should shine through the vignette (pumpkin faces, eyes).
  drawFrontLights(ctx, t, lights) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.type === 'pumpkin') {
        const p = l.p;
        const x = p.x + l.ox, y = p.y + l.oy;
        const fl = 0.72 + 0.28 * wobble(t * 0.9, p.seed) + 0.05 * Math.sin(t * 23 + p.seed);
        ctx.globalAlpha = Math.min(1, fl);
        ctx.drawImage(p.face, x - p.ox, y - p.oy);
        const g = p.size * 4.2;
        ctx.globalAlpha = 0.32 * fl;
        ctx.drawImage(this.warm, x - g / 2, y - p.size * 0.45 - g / 2, g, g);
        ctx.globalAlpha = 0.18 * fl;
        ctx.drawImage(this.warm, x - g * 0.6, y - g * 0.12, g * 1.2, g * 0.24);
      } else if (l.type === 'eye') {
        ctx.globalAlpha = l.a;
        const s = l.s * 6;
        ctx.drawImage(this.eyeGlow, l.x - s / 2, l.y - s / 2, s, s);
        ctx.fillStyle = 'rgb(255,214,90)';
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, l.s, l.s * l.open, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (l.type === 'skull') {
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 7);
        const s = l.s * 10;
        ctx.drawImage(this.skullGlow, l.x - s / 2, l.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  drawOwl(ctx, o, x, y, t) {
    const s = o.s;
    ctx.save();
    ctx.translate(x, y);
    // Soft moonlit halo behind the owl (cheaper than a blur, drawn every frame)
    ctx.globalAlpha = 0.4;
    ctx.drawImage(this.ghostGlow, -s * 1.1, -s * 1.75, s * 2.2, s * 2.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = SIL;
    ctx.beginPath(); ctx.ellipse(0, -s * 0.48, s * 0.3, s * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    const lk = Math.sin(t * 0.13 + o.look);
    const look = lk > 0.7 ? 0.5 : lk < -0.8 ? -0.5 : 0;
    ctx.beginPath(); ctx.ellipse(look * s * 0.04, -s * 0.92, s * 0.28, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * s * 0.12 + look * s * 0.04, -s * 1.08);
      ctx.lineTo(d * s * 0.3 + look * s * 0.04, -s * 1.28);
      ctx.lineTo(d * s * 0.26 + look * s * 0.04, -s * 0.98);
      ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.05); ctx.lineTo(0, s * 0.22); ctx.lineTo(s * 0.1, -s * 0.05); ctx.fill();
    ctx.restore();
    // Eyes (glowing, blinking), converted to screen space for the light pass.
    const cyc = (t + o.blink) % 5.5;
    const open = cyc < 0.18 ? Math.abs(cyc - 0.09) / 0.09 : 1;
    const m = ctx.getTransform();
    const dpr = Math.hypot(m.a, m.b) || 1;
    const eyes = [];
    for (const d of [-1, 1]) {
      const px = x + d * s * 0.11 + look * s * 0.06, py = y - s * 0.93;
      eyes.push({ type: 'eye', x: (m.a * px + m.c * py + m.e) / dpr, y: (m.b * px + m.d * py + m.f) / dpr, s: s * 0.06, open, a: 0.95 });
    }
    return eyes;
  }

  drawSpider(ctx, ax, ay, t) {
    const H = this.H;
    // Slowly lowers and climbs back up, with pauses.
    const cyc = (t % 40) / 40;
    const k = cyc < 0.4 ? cyc / 0.4 : cyc < 0.55 ? 1 : cyc < 0.95 ? 1 - (cyc - 0.55) / 0.4 : 0;
    const len = H * (0.03 + 0.14 * (0.5 - 0.5 * Math.cos(k * Math.PI)));
    this.spiderAt(ctx, ax, ay, len, H * this.treeSpiderSize, t, 0);
  }

  drawDropSpider(ctx, sp, t) {
    let k;
    if (sp.t < sp.down) k = sp.t / sp.down;
    else if (sp.t < sp.down + sp.pause) k = 1;
    else k = 1 - (sp.t - sp.down - sp.pause) / sp.up;
    const len = sp.len * (0.5 - 0.5 * Math.cos(Math.max(0, k) * Math.PI));
    this.spiderAt(ctx, sp.x, sp.y, Math.max(2, len), sp.s, t, sp.ph);
  }

  // A spider on its silk thread, with a moonlit outline so it shows up.
  spiderAt(ctx, ax, ay, len, s, t, ph) {
    const sway = Math.sin(t * 0.8 + ph) * this.H * 0.005;
    const sx = ax + sway, sy = ay + len;
    ctx.save();
    ctx.strokeStyle = 'rgba(225,230,245,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.shadowColor = RIM;
    ctx.shadowBlur = s * 0.9;
    ctx.fillStyle = SIL;
    ctx.strokeStyle = SIL;
    ctx.lineWidth = Math.max(1.4, s * 0.16);
    ctx.lineCap = 'round';
    const wig = Math.sin(t * 6 + ph) * 0.18;
    for (let i = 0; i < 4; i++) {
      for (const d of [-1, 1]) {
        const a0 = (i - 1.5) * 0.45 + wig * (i % 2 ? 1 : -1);
        const kx = sx + d * s * 1.5, ky = sy + s * (0.4 + i * 0.35) - s * 0.75;
        ctx.beginPath();
        ctx.moveTo(sx, sy + s * (0.6 + i * 0.12));
        ctx.lineTo(kx, ky + Math.sin(a0) * s);
        ctx.lineTo(sx + d * s * 2.2, sy + s * (0.7 + i * 0.5));
        ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(sx, sy + s * 0.55, s * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, sy + s * 1.7, s * 0.95, s * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // tiny red eyes
    ctx.fillStyle = 'rgba(255,60,40,0.9)';
    ctx.beginPath(); ctx.arc(sx - s * 0.22, sy + s * 0.75, Math.max(1, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + s * 0.22, sy + s * 0.75, Math.max(1, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
