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
  return (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CONFIG.NICK_MAX);
}

export function isBlocked(nick) {
  return CONFIG.BLOCKED.includes(nick) || CONFIG.BLOCKED_PARTS.some(w => nick.includes(w));
}

// fetch + read JSON, giving up after `ms` (a stalled mobile connection can
// otherwise hang a request forever).
async function getJSON(url, opts = {}, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- How many lamps tonight ----------
// Comes from the `settings` table in Supabase (change it in the Table Editor,
// no code needed). Local/demo testing can use ?count=50 in the address.
let currentTotal = CONFIG.TOTAL_LAMPS;
export function total() { return currentTotal; }

export async function loadTotal() {
  const mode = backendMode();
  const fromUrl = Number(params.get('count'));
  if (mode !== 'supabase') {
    if (fromUrl >= 1 && fromUrl <= 500) currentTotal = Math.round(fromUrl);
    return currentTotal;
  }
  for (let i = 0; i < 3; i++) {
    try {
      const rows = await getJSON(`${CONFIG.SUPABASE_URL}/rest/v1/settings?select=total_lamps&id=eq.1`, { headers: headers(), cache: 'no-store' });
      if (rows.length && rows[0].total_lamps >= 1) { currentTotal = rows[0].total_lamps; break; }
      break; // no settings row yet (old schema): keep the default
    } catch {
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return currentTotal;
}

// ---------- The join screen: who has joined, and is the lake open? ----------
// Calls a Supabase function; { missing: true } if the database is an older
// version without it (then everything behaves as before: the lake is open).
async function rpc(name, body, ms = 8000) {
  try {
    return await getJSON(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body || {}),
    }, ms);
  } catch (e) {
    if (String(e.message).includes('404')) return { missing: true };
    throw e;
  }
}

// { phase: 'gather'|'lake', total, start_at, auto, joined, lit }
export async function getState() {
  if (backendMode() !== 'supabase') return localState();
  const st = await rpc('lake_state');
  if (st.missing) return { phase: 'lake', total: currentTotal, start_at: 90, auto: false, joined: null, lit: null, legacy: true };
  if (st.total) currentTotal = st.total;
  return st;
}

// Guest joins with a nickname → { ok, phase, joined, total } or { ok:false, error }.
export async function joinLake(nickname, device = deviceId()) {
  if (backendMode() !== 'supabase') return localJoin(nickname, device);
  const r = await rpc('join_lake', { p_nickname: nickname, p_device: device });
  if (r.missing) return { ok: true, nickname: cleanNickname(nickname), phase: 'lake', joined: null, total: currentTotal, legacy: true };
  return r;
}

export async function joinLakeWithRetry(nickname, onRetry) {
  const waits = [600, 1000, 1500, 2500, 3500, 5000, 6000, 8000, 10000];
  let lastErr;
  for (let i = 0; i <= waits.length; i++) {
    try { return await joinLake(nickname); } catch (e) {
      lastErr = e;
      if (i === waits.length) break;
      onRetry && onRetry(i + 1);
      await new Promise(r => setTimeout(r, waits[i]));
    }
  }
  throw lastErr;
}

// Big screen: open the lake / back to the join screen (needs the operator key).
export async function setPhase(phase, key) {
  if (backendMode() !== 'supabase') {
    store.set(SKEY, { phase, auto: phase === 'lake' });
    channel && channel.postMessage({ type: 'state' });
    return { ok: true, phase };
  }
  const r = await rpc('set_phase', { p_key: key || '', p_phase: phase });
  if (r.missing) return { ok: false, error: 'old_database' };
  return r;
}

// Nicknames that joined after `since` (ISO time), oldest first.
export async function recentJoins(since) {
  if (backendMode() !== 'supabase') {
    return store.get(PKEY, []).filter(p => !since || p.joined_at > since).map(({ nickname, joined_at }) => ({ nickname, joined_at }));
  }
  const base = `${CONFIG.SUPABASE_URL}/rest/v1/participants?select=nickname,joined_at`;
  const url = since ? `${base}&joined_at=gt.${encodeURIComponent(since)}&order=joined_at.asc&limit=60` : `${base}&order=joined_at.desc&limit=12`;
  try {
    const rows = await getJSON(url, { headers: headers(), cache: 'no-store' });
    return since ? rows : rows.reverse();
  } catch { return []; }
}

// Calls onState(state) every `ms` (each check times out, never piles up).
export function watchState(onState, ms = 1500) {
  let stopped = false, busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try { onState(await getState()); } catch { /* try again next time */ }
    busy = false;
  };
  tick();
  const iv = setInterval(tick, ms);
  if (channel) channel.addEventListener('message', e => { if (e.data && (e.data.type === 'state' || e.data.type === 'reset')) tick(); });
  return { stop() { stopped = true; clearInterval(iv); }, now: tick };
}

// ---------- Guest: light a lamp ----------
// Returns { ok, lamp, nickname, repeat, total } or { ok:false, error }.
// Network failures throw, so the caller can retry.

