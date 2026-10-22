// Drawing of the clay oil lamp (diya), its flame, glow and reflection.
// Shared by the big screen and the guest phone.

// Soft round glow, pre-rendered once and reused (fast to draw many times).
export function makeGlow(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export const GLOW_WARM = [
  [0, 'rgba(255,214,140,1)'],
  [0.18, 'rgba(255,170,80,0.55)'],
  [0.45, 'rgba(255,120,40,0.16)'],
  [1, 'rgba(255,90,20,0)'],
];

// Smooth pseudo-noise from a few sine waves (cheap, organic flicker).
export function wobble(t, seed) {
  return (Math.sin(t * 7.3 + seed * 1.7) * 0.5 +
    Math.sin(t * 13.1 + seed * 3.1) * 0.3 +
    Math.sin(t * 23.7 + seed * 5.3) * 0.2);
}

// Flame shape: base at (bx, by), height h, lean = tip x-offset as a
// fraction of h. Drawn in three layers: outer orange, yellow, white core.
export function drawFlame(ctx, bx, by, h, lean = 0, alpha = 1) {
  if (h <= 0.5 || alpha <= 0) return;
  const layers = [
    { k: 1.0, w: 0.36, col0: 'rgba(255,120,30,0.0)', col1: 'rgba(255,128,36,0.92)', col2: 'rgba(255,190,90,0.95)' },
    { k: 0.74, w: 0.27, col0: 'rgba(255,200,90,0.0)', col1: 'rgba(255,214,110,0.96)', col2: 'rgba(255,240,190,1)' },
    { k: 0.42, w: 0.17, col0: 'rgba(255,255,240,0.0)', col1: 'rgba(255,252,235,1)', col2: 'rgba(255,255,255,1)' },
  ];
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const L of layers) {
    const hh = h * L.k;
    const w = h * L.w;
    const tipX = bx + lean * hh;
    const tipY = by - hh;
    const baseY = by + h * 0.04;
    ctx.beginPath();
    ctx.moveTo(bx, baseY);
    ctx.bezierCurveTo(bx - w * 1.05, baseY - hh * 0.06, bx - w * 0.75 + lean * hh * 0.35, by - hh * 0.62, tipX, tipY);
    ctx.bezierCurveTo(bx + w * 0.75 + lean * hh * 0.35, by - hh * 0.62, bx + w * 1.05, baseY - hh * 0.06, bx, baseY);
    const g = ctx.createLinearGradient(0, tipY, 0, baseY);
    g.addColorStop(0, L.col0);
    g.addColorStop(0.35, L.col1);
    g.addColorStop(1, L.col2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  // A hint of blue at the very base, like a real wick flame.
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.ellipse(bx, by + h * 0.02, h * 0.07, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(120,160,255,0.8)';
  ctx.fill();
  ctx.restore();
}

// Wick position relative to lamp contact point, for size s.
export function wickPos(x, y, s) {
  return { x: x + s * 0.5, y: y - s * 0.36 };
}

// Clay lamp, seen slightly from above. (x, y) = where it touches the water,
// s = lamp width. warmth 0..1 = how much its own flame lights the clay.
export function drawLampBody(ctx, x, y, s, warmth = 1, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const rimY = y - s * 0.3;
  const rx = s * 0.46;
  const ry = s * 0.13;

  // Bowl
  ctx.beginPath();
  ctx.moveTo(x - rx, rimY);
  ctx.bezierCurveTo(x - rx * 0.98, y - s * 0.06, x - rx * 0.45, y, x, y);
  ctx.bezierCurveTo(x + rx * 0.5, y, x + rx * 1.02, y - s * 0.08, x + rx * 1.08, rimY - s * 0.02);
  ctx.lineTo(x + s * 0.56, rimY - s * 0.06); // spout lip
  ctx.closePath();
  const bg = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  const w = warmth;
  bg.addColorStop(0, `rgb(${40 + 30 * w},${16 + 10 * w},${10 + 4 * w})`);
  bg.addColorStop(0.55, `rgb(${90 + 90 * w},${36 + 46 * w},${18 + 18 * w})`);
  bg.addColorStop(1, `rgb(${120 + 110 * w},${52 + 70 * w},${24 + 30 * w})`);
  ctx.fillStyle = bg;
  ctx.fill();

  // Decorative band
  ctx.beginPath();
  ctx.ellipse(x + s * 0.02, rimY + s * 0.12, rx * 0.86, ry * 0.75, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = `rgba(255,${180 + 40 * w},${120 + 40 * w},${0.18 + 0.3 * w})`;
  ctx.lineWidth = Math.max(0.6, s * 0.022);
  ctx.stroke();

  // Rim (teardrop opening pointing to the spout)
  ctx.beginPath();
  ctx.moveTo(x - rx, rimY);
  ctx.bezierCurveTo(x - rx, rimY - ry * 1.3, x + rx * 0.6, rimY - ry * 1.25, x + s * 0.56, rimY - s * 0.06);
  ctx.bezierCurveTo(x + rx * 0.6, rimY + ry * 0.9, x - rx, rimY + ry * 1.25, x - rx, rimY);
  ctx.fillStyle = `rgb(${150 + 90 * w},${72 + 70 * w},${36 + 30 * w})`;
  ctx.fill();

  // Oil surface inside the rim
  ctx.beginPath();
  ctx.ellipse(x - s * 0.03, rimY, rx * 0.8, ry * 0.72, -0.03, 0, Math.PI * 2);
  const og = ctx.createRadialGradient(x + s * 0.2, rimY, 0, x, rimY, rx);
  og.addColorStop(0, `rgba(${120 + 120 * w},${70 + 90 * w},${20 + 30 * w},1)`);
  og.addColorStop(1, 'rgba(30,12,6,1)');
  ctx.fillStyle = og;
  ctx.fill();

  // Wick
  ctx.beginPath();
  ctx.moveTo(x + s * 0.36, rimY - s * 0.02);
  ctx.quadraticCurveTo(x + s * 0.46, rimY - s * 0.06, x + s * 0.5, y - s * 0.36);
  ctx.strokeStyle = 'rgba(40,24,14,0.95)';
  ctx.lineWidth = Math.max(0.8, s * 0.035);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// Shadow ring where the lamp sits on the water.
export function drawWaterContact(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.58, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.restore();
}

// Reflection of a flame on the water: a broken, shimmering golden streak.
export function drawReflection(ctx, glow, x, y, s, t, seed, intensity = 1) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const len = s * 2.6;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    const yy = y + s * 0.12 + f * len;
    const wv = Math.sin(t * 2.2 + seed + i * 1.9) * s * 0.06 * (1 + f * 2);
    const w = s * (0.34 - f * 0.12) * (0.75 + 0.25 * Math.sin(t * 3.1 + seed * 2 + i));
    ctx.globalAlpha = Math.min(1, intensity * 0.55 * (1 - f) * (1 - f));
    ctx.drawImage(glow, x + s * 0.5 + wv - w, yy - s * 0.1, w * 2, s * 0.2);
  }
  ctx.restore();
}
