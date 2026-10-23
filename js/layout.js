// Shared layout: where each lamp floats, the order they fill in,
// and the WELCOME formation. Used by both the big screen and the guest
// page (for the "find your lamp" mini map), so both always agree.

export const HORIZON = 0.44;      // horizon height as a fraction of screen height
const LAKE_TOP = 0.50;            // nearest-to-horizon lamp row
const LAKE_BOTTOM = 0.93;         // nearest-to-viewer lamp row

// Small deterministic random generator (same seed → same layout).
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Perspective: lamps near the horizon are small, near the viewer large.
export function depthScale(yNorm) {
  const d = Math.max(0, Math.min(1, (yNorm - HORIZON) / (1 - HORIZON)));
  return 0.32 + 0.98 * Math.pow(d, 1.15);
}

// 140 lamp spots spread naturally over the lake, in normalized 0..1 coords.
// Spots are kept clear of the QR panel in the bottom-right corner.
export function makeSlots(seed, n) {
  const rand = rng(seed);
  const aspect = 4 / 3;
  const pts = [];
  let r = 0.085;
  let guard = 0;
  while (pts.length < n && guard < 200000) {
    guard++;
    const y = LAKE_TOP + Math.pow(rand(), 0.85) * (LAKE_BOTTOM - LAKE_TOP);
    const s = depthScale(y);
    const margin = 0.09 + 0.01 * s;     // clear of the foreground tree trunks
    const x = margin + rand() * (1 - 2 * margin);
    if (x > 0.80 && y > 0.74) continue; // QR panel area
    if (x < 0.27 && y > 0.82) continue; // pumpkin bank (bottom-left)
    if (x > 0.62 && y > 0.88) continue; // pumpkin bank (bottom-right)
    let ok = true;
    for (const p of pts) {
      const dx = (x - p.x) * aspect;
      // Vertical distances shrink with depth (water plane seen at an angle).
      const dy = (y - p.y) * 2.1;
      const need = r * (s + p.s) * 0.5;
      if (dx * dx + dy * dy < need * need) { ok = false; break; }
    }
    if (ok) pts.push({ x, y, s });
    if (guard % 4000 === 0) r *= 0.94; // loosen spacing until all fit
  }
  return pts;
}

// Order in which spots are filled: shuffled, so the lake fills organically.
// The very first lamp always lands near the middle of the lake.
export function makeOrder(seed, n, slots = makeSlots(seed, n)) {
  const rand = rng(seed * 7 + 3);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  let best = 0, bd = Infinity;
  a.forEach((si, k) => {
    const s = slots[si];
    if (!s) return;
    const d = Math.hypot(s.x - 0.5, (s.y - 0.72) * 1.5);
    if (d < bd) { bd = d; best = k; }
  });
  a.unshift(a.splice(best, 1)[0]);
  return a;
}

// ---------- WELCOME formation ----------
// Letters are drawn as simple strokes in units where letter height = 1
// (y = 0 is the top). Lamps are spaced evenly along all strokes.

function arc(cx, cy, rx, ry, a0, a1, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// Each glyph: width + list of strokes. A stroke with skipStart begins one
// spacing away from its first point (so it doesn't double up on a corner).
const GLYPHS = {
  W: { w: 1.12, strokes: [{ pts: [[0, 0], [0.27, 1], [0.56, 0.34], [0.85, 1], [1.12, 0]] }] },
  E: { w: 0.6, strokes: [
    { pts: [[0, 0], [0, 1]] },
    { pts: [[0, 0], [0.6, 0]], skipStart: true },
    { pts: [[0, 0.5], [0.48, 0.5]], skipStart: true },
    { pts: [[0, 1], [0.6, 1]], skipStart: true },
  ] },
  L: { w: 0.55, strokes: [{ pts: [[0, 0], [0, 1], [0.55, 1]] }] },
  C: { w: 0.82, strokes: [{ pts: arc(0.45, 0.5, 0.45, 0.5, -Math.PI * 0.27, -Math.PI * 1.73) }] },
  O: { w: 0.9, strokes: [{ pts: arc(0.45, 0.5, 0.45, 0.5, 0, Math.PI * 2, 60), closed: true }] },
  M: { w: 1.04, strokes: [{ pts: [[0, 1], [0, 0], [0.52, 0.66], [1.04, 0], [1.04, 1]] }] },
};
const GAP = 0.3;

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, d / seg) : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    d -= seg;
  }
  return pts[pts.length - 1];
}

