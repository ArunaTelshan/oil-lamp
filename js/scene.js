// The night lake: sky, moon, stars, far shore, water (sky reflection, ripples,
// moonlight glitter path), mist, fireflies and reeds — plus the Halloween
// layer. A very slow camera drift moves near things more than far things,
// which gives the scene depth.

import { HORIZON, rng } from './layout.js';
import { makeGlow } from './lamp-art.js';
import { Halloween } from './halloween.js';

const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

// Night palette (L = 0: dark lake, L = 1: lake full of light).
// Lifted a little so black silhouettes stand out, even on a projector.
const SKY_TOP = [[8, 10, 30], [12, 14, 38]];
const SKY_MID = [[22, 24, 62], [36, 30, 72]];
const SKY_LOW = [[54, 44, 92], [96, 64, 92]];

export class Scene {
  constructor(seed) {
    this.seed = seed || ((Math.random() * 1e9) | 0);   // new trees each time the screen opens
    this.moonGlow = makeGlow(256, [[0, 'rgba(255,246,220,0.9)'], [0.12, 'rgba(240,230,210,0.35)'], [0.4, 'rgba(160,170,210,0.08)'], [1, 'rgba(120,130,190,0)']]);
    this.mistSprite = makeGlow(256, [[0, 'rgba(178,186,214,0.9)'], [0.5, 'rgba(160,170,205,0.35)'], [1, 'rgba(150,160,200,0)']]);
    this.cloudSprite = makeGlow(256, [[0, 'rgba(20,22,46,0.95)'], [0.6, 'rgba(20,22,46,0.4)'], [1, 'rgba(20,22,46,0)']]);
    this.flyGlow = makeGlow(64, [[0, 'rgba(230,255,160,1)'], [0.3, 'rgba(200,255,120,0.35)'], [1, 'rgba(160,240,90,0)']]);
    this.glint = makeGlow(64, [[0, 'rgba(255,252,240,1)'], [0.35, 'rgba(235,235,255,0.55)'], [1, 'rgba(200,210,255,0)']]);
    this.hw = new Halloween(this.seed);
    this.cam = { x: 0, y: 0 };
  }

  // Height of the far shore at x (shared by trees, pumpkins and the house).
  shoreY(x) {
    const { W, H, hy } = this;
    const edge = Math.pow(Math.min(1, Math.abs(x / W - 0.5) * 2), 2);
    return hy - H * (0.006 + 0.012 * Math.sin(x * 0.004 + 1) ** 2 + 0.035 * edge);
  }

