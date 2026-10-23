// Lake of Lights — big screen.
import { CONFIG } from './config.js';
import { makeSlots, makeOrder, wordTargets, wordSpacing, matchTargets, HORIZON } from './layout.js';
import { makeGlow, GLOW_WARM, wobble, drawFlame, drawLampBody, drawWaterContact, drawReflection, wickPos } from './lamp-art.js';
import { Scene } from './scene.js';
import { LakeAudio } from './audio.js';
import { backendMode, watchLamps, watchShakes, loadTotal, getState, watchState, setPhase, recentJoins, joinLake } from './backend.js';

let N = CONFIG.TOTAL_LAMPS;   // replaced by the number in Supabase settings at start
const WORD = CONFIG.FINALE_WORD || 'WELCOME';
let MILESTONES = [];
const params = new URLSearchParams(location.search);
const MODE = backendMode();

const canvas = document.getElementById('lake');
const ctx = canvas.getContext('2d');
const scene = new Scene(CONFIG.SCENE_SEED);
const audio = new LakeAudio();
scene.hw.onEvent = (name, arg) => {
  if (name === 'splash') audio.splash();
  else if (name === 'cackle') audio.cackle(arg);
  else if (name === 'rattle') audio.rattle();
  else if (name === 'rise') audio.rumble();
};
const glow = makeGlow(128, GLOW_WARM);
const ember = makeGlow(64, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,110,0.7)'], [1, 'rgba(255,120,30,0)']]);

let SLOTS = [], ORDER = [];
function setTotal(n) {
  N = n;
  MILESTONES = [Math.round(N * 0.25), Math.round(N * 0.5), Math.round(N * 0.75)];
  SLOTS = makeSlots(CONFIG.LAYOUT_SEED, N);
  ORDER = makeOrder(CONFIG.LAYOUT_SEED, N, SLOTS);
}

let W = 0, H = 0, DPR = 1, BASE = 30;
let targets = [], finaleLampSize = 20;
// With fewer than this many lamps, small extra tea-lights fill in the
// letters during the finale so WELCOME stays readable.
const FINALE_MIN_POINTS = 110;
let fillers = [];

const lamps = [];          // lamps on the lake (arriving or lit)
const pending = [];        // lamps waiting for their arrival moment
const ripples = [];
const sparks = [];
const known = new Set();
const byId = new Map();     // lamp id → lamp (for shakes)
let shakeStatus = 'off';
let frameDt = 0.016;
let lastSpawn = 0;
let litCount = 0;          // lamps whose flame has caught
let light = 0;             // smoothed light level 0..1
let moonPulse = 0;
let mistAmount = 1;
let nextBeat = 0;
let finale = null;         // { t0, at } once triggered
let formed = false;
let qrVisible = true, qrAlpha = 0;
let connectionOk = true;
let lastLampCheck = 0;      // when the screen last heard from the database
let started = false, startedAt = 0;
let showHelp = false;
let now = 0;
let fpsShown = 0, fpsFrames = 0, fpsT0 = 0;

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Layout ----------
// Render quality: 1 = full resolution. If the laptop struggles (low frame
// rate), the screen quietly renders at a slightly lower resolution.
const QUALITY_STEPS = [1, 0.8, 0.65];
let quality = Number(params.get('quality')) || 1;
let lowFpsSeconds = 0;

function setCanvasSize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  setCanvasSize();
  // Lamp size: a little bigger for small groups, smaller for big ones.
  BASE = H * 0.047 * Math.max(0.55, Math.min(1.25, Math.sqrt(140 / N)));
  scene.resize(W, H);
  resizeLightMap();
  const P = Math.max(N, FINALE_MIN_POINTS);
  const all = wordTargets(WORD, P, W, H);
  finaleLampSize = wordSpacing(WORD, P, W, H) * 0.78;
  if (P === N) { targets = all; fillers = []; } else {
    const pick = new Set();
    for (let i = 0; i < N; i++) pick.add(Math.floor(((i + 0.5) * P) / N));
    targets = all.filter((_, i) => pick.has(i));
    fillers = all.filter((_, i) => !pick.has(i)).map(t => ({
      x: t.x, y: t.y, k: t.k || 1, seed: Math.random() * 100,
      jx: (Math.random() - 0.5) * 0.36, jy: (Math.random() - 0.5) * 0.3, sizeVar: 0.5 + Math.random() * 0.15,
    }));
  }
  if (finale) {
    for (const L of lamps) { const p = slotPos(L); L.from = { x: p.x, y: p.y, s: p.s }; }
    assignTargets();
  }
  buildQR();
}

function slotPos(lamp) {
  const s = SLOTS[lamp.slot];
  return { x: s.x * W, y: s.y * H, s: BASE * s.s };
}

// ---------- Lamps arriving ----------
function addLamps(rows, initial) {
  for (const r of rows) {
    if (known.has(r.id) || r.id > N) continue;
    known.add(r.id);
    if (initial) placeLit(r); else pending.push(r);
  }
  if (initial && litCount >= N) { formNow(); }
}

function makeLamp(r) {
  return {
    id: r.id,
    nick: r.nickname || '',
    slot: ORDER[(r.id - 1) % N],
    seed: Math.random() * 100,
    jx: (Math.random() - 0.5) * 0.36,   // resting offset in the WELCOME formation
    jy: (Math.random() - 0.5) * 0.3,
    sizeVar: 0.88 + Math.random() * 0.24,
    t0: now,
    state: 'arriving',
    lit: 0,
    flare: 0,
    landed: false,
    shake: 0,          // how hard the guest is shaking their phone (decays)
    nickAt: null,      // when the nickname was last shown
    lastSpark: 0,
  };
}

function placeLit(r) {
  const L = makeLamp(r);
  L.state = 'lit'; L.lit = 1; L.t0 = now - 100;
  lamps.push(L);
  byId.set(L.id, L);
  litCount++;
}

function spawn(r) {
  const L = makeLamp(r);
  const p = slotPos(L);
  const w = wickPos(p.x, p.y, p.s);
  const final = r.id >= N;
  L.sparkDur = final ? 2.2 : r.id >= N - 4 ? 1.6 : 1.25;
  L.sx = W * 0.5 + (w.x - W * 0.5) * 0.35 + (Math.random() - 0.5) * W * 0.1;
  L.sy = H + 20;
  L.cx = (L.sx + w.x) / 2 + (Math.random() - 0.5) * W * 0.15;
  L.cy = Math.min(L.sy, w.y) - H * (final ? 0.35 : 0.18);
  lamps.push(L);
  byId.set(L.id, L);
  audio.rise((w.x / W) * 2 - 1);
}

function processQueue() {
  if (!pending.length || finale) return;
  const next = pending[0];
  let gap = pending.length > 10 ? 0.28 : pending.length > 4 ? 0.45 : 0.7;
  if (next.id >= N - 4) gap = Math.max(gap, 1.8);
  if (next.id === N) gap = 2.6;
  if (now - lastSpawn < gap) return;
  lastSpawn = now;
  spawn(pending.shift());
}

