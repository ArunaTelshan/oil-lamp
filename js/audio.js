// All sound is generated live (WebAudio) — no audio files needed.
// Night ambience, a chime per lamp, milestone bells, a heartbeat for the
// final lamps, and a swelling chord for the WELCOME finale.

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];

export class LakeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastSparkle = 0;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // Reverb (generated impulse response): gives a big, open night feel.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.2, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet).connect(this.master);

    this.ambience();
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(seconds, brown = false) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  ambience() {
    const ctx = this.ctx;
    // Gentle water: brown noise, low-passed, slowly breathing.
    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuffer(8, true);
    water.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.08;
    lfo.connect(lfoAmt).connect(this.waterGain.gain);
    water.connect(lp).connect(this.waterGain).connect(this.master);
    water.start();
    lfo.start();

    // Warm drone that grows as the lake fills with light.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 700;
    for (const [f, g] of [[65.41, 0.5], [98.0, 0.35], [130.81, 0.25], [196.0, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(dlp);
      o.start();
    }
    dlp.connect(this.drone).connect(this.master);
    this.drone.connect(this.reverb);

    // Crickets: tiny chirps scheduled at random.
    const chirp = () => {
      if (!this.ctx) return;
      if (!this.crickets_off) this.cricket();
      setTimeout(chirp, 500 + Math.random() * 1600);
    };
    chirp();
  }

  cricket() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.frequency.value = 4300 + Math.random() * 500;
    o.connect(g).connect(pan).connect(this.master);
    const vol = 0.012 + Math.random() * 0.01;
    const pulses = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const s = t + i * 0.055;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.008);
      g.gain.linearRampToValueAtTime(0, s + 0.035);
    }
    o.start(t);
    o.stop(t + pulses * 0.055 + 0.05);
  }

  // Light level 0..1 → warmer drone, quieter crickets near the end.
  setLight(L) {
    if (!this.ctx) return;
    this.drone.gain.setTargetAtTime(0.05 * Math.pow(L, 0.8), this.ctx.currentTime, 1.5);
  }

  bell(freq, { when = 0, vol = 0.12, decay = 2.4, pan = 0, partials = [[1, 1], [2.0, 0.5], [2.76, 0.32], [4.07, 0.18], [5.4, 0.08]] } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(p);
    p.connect(this.master);
    p.connect(this.reverb);
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(ratio));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  whoosh(pan = 0, vol = 0.05) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp).connect(g).connect(p).connect(this.master);
    src.start(t);
  }

  // Spark rising from the audience.
  rise(pan) {
    if (!this.ctx || this.muted) return;
    this.whoosh(pan * 0.7, 0.035);
  }

  // A lamp catches fire.
  ignite(pan = 0, depth = 0.5) {
    if (!this.ctx || this.muted) return;
    const f = PENTA[Math.floor(Math.random() * PENTA.length)];
    this.bell(f, { vol: 0.07 + depth * 0.06, decay: 2.8, pan: pan * 0.8 });
    this.whoosh(pan * 0.8, 0.03);
  }

  // Deep temple-style bell at 35 / 70 / 105 lamps.
  milestone() {
    if (!this.ctx || this.muted) return;
    this.bell(98, { vol: 0.32, decay: 9, partials: [[1, 1], [2.0, 0.6], [2.4, 0.4], [3.0, 0.3], [4.2, 0.2], [5.9, 0.1]] });
    this.bell(196, { when: 0.02, vol: 0.12, decay: 6 });
  }

  // Low heartbeat for the last few lamps.
  heartbeat() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    for (const [dt, v] of [[0, 0.5], [0.24, 0.32]]) {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.4);
    }
  }

  // Short hush before the finale.
  hush(seconds = 2.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.waterGain.gain.setTargetAtTime(0.05, t, 0.4);
    this.crickets_off = true;
    setTimeout(() => {
      if (!this.ctx) return;
      this.waterGain.gain.setTargetAtTime(0.22, this.ctx.currentTime, 3);
    }, seconds * 1000 + 4000);
  }

  // The swelling chord as lamps drift into WELCOME.
  finale(duration = 11) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + duration * 0.8);
    g.gain.setValueAtTime(0.11, t + duration + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 26);
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    // C major add9, spread wide.
    const notes = [65.41, 130.81, 196.0, 261.63, 329.63, 392.0, 587.33];
    for (const f of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = f < 150 ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = f < 150 ? 0.5 : 0.16;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + duration + 27);
      }
    }
    // Final resolving bells when the word completes.
    setTimeout(() => {
      if (!this.ctx || this.muted) return;
      this.bell(130.81, { vol: 0.3, decay: 10, partials: [[1, 1], [2, 0.5], [3, 0.3], [4.2, 0.2]] });
      [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => this.bell(f, { when: 0.5 + i * 0.18, vol: 0.05, decay: 4, pan: -0.6 + i * 0.4 }));
    }, duration * 1000);
  }

  // Tiny chime as a lamp lands in its letter (rate-limited).
  sparkle(pan = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSparkle < 0.12) return;
    this.lastSparkle = now;
    const f = PENTA[Math.floor(Math.random() * PENTA.length)] * 2;
    this.bell(f, { vol: 0.025, decay: 1.6, pan });
  }

  // The skeleton: a low rumble as it rises, a bony click per step, a splash.
  rumble() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    const p = ctx.createStereoPanner(); p.pan.value = -0.7;
    src.connect(lp).connect(g).connect(p).connect(this.master);
    src.start(t);
  }

  rattle() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const s = t + i * 0.035;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(900 + Math.random() * 600, s);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.06, s + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
      const p = ctx.createStereoPanner(); p.pan.value = -0.6;
      o.connect(bp).connect(g).connect(p).connect(this.master);
      o.start(s); o.stop(s + 0.06);
    }
  }

  splash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const p = ctx.createStereoPanner(); p.pan.value = -0.5;
    src.connect(lp).connect(g).connect(p);
    p.connect(this.master); p.connect(this.reverb);
    src.start(t);
    // droplets falling back
    for (let i = 0; i < 7; i++) {
      const s = t + 0.25 + Math.random() * 0.9;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(900 + Math.random() * 900, s);
      o.frequency.exponentialRampToValueAtTime(1800 + Math.random() * 900, s + 0.05);
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, s);
      dg.gain.exponentialRampToValueAtTime(0.04, s + 0.005);
      dg.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      o.connect(dg).connect(p);
      o.start(s); o.stop(s + 0.1);
    }
  }

  // A witch's cackle: shrill, raspy "ha-ha-ha-haaa" bursts falling in pitch,
  // shaped by "ah" vowel formants, with breath noise on each syllable.
  cackle(pan = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const shaper = ctx.createWaveShaper();                 // a little rasp
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    shaper.connect(out).connect(p);
    p.connect(this.master); p.connect(this.reverb);
    const formants = [[850, 6, 1], [1250, 7, 0.6], [2700, 9, 0.35]];
    const noise = this.noiseBuffer(0.2);
    const n = 9;
    let s = t0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const dur = last ? 0.75 : 0.085 + Math.random() * 0.02;
      const f0 = (640 - i * 22) * (0.97 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.15, s);
      o.frequency.exponentialRampToValueAtTime(f0 * (last ? 0.62 : 0.85), s + dur);
      const lfo = ctx.createOscillator();                  // wobbly old voice
      lfo.frequency.value = last ? 7 : 24;
      const lg = ctx.createGain(); lg.gain.value = f0 * (last ? 0.05 : 0.025);
      lfo.connect(lg).connect(o.frequency);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, s);
      env.gain.exponentialRampToValueAtTime(last ? 0.5 : 0.6, s + 0.018);
      if (last) env.gain.setValueAtTime(0.5, s + 0.3);
      env.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      for (const [f, q, v] of formants) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const fg = ctx.createGain(); fg.gain.value = v;
        o.connect(bp).connect(fg).connect(env);
      }
      env.connect(shaper);
      // breathy "h" at the start of each syllable
      const h = ctx.createBufferSource(); h.buffer = noise;
      const hb = ctx.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 2200; hb.Q.value = 1.2;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, s - 0.03);
      hg.gain.exponentialRampToValueAtTime(0.25, s);
      hg.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
      h.connect(hb).connect(hg).connect(out);
      h.start(s - 0.03); h.stop(s + 0.08);
      o.start(s); o.stop(s + dur + 0.02);
      lfo.start(s); lfo.stop(s + dur + 0.02);
      s += dur + 0.04 + (i > 5 ? (i - 5) * 0.015 : 0);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
    return this.muted;
  }
}
