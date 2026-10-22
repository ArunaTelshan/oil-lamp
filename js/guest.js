// Lake of Lights — guest phone page.
import { CONFIG } from './config.js';
import { makeSlots, makeOrder, HORIZON } from './layout.js';
import { makeGlow, GLOW_WARM, wobble, drawFlame, drawLampBody, wickPos } from './lamp-art.js';
import { backendMode, cleanNickname, isBlocked, lightLampWithRetry, sendShake, shakeStats, notifyLit } from './backend.js';

const N = CONFIG.TOTAL_LAMPS;
const app = document.getElementById('app');
const stage = document.getElementById('stage');
const canvas = document.getElementById('lamp');
const ctx = canvas.getContext('2d');
const ring = document.querySelector('#ring circle');
const nickInput = document.getElementById('nick');
const nickError = document.getElementById('nickError');
const continueBtn = document.getElementById('continue');
const glow = makeGlow(128, GLOW_WARM);
const ember = makeGlow(64, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,110,0.7)'], [1, 'rgba(255,120,30,0)']]);

const KEEP = 'lol_keepsake';
const debugEl = document.getElementById('debug');
const MODE = backendMode();
if (MODE !== 'supabase') document.getElementById('localNote').hidden = false;

let step = 'name';
let W = 0, H = 0, DPR = 1;
let now = performance.now() / 1000;

// Lamp state
let hold = 0, holding = false;
let flameK = 0, flare = 0;          // 0..1 flame size, ignition flare
let lean = 0, leanV = 0, leanTarget = 0, flutter = 0;
let lift = 0;                       // finger drag offset while swiping (px)
let fly = null;                     // { t0, dir: 'up' | 'down' }
const sparks = [];
let lastShakeSpark = 0;
let audioCtx = null;
let nickname = '';

const setStep = s => { step = s; app.dataset.step = s; };

// ---------- Canvas sizing ----------
// The canvas covers the whole screen (so glows are never clipped);
// the lamp is placed in the middle of the #stage area.
let SX = 0, SY = 0, SW = 0, SH = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  measureStage();
  drawMap();
}
function measureStage() {
  const r = stage.getBoundingClientRect();
  SX = r.left; SY = r.top; SW = r.width; SH = r.height;
}
window.addEventListener('resize', resize);

function lampGeom() {
  // Sized so the lamp + its tallest flame always fit inside the stage.
  const s = Math.min(SW * 0.46, SH * 0.46);
  return { x: SX + SW / 2 - s * 0.08, y: SY + SH * 0.6 + s * 0.32, s };
}

// ---------- Nickname ----------
function updateContinue() {
  continueBtn.disabled = cleanNickname(nickInput.value).length < 1;
}
// Letters only. While a phone keyboard is still composing a word (Android),
// leave the text alone — changing it mid-word breaks typing.
let composing = false;
function tidyNick() {
  const v = nickInput.value;
  const clean = cleanNickname(v);
  if (clean !== v.toUpperCase()) nickInput.value = clean;
}
nickInput.addEventListener('compositionstart', () => { composing = true; });
nickInput.addEventListener('compositionend', () => { composing = false; tidyNick(); updateContinue(); });
nickInput.addEventListener('input', e => {
  if (!composing && !e.isComposing) tidyNick();
  nickError.textContent = '';
  updateContinue();
});
nickInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !continueBtn.disabled) continueBtn.click(); });

continueBtn.addEventListener('click', () => {
  const v = cleanNickname(nickInput.value);
  if (!v) return;
  if (isBlocked(v)) { nickError.textContent = 'Please choose a different name.'; return; }
  nickname = v;
  nickInput.blur();
  enableMotion();   // must happen inside a tap for iPhones
  initAudio();
  setStep('light');
});

// ---------- Motion (shake the flame) ----------
// Uses the plain accelerometer (every phone has one) and removes gravity
// ourselves, so it also works on phones without a gyroscope.
let motionOn = false;       // listeners attached
let motionLive = false;     // sensor events are actually arriving
let motionEvents = 0;
let motionDenied = false;
let gSign = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1;
const grav = { x: 0, y: 0, z: 0, init: false };
const hp = { x: 0, y: 0, z: 0 };
let shakeKick = 0;          // quick sideways push from a shake
let shakeEnergy = 0, lastShakeSend = 0;   // mirrored to the lamp on the big screen
const DEBUG = new URLSearchParams(location.search).has('debug');
const needsPermission = () => {
  const DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent;
  return (DM && typeof DM.requestPermission === 'function') || (DO && typeof DO.requestPermission === 'function');
};