function ignite(L, p) {
  litCount++;
  L.nickAt = now;
  const w = wickPos(p.x, p.y, p.s);
  ripples.push({ x: p.x, y: p.y, s: p.s, t0: now, dur: 2.2 });
  ripples.push({ x: p.x, y: p.y, s: p.s, t0: now + 0.35, dur: 2.4 });
  for (let i = 0; i < 9; i++) {
    sparks.push({ x: w.x, y: w.y, vx: (Math.random() - 0.5) * p.s * 2.2, vy: -p.s * (0.8 + Math.random() * 1.6), t0: now, life: 0.8 + Math.random() * 0.7, size: p.s * 0.25 });
  }
  audio.ignite((p.x / W) * 2 - 1, SLOTS[L.slot].s / 1.3);
  if (MILESTONES.includes(L.id)) {
    audio.milestone();
    moonPulse = 1;
    ripples.push({ lake: true, t0: now, dur: 5 });
    if (L.id === MILESTONES[1]) scene.hw.launchWitch(); // halfway: a witch crosses the moon
  }
  if (litCount >= N && !finale) {
    finale = { at: now + 3.4, t0: null };
    audio.hush(3.4);
  }
}

// ---------- Shakes from guests' phones ----------
function onShake(msg) {
  const L = byId.get(Number(msg.l));
  if (!L || L.state === 'arriving') return;
  const p = Math.max(0, Math.min(1.5, Number(msg.p) || 0));
  L.shake = Math.min(2, L.shake + p * 0.9 + 0.25);
  // Show the nickname again (if it isn't already showing) so the guest can spot their lamp.
  if (!L.nickAt || now - L.nickAt > 4.6) L.nickAt = now;
}

// ---------- Finale ----------
function assignTargets() {
  const from = lamps.map(L => L.from);
  const match = matchTargets(from, targets);
  lamps.forEach((L, i) => { L.target = match[i]; });
}

function startFinale() {
  finale.t0 = now;
  lamps.sort((a, b) => a.id - b.id);
  for (const L of lamps) {
    const p = slotPos(L);
    L.from = { x: p.x, y: p.y, s: p.s };
    L.state = 'lit'; L.lit = 1;
  }
  assignTargets();
  for (const L of lamps) {
    const t = targets[L.target];
    L.delay = Math.abs(t.x / W - 0.5) * 1.8 + Math.random() * 0.9;
    L.dur = 6.2 + Math.random() * 1.6;
    L.sway = (Math.random() - 0.5) * W * 0.06;
    L.landed = false;
  }
  scene.hw.enabled = false;
  audio.finale(9.4);
}

function formNow() {
  finale = { at: 0, t0: now - 100 };
  lamps.sort((a, b) => a.id - b.id);
  for (const L of lamps) {
    const p = slotPos(L);
    L.from = { x: p.x, y: p.y, s: p.s };
    L.delay = 0; L.dur = 1; L.sway = 0; L.landed = true;
  }
  assignTargets();
  formed = true;
  scene.hw.enabled = false;
}

function replayFinale() {
  if (litCount < N) return;
  finale = { at: now + 1.5, t0: null };
  formed = false;
  for (const L of lamps) L.landed = false;
  audio.hush(1.5);
}

function formedFloat(L, t, sp) {
  sp *= t.k || 1;                       // further away = smaller drift
  const swell = Math.sin(now * 0.55 - (t.x / W) * 7) * sp * 0.16;
  return {
    x: L.jx * sp + Math.sin(now * 0.31 + L.seed) * sp * 0.12 + Math.sin(now * 0.13 + L.seed * 3) * sp * 0.06,
    // the water is seen at an angle, so up/down drift looks flatter
    y: (L.jy * sp + swell + Math.cos(now * 0.27 + L.seed * 1.3) * sp * 0.08) * 0.6,
  };
}

// Where a lamp is right now (handles bobbing and the finale journey).
function lampPos(L) {
  const bob = Math.sin(now * 0.9 + L.seed) * 0.5 + Math.sin(now * 0.37 + L.seed * 2) * 0.5;
  if (finale && finale.t0 !== null && L.from) {
    const t = targets[L.target];
    const p = clamp01((now - finale.t0 - L.delay) / L.dur);
    const e = ease(p);
    if (p >= 1 && !L.landed) {
      L.landed = true;
      audio.sparkle((t.x / W) * 2 - 1);
      ripples.push({ x: t.x, y: t.y, s: finaleLampSize, t0: now, dur: 1.6 });
    }
    // Lamps on water never sit in perfect lines: each has a small random
    // offset, its own slow drift, and a gentle swell rolls through the word.
    const sp = finaleLampSize;
    const drift = formedFloat(L, t, sp);
    const s = lerp(L.from.s, sp * L.sizeVar * (t.k || 1), e);
    return {
      x: lerp(L.from.x, t.x + drift.x, e) + Math.sin(p * Math.PI) * L.sway,
      y: lerp(L.from.y, t.y + drift.y, e) + bob * s * 0.04,
      s,
      p,
    };
  }
  const sp = slotPos(L);
  return { x: sp.x + Math.sin(now * 0.21 + L.seed) * sp.s * 0.06, y: sp.y + bob * sp.s * 0.05, s: sp.s, p: 0 };
}

// ---------- Drawing ----------
function drawSpark(L, p) {
  const w = wickPos(p.x, p.y, p.s);
  const k = clamp01((now - L.t0) / L.sparkDur);
  const at = u => {
    const e = ease(u);
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    return { x: a * L.sx + b * L.cx + c * w.x, y: a * L.sy + b * L.cy + c * w.y };
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 12; i >= 0; i--) {
    const u = k - i * 0.018;
    if (u <= 0) continue;
    const q = at(u);
    const sz = BASE * (0.7 - i * 0.045) * (L.id >= N ? 1.6 : 1);
    ctx.globalAlpha = (1 - i / 13) * 0.85;
    ctx.drawImage(ember, q.x - sz / 2, q.y - sz / 2, sz, sz);
  }
  const head = at(k);
  ctx.globalAlpha = 0.5;
  const big = BASE * 3 * (L.id >= N ? 1.8 : 1);
  ctx.drawImage(glow, head.x - big / 2, head.y - big / 2, big, big);
  ctx.restore();
}

// Pre-drawn lamp body and flame, reused for every lamp (much faster than
// redrawing 140 detailed lamps each frame).
const S0 = 180;
const BODY = (() => {
  const c = document.createElement('canvas');
  c.width = Math.ceil(S0 * 1.3); c.height = Math.ceil(S0 * 0.7);
  const g = c.getContext('2d');
  const ox = S0 * 0.64, oy = S0 * 0.54;
  drawWaterContact(g, ox, oy, S0, 1);
  drawLampBody(g, ox, oy, S0, 1, 1);
  return { c, ox, oy };
})();
const H0 = 160;
const FLAME = (() => {
  const c = document.createElement('canvas');
  c.width = Math.ceil(H0 * 0.9); c.height = Math.ceil(H0 * 1.15);
  const g = c.getContext('2d');
  const bx = c.width / 2, by = H0 * 1.07;
  drawFlame(g, bx, by, H0, 0, 1);
  return { c, bx, by };
})();

