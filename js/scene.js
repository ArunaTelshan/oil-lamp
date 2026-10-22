// The night lake: sky, moon, stars, bare-tree shoreline, water,
// reflections, mist, fireflies and foreground reeds, plus the Halloween
// layer (trees, pumpkins, owl, witch, bats, ghost, wisps, wind).

import { HORIZON, rng } from './layout.js';
import { makeGlow } from './lamp-art.js';
import { Halloween } from './halloween.js';

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;

export class Scene {
  constructor() {
    this.moonGlow = makeGlow(256, [[0, 'rgba(255,246,220,0.9)'], [0.12, 'rgba(240,230,210,0.35)'], [0.4, 'rgba(160,170,210,0.08)'], [1, 'rgba(120,130,190,0)']]);
    this.mistSprite = makeGlow(256, [[0, 'rgba(178,186,214,0.9)'], [0.5, 'rgba(160,170,205,0.35)'], [1, 'rgba(150,160,200,0)']]);
    this.cloudSprite = makeGlow(256, [[0, 'rgba(14,16,34,0.95)'], [0.6, 'rgba(14,16,34,0.4)'], [1, 'rgba(14,16,34,0)']]);
    this.flyGlow = makeGlow(64, [[0, 'rgba(230,255,160,1)'], [0.3, 'rgba(200,255,120,0.35)'], [1, 'rgba(160,240,90,0)']]);
    this.hw = new Halloween();
  }

  // Height of the far shore at x (shared by trees, pumpkins and the house).
  shoreY(x) {
    const { W, H, hy } = this;
    const edge = Math.pow(Math.abs(x / W - 0.5) * 2, 2);
    return hy - H * (0.006 + 0.012 * Math.sin(x * 0.004 + 1) ** 2 + 0.035 * edge);
  }

  resize(W, H) {
    this.W = W; this.H = H;
    this.hy = H * HORIZON;
    const rand = rng(77);

    // Stars
    this.stars = [];
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(rand(), 1.4) * this.hy * 0.95;
      this.stars.push({ x: rand() * W, y, r: rand() < 0.1 ? 1.6 : 0.6 + rand() * 0.8, a: 0.25 + rand() * 0.6, tw: 0.5 + rand() * 2.5, ph: rand() * 6.28 });
    }

    // Moon
    this.moon = { x: W * 0.73, y: H * 0.165, r: H * 0.062 };
    this.moonDisk = this.renderMoon(this.moon.r);

    // Halloween layer + shoreline with bare trees and a haunted house
    this.hw.resize(W, H, this.hy, x => this.shoreY(x), this.moon);
    this.trees = this.renderTrees(W, H);

    // Mist banks
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