function onMotion(e) {
  let x, y, z;
  const g = e.accelerationIncludingGravity;
  if (g && g.x != null) {
    if (!grav.init) { grav.x = g.x; grav.y = g.y; grav.z = g.z; grav.init = true; }
    grav.x += (g.x - grav.x) * 0.08;
    grav.y += (g.y - grav.y) * 0.08;
    grav.z += (g.z - grav.z) * 0.08;
    x = g.x - grav.x; y = g.y - grav.y; z = g.z - grav.z;
    // iPhones report gravity with the opposite sign; learn it from how
    // the phone is held (upright = gravity mostly along y).
    if (Math.abs(grav.y) > 4) gSign = grav.y > 0 ? 1 : -1;
    // Keep the flame pointing "up" in the real world as the phone tilts.
    leanTarget = Math.max(-0.75, Math.min(0.75, (gSign * grav.x) / 9.8 * 0.95));
  } else if (e.acceleration && e.acceleration.x != null) {
    x = e.acceleration.x; y = e.acceleration.y || 0; z = e.acceleration.z || 0;
  } else return;
  hp.x = x; hp.y = y; hp.z = z;
  motionEvents++;
  motionLive = true;
  const mag = Math.hypot(x, y, z);
  if (mag < 0.3) return;    // sensor noise
  if (mag > 1.2) shakeEnergy = Math.max(shakeEnergy, mag);
  // Even a gentle shake should clearly move the flame.
  leanV += -x * 0.1;
  shakeKick = Math.max(-0.7, Math.min(0.7, shakeKick - x * 0.035));
  flutter = Math.min(1.5, flutter + mag * 0.035);
  if (mag > 6 && now - lastShakeSpark > 0.14 && flameK > 0.5) {
    lastShakeSpark = now;
    burst(2 + Math.min(10, Math.floor(mag / 3)));
    if (mag > 12 && navigator.vibrate) navigator.vibrate(8);
  }
}

function attachMotion() {
  if (motionOn) return;
  motionOn = true;
  window.addEventListener('devicemotion', onMotion);
}

// Always listen straight away: most phones send motion with no prompt.
// Some browsers (iPhones, and a few Android browsers) also offer a
// permission step; on those we also ask from a tap, which only matters if no
// motion is arriving yet.
let motionAsking = false, motionGranted = false;
function enableMotion() {
  attachMotion();
  if (!needsPermission() || motionLive || motionGranted || motionAsking) return;
  const DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent;
  const asks = [];
  if (DM && typeof DM.requestPermission === 'function') asks.push(DM.requestPermission().catch(() => 'denied'));
  if (DO && typeof DO.requestPermission === 'function') asks.push(DO.requestPermission().catch(() => 'denied'));
  motionAsking = true;
  Promise.all(asks).then(r => {
    motionAsking = false;
    if (r.includes('granted')) motionGranted = true;
    else if (!motionLive) motionDenied = true;
  });
}

// ---------- Little sounds on the phone ----------
function initAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
  } catch { /* no audio */ }
}
function chime(freqs, vol = 0.08) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  freqs.forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = f;
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(vol, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 1.8);
    o.connect(g).connect(audioCtx.destination);
    o.start(s); o.stop(s + 1.9);
  });
}

// ---------- Hold to light ----------
stage.addEventListener('pointerdown', e => {
  if (step === 'light') { holding = true; stage.setPointerCapture(e.pointerId); }
  if (step === 'release') { swipe = { y0: e.clientY, id: e.pointerId }; stage.setPointerCapture(e.pointerId); }
  if (step === 'done' || step === 'full') { push = { x: e.clientX }; }
});
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
function endPointer() {
  holding = false;
  if (swipe) { swipe = null; if (step === 'release') lift = 0; }
  push = null;
}

function ignite() {
  flameK = 0.01;
  flare = 1;
  burst(14);
  if (navigator.vibrate) navigator.vibrate([18, 40, 70]);
  chime([659.25, 987.77, 1318.5], 0.06);
  setTimeout(() => { if (step === 'light') setStep('release'); }, 900);
}