// Low-resolution light layer: all lamp glows are painted here, then
// stretched over the scene in one go.
const LM = 0.2;
let lm = null, lctx = null;
function resizeLightMap() {
  lm = document.createElement('canvas');
  lm.width = Math.ceil(W * LM); lm.height = Math.ceil(H * LM);
  lctx = lm.getContext('2d');
}

function lampLook(L, p, intensity) {
  const age = now - L.t0;
  let bodyA = 1, flameK = L.lit;
  if (L.state === 'arriving') {
    const k = age - L.sparkDur;
    bodyA = clamp01((k + 0.15) / 0.35);
    flameK = clamp01(k / 0.6);
  }
  const w = wickPos(p.x, p.y, p.s);
  const sh = Math.min(1.5, L.shake);
  const flick = 1 + 0.07 * wobble(now, L.seed) + 0.03 * Math.sin(now * 31 + L.seed) + sh * 0.12 * Math.sin(now * 17 + L.seed);
  const fh = p.s * 0.95 * flameK * flick * (1 + L.flare * 0.6 + sh * 0.15) * intensity;
  const gust = scene.hw.gust * scene.hw.gustDir * (0.32 + 0.08 * Math.sin(L.seed));
  const lean = 0.08 * wobble(now * 0.6, L.seed + 9) + gust +
    sh * (0.32 * Math.sin(now * 19 + L.seed) + 0.18 * Math.sin(now * 31 + L.seed * 2));
  return { bodyA, flameK, w, flick, fh, lean };
}

// Pass 1: lamp body + its glow into the light layer.
function drawLampBodyPass(L, p, intensity) {
  if (L.state === 'arriving') {
    const k = now - L.t0 - L.sparkDur;
    L.flare = k > 0 ? Math.max(0, 1 - k / 1.2) : 0;
    if (k >= 0.6) { L.state = 'lit'; L.lit = 1; }
  } else if (L.flare > 0) {
    L.flare = Math.max(0, L.flare - 0.016);
  }
  if (L.shake > 0.01) {
    L.shake *= Math.exp(-frameDt * 1.5);
    if (L.shake > 0.5 && now - L.lastSpark > 0.18) {
      L.lastSpark = now;
      const w = wickPos(p.x, p.y, p.s);
      for (let i = 0; i < 2 + Math.round(L.shake * 2); i++) {
        sparks.push({ x: w.x, y: w.y - p.s * 0.4, vx: (Math.random() - 0.5) * p.s * 2.4, vy: -p.s * (0.8 + Math.random() * 1.4), t0: now, life: 0.6 + Math.random() * 0.6, size: p.s * 0.16 });
      }
    }
  } else L.shake = 0;
  const o = lampLook(L, p, intensity);
  if (o.bodyA <= 0) return;
  if (o.flameK >= 1 && o.bodyA >= 1) {
    const k = p.s / S0;
    ctx.drawImage(BODY.c, p.x - BODY.ox * k, p.y - BODY.oy * k, BODY.c.width * k, BODY.c.height * k);
  } else {
    drawWaterContact(ctx, p.x, p.y, p.s, o.bodyA);
    drawLampBody(ctx, p.x, p.y, p.s, 0.25 + 0.75 * o.flameK, o.bodyA);
  }
  if (o.flameK > 0) {
    const g1 = p.s * (4.2 + L.flare * 5 + Math.min(1.5, L.shake) * 1.5) * (0.8 + 0.2 * o.flick) * LM;
    lctx.globalAlpha = Math.min(1, 0.45 * o.flameK * Math.min(1.4, intensity));
    lctx.drawImage(glow, o.w.x * LM - g1 / 2, (o.w.y - o.fh * 0.4) * LM - g1 / 2, g1, g1);
    const g2 = p.s * 11 * LM;
    lctx.globalAlpha = 0.05 * o.flameK * intensity;
    lctx.drawImage(glow, o.w.x * LM - g2 / 2, o.w.y * LM - g2 / 2, g2, g2);
  }
}

// Pass 2: the flame itself (drawn after the glow so it stays crisp).
function drawLampFlamePass(L, p, intensity) {
  const o = lampLook(L, p, intensity);
  if (o.flameK <= 0 || o.bodyA <= 0 || o.fh < 0.5) return;
  const k = o.fh / H0;
  ctx.save();
  ctx.globalAlpha = o.flameK;
  ctx.translate(o.w.x, o.w.y);
  ctx.transform(1, 0, -o.lean, 1, 0, 0);
  ctx.scale(k, k);
  ctx.drawImage(FLAME.c, -FLAME.bx, -FLAME.by);
  ctx.restore();
}

