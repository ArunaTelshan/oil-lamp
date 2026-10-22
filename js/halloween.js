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
    this.skullGlow = makeGlow(32, [[0, 'rgba(190,255,200,1)'], [0.4, 'rgba(120,255,160,0.5)'], [1, 'rgba(80,220,120,0)']]);
    this.drop = makeGlow(16, [[0, 'rgba(230,240,255,1)'], [1, 'rgba(200,220,255,0)']]);
    this.gust = 0; this.gustDir = 1; this.gustT = -1; this.nextGust = 25;
    this.leaves = [];
    this.bats = null; this.nextBats = 20 + Math.random() * 15;
    this.witch = null; this.nextWitch = 80 + Math.random() * 40;
    this.ghost = null; this.nextGhost = 45 + Math.random() * 30;
    this.owls = []; this.nextOwl = 12 + Math.random() * 10;
    this.skel = null; this.nextSkel = 100 + Math.random() * 50;
    this.splash = null;
    this.onEvent = null;     // (name) → screen plays a sound
    this.enabled = true;     // false during the finale (no new flying characters)
  }

  resize(W, H, hy, shoreY, moon) {
    this.W = W; this.H = H; this.hy = hy; this.moon = moon; this.shoreY = shoreY;
    this.left = renderTree(W, H, 'left', this.seed * 3 + 1, moon);
    this.right = renderTree(W, H, 'right', this.seed * 7 + 2, moon);
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

  // Sky layer: witch and bats, with a faint moonlit glow so they stand out.
  drawSky(ctx, t, dt) {
    const { W, H, moon } = this;
    ctx.save();
    ctx.shadowColor = RIM;
    if (this.witch) {
      const w = this.witch;
      w.t += dt;
      const p = w.t / w.dur;
      if (p >= 1) this.witch = null;
      else {
        const x = w.ltr ? lerp(-W * 0.1, W * 1.1, p) : lerp(W * 1.1, -W * 0.1, p);
        const y = moon.y + (x - moon.x) * (w.ltr ? 0.12 : -0.12) + Math.sin(p * 10) * H * 0.008;
        ctx.shadowBlur = H * 0.012;
        ctx.save();
        if (!w.ltr) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        drawWitch(ctx, x, y, H * 0.065, t);
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

    ctx.drawImage(this.bank.canvas, this.bank.x, this.bank.y);

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