export async function lightLamp(nickname, device = deviceId()) {
  const mode = backendMode();
  if (mode === 'local' || mode === 'demo') return localLight(nickname, device);
  // Safe to retry: the same phone asking again just gets its lamp back.
  return getJSON(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/light_lamp`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_nickname: nickname, p_device: device }),
  }, 10000);
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
  if (mode === 'demo') return { stop() {}, kick() {} }; // screen drives demo itself
  const base = `${CONFIG.SUPABASE_URL}/rest/v1/lamps`;
  const opts = { headers: headers(), cache: 'no-store' };
  let last = 0, lastCreated = null;
  let stopped = false, busy = false, timer = null;
  let fails = 0, polls = 0, lastStart = Date.now();

  const kick = (ms = 0) => { clearTimeout(timer); if (!stopped) timer = setTimeout(poll, ms); };

  async function poll() {
    if (stopped || busy) return;
    busy = true;
    lastStart = Date.now();
    try {
      const rows = await getJSON(`${base}?select=id,nickname,created_at&id=gt.${last}&order=id.asc`, opts);
      const initial = polls === 0;
      polls++;
      if (rows.length) {
        last = rows[rows.length - 1].id;
        lastCreated = rows[rows.length - 1].created_at;
      }
      if (rows.length || initial) {
        try { onLamps(rows, initial); } catch (e) { console.error(e); }
      }
      // Every ~10 checks: is our newest lamp still the same row? If not, the
      // ceremony was reset (even if new lamps have since reached the same number).
      if (polls % 10 === 0 && last > 0) {
        const chk = await getJSON(`${base}?select=created_at&id=eq.${last}`, opts);
        if (!chk.length || chk[0].created_at !== lastCreated) { onReset && onReset(); return; }
      }
      // Every ~10 checks: was the number of lamps changed in Supabase?
      if (polls % 10 === 5) {
        const st = await getJSON(`${CONFIG.SUPABASE_URL}/rest/v1/settings?select=total_lamps&id=eq.1`, opts).catch(() => null);
        const n = st && st.length ? st[0].total_lamps : null;
        if (Number.isInteger(n) && n !== currentTotal) { onReset && onReset(); return; }
      }
      fails = 0;
      onStatus && onStatus(true);
    } catch {
      fails++;
      if (fails >= 3) onStatus && onStatus(false);
    } finally {
      busy = false;
    }
    kick(CONFIG.POLL_MS);
  }

  // Watchdog: if checking has stopped for any reason, start it again.
  setInterval(() => {
    if (Date.now() - lastStart > 10000) { busy = false; kick(0); }
  }, 4000);
  // Check right away when the screen tab becomes visible again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(0); });

  kick(0);
  return { stop() { stopped = true; clearTimeout(timer); }, kick: () => { if (!busy) kick(0); } };
}

// ---------- Local stand-in (same browser, for testing) ----------
// ?local keeps everything in localStorage (guest + screen tabs share it);
// ?demo keeps it in memory (the screen plays on its own).
const LKEY = 'lol_local_lamps', PKEY = 'lol_local_people', SKEY = 'lol_local_phase';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('lake-of-lights') : null;
const mem = {};
const store = {
  get(k, d) {
    if (backendMode() === 'demo') return k in mem ? mem[k] : d;
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; }
  },
  set(k, v) {
    if (backendMode() === 'demo') mem[k] = v;
    else try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  },
};
const startAtDefault = () => Number(params.get('startat')) || CONFIG.START_AT_PERCENT || 90;

function readLocal() { return store.get(LKEY, []); }

function localState() {
  const st = store.get(SKEY, { phase: 'gather', auto: true });
  return { phase: st.phase, auto: st.auto, total: currentTotal, start_at: startAtDefault(), joined: store.get(PKEY, []).length, lit: readLocal().length };
}

async function localJoin(nickname, device) {
  if (backendMode() !== 'demo') await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
  const nick = cleanNickname(nickname);
  if (!nick) return { ok: false, error: 'bad_nickname' };
  if (isBlocked(nick)) return { ok: false, error: 'blocked_nickname' };
  const people = store.get(PKEY, []);
  const me = people.find(p => p.device_id === device);
  if (me) me.nickname = nick; else people.push({ device_id: device, nickname: nick, joined_at: new Date().toISOString() });
  store.set(PKEY, people);
  const st = store.get(SKEY, { phase: 'gather', auto: true });
  if (st.phase === 'gather' && st.auto && people.length >= Math.ceil(currentTotal * startAtDefault() / 100)) {
    st.phase = 'lake';
    store.set(SKEY, st);
  }
  channel && channel.postMessage({ type: 'state' });
  return { ok: true, nickname: nick, phase: st.phase, joined: people.length, total: currentTotal };
}

async function localLight(nickname, device) {
  await new Promise(r => setTimeout(r, 250 + Math.random() * 400)); // feel like a network
  const nick = cleanNickname(nickname);
  if (!nick) return { ok: false, error: 'bad_nickname' };
  if (isBlocked(nick)) return { ok: false, error: 'blocked_nickname' };
  const lamps = readLocal();
  const mine = lamps.find(l => l.device_id === device);
  if (mine) return { ok: true, lamp: mine.id, nickname: mine.nickname, repeat: true, total: currentTotal };
  if (localState().phase !== 'lake') return { ok: false, error: 'not_yet', total: currentTotal };
  if (lamps.length >= currentTotal) return { ok: false, error: 'full', total: currentTotal };
  const people = store.get(PKEY, []);
  if (!people.some(p => p.device_id === device)) {
    people.push({ device_id: device, nickname: nick, joined_at: new Date().toISOString() });
    store.set(PKEY, people);
  }
  const lamp = { id: lamps.length + 1, nickname: nick, device_id: device };
  lamps.push(lamp);
  store.set(LKEY, lamps);
  channel && channel.postMessage({ type: 'lamp' });
  return { ok: true, lamp: lamp.id, nickname: nick, repeat: false, total: currentTotal };
}

export function resetLocal() {
  for (const k of [LKEY, PKEY, SKEY]) { if (backendMode() === 'demo') delete mem[k]; else localStorage.removeItem(k); }
  channel && channel.postMessage({ type: 'reset' });
}

// ---------- Shakes: a guest shakes their phone → their lamp flutters ----------
// Phones send a tiny message through Supabase Realtime (no database use);
// the screen listens on a WebSocket.
const SHAKE_TOPIC = 'lake-shake';
let shakeBusy = false;
export const shakeStats = { sent: 0, failed: 0, last: '' };

export function sendShake(lamp, power) {
  const mode = backendMode();
  const payload = { l: lamp, p: Math.round(power * 100) / 100 };
  if (mode !== 'supabase') {
    channel && channel.postMessage({ type: 'shake', ...payload });
    shakeStats.sent++;
    return;
  }
  if (shakeBusy) return;
  shakeBusy = true;
  fetch(`${CONFIG.SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages: [{ topic: SHAKE_TOPIC, event: 'shake', payload, private: false }] }),
    keepalive: true,
  }).then(r => {
    shakeStats.last = String(r.status);
    if (r.ok) shakeStats.sent++; else shakeStats.failed++;
  }).catch(e => {
    shakeStats.failed++;
    shakeStats.last = e.message;
  }).finally(() => { shakeBusy = false; });
}