function drawNickname(L, p) {
  if (!L.nick || L.nickAt === null) return;
  const age = now - L.nickAt;
  const DUR = 4.6;
  if (age < 0 || age > DUR) return;
  const a = Math.min(1, age / 0.4) * (age > DUR - 1.3 ? (DUR - age) / 1.3 : 1);
  const size = Math.round(H * 0.022 + p.s * 0.22);
  const y = p.y - p.s * 1.5 - easeOut(age / DUR) * H * 0.05;
  ctx.save();
  ctx.font = `${Math.round(size * 1.15)}px Creepster, Cinzel, Georgia, serif`;
  try { ctx.letterSpacing = `${Math.round(size * 0.08)}px`; } catch { /* older browsers */ }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(255,170,70,0.9)';
  ctx.shadowBlur = size * 0.8;
  ctx.fillStyle = 'rgba(255,232,190,1)';
  ctx.fillText(L.nick, p.x + p.s * 0.3, y);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawRipples() {
  ctx.save();
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const k = (now - r.t0) / r.dur;
    if (k < 0) continue;
    if (k >= 1) { ripples.splice(i, 1); continue; }
    if (r.lake) {
      const rx = W * (0.05 + easeOut(k) * 0.75);
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.strokeStyle = 'rgb(255,215,160)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.72, rx, rx * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    const rx = r.s * (0.6 + easeOut(k) * 2.4);
    ctx.globalAlpha = (1 - k) * 0.4;
    ctx.strokeStyle = 'rgb(255,205,140)';
    ctx.lineWidth = Math.max(1, r.s * 0.03);
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rx, rx * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparks(dt) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    const k = (now - s.t0) / s.life;
    if (k >= 1) { sparks.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vy += (s.rise ? -4 : 30) * dt;
    s.vx *= 0.985;
    const sz = s.size * (1 - k * 0.6);
    ctx.globalAlpha = (1 - k) * (s.rise ? 0.7 : 0.9);
    ctx.drawImage(ember, s.x - sz, s.y - sz, sz * 2, sz * 2);
  }
  ctx.restore();
}

// ---------- QR code ----------
// The operator can drag it anywhere, resize it (drag the corner or scroll),
// and double-click to reset. Its place is remembered on this laptop.
const QR_KEY = 'lol_qr';
const QR_PAD = 0.09;                      // white border, as a share of the code size
const QR_DEFAULT = { cx: null, cy: null, size: 0.15 };   // size = share of screen height
let qrBox = { ...QR_DEFAULT };
try { Object.assign(qrBox, JSON.parse(localStorage.getItem(QR_KEY) || '{}')); } catch { /* ignore */ }
let qrCanvas = null, qrBuiltFor = 0;
let qrDrag = null, qrHover = null, lastMouse = -10, mouseX = -1, mouseY = -1;

function guestUrl() {
  let url = CONFIG.GUEST_URL || new URL('./', location.href).href;
  if (MODE === 'local' && !url.includes('local')) url += (url.includes('?') ? '&' : '?') + 'local';
  return url;
}

// Panel rectangle in screen pixels (kept fully on screen).
function qrRect() {
  const size = Math.max(H * 0.06, Math.min(H * 0.6, qrBox.size * H));
  const total = size * (1 + QR_PAD * 2);
  let cx = qrBox.cx == null ? W - H * 0.035 - total / 2 : qrBox.cx * W;
  let cy = qrBox.cy == null ? H - H * 0.035 - total / 2 : qrBox.cy * H;
  cx = Math.max(total / 2, Math.min(W - total / 2, cx));
  cy = Math.max(total / 2, Math.min(H - total / 2, cy));
  return { x: cx - total / 2, y: cy - total / 2, w: total, size };
}

function saveQR() {
  try { localStorage.setItem(QR_KEY, JSON.stringify(qrBox)); } catch { /* ignore */ }
}

// The big QR code on the join screen (centred).
function qrRectGather() {
  const size = H * 0.4;
  const total = size * (1 + QR_PAD * 2);
  return { x: W / 2 - total / 2, y: H * 0.5 - total / 2, w: total, size };
}

function buildQR() {
  if (!window.qrcode) { qrCanvas = null; return; }
  const r = qrRect();
  const px = Math.round(Math.max(r.size, qrRectGather().size) * DPR);
  if (qrCanvas && Math.abs(px - qrBuiltFor) < 2) return;
  qrBuiltFor = px;
  const qr = window.qrcode(0, 'M');
  qr.addData(guestUrl());
  qr.make();
  const n = qr.getModuleCount();
  const pad = Math.round(px * QR_PAD);
  const c = document.createElement('canvas');
  c.width = c.height = px + pad * 2;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(246,236,214,0.94)';
  g.beginPath();
  g.roundRect ? g.roundRect(0, 0, c.width, c.height, pad * 1.2) : g.rect(0, 0, c.width, c.height);
  g.fill();
  // Whole-pixel modules keep the code crisp at any size.
  const cell = Math.floor(px / n) || 1;
  const off = pad + Math.floor((px - cell * n) / 2);
  g.fillStyle = '#1b130c';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (qr.isDark(y, x)) g.fillRect(off + x * cell, off + y * cell, cell, cell);
  }
  qrCanvas = c;
}

function drawQR(dt) {
  const target = (qrVisible || stageMix < 0.99) && !finale ? 1 : 0;
  qrAlpha += (target - qrAlpha) * Math.min(1, dt * 2);
  if (!qrCanvas || qrAlpha < 0.01) return;
  const lr = qrRect(), gr = qrRectGather();
  const e = ease(stageMix);
  const r = stageMix >= 1 ? lr : { x: lerp(gr.x, lr.x, e), y: lerp(gr.y, lr.y, e), w: lerp(gr.w, lr.w, e), size: lerp(gr.size, lr.size, e) };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = qrAlpha * (0.18 + 0.05 * Math.sin(now * 1.5));
  const gs = r.w * 2.2;
  ctx.drawImage(glow, r.x + r.w / 2 - gs / 2, r.y + r.w / 2 - gs / 2, gs, gs);
  ctx.restore();
  ctx.globalAlpha = qrAlpha;
  ctx.drawImage(qrCanvas, r.x, r.y, r.w, r.w);
  ctx.globalAlpha = 1;

  // Operator-only handles: shown while the mouse is over the QR code.
  if ((qrHover || qrDrag) && now - lastMouse < 2.5 && stageMix >= 1) {
    const hs = Math.max(12, r.w * 0.08);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,226,170,0.9)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.w + 12);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,226,170,0.95)';
    ctx.fillRect(r.x + r.w + 6 - hs, r.y + r.w + 6 - hs, hs, hs);
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tip = 'Drag to move · drag corner or scroll to resize · double-click to reset';
    const ty = r.y > 40 ? r.y - 14 : r.y + r.w + 24;
    const tw = ctx.measureText(tip).width + 16;
    const tx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, r.x + r.w / 2));
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx - tw / 2, ty - 15, tw, 21);
    ctx.fillStyle = '#f3e6c8';
    ctx.fillText(tip, tx, ty);
    ctx.restore();
  }
}

function qrHit(x, y) {
  if (!qrVisible || finale || qrAlpha < 0.5 || stageMix < 1) return null;
  const r = qrRect();
  const hs = Math.max(12, r.w * 0.08) + 8;
  if (x > r.x + r.w - hs && x < r.x + r.w + 14 && y > r.y + r.w - hs && y < r.y + r.w + 14) return 'resize';
  if (x > r.x - 6 && x < r.x + r.w + 6 && y > r.y - 6 && y < r.y + r.w + 6) return 'move';
  return null;
}

canvas.addEventListener('pointermove', e => {
  mouseX = e.clientX; mouseY = e.clientY; lastMouse = now;
  if (qrDrag) {
    const r = qrRect();
    if (qrDrag.mode === 'move') {
      qrBox.cx = (e.clientX - qrDrag.dx) / W;
      qrBox.cy = (e.clientY - qrDrag.dy) / H;
    } else {
      const total = Math.max(e.clientX - r.x, e.clientY - r.y);
      const cxPx = r.x, cyPx = r.y;           // keep the top-left corner fixed
      qrBox.size = Math.max(0.06, Math.min(0.6, total / (1 + QR_PAD * 2) / H));
      const nt = qrBox.size * H * (1 + QR_PAD * 2);
      qrBox.cx = (cxPx + nt / 2) / W;
      qrBox.cy = (cyPx + nt / 2) / H;
      buildQR();
    }
    return;
  }
  qrHover = qrHit(e.clientX, e.clientY);
  canvas.style.cursor = qrHover === 'resize' ? 'nwse-resize' : qrHover === 'move' ? 'move' : '';
});
canvas.addEventListener('pointerdown', e => {
  const hit = qrHit(e.clientX, e.clientY);
  if (!hit) return;
  const r = qrRect();
  qrDrag = { mode: hit, dx: e.clientX - (r.x + r.w / 2), dy: e.clientY - (r.y + r.w / 2) };
  canvas.setPointerCapture(e.pointerId);
});
const endQrDrag = () => { if (qrDrag) { qrDrag = null; buildQR(); saveQR(); } };
canvas.addEventListener('pointerup', endQrDrag);
canvas.addEventListener('pointercancel', endQrDrag);
canvas.addEventListener('wheel', e => {
  if (!qrHit(e.clientX, e.clientY)) return;
  e.preventDefault();
  const r = qrRect();
  const cx = r.x + r.w / 2, cy = r.y + r.w / 2;   // resize around the centre
  qrBox.size = Math.max(0.06, Math.min(0.6, qrBox.size * Math.exp(-e.deltaY * 0.0015)));
  qrBox.cx = cx / W; qrBox.cy = cy / H;
  lastMouse = now;
  buildQR();
  clearTimeout(qrSaveTimer);
  qrSaveTimer = setTimeout(saveQR, 400);
}, { passive: false });
let qrSaveTimer;
canvas.addEventListener('dblclick', e => {
  if (!qrHit(e.clientX, e.clientY)) return;
  qrBox = { ...QR_DEFAULT };
  qrBuiltFor = 0;
  buildQR();
  saveQR();
});