// ---------- Swipe up to release ----------
let swipe = null, push = null;
stage.addEventListener('pointermove', e => {
  if (swipe && step === 'release') {
    lift = Math.min(0, e.clientY - swipe.y0);
    if (lift < -70) { swipe = null; release(); }
  }
  if (push && (step === 'done' || step === 'full')) {
    leanV += (e.clientX - push.x) * 0.03;
    shakeEnergy = Math.max(shakeEnergy, Math.abs(e.clientX - push.x) * 0.25);
    push.x = e.clientX;
  }
});
document.getElementById('releaseBtn').addEventListener('click', () => release());
document.getElementById('retryBtn').addEventListener('click', () => release(true));

async function release(isRetry = false) {
  if (step !== 'release' && !isRetry) return;
  setStep('sending');
  lift = 0;
  document.getElementById('sendingNote').textContent = 'Watch the big screen.';
  if (!isRetry) {
    fly = { t0: now, dir: 'up' };
    chime([523.25, 783.99], 0.04);
    if (navigator.vibrate) navigator.vibrate(30);
  }
  const minAnim = new Promise(r => setTimeout(r, isRetry ? 300 : 1300));
  let result;
  try {
    result = await lightLampWithRetry(nickname, n => {
      if (n >= 2) document.getElementById('sendingNote').textContent = 'Weak signal — still trying…';
    });
  } catch {
    await minAnim;
    setStep('offline');
    return;
  }
  await minAnim;
  if (result.ok) {
    notifyLit(result.lamp);
    const keep = { lamp: result.lamp, nickname: result.nickname, time: Date.now() };
    try { localStorage.setItem(KEEP, JSON.stringify(keep)); } catch { /* ignore */ }
    showKeepsake(keep);
  } else if (result.error === 'full') {
    fly = { t0: now, dir: 'down' };
    setStep('full');
  } else {
    // Name refused by the server: back to the name step.
    fly = { t0: now, dir: 'down' };
    nickError.textContent = 'Please choose a different name.';
    nickInput.value = '';
    updateContinue();
    flameK = 0; hold = 0;
    setStep('name');
  }
}

function showKeepsake(k) {
  fly = { t0: now, dir: 'down' };
  flameK = Math.max(flameK, 1);
  document.getElementById('kName').textContent = k.nickname;
  const t = new Date(k.time);
  const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('kMeta').textContent = `Lamp ${k.lamp} of ${N} · lit at ${time}`;
  myLamp = k.lamp;
  setStep('done');
  requestAnimationFrame(drawMap);
}

// ---------- Mini map of the lake ----------
const SLOTS = makeSlots(CONFIG.LAYOUT_SEED, N);
const ORDER = makeOrder(CONFIG.LAYOUT_SEED, N, SLOTS);
let myLamp = 0;
function drawMap(pulse = 0) {
  const m = document.getElementById('map');
  const r = m.getBoundingClientRect();
  if (!r.width) return;
  const d = Math.min(window.devicePixelRatio || 1, 2.5);
  if (m.width !== Math.round(r.width * d)) { m.width = Math.round(r.width * d); m.height = Math.round(r.height * d); }
  const g = m.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  const w = r.width, h = r.height;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1a1630');
  bg.addColorStop(1, '#07070f');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const y0 = 0.47, y1 = 0.96;
  const pos = s => ({ x: s.x * w, y: ((s.y - y0) / (y1 - y0)) * h * 0.86 + h * 0.07 });
  g.fillStyle = 'rgba(255,214,150,0.28)';
  for (const s of SLOTS) {
    const p = pos(s);
    g.beginPath(); g.arc(p.x, p.y, 0.8 + s.s * 1.2, 0, Math.PI * 2); g.fill();
  }
  if (myLamp) {
    const s = SLOTS[ORDER[(myLamp - 1) % N]];
    const p = pos(s);
    const gs = 34 + pulse * 10;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow, p.x - gs / 2, p.y - gs / 2, gs, gs);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff6dc';
    g.beginPath(); g.arc(p.x, p.y, 3.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,220,160,${0.8 - pulse * 0.6})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(p.x, p.y, 7 + pulse * 9, 0, Math.PI * 2); g.stroke();
  }
}

// ---------- Sparks ----------
function burst(n) {
  const L = lampGeom();
  const w = wickPos(L.x, L.y + lift + flyOffset(), L.s);
  for (let i = 0; i < n; i++) {
    sparks.push({ x: w.x, y: w.y - L.s * 0.3, vx: (Math.random() - 0.5) * L.s * 1.6, vy: -L.s * (0.6 + Math.random() * 1.6), t0: now, life: 0.6 + Math.random() * 0.8, size: L.s * (0.025 + Math.random() * 0.035) });
  }
}