  resize(W, H) {
    this.W = W; this.H = H;
    this.hy = H * HORIZON;
    const rand = rng(77);

    this.stars = [];
    for (let i = 0; i < 300; i++) {
      const y = Math.pow(rand(), 1.4) * this.hy * 0.95;
      this.stars.push({ x: rand() * W * 1.04 - W * 0.02, y, r: rand() < 0.1 ? 1.8 : 0.7 + rand() * 0.9, a: 0.3 + rand() * 0.6, tw: 0.5 + rand() * 2.5, ph: rand() * 6.28 });
    }

    this.moon = { x: W * 0.73, y: H * 0.165, r: H * 0.062 };
    this.moonDisk = this.renderMoon(this.moon.r);

    this.hw.resize(W, H, this.hy, x => this.shoreY(x), this.moon);
    this.trees = this.renderTrees(W, H);
    this.ripples = this.renderRipples(W, H);

    // Moonlight glitter: hundreds of tiny glints on the ripples.
    const gr = rng(this.seed + 5);
    this.glints = Array.from({ length: 480 }, () => ({
      u: (gr() + gr() + gr() - 1.5) / 1.5,          // across the path (bell-shaped)
      v: gr(),                                        // along the path (far → near)
      sp: 1.2 + gr() * 3.5, ph: gr() * 6.28, size: 0.4 + gr() * 0.8,
    }));

    this.mist = [];
    for (let i = 0; i < 26; i++) {
      const far = i < 16;
      const w = W * (far ? 0.28 + rand() * 0.35 : 0.4 + rand() * 0.45);
      this.mist.push({
        far,
        x: rand() * (W + w) - w / 2,
        y: far ? this.hy - H * 0.03 + rand() * H * 0.13 : H * (0.6 + rand() * 0.42),
        w, h: w * (far ? 0.16 : 0.2),
        v: (far ? 5 : 9) + rand() * 9,
        a: far ? 0.16 + rand() * 0.12 : 0.06 + rand() * 0.07,
      });
    }

    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: rand() * W, y: H * (0.06 + rand() * 0.24), w: W * (0.25 + rand() * 0.3), h: H * (0.025 + rand() * 0.03), v: 3 + rand() * 5, a: 0.3 + rand() * 0.3 });
    }

    this.flies = [];
    for (let i = 0; i < 18; i++) {
      this.flies.push({ x: rand() * W, y: H * (0.47 + rand() * 0.48), ax: 20 + rand() * 60, ay: 8 + rand() * 25, fx: 0.05 + rand() * 0.15, fy: 0.07 + rand() * 0.2, ph: rand() * 6.28, bf: 0.3 + rand() * 0.6 });
    }

    this.reeds = this.renderReeds(W, H);
    this.vignette = this.renderVignette(W, H);

    // Moonlit sky: a wide soft brightening around the moon (pre-rendered)
    const sk = document.createElement('canvas');
    sk.width = Math.ceil(W * 1.1); sk.height = Math.ceil(this.hy + H * 0.05);
    const sg = sk.getContext('2d');
    const m = this.moon;
    const grad = sg.createRadialGradient(m.x + W * 0.05, m.y + H * 0.05, 0, m.x + W * 0.05, m.y + H * 0.05, W * 0.55);
    grad.addColorStop(0, 'rgba(120,125,170,0.3)');
    grad.addColorStop(1, 'rgba(60,60,110,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, sk.width, sk.height);
    this.skyGlow = sk;
  }

  renderMoon(r) {
    const c = document.createElement('canvas');
    const S = Math.ceil(r * 2 + 4);
    c.width = c.height = S;
    const g = c.getContext('2d');
    const cx = S / 2;
    const grad = g.createRadialGradient(cx - r * 0.25, cx - r * 0.25, r * 0.1, cx, cx, r);
    grad.addColorStop(0, '#fffdf2');
    grad.addColorStop(0.7, '#f1e6cc');
    grad.addColorStop(1, '#d9c9a6');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill();
    const rand = rng(9);
    g.save();
    g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.clip();
    g.filter = `blur(${Math.max(1, r * 0.06)}px)`;
    for (let i = 0; i < 9; i++) {
      const a = rand() * 6.28, d = rand() * r * 0.6, rr = r * (0.1 + rand() * 0.22);
      g.fillStyle = `rgba(160,145,120,${0.05 + rand() * 0.06})`;
      g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cx + Math.sin(a) * d, rr, rr * (0.7 + rand() * 0.3), rand() * 3, 0, Math.PI * 2); g.fill();
    }
    g.filter = 'none';
    g.restore();
    return c;
  }

  // Far shore, random each time: a hazy ridge with a back row of trees, then
  // the dark shoreline with a varied front row — bare trees of different
  // shapes, pines, round crowns, narrow poplars, dead snags and bushes,
  // growing in clumps with gaps (taller towards the edges).
  renderTrees(W, H) {
    const pad = Math.ceil(W * 0.04);         // extra width so the parallax never shows an edge
    const c = document.createElement('canvas');
    c.width = W + pad * 2; c.height = Math.ceil(this.hy + 2);
    const g = c.getContext('2d');
    g.translate(pad, 0);
    const hy = this.hy;
    const rand = rng(this.seed + 31);
    const FAR = '#141127', NEAR = '#03040a';
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // ---- tree shapes ----
    const bare = (x, base, h, col) => {
      const spread = 0.3 + rand() * 0.5, decay = 0.58 + rand() * 0.16, wobble = 0.3 + rand() * 0.5;
      const depth = rand() < 0.5 ? 5 : 6;
      const br = (bx, by, len, ang, wid, d) => {
        const x2 = bx + Math.cos(ang) * len, y2 = by + Math.sin(ang) * len;
        g.lineWidth = Math.max(0.7, wid);
        g.beginPath();
        g.moveTo(bx, by);
        const bend = (rand() - 0.5) * len * wobble;
        g.quadraticCurveTo((bx + x2) / 2 + bend, (by + y2) / 2 + bend * 0.3, x2, y2);
        g.stroke();
        if (d <= 0 || len < 2) return;
        const kids = d > 3 ? 2 : 2 + (rand() < 0.4 ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const na = ang + (k - (kids - 1) / 2) * spread * (0.7 + rand() * 0.6) + (rand() - 0.5) * 0.5;
          br(x2, y2, len * (decay + rand() * 0.12), na, wid * 0.66, d - 1);
        }
      };
      g.strokeStyle = col;
      br(x, base, h * (0.3 + rand() * 0.15), -Math.PI / 2 + (rand() - 0.5) * 0.35, Math.max(1, h * 0.045), depth);
    };
    const pine = (x, base, h, col) => {
      const tiers = 5 + Math.floor(rand() * 5);
      const w0 = h * (0.24 + rand() * 0.14);
      const lean = (rand() - 0.5) * h * 0.06;
      const right = [], left = [];
      for (let i = 0; i < tiers; i++) {
        const f = (i + 1) / tiers;
        const y = base - h + f * h * 0.9;
        const hw = w0 * f * (0.75 + rand() * 0.5);
        const cx = x + lean * (1 - f);
        right.push([cx + hw, y], [cx + hw * 0.4, y - h * 0.03]);
        left.push([cx - hw * (0.85 + rand() * 0.3), y], [cx - hw * 0.4, y - h * 0.03]);
      }
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x + lean, base - h);
      for (const [px, py] of right) g.lineTo(px, py);
      g.lineTo(x + w0 * 0.12, base);
      g.lineTo(x - w0 * 0.12, base);
      for (let i = left.length - 1; i >= 0; i--) g.lineTo(left[i][0], left[i][1]);
      g.closePath();
      g.fill();
    };
    const round = (x, base, h, col) => {
      const lean = (rand() - 0.5) * h * 0.12;
      g.strokeStyle = col; g.fillStyle = col;
      g.lineWidth = Math.max(1, h * 0.05);
      g.beginPath(); g.moveTo(x, base); g.lineTo(x + lean, base - h * 0.5); g.stroke();
      const r = h * (0.26 + rand() * 0.1), cx = x + lean, cy = base - h * 0.68;
      const n = 6 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.28, d = rand() * r * 0.6;
        g.beginPath();
        g.arc(cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, r * (0.35 + rand() * 0.3), 0, Math.PI * 2);
        g.fill();
      }
    };
    const poplar = (x, base, h, col) => {
      g.fillStyle = col;
      const n = 6 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        g.beginPath();
        g.arc(x + (rand() - 0.5) * h * 0.04, base - h * (0.15 + f * 0.8), h * (0.09 - f * 0.04) * (0.8 + rand() * 0.4), 0, Math.PI * 2);
        g.fill();
      }
    };
    const snag = (x, base, h, col) => {
      g.strokeStyle = col;
      const bend = (rand() - 0.5) * h * 0.2;
      g.lineWidth = Math.max(1, h * 0.05);
      g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + bend, base - h * 0.5, x + bend * 0.6, base - h * (0.8 + rand() * 0.2)); g.stroke();
      const stubs = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < stubs; i++) {
        const f = 0.35 + rand() * 0.5, sx = x + bend * f, sy = base - h * f * 0.9;
        const dir = rand() < 0.5 ? -1 : 1, len = h * (0.1 + rand() * 0.18);
        g.lineWidth = Math.max(0.8, h * 0.02);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dir * len, sy - len * (0.2 + rand() * 0.6)); g.stroke();
      }
    };
    const bush = (x, base, h, col) => {
      g.fillStyle = col;
      const n = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.arc(x + (rand() - 0.5) * h * 0.9, base - h * (0.12 + rand() * 0.2), h * (0.2 + rand() * 0.15), 0, Math.PI * 2);
        g.fill();
      }
    };
    const pick = weights => {
      let r = rand() * weights.reduce((a, [, w]) => a + w, 0);
      for (const [fn, w] of weights) { if ((r -= w) <= 0) return fn; }
      return weights[0][0];
    };
    const NEAR_KINDS = [[bare, 40], [pine, 18], [round, 14], [snag, 11], [poplar, 8], [bush, 9]];
    const FAR_KINDS = [[bare, 30], [pine, 30], [round, 25], [poplar, 10], [bush, 5]];
    const edgeOf = x => Math.min(1, Math.abs(x / W - 0.5) * 2);

    // Groves: clumps of trees with open gaps between them.
    const groves = (yAt, kinds, col, hMin, hEdge, density) => {
      let x = -pad;
      while (x < W + pad) {
        const e = edgeOf(x);
        const groveLen = W * (0.02 + rand() * 0.12) * (0.6 + e);
        const end = x + groveLen;
        while (x < end) {
          const ee = edgeOf(x);
          const h = H * (hMin + hEdge * Math.pow(ee, 2) * (0.5 + rand() * 0.8)) * (0.6 + rand() * 0.7);
          pick(kinds)(x, yAt(x) + H * 0.004, h, col);
          x += W * (0.004 + rand() * 0.014) / density;
        }
        x += W * (0.01 + rand() * 0.07) * (1.6 - e);
      }
    };

    // Back ridge, hazy (further away = paler)
    const ph = rand() * 6.28;
    const ridgeY = x => this.shoreY(x) - H * (0.012 + 0.012 * (0.5 + 0.5 * Math.sin(x * 0.0023 + ph)) + 0.005 * Math.sin(x * 0.011 + ph * 2));
    g.fillStyle = FAR;
    g.beginPath();
    g.moveTo(-pad, hy + 1);
    for (let x = -pad; x <= W + pad; x += W / 80) g.lineTo(x, ridgeY(x));
    g.lineTo(W + pad, hy + 1);
    g.closePath();
    g.fill();
    groves(ridgeY, FAR_KINDS, FAR, 0.012, 0.035, 1.3);

    // Near shoreline
    g.fillStyle = NEAR;
    g.beginPath();
    g.moveTo(-pad, hy + 1);
    for (let x = -pad; x <= W + pad; x += W / 60) g.lineTo(x, this.shoreY(x));
    g.lineTo(W + pad, hy + 1);
    g.closePath();
    g.fill();

    this.hw.renderHouse(g, W * 0.835, this.shoreY(W * 0.835) + 2, H);
    groves(x => this.shoreY(x), NEAR_KINDS, NEAR, 0.016, 0.1, 1);
    // One great dead tree near the left edge
    g.strokeStyle = NEAR;
    bare(W * (0.04 + rand() * 0.06), hy + 2, H * (0.2 + rand() * 0.08), NEAR);
    return { canvas: c, pad };
  }

  // Water texture: thousands of short ripple highlights and troughs, small
  // and dense far away, longer and wider close up (perspective).
  renderRipples(W, H) {
    const lakeH = Math.ceil(H - this.hy);
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * 1.12); c.height = lakeH;
    const g = c.getContext('2d');
    const rand = rng(404);
    for (let i = 0; i < 3200; i++) {
      const d = Math.pow(rand(), 1.9);                  // 0 far … 1 near
      const y = d * lakeH;
      const len = W * (0.004 + 0.05 * Math.pow(d, 1.3)) * (0.5 + rand());
      const th = 0.5 + 2.6 * d;
      const x = rand() * c.width;
      g.fillStyle = `rgba(0,0,8,${0.12 + 0.14 * rand()})`;
      g.beginPath(); g.ellipse(x, y + th * 1.3, len / 2, th * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(175,182,235,${0.035 + 0.06 * rand()})`;
      g.beginPath(); g.ellipse(x, y, len / 2, th * 0.5, 0, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  renderReeds(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rand = rng(55);
    g.strokeStyle = '#020306';
    g.fillStyle = '#020306';
    g.lineCap = 'round';
    const clump = (x0, x1, maxH) => {
      for (let i = 0; i < 46; i++) {
        const x = x0 + rand() * (x1 - x0);
        const h = maxH * (0.3 + rand() * 0.7);
        const lean = (rand() - 0.5) * h * 0.6;
        g.lineWidth = 1 + rand() * 2.2;
        g.beginPath();
        g.moveTo(x, H + 4);
        g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
        g.stroke();
        if (rand() < 0.18) {
          g.beginPath();
          g.ellipse(x + lean, H - h, 2.4, 7, Math.atan2(lean, h) * 0.6, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    clump(-30, W * 0.09, H * 0.13);
    clump(W * 0.93, W + 30, H * 0.1);
    return c;
  }

  renderVignette(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.38, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  update(t, dt, L) {
    // Slow, gentle camera drift (two out-of-step waves so it never feels mechanical).
    this.cam.x = Math.sin(t * 0.045) * this.W * 0.007 + Math.sin(t * 0.019 + 1) * this.W * 0.004;
    this.cam.y = Math.sin(t * 0.033 + 2) * this.H * 0.003;
    this.hw.update(t, dt, L);
  }

  // Run fn with the camera shifted by `k` (0 = infinitely far, 1 = foreground).
  layer(ctx, k, fn) {
    ctx.save();
    ctx.translate(this.cam.x * k, this.cam.y * k);
    fn();
    ctx.restore();
  }

  // Sky, moon, far shore and water. L = light level 0..1, glow = moon boost.
  drawBack(ctx, t, dt, L, glow) {
    const { W, H, hy } = this;
    const m = this.moon;
    const top = mixc(...SKY_TOP, L), mid = mixc(...SKY_MID, L), low = mixc(...SKY_LOW, L);

    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, css(top));
    sky.addColorStop(0.6, css(mid));
    sky.addColorStop(1, css(low));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 1);

    this.layer(ctx, 0.1, () => {
      // Moonlit sky: a wide soft brightening around the moon
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, (0.22 + 0.08 * glow) / 0.3);
      ctx.drawImage(this.skyGlow, -W * 0.05, -H * 0.05);
      ctx.restore();

      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph)) * (1 - L * 0.35);
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = m.r * (9 + glow * 4);
      ctx.globalAlpha = 0.45 + 0.35 * glow;
      ctx.drawImage(this.moonGlow, m.x - halo / 2, m.y - halo / 2, halo, halo);
      ctx.restore();
      ctx.globalAlpha = 0.94 + 0.06 * glow;
      ctx.drawImage(this.moonDisk, m.x - this.moonDisk.width / 2, m.y - this.moonDisk.height / 2);
      ctx.globalAlpha = 1;

      for (const c of this.clouds) {
        c.x += c.v * dt;
        if (c.x - c.w / 2 > W * 1.05) c.x = -c.w / 2 - W * 0.05;
        ctx.globalAlpha = c.a * (1 - L * 0.5);
        ctx.drawImage(this.cloudSprite, c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
      }
      ctx.globalAlpha = 1;
    });

    this.layer(ctx, 0.2, () => this.hw.drawSky(ctx, t, dt));

    // Water: like real water it mirrors the sky — brightest near the horizon
    // (seen at a grazing angle), darker close up where you look into it.
    const water = ctx.createLinearGradient(0, hy, 0, H);
    water.addColorStop(0, css(mixc(low, [0, 0, 0], 0.25)));
    water.addColorStop(0.12, css(mixc(mid, [0, 0, 0], 0.35)));
    water.addColorStop(0.45, css(mixc(mid, [0, 0, 0], 0.72)));
    water.addColorStop(1, css(mixc(top, [0, 0, 0], 0.75)));
    ctx.fillStyle = water;
    ctx.fillRect(0, hy, W, H - hy);

    const tc = this.trees;
    this.layer(ctx, 0.3, () => {
      // Shoreline reflected in the water (wavy strips)
      const reflH = H * 0.24;
      for (let yy = 0; yy < reflH; yy += 3) {
        const off = Math.sin(yy * 0.09 + t * 1.3) * (0.6 + yy * 0.03);
        const sy = hy - yy - 3;
        if (sy < 0) break;
        ctx.globalAlpha = 0.6 * (1 - (yy / reflH) * 0.6);
        ctx.drawImage(tc.canvas, 0, sy, tc.canvas.width, 3, -tc.pad + off, hy + yy, tc.canvas.width, 3);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(tc.canvas, -tc.pad, 0);
      // Thin bright line where the water meets the far shore
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = css(low, 0.25);
      ctx.fillRect(-W * 0.05, hy, W * 1.1, 1.5);
      ctx.restore();
      this.hw.drawFarLights(ctx, t);
    });

    this.layer(ctx, 0.15, () => this.drawMoonPath(ctx, t, glow));

    // Moving ripples: two copies of the texture drifting against each other.
    this.layer(ctx, 0.45, () => {
      const rc = this.ripples;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(rc, -W * 0.06 + Math.sin(t * 0.21) * W * 0.03, hy);
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(rc, -W * 0.06 + Math.sin(t * 0.17 + 2) * W * 0.03, hy + 1.5);
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // Warm light from the lamps spreading over the lake
    if (L > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(W / 2, H * 0.74, 0, W / 2, H * 0.74, W * 0.75);
      lg.addColorStop(0, `rgba(255,150,60,${0.11 * L})`);
      lg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, hy, W, H - hy);
      const sk = ctx.createLinearGradient(0, hy - H * 0.2, 0, hy);
      sk.addColorStop(0, 'rgba(255,140,60,0)');
      sk.addColorStop(1, `rgba(255,140,60,${0.08 * L})`);
      ctx.fillStyle = sk;
      ctx.fillRect(0, hy - H * 0.2, W, H * 0.2);
      ctx.restore();
    }
  }

  // Moonlight on the water: a soft column, a wobbling reflection of the moon
  // (as far below the horizon as the moon is above it), and twinkling glints
  // that spread wider as the path comes towards you.
  drawMoonPath(ctx, t, glow) {
    const { H, hy } = this;
    const m = this.moon;
    const lakeH = H - hy;
    const mirrorY = hy + (hy - m.y);
    const env = y => 0.3 + 0.7 * Math.exp(-(((y - mirrorY) / (H * 0.14)) ** 2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft column
    for (let i = 0; i < 26; i++) {
      const f = i / 26;
      const y = hy + Math.pow(f, 1.4) * lakeH;
      const d = (y - hy) / lakeH;
      const w = m.r * (0.9 + 5 * d);
      ctx.globalAlpha = (0.08 + 0.05 * glow) * env(y);
      ctx.drawImage(this.moonGlow, m.x - w, y - lakeH / 26, w * 2, lakeH / 13);
    }
    // Broken reflection of the moon itself
    for (let i = -6; i <= 6; i++) {
      const y = mirrorY + i * m.r * 0.2;
      const k = 1 - Math.abs(i) / 7;
      const w = m.r * 1.9 * k * (0.7 + 0.3 * Math.sin(t * 2.1 + i * 1.7));
      const off = Math.sin(t * 1.3 + i * 1.1) * m.r * 0.28;
      ctx.globalAlpha = (0.5 + 0.15 * glow) * k;
      ctx.drawImage(this.glint, m.x - w / 2 + off, y - m.r * 0.07, w, m.r * 0.14);
    }
    // Glints
    for (const g of this.glints) {
      const y = hy + Math.pow(g.v, 1.5) * lakeH;
      const d = (y - hy) / lakeH;
      const pathW = m.r * (0.5 + 5 * d);
      const x = m.x + g.u * pathW + Math.sin(t * 0.6 + g.v * 20) * m.r * 0.2 * d;
      const tw = Math.max(0, Math.sin(t * g.sp + g.ph));
      const a = env(y) * Math.pow(1 - Math.abs(g.u), 1.4) * tw * tw * tw;
      if (a < 0.02) continue;
      const len = m.r * (0.15 + 1.3 * d) * g.size;
      const th = 1 + 2.6 * d;
      ctx.globalAlpha = Math.min(1, a * (1.0 + 0.3 * glow));
      ctx.drawImage(this.glint, x - len / 2, y - th / 2, len, th);
    }
    ctx.restore();
  }

  drawMist(ctx, dt, amount, far) {
    if (amount <= 0.002) return;
    const W = this.W;
    this.layer(ctx, far ? 0.35 : 0.9, () => {
      for (const m of this.mist) {
        if (m.far !== far) continue;
        m.x += m.v * dt * (1 + this.hw.gust * 4 * this.hw.gustDir);
        if (m.x - m.w / 2 > W) m.x = -m.w / 2;
        if (m.x + m.w / 2 < 0) m.x = W + m.w / 2;
        ctx.globalAlpha = m.a * amount;
        ctx.drawImage(this.mistSprite, m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
      }
      ctx.globalAlpha = 1;
    });
  }

  drawFireflies(ctx, t, amount = 1) {
    this.layer(ctx, 0.7, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flies) {
        const x = f.x + Math.sin(t * f.fx * 6.28 + f.ph) * f.ax;
        const y = f.y + Math.sin(t * f.fy * 6.28 + f.ph * 2) * f.ay;
        const blink = Math.pow(Math.max(0, Math.sin(t * f.bf * 3 + f.ph)), 6);
        if (blink < 0.02) continue;
        ctx.globalAlpha = blink * 0.9 * amount;
        ctx.drawImage(this.flyGlow, x - 12, y - 12, 24, 24);
      }
      ctx.restore();
    });
  }

  drawWater(ctx, t, dt, L) {
    this.layer(ctx, 0.5, () => this.hw.drawWater(ctx, t, dt, L));
  }

  drawFront(ctx, t) {
    const lights = this.hw.drawFront(ctx, t, this.cam);
    this.layer(ctx, 1.1, () => ctx.drawImage(this.reeds, 0, 0));
    ctx.drawImage(this.vignette, 0, 0);
    this.hw.drawFrontLights(ctx, t, lights);
  }
}