// ---------- Join screen (phase 'gather') ----------
// Big QR code, live count of guests who have joined, their names drifting up.
// The lake opens by itself at the threshold, or with L (and L goes back).
let phase = 'lake', stageMix = 1, joined = 0, startAt = 90, autoOpen = true, legacyDb = false;
const joinFloaters = [];
let lastJoinAt = null, toastText = '', toastUntil = 0;
const OPKEY = 'lol_opkey';
try {
  const m = location.hash.match(/key=([A-Za-z0-9]+)/);
  if (m) { localStorage.setItem(OPKEY, m[1]); history.replaceState(null, '', location.pathname + location.search); }
} catch { /* ignore */ }

function toast(t) { toastText = t; toastUntil = now + 4.5; }

// Projector brightness (P cycles it; remembered on this laptop). Projectors
// wash out dark scenes, so this lifts everything a little.
const BRIGHT_STEPS = [1, 1.15, 1.3, 1.45, 1.6];
let bright = 1;
try { bright = Number(localStorage.getItem('lol_bright')) || 1; } catch { /* ignore */ }
function applyBright() { canvas.style.filter = bright === 1 ? '' : `brightness(${bright})`; }
applyBright();
function cycleBright() {
  const i = BRIGHT_STEPS.indexOf(bright);
  bright = BRIGHT_STEPS[(i + 1) % BRIGHT_STEPS.length];
  try { localStorage.setItem('lol_bright', String(bright)); } catch { /* ignore */ }
  applyBright();
  toast(`Brightness ${Math.round(bright * 100)}%`);
}

function applyState(st, instant = false) {
  if (!st) return;
  legacyDb = !!st.legacy;
  if (st.joined != null) joined = st.joined;
  if (st.start_at) startAt = st.start_at;
  if (st.auto != null) autoOpen = st.auto;
  if (st.phase && st.phase !== phase) {
    const opening = st.phase === 'lake';
    phase = st.phase;
    if (instant) stageMix = opening ? 1 : 0;
    else if (started) {
      if (opening) { audio.milestone(); ripples.push({ lake: true, t0: now, dur: 5 }); moonPulse = 1; }
      else audio.whoosh && audio.ctx && audio.whoosh(0, 0.04);
    }
  }
}

async function togglePhase() {
  const target = phase === 'lake' ? 'gather' : 'lake';
  let key = '';
  if (MODE === 'supabase') {
    try { key = localStorage.getItem(OPKEY) || ''; } catch { /* ignore */ }
    if (!key) {
      key = (window.prompt('Operator key (Supabase → Table Editor → operator_secret → key):') || '').trim();
      if (!key) return;
    }
  }
  let r;
  try { r = await setPhase(target, key); } catch { r = { ok: false, error: 'network' }; }
  if (r.ok) {
    try { if (key) localStorage.setItem(OPKEY, key); } catch { /* ignore */ }
    applyState({ phase: target, auto: target === 'lake' ? autoOpen : false });
    toast(target === 'lake' ? 'The lake is open' : 'Back to the join screen (press L to open the lake)');
  } else if (r.error === 'bad_key') {
    try { localStorage.removeItem(OPKEY); } catch { /* ignore */ }
    toast('Wrong operator key — press L to try again');
  } else if (r.error === 'old_database') {
    toast('Re-run supabase/schema.sql in Supabase to use the join screen');
  } else toast('Could not reach Supabase — try again');
}

