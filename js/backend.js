// Talks to Supabase (the real event), or to a local stand-in for testing.
//   ?local  → guest + screen in the same browser share lamps via localStorage
//   ?demo   → screen only: fake guests light lamps automatically (offline backup)

import { CONFIG, isConfigured } from './config.js';

const params = new URLSearchParams(location.search);

export function backendMode() {
  if (params.has('demo')) return 'demo';
  if (params.has('local')) return 'local';
  return isConfigured() ? 'supabase' : 'local';
}

function headers() {
  const key = CONFIG.SUPABASE_ANON_KEY;
  const h = { apikey: key, 'Content-Type': 'application/json' };
  // Older "anon" keys are JWTs and also go in Authorization.
  // New "sb_publishable_" keys must only be sent as apikey.
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}

export function deviceId() {
  const K = 'lol_device';
  let id = null;
  try { id = localStorage.getItem(K); } catch { /* private mode */ }
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
    try { localStorage.setItem(K, id); } catch { /* ignore */ }
  }
  return id;
}

export function cleanNickname(s) {
  return (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function isBlocked(nick) {
  return CONFIG.BLOCKED.includes(nick);
}

// ---------- Guest: light a lamp ----------
// Returns { ok, lamp, nickname, repeat, total } or { ok:false, error }.
// Network failures throw, so the caller can retry.

export async function lightLamp(nickname, device = deviceId()) {
  const mode = backendMode();
  if (mode === 'local' || mode === 'demo') return localLight(nickname, device);
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/light_lamp`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_nickname: nickname, p_device: device }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Retries network errors with back-off (~40 s in total).
export async function lightLampWithRetry(nickname, onRetry) {
  const waits = [600, 1000, 1500, 2500, 3500, 5000, 6000, 8000, 10000];
  let lastErr;
  for (let i = 0; i <= waits.length; i++) {
    try {
      return await lightLamp(nickname);
    } catch (e) {
      lastErr = e;
      if (i === waits.length) break;
      onRetry && onRetry(i + 1);
      await new Promise(r => setTimeout(r, waits[i]));
    }
  }
  throw lastErr;
}

// ---------- Screen: watch lamps ----------
// onLamps(list, initial) is called with new lamps [{id, nickname}], in order.
// initial = true for the first batch (lamps already lit before the screen opened).
// onStatus(ok) reports connection health. onReset() if the ceremony was reset.

export function watchLamps({ onLamps, onStatus, onReset }) {
  const mode = backendMode();
  if (mode === 'local') return watchLocal({ onLamps, onReset });
  if (mode === 'demo') return { stop() {} }; // screen drives demo itself
  let last = 0;
  let stopped = false;
  let fails = 0;
  let polls = 0;
  async function poll() {
    if (stopped) return;
    try {
      const url = `${CONFIG.SUPABASE_URL}/rest/v1/lamps?select=id,nickname&id=gt.${last}&order=id.asc`;
      const res = await fetch(url, { headers: headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      const initial = polls === 0;
      if (rows.length) last = rows[rows.length - 1].id;
      if (rows.length || initial) onLamps(rows, initial);
      // Every ~10 polls, check whether the table was reset.
      if (++polls % 10 === 0 && last > 0) {
        const r2 = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/lamps?select=id&order=id.desc&limit=1`,
          { headers: headers(), cache: 'no-store' });
        if (r2.ok) {
          const top = await r2.json();
          if (!top.length || top[0].id < last) { onReset && onReset(); return; }
        }
      }
      fails = 0;
      onStatus && onStatus(true);
    } catch {
      fails++;
      if (fails >= 3) onStatus && onStatus(false);
    }
    setTimeout(poll, CONFIG.POLL_MS);
  }
  poll();
  return { stop() { stopped = true; } };
}

// ---------- Local stand-in (same browser, for testing) ----------
const LKEY = 'lol_local_lamps';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('lake-of-lights') : null;

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch { return []; }
}

async function localLight(nickname, device) {
  await new Promise(r => setTimeout(r, 250 + Math.random() * 400)); // feel like a network
  const nick = cleanNickname(nickname);
  if (!nick) return { ok: false, error: 'bad_nickname' };
  if (isBlocked(nick)) return { ok: false, error: 'blocked_nickname' };
  const lamps = readLocal();
  const mine = lamps.find(l => l.device_id === device);
  if (mine) return { ok: true, lamp: mine.id, nickname: mine.nickname, repeat: true, total: CONFIG.TOTAL_LAMPS };
  if (lamps.length >= CONFIG.TOTAL_LAMPS) return { ok: false, error: 'full', total: CONFIG.TOTAL_LAMPS };
  const lamp = { id: lamps.length + 1, nickname: nick, device_id: device };
  lamps.push(lamp);
  localStorage.setItem(LKEY, JSON.stringify(lamps));
  channel && channel.postMessage({ type: 'lamp' });
  return { ok: true, lamp: lamp.id, nickname: nick, repeat: false, total: CONFIG.TOTAL_LAMPS };
}

export function resetLocal() {
  localStorage.removeItem(LKEY);
  channel && channel.postMessage({ type: 'reset' });
}

function watchLocal({ onLamps, onReset }) {
  let last = 0;
  let initial = true;
  const check = () => {
    const lamps = readLocal();
    if (lamps.length < last) { onReset && onReset(); return; }
    const fresh = lamps.filter(l => l.id > last).map(({ id, nickname }) => ({ id, nickname }));
    if (fresh.length) last = fresh[fresh.length - 1].id;
    if (fresh.length || initial) onLamps(fresh, initial);
    initial = false;
  };
  check();
  const iv = setInterval(check, 500);
  if (channel) channel.onmessage = check;
  window.addEventListener('storage', check);
  return { stop() { clearInterval(iv); } };
}