// Returns n pixel positions spelling `word`, sized for a W×H screen.
export function wordTargets(word, n, W, H) {
  const strokes = [];
  let cursor = 0;
  for (const ch of word.toUpperCase()) {
    const g = GLYPHS[ch];
    if (!g) { cursor += 0.6; continue; }
    for (const s of g.strokes) {
      strokes.push({ ...s, pts: s.pts.map(([x, y]) => [x + cursor, y]) });
    }
    cursor += g.w + GAP;
  }
  const wordW = cursor - GAP;

  // Distribute n points across strokes by length (largest remainder).
  const lens = strokes.map(s => polyLength(s.pts));
  const total = lens.reduce((a, b) => a + b, 0);
  const raw = lens.map(l => (l / total) * n);
  const counts = raw.map(Math.floor);
  let left = n - counts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (left > 0) { counts[i]++; left--; } });

  const unitPts = [];
  strokes.forEach((s, i) => {
    const k = counts[i];
    const L = lens[i];
    for (let j = 0; j < k; j++) {
      let d;
      if (s.closed) d = (j / k) * L;
      else if (s.skipStart) d = ((j + 1) / k) * L;
      else d = k === 1 ? L / 2 : (j / (k - 1)) * L;
      unitPts.push(pointAt(s.pts, d));
    }
  });

  // Where two strokes meet at a sharp angle (bottom of W, middle of M),
  // lamps crowd together. Drop crowded ones and re-place them in the
  // emptiest spots along the letters.
  const step = total / n;
  const minD = step * 0.72;
  const kept = [];
  for (const p of unitPts) {
    if (kept.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) >= minD)) kept.push(p);
  }
  if (kept.length < n) {
    const cand = [];
    strokes.forEach((s, i) => {
      const k = Math.max(2, Math.ceil(lens[i] / (step / 8)));
      for (let j = 0; j <= k; j++) cand.push(pointAt(s.pts, (j / k) * lens[i]));
    });
    const dmin = cand.map(c => Math.min(...kept.map(q => Math.hypot(c[0] - q[0], c[1] - q[1]))));
    while (kept.length < n) {
      let bi = 0;
      for (let i = 1; i < cand.length; i++) if (dmin[i] > dmin[bi]) bi = i;
      const b = cand[bi];
      kept.push(b);
      for (let i = 0; i < cand.length; i++) {
        const d = Math.hypot(cand[i][0] - b[0], cand[i][1] - b[1]);
        if (d < dmin[i]) dmin[i] = d;
      }
    }
  }
  unitPts.length = 0;
  unitPts.push(...kept);

  // Lay the word flat on the water, in perspective: the top of the letters
  // is further away (narrower, smaller lamps), the bottom is closer (wider,
  // bigger lamps). k = lamp size factor at that spot (1 = nearest row).
  const D_FAR = 1.2;                 // how much further the top of the letters is
  const hyEff = -H * 0.2;            // gentle tilt: the word stays easy to read
  const yNear = H * 0.84;            // bottom of the letters
  const nearW = Math.min(W * 0.84, H * 1.25);
  return unitPts.map(([x, y]) => {
    const d = D_FAR + (1 - D_FAR) * y;          // y: 0 top (far) … 1 bottom (near)
    return {
      x: W / 2 + (x / wordW - 0.5) * nearW / d,
      y: hyEff + (yNear - hyEff) / d,
      k: 1 / d,
    };
  });
}

// Spacing between neighbouring lamps in the formation (pixels).
export function wordSpacing(word, n, W, H) {
  const p = wordTargets(word, n, W, H);
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    let best = Infinity;
    for (let j = 0; j < p.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / p.length;
}

// Optimal one-to-one matching (Hungarian algorithm) so lamps glide to the
// nearest letter spots without a chaotic tangle. Returns target index per lamp.
export function matchTargets(from, to) {
  const n = from.length;
  const INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  const cost = (i, j) => {
    const dx = from[i].x - to[j].x, dy = from[i].y - to[j].y;
    return dx * dx + dy * dy;
  };
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const result = new Array(n);
  for (let j = 1; j <= n; j++) result[p[j] - 1] = j - 1;
  return result;
}