function drawGather(dt) {
  const target = phase === 'lake' ? 1 : 0;
  stageMix += Math.sign(target - stageMix) * Math.min(Math.abs(target - stageMix), dt / 2.4);
  const a = 1 - ease(stageMix);
  if (a < 0.005) { joinFloaters.length = 0; return; }
  ctx.save();
  // Dim the lake behind
  ctx.globalAlpha = 0.66 * a;
  ctx.fillStyle = '#04030a';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Title
  const t1 = Math.round(H * 0.085);
  ctx.font = `${t1}px Creepster, Cinzel, serif`;
  ctx.shadowColor = 'rgba(255,120,30,0.85)';
  ctx.shadowBlur = t1 * 0.35;
  const tg = ctx.createLinearGradient(0, H * 0.13 - t1, 0, H * 0.13);
  tg.addColorStop(0, '#ffe7a3'); tg.addColorStop(0.6, '#ffaa3c'); tg.addColorStop(1, '#e0561a');
  ctx.fillStyle = tg;
  try { ctx.letterSpacing = `${Math.round(t1 * 0.06)}px`; } catch { /* ignore */ }
  ctx.fillText('Lake of Lights', W / 2, H * 0.13);
  ctx.shadowBlur = 0;
  try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
  ctx.font = `italic ${Math.round(H * 0.034)}px 'Cormorant Garamond', Georgia, serif`;
  ctx.fillStyle = 'rgba(243,230,200,0.92)';
  ctx.fillText('Scan the code with your phone to join', W / 2, H * 0.195);

  // Joined count + progress towards the lake opening
  const n = Math.round(H * 0.07);
  const y = H * 0.83;
  const numTxt = String(joined), restTxt = ` / ${N}`;
  ctx.font = `${n}px Creepster, Cinzel, serif`;
  const nw = ctx.measureText(numTxt).width;
  ctx.font = `${Math.round(n * 0.5)}px Creepster, Cinzel, serif`;
  const rw = ctx.measureText(restTxt).width;
  const left = W / 2 - (nw + rw) / 2;
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(255,120,30,0.8)';
  ctx.shadowBlur = n * 0.3;
  ctx.font = `${n}px Creepster, Cinzel, serif`;
  ctx.fillStyle = tg;
  const ng = ctx.createLinearGradient(0, y - n, 0, y);
  ng.addColorStop(0, '#ffe7a3'); ng.addColorStop(0.6, '#ffaa3c'); ng.addColorStop(1, '#e0561a');
  ctx.fillStyle = ng;
  ctx.fillText(numTxt, left, y);
  ctx.font = `${Math.round(n * 0.5)}px Creepster, Cinzel, serif`;
  ctx.fillStyle = 'rgba(255,214,150,0.9)';
  ctx.fillText(restTxt, left + nw, y);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(H * 0.015)}px Cinzel, serif`;
  try { ctx.letterSpacing = `${Math.round(H * 0.005)}px`; } catch { /* ignore */ }
  ctx.fillStyle = 'rgba(243,230,200,0.75)';
  ctx.fillText('GUESTS HAVE JOINED', W / 2, y + H * 0.032);
  try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
  // Progress bar with the opening point marked
  const bw = W * 0.42, bh = Math.max(6, H * 0.008), bx = W / 2 - bw / 2, by = y + H * 0.055;
  const openAt = Math.ceil((N * startAt) / 100);
  ctx.fillStyle = 'rgba(255,230,190,0.15)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, bh / 2) : ctx.rect(bx, by, bw, bh); ctx.fill();
  const fillW = bw * Math.min(1, joined / N);
  const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  pg.addColorStop(0, '#e0561a'); pg.addColorStop(1, '#ffd27a');
  ctx.fillStyle = pg;
  ctx.shadowColor = 'rgba(255,150,50,0.8)'; ctx.shadowBlur = bh * 2;
  if (fillW > 0) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, fillW, bh, bh / 2) : ctx.rect(bx, by, fillW, bh); ctx.fill(); }
  ctx.shadowBlur = 0;
  if (autoOpen && !legacyDb) {
    const mx = bx + bw * Math.min(1, openAt / N);
    ctx.fillStyle = 'rgba(255,240,210,0.9)';
    ctx.fillRect(mx - 1, by - bh * 0.8, 2, bh * 2.6);
    ctx.font = `italic ${Math.round(H * 0.022)}px 'Cormorant Garamond', Georgia, serif`;
    ctx.fillStyle = 'rgba(243,230,200,0.75)';
    ctx.fillText(`The lake opens when ${openAt} guests have joined`, W / 2, by + H * 0.04);
  }

  // Names of guests who just joined drift up like embers
  ctx.textAlign = 'center';
  const fs = Math.round(H * 0.028);
  ctx.font = `${fs}px Creepster, Cinzel, serif`;
  for (let i = joinFloaters.length - 1; i >= 0; i--) {
    const f = joinFloaters[i];
    const k = (now - f.t0) / f.life;
    if (k >= 1) { joinFloaters.splice(i, 1); continue; }
    const fa = Math.min(1, k * 5) * (1 - k);
    ctx.globalAlpha = a * fa;
    ctx.shadowColor = 'rgba(255,140,40,0.9)';
    ctx.shadowBlur = fs * 0.6;
    ctx.fillStyle = '#ffd99a';
    ctx.fillText(f.name, f.x + Math.sin(now * 1.3 + f.ph) * W * 0.008, f.y - k * H * 0.12);
  }
  ctx.restore();
}

function addJoinFloaters(rows) {
  for (const r of rows) {
    if (!lastJoinAt || r.joined_at > lastJoinAt) lastJoinAt = r.joined_at;
    if (phase !== 'gather' || joinFloaters.length > 30) continue;
    // around the QR code: left or right of it
    const g = qrRectGather();
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = W / 2 + side * (g.w / 2 + W * (0.06 + Math.random() * 0.14));
    joinFloaters.push({ name: r.nickname, x, y: H * (0.38 + Math.random() * 0.36), t0: now + Math.random() * 0.6, life: 5 + Math.random() * 2, ph: Math.random() * 6 });
  }
}

function drawToast() {
  if (now > toastUntil) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (toastUntil - now) / 0.6);
  ctx.font = '15px system-ui, sans-serif';
  const w = ctx.measureText(toastText).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(16, H - 56, w, 34);
  ctx.fillStyle = '#f3e6c8';
  ctx.fillText(toastText, 30, H - 34);
  ctx.restore();
}

// ---------- Lamp counter (C to show / hide) ----------
let showCounter = true;
try { showCounter = localStorage.getItem('lol_counter') !== 'off'; } catch { /* ignore */ }
let counterAlpha = 0, counterShown = -1, counterPulse = 0;
function drawCounter(dt) {
  const target = showCounter && !finale && stageMix > 0.98 ? 1 : 0;
  counterAlpha += (target - counterAlpha) * Math.min(1, dt * 2.5);
  if (litCount !== counterShown) { if (counterShown >= 0) counterPulse = 1; counterShown = litCount; }
  counterPulse = Math.max(0, counterPulse - dt * 2.5);
  if (counterAlpha < 0.01) return;
  const big = Math.round(H * 0.07), small = Math.round(H * 0.036);
  const x = W / 2, y = H * 0.1;
  ctx.save();
  ctx.globalAlpha = counterAlpha;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${big}px Creepster, Cinzel, serif`;
  const num = String(litCount);
  const numW = ctx.measureText(num).width;
  ctx.font = `${small}px Creepster, Cinzel, serif`;
  const rest = ` / ${N}`;
  const restW = ctx.measureText(rest).width;
  const left = x - (numW + restW) / 2;
  const flick = 0.85 + 0.15 * Math.sin(now * 7) * Math.sin(now * 3.1);
  ctx.shadowColor = `rgba(255,120,30,${0.9 * flick})`;
  ctx.shadowBlur = big * 0.35;
  const grad = ctx.createLinearGradient(0, y - big, 0, y);
  grad.addColorStop(0, '#ffe7a3');
  grad.addColorStop(0.6, '#ffaa3c');
  grad.addColorStop(1, '#e0561a');
  ctx.fillStyle = grad;
  // The number swells for a moment each time a lamp is lit.
  const sc = 1 + counterPulse * 0.18;
  ctx.save();
  ctx.translate(left + numW / 2, y - big * 0.35);
  ctx.scale(sc, sc);
  ctx.font = `${big}px Creepster, Cinzel, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(num, 0, big * 0.35);
  ctx.restore();
  ctx.font = `${small}px Creepster, Cinzel, serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,214,150,0.85)';
  ctx.fillText(rest, left + numW, y);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.round(H * 0.013)}px Cinzel, serif`;
  try { ctx.letterSpacing = `${Math.round(H * 0.005)}px`; } catch { /* older browsers */ }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(243,230,200,0.7)';
  ctx.fillText('LAMPS LIT', x, y + H * 0.03);
  ctx.restore();
}

// ---------- Operator help (H or the small ? on the left) ----------
const helpEl = document.getElementById('help');
const helpBtn = document.getElementById('helpBtn');
function setHelp(on) {
  showHelp = on;
  helpEl.hidden = !on;
  helpBtn.classList.toggle('open', on);
}
helpBtn.addEventListener('click', () => setHelp(!showHelp));
setInterval(() => {
  if (!showHelp) return;
  document.getElementById('helpStatus').textContent =
    `Screen: ${phase === 'lake' ? 'the lake' : 'join screen'} · joined ${joined} / ${N}${phase === 'gather' && autoOpen ? ` · opens at ${Math.ceil((N * startAt) / 100)}` : ''}${legacyDb ? ' · (old database: re-run schema.sql)' : ''}\n` +
    `Lamps lit: ${litCount} / ${N} · waiting: ${pending.length} · mode: ${MODE}\n` +
    `${fpsShown} fps · quality ${Math.round(quality * 100)}% · brightness ${Math.round(bright * 100)}% · counter ${showCounter ? 'on' : 'off'}\n` +
    `Last lamp check: ${lastLampCheck ? Math.round(now - lastLampCheck) + 's ago' : '—'} · phone shakes: ${shakeStatus}${frameErrors ? ` · frame errors: ${frameErrors}` : ''}\n` +
    `Guest link: ${guestUrl()}`;
}, 500);

function drawOperator() {
  // A small red dot means the screen has lost its connection (it keeps retrying).
  if (!connectionOk) {
    ctx.fillStyle = 'rgba(255,60,60,0.7)';
    ctx.beginPath(); ctx.arc(14, 14, 5, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- Main loop ----------
let lastT = performance.now() / 1000;
// The frame loop never stops, even if one frame hits an unexpected error.
let frameErrors = 0;
function frame() {
  try { frameBody(); } catch (e) { frameErrors++; console.error(e); }
  requestAnimationFrame(frame);
}
function frameBody() {
  const t = performance.now() / 1000;
  const dt = Math.min(0.05, t - lastT);
  lastT = t; now = t;
  frameDt = dt;
  fpsFrames++;
  if (t - fpsT0 >= 1) {
    fpsShown = Math.round(fpsFrames / (t - fpsT0)); fpsFrames = 0; fpsT0 = t;
    // Automatic quality: after 4 slow seconds in a row, step the resolution down.
    if (started && !params.has('quality') && t - startedAt > 6) {
      lowFpsSeconds = fpsShown < 40 ? lowFpsSeconds + 1 : 0;
      const i = QUALITY_STEPS.indexOf(quality);
      if (lowFpsSeconds >= 4 && i >= 0 && i < QUALITY_STEPS.length - 1) {
        quality = QUALITY_STEPS[i + 1];
        lowFpsSeconds = 0;
        setCanvasSize();
      }
    }
  }

  processQueue();
  if (finale && finale.t0 === null && now >= finale.at) startFinale();

  // Light, mist and moon follow the number of lit lamps.
  const targetLight = finale && finale.t0 !== null ? 1.15 : litCount / N;
  light += (targetLight - light) * Math.min(1, dt * 0.9);
  const mistTarget = finale && finale.t0 !== null ? 0 : 1 - Math.pow(litCount / N, 0.8) * 0.8;
  mistAmount += (mistTarget - mistAmount) * Math.min(1, dt * 0.6);
  moonPulse = Math.max(0, moonPulse - dt * 0.4);

  // Heartbeat for the last five lamps.
  if (!finale && litCount >= N - 5 && litCount < N && now >= nextBeat) {
    audio.heartbeat();
    moonPulse = Math.max(moonPulse, 0.5);
    nextBeat = now + 1.45;
  }
  audio.setLight(Math.min(1, light));
  const moonGlow = Math.min(1.4, light * 0.5 + moonPulse * 0.5 + (formed ? 0.4 : 0));

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  scene.update(now, dt, Math.min(1, light));
  scene.drawBack(ctx, now, dt, Math.min(1, light), moonGlow);
  scene.drawMist(ctx, dt, mistAmount, true);
  scene.drawWater(ctx, now, dt, Math.min(1, light));

  // Positions this frame
  // Lamps drift with the camera too: near ones more than far ones (depth).
  const placed = lamps.map(L => {
    const p = lampPos(L);
    const depth = clamp01((p.y - H * HORIZON) / (H * (1 - HORIZON)));
    const k = 0.35 + 0.6 * depth;
    p.x += scene.cam.x * k;
    p.y += scene.cam.y * k;
    return { L, p };
  });
  placed.sort((a, b) => a.p.y - b.p.y);

  // A slow wave of brightness travels across the finished word.
  const allDone = finale && finale.t0 !== null && lamps.every(L => L.landed);
  if (allDone && !formed) formed = true;
  const intensityOf = p => {
    if (!formed) return 1;
    const wave = ((now * 0.12) % 1.6) - 0.3;
    const d = p.x / W - wave;
    return 1.15 + 0.45 * Math.exp(-d * d * 60);
  };

  // Reflections first (they sit on the water under every lamp).
  for (const { L, p } of placed) {
    let k = L.state === 'lit' ? 1 : clamp01((now - L.t0 - L.sparkDur) / 0.6);
    if (k > 0) drawReflection(ctx, glow, p.x, p.y, p.s, now, L.seed, k * intensityOf(p));
  }
  drawRipples();

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, lm.width, lm.height);
  lctx.globalCompositeOperation = 'lighter';
  const shown = [];
  for (const { L, p } of placed) {
    let inten = 1;
    if (L.state === 'arriving') {
      const age = now - L.t0;
      if (age < L.sparkDur) drawSpark(L, p);
      if (age >= L.sparkDur && !L.ignited) { L.ignited = true; ignite(L, p); }
      if (age < L.sparkDur - 0.15) continue;
    } else inten = intensityOf(p);
    drawLampBodyPass(L, p, inten);
    shown.push([L, p, inten]);
  }
  // Tea-lights that complete the letters (small groups only)
  const fillerA = finale && finale.t0 !== null && fillers.length ? clamp01((now - finale.t0 - 3.5) / 4) : 0;
  const fillerPos = [];
  if (fillerA > 0) {
    for (const f of fillers) {
      const d = formedFloat(f, f, finaleLampSize);
      const p = { x: f.x + d.x, y: f.y + d.y, s: finaleLampSize * f.sizeVar * f.k };
      const depth = clamp01((p.y - H * HORIZON) / (H * (1 - HORIZON)));
      p.x += scene.cam.x * (0.35 + 0.6 * depth);
      p.y += scene.cam.y * (0.35 + 0.6 * depth);
      const k = p.s / S0;
      ctx.globalAlpha = fillerA;
      ctx.drawImage(BODY.c, p.x - BODY.ox * k, p.y - BODY.oy * k, BODY.c.width * k, BODY.c.height * k);
      const w = wickPos(p.x, p.y, p.s);
      const g = p.s * 4 * LM;
      lctx.globalAlpha = 0.4 * fillerA;
      lctx.drawImage(glow, w.x * LM - g / 2, (w.y - p.s * 0.4) * LM - g / 2, g, g);
      fillerPos.push([f, p, w]);
    }
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lm, 0, 0, W, H);
  ctx.restore();
  for (const [L, p, inten] of shown) drawLampFlamePass(L, p, inten);
  for (const [f, p, w] of fillerPos) {
    const fh = p.s * 0.95 * (1 + 0.07 * wobble(now, f.seed)) * 1.1;
    const k = fh / H0;
    ctx.save();
    ctx.globalAlpha = fillerA;
    ctx.translate(w.x, w.y);
    ctx.transform(1, 0, -0.08 * wobble(now * 0.6, f.seed + 9) - scene.hw.gust * scene.hw.gustDir * 0.3, 1, 0, 0);
    ctx.scale(k, k);
    ctx.drawImage(FLAME.c, -FLAME.bx, -FLAME.by);
    ctx.restore();
  }
  for (const { L, p } of placed) drawNickname(L, p);

  // Rising embers once WELCOME is formed.
  if (formed && Math.random() < dt * 14 && lamps.length) {
    const L = lamps[Math.floor(Math.random() * lamps.length)];
    const p = lampPos(L);
    const w = wickPos(p.x, p.y, p.s);
    sparks.push({ x: w.x, y: w.y - p.s * 0.6, vx: (Math.random() - 0.5) * 12, vy: -(20 + Math.random() * 40), t0: now, life: 2.5 + Math.random() * 2.5, size: p.s * 0.18, rise: true });
  }
  drawSparks(dt);

  // Lake mist wanders in front of the lamps and glows where they are lit
  // (a little always stays, even when the lake is full of light).
  scene.drawLakeMist(ctx, now, dt, finale && finale.t0 !== null ? 0.35 : Math.max(0.55, mistAmount), lm);
  scene.drawGhost(ctx, now, Math.min(1, light));
  scene.drawFireflies(ctx, now, 1 - (formed ? 0.5 : 0));
  scene.drawFront(ctx, now);
  drawGather(dt);
  drawQR(dt);
  drawCounter(dt);
  drawToast();
  drawOperator();
}

// ---------- Demo mode (offline backup / rehearsal) ----------
const DEMO_NAMES = ['NIMA', 'KASU', 'RAVI', 'SAMA', 'AMI', 'TOM', 'DILU', 'JO', 'MAYA', 'ARUN', 'LEO', 'ISHA', 'KAVI', 'ROSE', 'BEN', 'ZARA', 'MALI', 'SUNI', 'OWL', 'BOO', 'NILA', 'PRIA', 'DEV', 'ANU', 'CHAM', 'HIRU', 'SHAN', 'GIGI', 'MOON', 'KIT'];
let demoId = 0, demoOn = false, demoTimer = null;
function demoAdd() {
  if (demoId >= N) return;
  demoId++;
  addLamps([{ id: demoId, nickname: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)] }], false);
}
function demoShakes() {
  const lit = lamps.filter(L => L.state === 'lit');
  if (lit.length) {
    const L = lit[Math.floor(Math.random() * lit.length)];
    for (let i = 0; i < 4; i++) setTimeout(() => onShake({ l: L.id, p: 0.6 + Math.random() * 0.8 }), i * 450);
  }
  setTimeout(demoShakes, 3000 + Math.random() * 4000);
}
// Demo: fake guests first join (join screen), then light lamps once the lake is open.
let demoJoined = 0;
function demoJoin() {
  demoJoined++;
  const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
  joinLake(name, 'demo-' + demoJoined).then(r => {
    addJoinFloaters([{ nickname: name, joined_at: new Date().toISOString() }]);
    applyState({ phase: r.phase, joined: r.joined });
  });
}
function demoLoop() {
  clearTimeout(demoTimer);
  if (!demoOn) return;
  const fast = params.get('demo') === 'fast';
  if (phase === 'gather') {
    if (demoJoined < N) demoJoin();
    demoTimer = setTimeout(demoLoop, fast ? 60 + Math.random() * 150 : 150 + Math.random() * 500);
    return;
  }
  if (demoId >= N) return;
  demoAdd();
  demoTimer = setTimeout(demoLoop, fast ? 80 + Math.random() * 300 : 250 + Math.random() * 1300);
}

// ---------- Start ----------
function begin() {
  if (started) return;
  started = true;
  startedAt = performance.now() / 1000;
  audio.start();
  document.getElementById('start').classList.add('hidden');
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch { /* ignore */ }
  if (MODE === 'demo') { demoOn = true; demoLoop(); demoShakes(); }
}

document.getElementById('start').addEventListener('click', begin);
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!started && (k === 'enter' || k === ' ')) { begin(); return; }
  if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  } else if (k === 'm') audio.toggleMute();
  else if (k === 'q') qrVisible = !qrVisible;
  else if (k === 'h' || k === '?') setHelp(!showHelp);
  else if (k === 'c') {
    showCounter = !showCounter;
    try { localStorage.setItem('lol_counter', showCounter ? 'on' : 'off'); } catch { /* ignore */ }
  }
  else if (k === 'l') togglePhase();
  else if (k === 'p') cycleBright();
  else if (k === 'w' && !e.shiftKey) { scene.hw.witch = null; scene.hw.launchWitch(); }
  else if (k === 'k') scene.hw.launchSkeleton();
  else if (k === 'o') scene.hw.owlArrive();
  else if (k === 'b') scene.hw.launchBats();
  else if (k === 'g') scene.hw.launchGhost();
  else if (k === 'r' && e.shiftKey) replayFinale();
  else if (MODE === 'demo' && k === ' ') { e.preventDefault(); if (phase === 'gather') demoJoin(); else demoAdd(); }
  else if (MODE === 'demo' && k === 'd') { demoOn = !demoOn; demoLoop(); }
});

// Hide the mouse cursor when it is idle.
let cursorTimer;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('nocursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => { document.body.classList.add('nocursor'); canvas.style.cursor = ''; }, 2500);
});

window.addEventListener('resize', resize);

const modeNote = {
  supabase: 'Live mode — connected to Supabase.',
  local: 'Local test mode — open the guest page with ?local in this same browser.',
  demo: 'Demo mode — fake guests will light lamps automatically.',
}[MODE];
document.getElementById('mode').textContent = modeNote;

Promise.all([
  document.fonts ? Promise.all([document.fonts.load('600 40px Cinzel'), document.fonts.load('40px Creepster'), document.fonts.load('italic 30px "Cormorant Garamond"')]).catch(() => {}) : Promise.resolve(),
  loadTotal().then(setTotal),
  getState().then(st => applyState(st, true)).catch(() => {}),
]).finally(() => {
  if (!SLOTS.length) setTotal(N);
  resize();
  // Join screen: keep the count and phase up to date, show new names.
  watchState(st => applyState(st), 1500);
  recentJoins(null).then(rows => { lastJoinAt = rows.length ? rows[rows.length - 1].joined_at : new Date(0).toISOString(); });
  setInterval(async () => {
    if (phase !== 'gather' || lastJoinAt === null) return;
    addJoinFloaters(await recentJoins(lastJoinAt));
  }, 1500);
  if (MODE !== 'demo') {
    const watcher = watchLamps({
      onLamps: addLamps,
      onStatus: ok => { connectionOk = ok; if (ok) lastLampCheck = performance.now() / 1000; },
      onReset: () => location.reload(),
    });
    watchShakes({ onShake, onLit: () => watcher.kick(), onStatus: st => { shakeStatus = st; } });
  }
  requestAnimationFrame(frame);
});

// Test hook for automated checks.
window.__lake = { get litCount() { return litCount; }, get formed() { return formed; }, get lamps() { return lamps.length; }, addLamps, demoAdd, begin, onShake, scene, get maxShake() { return Math.max(0, ...lamps.map(l => l.shake)); }, get nickShown() { return lamps.filter(l => l.nickAt && now - l.nickAt < 4.6).length; } };