    // Thin clouds near the moon
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: rand() * W, y: H * (0.06 + rand() * 0.24), w: W * (0.25 + rand() * 0.3), h: H * (0.025 + rand() * 0.03), v: 3 + rand() * 5, a: 0.35 + rand() * 0.35 });
    }

    // Fireflies
    this.flies = [];
    for (let i = 0; i < 18; i++) {
      this.flies.push({ x: rand() * W, y: H * (0.47 + rand() * 0.48), ax: 20 + rand() * 60, ay: 8 + rand() * 25, fx: 0.05 + rand() * 0.15, fy: 0.07 + rand() * 0.2, ph: rand() * 6.28, bf: 0.3 + rand() * 0.6 });
    }

    this.reeds = this.renderReeds(W, H);
    this.vignette = this.renderVignette(W, H);
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
    // Soft "seas" and craters
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

  renderTrees(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = Math.ceil(this.hy + 2);
    const g = c.getContext('2d');
    const hy = this.hy;
    const rand = rng(31);
    g.fillStyle = '#03040a';
    g.strokeStyle = '#03040a';
    g.lineCap = 'round';

    // Low rolling far shore
    g.beginPath();
    g.moveTo(0, hy + 1);
    for (let x = 0; x <= W; x += W / 60) g.lineTo(x, this.shoreY(x));
    g.lineTo(W, hy + 1);
    g.closePath();
    g.fill();

    this.hw.renderHouse(g, W * 0.835, this.shoreY(W * 0.835) + 2, H);
    g.fillStyle = '#03040a';

    const branch = (x, y, len, ang, wid, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      g.lineWidth = wid;
      g.beginPath();
      g.moveTo(x, y);
      const bend = (rand() - 0.5) * len * 0.6;
      g.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2 + bend * 0.3, x2, y2);
      g.stroke();
      if (depth <= 0 || len < 2) return;
      const kids = depth > 4 ? 2 : 2 + (rand() < 0.4 ? 1 : 0);
      for (let k = 0; k < kids; k++) {
        const spread = 0.35 + rand() * 0.5;
        const na = ang + (k - (kids - 1) / 2) * spread + (rand() - 0.5) * 0.6;
        branch(x2, y2, len * (0.62 + rand() * 0.18), na, wid * 0.66, depth - 1);
      }
    };

    // Trees: tall and gnarled at the edges, small and sparse in the middle.
    const tree = (x, h) => {
      const base = this.shoreY(x) + H * 0.004;
      branch(x, base + 2, h * 0.38, -Math.PI / 2 + (rand() - 0.5) * 0.2, Math.max(1.2, h * 0.045), 6);
    };
    for (let i = 0; i < 70; i++) {
      const u = rand();
      const x = u < 0.5 ? Math.pow(rand(), 1.8) * W * 0.4 : W - Math.pow(rand(), 1.8) * W * 0.4;
      const edge = Math.abs(x / W - 0.5) * 2;
      tree(x, H * (0.03 + 0.11 * Math.pow(edge, 2.2) * (0.6 + rand() * 0.6)));
    }
    for (let i = 0; i < 18; i++) tree(W * (0.3 + rand() * 0.4), H * (0.012 + rand() * 0.025));
    // One great dead tree on the left
    branch(W * 0.06, hy + 2, H * 0.11, -Math.PI / 2 + 0.12, H * 0.012, 7);
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
        if (rand() < 0.18) { // cattail head
          g.beginPath();
          g.ellipse(x + lean, H - h, 2.4, 7, Math.atan2(lean, h) * 0.6, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    clump(-10, W * 0.09, H * 0.13);
    clump(W * 0.93, W + 10, H * 0.1);
    return c;
  }

  renderVignette(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // Sky, moon, shoreline and water. L = light level 0..1, glow = moon boost.
  drawBack(ctx, t, dt, L, glow) {
    const { W, H, hy } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, mix([3, 4, 12], [8, 10, 28], L));
    sky.addColorStop(0.6, mix([10, 12, 32], [26, 22, 52], L));
    sky.addColorStop(1, mix([26, 22, 50], [70, 46, 64], L));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 1);

    // Stars fade a little as the lake brightens.
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph)) * (1 - L * 0.4);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Moon + halo
    const m = this.moon;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = m.r * (9 + glow * 4);
    ctx.globalAlpha = 0.4 + 0.35 * glow;
    ctx.drawImage(this.moonGlow, m.x - halo / 2, m.y - halo / 2, halo, halo);
    ctx.restore();
    ctx.globalAlpha = 0.92 + 0.08 * glow;
    ctx.drawImage(this.moonDisk, m.x - this.moonDisk.width / 2, m.y - this.moonDisk.height / 2);
    ctx.globalAlpha = 1;

    // Drifting clouds
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x - c.w / 2 > W) c.x = -c.w / 2;
      ctx.globalAlpha = c.a * (1 - L * 0.5);
      ctx.drawImage(this.cloudSprite, c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }
    ctx.globalAlpha = 1;

    this.hw.drawSky(ctx, t, dt);

    // Water
    const water = ctx.createLinearGradient(0, hy, 0, H);
    water.addColorStop(0, mix([16, 16, 36], [46, 32, 48], L));
    water.addColorStop(0.25, mix([7, 8, 20], [22, 16, 26], L));
    water.addColorStop(1, mix([2, 2, 7], [9, 6, 10], L));
    ctx.fillStyle = water;
    ctx.fillRect(0, hy, W, H - hy);

    // Tree reflection (wavy strips)
    const tc = this.trees;
    const reflH = H * 0.22;
    ctx.globalAlpha = 0.5;
    for (let yy = 0; yy < reflH; yy += 3) {
      const off = Math.sin(yy * 0.09 + t * 1.3) * (0.6 + yy * 0.025);
      const sy = hy - yy - 3;
      if (sy < 0) break;
      ctx.drawImage(tc, 0, sy, W, 3, off, hy + yy, W, 3);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(tc, 0, 0);
    this.hw.drawFarLights(ctx, t);

    // Moon path on the water
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rows = 70;
    for (let i = 0; i < rows; i++) {
      const f = i / rows;
      const y = hy + 2 + Math.pow(f, 1.5) * (H - hy) * 0.95;
      const w = m.r * (0.5 + f * 2.6) * (0.55 + 0.45 * Math.sin(t * 1.3 + i * 2.3));
      const off = Math.sin(t * 0.7 + i * 0.9) * m.r * 0.35 * f;
      const hgt = 2 + f * 7;
      ctx.globalAlpha = (0.2 + 0.14 * glow) * (1 - f * 0.8);
      ctx.drawImage(this.moonGlow, m.x - w / 2 + off, y - hgt / 2, w, hgt);
    }
    ctx.restore();

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

  drawMist(ctx, dt, amount, far) {
    if (amount <= 0.002) return;
    const W = this.W;
    for (const m of this.mist) {
      if (m.far !== far) continue;
      m.x += m.v * dt * (1 + this.hw.gust * 4 * this.hw.gustDir);
      if (m.x - m.w / 2 > W) m.x = -m.w / 2;
      if (m.x + m.w / 2 < 0) m.x = W + m.w / 2;
      ctx.globalAlpha = m.a * amount;
      ctx.drawImage(this.mistSprite, m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
    }
    ctx.globalAlpha = 1;
  }

  drawFireflies(ctx, t, amount = 1) {
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
  }

  update(t, dt, L) { this.hw.update(t, dt, L); }

  drawWater(ctx, t, dt, L) { this.hw.drawWater(ctx, t, dt, L); }

  drawFront(ctx, t) {
    const lights = this.hw.drawFront(ctx, t);
    ctx.drawImage(this.reeds, 0, 0);
    ctx.drawImage(this.vignette, 0, 0);
    this.hw.drawFrontLights(ctx, t, lights);
  }
}