function flyOffset() {
  if (!fly) return 0;
  const k = Math.min(1, (now - fly.t0) / (fly.dir === 'up' ? 1.2 : 1.0));
  if (fly.dir === 'up') return -Math.pow(k, 2) * H * 1.1;
  const e = 1 - Math.pow(1 - k, 3);
  return -(1 - e) * H * 0.9;
}

// ---------- Draw loop ----------
let last = performance.now() / 1000;
function frame() {
  const t = performance.now() / 1000;
  const dt = Math.min(0.05, t - last);
  last = t; now = t;
  measureStage();

  // Hold-to-light progress
  if (step === 'light' && flameK === 0) {
    hold = holding ? Math.min(1, hold + dt / 1.4) : Math.max(0, hold - dt / 0.7);
    ring.style.strokeDashoffset = String(289 * (1 - hold));
    if (hold >= 1) ignite();
  }
  if (flameK > 0 && flameK < 1) flameK = Math.min(1, flameK + dt / 0.6);
  flare = Math.max(0, flare - dt / 1.1);

  // Flame spring physics (tilt + shake + finger)
  const acc = (leanTarget - lean) * 38 - leanV * 5.5;
  leanV += acc * dt;
  lean += leanV * dt;
  lean = Math.max(-1.1, Math.min(1.1, lean));
  flutter = Math.max(0, flutter - dt * 1.4);
  // Tell the big screen (at most twice a second) so this guest's lamp flutters too.
  if (step === 'done' && myLamp && shakeEnergy > 2.5 && now - lastShakeSend > 0.5) {
    sendShake(myLamp, Math.min(1.5, shakeEnergy / 10));
    lastShakeSend = now;
    shakeEnergy = 0;
  }
  shakeEnergy *= Math.exp(-dt * 4);
  shakeKick *= Math.exp(-dt * 5);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const L = lampGeom();
  if (step === 'light') {
    const rs = L.s * 1.7;
    const el = ring.ownerSVGElement;
    el.style.left = `${L.x + L.s * 0.1}px`;
    el.style.top = `${L.y - L.s * 0.32}px`;
    el.style.width = el.style.height = `${rs}px`;
  }
  const off = lift + flyOffset();
  const ly = L.y + off;
  const scale = fly && fly.dir === 'up' ? 1 - Math.min(1, (now - fly.t0) / 1.2) * 0.5 : 1;
  const s = L.s * scale;

  // Water + reflection under the lamp
  const wy = L.y + L.s * 0.02;
  const water = ctx.createRadialGradient(SX + SW / 2, wy, 0, SX + SW / 2, wy, SW * 0.6);
  water.addColorStop(0, `rgba(255,170,80,${0.1 * flameK})`);
  water.addColorStop(0.4, 'rgba(30,26,50,0.35)');
  water.addColorStop(1, 'rgba(10,10,20,0)');
  ctx.fillStyle = water;
  ctx.beginPath(); ctx.ellipse(SX + SW / 2, wy, SW * 0.6, L.s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  if (Math.abs(off) < 2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const f = i / 6;
      const wv = Math.sin(now * 2 + i * 1.7) * L.s * 0.05 * (1 + f * 2);
      const ww = L.s * (0.3 - f * 0.1);
      ctx.globalAlpha = flameK * 0.45 * (1 - f) * (1 - f);
      ctx.drawImage(glow, L.x + L.s * 0.5 + wv - ww, wy + L.s * 0.06 + f * L.s * 0.5, ww * 2, L.s * 0.08);
    }
    ctx.restore();
    // Ripple rings
    ctx.strokeStyle = 'rgba(255,220,170,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const k = ((now * 0.25 + i * 0.5) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(L.x, wy, L.s * (0.6 + k * 0.9), L.s * (0.1 + k * 0.15), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const w = wickPos(L.x, ly, s);

  // Glow
  if (flameK > 0 || hold > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const k = Math.max(flameK, hold * 0.35);
    const g = s * (3.2 + flare * 3) * (0.9 + 0.1 * Math.sin(now * 9));
    ctx.globalAlpha = 0.55 * k;
    ctx.drawImage(glow, w.x - g / 2, w.y - s * 0.4 - g / 2, g, g);
    ctx.restore();
  }

  drawLampBody(ctx, L.x - (L.s - s) * 0.4, ly, s, 0.2 + 0.8 * flameK, 1);

  // Ember while holding
  if (flameK === 0 && hold > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const es = s * (0.12 + hold * 0.35) * (0.85 + 0.15 * Math.sin(now * 30));
    ctx.globalAlpha = 0.4 + hold * 0.6;
    ctx.drawImage(ember, w.x - es / 2, w.y - es / 2, es, es);
    ctx.restore();
    if (Math.random() < hold * dt * 18) burst(1);
  }

  // Flame
  if (flameK > 0) {
    const flick = 1 + 0.07 * wobble(now, 3) + 0.03 * Math.sin(now * 29);
    const fl = flutter * (0.22 * Math.sin(now * 23) + 0.12 * Math.sin(now * 37)) + shakeKick;
    const fh = s * 1.0 * flameK * flick * (1 + flare * 0.5) * (1 - Math.min(0.35, Math.abs(lean) * 0.25));
    drawFlame(ctx, w.x, w.y, fh, lean * 0.9 + fl + 0.05 * wobble(now * 0.6, 7), 1);
  }

  // Sparks
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    const k = (now - p.t0) / p.life;
    if (k >= 1) { sparks.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += L.s * 1.2 * dt; p.vx *= 0.98;
    const z = p.size * (1 - k * 0.5) * 2;
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(ember, p.x - z, p.y - z, z * 2, z * 2);
  }
  ctx.restore();

  if (step === 'done') drawMap((Math.sin(now * 2.4) + 1) / 2);
  if (DEBUG && Math.floor(now * 5) !== Math.floor((now - dt) * 5)) {
    const f = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
    debugEl.textContent =
      `permission step: ${needsPermission() ? 'yes' : 'no'}  granted: ${motionGranted}  denied: ${motionDenied}\n` +
      `events: ${motionEvents}  shake: ${f(hp.x)} ${f(hp.y)} ${f(hp.z)}\n` +
      `gravity: ${f(grav.x)} ${f(grav.y)} ${f(grav.z)}  sign: ${gSign}\n` +
      `lean: ${f(lean)}  flutter: ${f(flutter)}\n` +
      `to screen: sent ${shakeStats.sent}  failed ${shakeStats.failed}  last ${shakeStats.last}`;
  }

  requestAnimationFrame(frame);
}

// ---------- Hidden: light another lamp with a new name ----------
// Tap the moon 5 times quickly (or open the page with ?new). The phone
// forgets its lamp and gets a fresh identity, so it can light a new one.
function startOver() {
  try { localStorage.removeItem(KEEP); localStorage.removeItem('lol_device'); } catch { /* ignore */ }
  myLamp = 0; nickname = ''; flameK = 0; flare = 0; hold = 0; fly = null; lift = 0;
  nickInput.value = '';
  nickError.textContent = '';
  updateContinue();
  setStep('name');
  chime([1318.5, 987.77, 659.25], 0.04);
}
let moonTaps = [];
window.addEventListener('pointerdown', e => {
  const m = document.querySelector('.moon').getBoundingClientRect();
  const pad = 24;
  if (e.clientX < m.left - pad || e.clientX > m.right + pad || e.clientY < m.top - pad || e.clientY > m.bottom + pad) return;
  moonTaps = moonTaps.filter(t => now - t < 3).concat(now);
  if (moonTaps.length >= 5 && step !== 'sending') { moonTaps = []; initAudio(); startOver(); }
});

// ---------- Start ----------
function init() {
  if (new URLSearchParams(location.search).has('new')) {
    try { localStorage.removeItem(KEEP); localStorage.removeItem('lol_device'); } catch { /* ignore */ }
  }
  resize();
  attachMotion();
  let keep = null;
  try { keep = JSON.parse(localStorage.getItem(KEEP) || 'null'); } catch { /* ignore */ }
  if (keep && keep.lamp) {
    nickname = keep.nickname;
    flameK = 1;
    showKeepsake(keep);
    fly = null;
    // iPhones only allow motion after a tap: ask on the first tap anywhere.
    if (needsPermission()) window.addEventListener('click', () => enableMotion(), { once: true });
  } else {
    setStep('name');
    updateContinue();
  }
  requestAnimationFrame(frame);
}
init();

window.__guest = { get step() { return step; } };