// Tell the screen right away that a lamp was lit (it then checks immediately).
export function notifyLit(lamp) {
  if (backendMode() !== 'supabase') return; // local mode already notifies
  fetch(`${CONFIG.SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages: [{ topic: SHAKE_TOPIC, event: 'lit', payload: { l: lamp }, private: false }] }),
    keepalive: true,
  }).catch(() => { /* polling still picks it up */ });
}

// onShake({l, p}); onLit({l}); onStatus(text) for the operator panel.
export function watchShakes({ onShake, onLit, onStatus }) {
  const mode = backendMode();
  if (mode === 'local') {
    channel && channel.addEventListener('message', e => {
      if (e.data && e.data.type === 'shake') onShake(e.data);
    });
    onStatus && onStatus('local');
    return { stop() {} };
  }
  if (mode !== 'supabase') return { stop() {} };
  const topic = `realtime:${SHAKE_TOPIC}`;
  const url = `${CONFIG.SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.SUPABASE_ANON_KEY)}&vsn=1.0.0`;
  let ws = null, hb = null, ref = 0, retry = 0, stopped = false;
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const connect = () => {
    onStatus && onStatus('connecting');
    try { ws = new WebSocket(url); } catch { schedule(); return; }
    ws.onopen = () => {
      const joinRef = String(++ref);
      send({
        topic, event: 'phx_join', ref: joinRef, join_ref: joinRef,
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false } },
      });
      clearInterval(hb);
      hb = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), 25000);
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic === topic && m.event === 'phx_reply' && m.payload) {
        if (m.payload.status === 'ok') { retry = 0; onStatus && onStatus('connected'); }
        else onStatus && onStatus(`refused: ${JSON.stringify(m.payload.response || {}).slice(0, 80)}`);
      } else if (m.event === 'broadcast' && m.payload && m.payload.event === 'shake') {
        onShake(m.payload.payload || {});
      } else if (m.event === 'broadcast' && m.payload && m.payload.event === 'lit') {
        onLit && onLit(m.payload.payload || {});
      } else if (m.topic === topic && (m.event === 'phx_error' || m.event === 'phx_close')) {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    ws.onclose = () => { clearInterval(hb); if (!stopped) schedule(); };
    ws.onerror = () => { onStatus && onStatus('connection error'); };
  };
  const schedule = () => {
    onStatus && onStatus('reconnecting');
    setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
  };
  connect();
  return { stop() { stopped = true; clearInterval(hb); ws && ws.close(); } };
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
  if (channel) channel.addEventListener('message', e => { if (!e.data || e.data.type !== 'shake') check(); });
  window.addEventListener('storage', check);
  return { stop() { clearInterval(iv); } };
}
