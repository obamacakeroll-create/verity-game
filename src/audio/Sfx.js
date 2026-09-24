// Synthesised sound effects. Each recipe builds a short-lived node graph.
export class Sfx {
  constructor(engine) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = distortionCurve(60);
  }

  dest(bus = 'sfx', position) {
    const b = this.e.buses[bus];
    if (!position) return b;
    const p = this.e.panner(position);
    p.connect(b);
    return p;
  }

  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  filt(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  noise(brown = false, rate = 1, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.e.brown : this.e.noise;
    s.loop = loop;
    s.playbackRate.value = rate;
    return s;
  }
  env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }
  start(nodes, t, dur) { for (const n of nodes) { n.start(t, n.buffer ? Math.random() * 1.5 : undefined); n.stop(t + dur + 0.05); } }

  // generic noise burst
  burst(t, { type = 'bandpass', f = 1000, q = 1, a = 0.002, d = 0.1, peak = 0.5, brown = false, out, rate = 1, sweep }) {
    const n = this.noise(brown, rate);
    const fl = this.filt(type, f, q);
    const g = this.gain(0);
    n.connect(fl).connect(g).connect(out);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    this.env(g, t, a, peak, d);
    this.start([n], t, a + d);
  }
  tone(t, { type = 'sine', f = 440, to, a = 0.005, d = 0.3, peak = 0.3, out, detune = 0, filter }) {
    const o = this.osc(type, f);
    o.detune.value = detune;
    const g = this.gain(0);
    if (filter) { const fl = this.filt(filter.type || 'lowpass', filter.f, filter.q || 1); o.connect(fl).connect(g); }
    else o.connect(g);
    g.connect(out);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    this.env(g, t, a, peak, d);
    this.start([o], t, a + d);
    return o;
  }

  play(name, opts = {}) {
    if (!this.e.ready) return;
    const t = this.ctx.currentTime + (opts.delay || 0);
    const out = this.dest(opts.bus || 'sfx', opts.position);
    const v = opts.volume ?? 1;
    const fn = this['s_' + name];
    if (fn) fn.call(this, t, out, v, opts);
  }

  // ---------------------------------------------------------------- recipes
  s_step(t, out, v, o) {
    const surf = o.surface || 'wood';
    const k = (o.intensity ?? 1) * v;
    if (surf === 'tile') {
      this.burst(t, { f: 2600, q: 2, d: 0.05, peak: 0.25 * k, out });
      this.tone(t, { f: 180, to: 90, d: 0.06, peak: 0.12 * k, out });
    } else if (surf === 'carpet') {
      this.burst(t, { type: 'lowpass', f: 380, d: 0.12, peak: 0.35 * k, out });
    } else {
      this.burst(t, { f: 600 + Math.random() * 400, q: 1.2, d: 0.08, peak: 0.28 * k, out });
      this.tone(t, { f: 95, to: 60, d: 0.09, peak: 0.25 * k, out });
      if (Math.random() < 0.18) this.s_creak(t + 0.02, out, 0.25 * k, { short: true });
    }
  }

  s_creak(t, out, v = 1, o = {}) {
    const dur = o.short ? 0.25 : (o.dur || 0.9);
    const f0 = (o.pitch || 1) * (160 + Math.random() * 60);
    const src = this.osc('sawtooth', f0);
    const lfo = this.osc('square', 25 + Math.random() * 20);
    const lg = this.gain(f0 * 0.12);
    lfo.connect(lg).connect(src.frequency);
    src.frequency.setValueAtTime(f0, t);
    src.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.2), t + dur * 0.5);
    src.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.3), t + dur);
    const bp = this.filt('bandpass', 900 + Math.random() * 500, 7);
    const g = this.gain(0);
    src.connect(bp).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.05);
    g.gain.setValueAtTime(0.18 * v, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.start([src, lfo], t, dur);
  }

  s_doorOpen(t, out, v) {
    this.s_click(t, out, 0.6 * v);
    this.s_creak(t + 0.08, out, v, { dur: 1.3, pitch: 0.8 });
  }
  s_doorClose(t, out, v) {
    this.s_creak(t, out, 0.5 * v, { dur: 0.35 });
    this.burst(t + 0.35, { type: 'lowpass', f: 300, d: 0.25, peak: 0.9 * v, out, brown: true });
    this.tone(t + 0.35, { f: 70, to: 40, d: 0.3, peak: 0.6 * v, out });
    this.s_click(t + 0.4, out, 0.7 * v);
  }
  s_slam(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 500, d: 0.5, peak: 1.2 * v, out, brown: true });
    this.tone(t, { f: 60, to: 30, d: 0.5, peak: 1.0 * v, out });
    this.s_click(t + 0.02, out, v);
  }
  s_locked(t, out, v) {
    for (let i = 0; i < 3; i++) {
      this.burst(t + i * 0.09, { type: 'highpass', f: 2500, d: 0.03, peak: 0.35 * v, out });
      this.tone(t + i * 0.09, { f: 140, to: 90, d: 0.05, peak: 0.25 * v, out });
    }
  }
  s_knock(t, out, v, o = {}) {
    const n = o.count || 3;
    const gap = o.gap || 0.3;
    for (let i = 0; i < n; i++) {
      const tt = t + i * gap + (Math.random() - 0.5) * 0.03;
      this.burst(tt, { type: 'lowpass', f: 260, d: 0.14, peak: 1.1 * v, out, brown: true });
      this.tone(tt, { f: 120, to: 70, d: 0.12, peak: 0.8 * v, out });
      this.burst(tt, { f: 1400, q: 3, d: 0.02, peak: 0.15 * v, out });
    }
  }
  s_click(t, out, v = 1) {
    this.tone(t, { type: 'square', f: 2200, d: 0.008, peak: 0.12 * v, out });
    this.burst(t, { type: 'highpass', f: 3000, d: 0.015, peak: 0.2 * v, out });
  }
  s_fuse(t, out, v) {
    this.s_slam(t, out, 0.6 * v);
    const s = this.osc('sawtooth', 120);
    const g = this.gain(0);
    s.connect(this.filt('lowpass', 900)).connect(g).connect(out);
    this.env(g, t + 0.05, 0.01, 0.25 * v, 0.5);
    this.start([s], t, 0.6);
    this.burst(t + 0.05, { type: 'highpass', f: 5000, d: 0.3, peak: 0.25 * v, out });
  }
  s_rustle(t, out, v, o = {}) {
    const dur = o.dur || 0.7;
    for (let i = 0; i < dur * 25; i++) {
      const tt = t + Math.random() * dur;
      this.burst(tt, { f: 1200 + Math.random() * 2000, q: 1.5, d: 0.02 + Math.random() * 0.04, peak: 0.12 * v, out });
    }
    this.burst(t, { f: 700, q: 0.8, a: 0.1, d: dur, peak: 0.08 * v, out });
  }
  s_flaps(t, out, v) {
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.15;
      this.burst(tt, { type: 'lowpass', f: 700, d: 0.14, peak: 0.6 * v, out });
      this.burst(tt, { f: 1800, q: 1, d: 0.05, peak: 0.2 * v, out });
    }
  }
  s_tapeRip(t, out, v) {
    this.burst(t, { type: 'bandpass', f: 1800, q: 0.7, a: 0.02, d: 0.45, peak: 0.45 * v, out, sweep: 4000 });
    for (let i = 0; i < 18; i++) this.burst(t + i * 0.025, { type: 'highpass', f: 3000, d: 0.01, peak: 0.12 * v, out });
  }
  s_whoosh(t, out, v, o = {}) {
    const d = o.dur || 0.8;
    const n = this.noise();
    const f = this.filt('bandpass', 300, 1.2);
    const g = this.gain(0);
    n.connect(f).connect(g).connect(out);
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + d * 0.45);
    f.frequency.exponentialRampToValueAtTime(400, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + d * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    this.start([n], t, d);
  }
  // Verity's "pop" out of the box: a warm rising chime that's just slightly wrong.
  s_emerge(t, out, v) {
    this.s_whoosh(t, out, 0.7 * v, { dur: 1 });
    const notes = [523.25, 659.25, 783.99, 1046.5, 1244.5];
    notes.forEach((f, i) => {
      this.tone(t + 0.3 + i * 0.09, { type: 'sine', f, d: 1.3, peak: 0.12 * v, out, detune: i === 4 ? 30 : 0 });
      this.tone(t + 0.3 + i * 0.09, { type: 'triangle', f: f * 2, d: 0.5, peak: 0.03 * v, out });
    });
  }
  s_static(t, out, v, o = {}) {
    const d = o.dur || 1.5;
    this.burst(t, { f: 2600, q: 0.6, a: 0.02, d, peak: 0.25 * v, out });
    for (let i = 0; i < d * 30; i++) this.burst(t + Math.random() * d, { type: 'highpass', f: 4000, d: 0.006, peak: 0.3 * v, out });
  }
  s_tune(t, out, v) {
    this.s_static(t, out, 0.7 * v, { dur: 1.2 });
    const o = this.osc('sine', 800);
    const g = this.gain(0);
    o.connect(g).connect(out);
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(900, t + 1.1);
    this.env(g, t, 0.05, 0.05 * v, 1.1);
    this.start([o], t, 1.2);
  }
  s_heartbeat(t, out, v) {
    for (const [dt, p] of [[0, 1], [0.24, 0.7]]) {
      this.tone(t + dt, { f: 58, to: 38, a: 0.01, d: 0.18, peak: 0.9 * v * p, out, filter: { f: 200 } });
    }
  }
  s_breath(t, out, v, o = {}) {
    const d = o.dur || 1.6;
    const n = this.noise();
    const f = this.filt('bandpass', o.inhale ? 1400 : 900, 0.9);
    const g = this.gain(0);
    n.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * v, t + d * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    this.start([n], t, d);
  }
  s_pant(t, out, v) {
    for (let i = 0; i < 4; i++) {
      this.s_breath(t + i * 0.6, out, v * 1.3, { dur: 0.32, inhale: true });
      this.s_breath(t + i * 0.6 + 0.3, out, v * 1.1, { dur: 0.3 });
    }
  }
  s_thunder(t, out, v) {
    this.burst(t, { type: 'highpass', f: 1500, d: 0.3, peak: 0.25 * v, out });
    const n = this.noise(true, 0.5);
    const f = this.filt('lowpass', 500, 0.7);
    const g = this.gain(0);
    n.connect(f).connect(g).connect(out);
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.3 * v, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    this.start([n], t, 5.6);
  }
  s_stinger(t, out, v) {
    const fr = [110, 116.5, 164.8, 349.2, 493.9, 987.8];
    const g = this.gain(0);
    const f = this.filt('lowpass', 5000);
    g.connect(f).connect(out);
    for (const x of fr) {
      const o = this.osc('sawtooth', x);
      o.detune.value = (Math.random() - 0.5) * 30;
      o.connect(g);
      this.start([o], t, 3.2);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    this.burst(t, { type: 'lowpass', f: 400, d: 0.6, peak: 1.0 * v, out, brown: true });
  }
  s_stingerSoft(t, out, v) {
    const g = this.gain(0);
    g.connect(out);
    for (const x of [1318.5, 1396.9, 1975.5, 2093]) {
      const o = this.osc('sine', x);
      o.connect(g);
      this.start([o], t, 4);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04 * v, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
  }
  s_glitch(t, out, v, o = {}) {
    const d = o.dur || 0.4;
    for (let i = 0; i < d * 40; i++) {
      this.tone(t + i * 0.025, { type: 'square', f: 80 + Math.random() * 1800, d: 0.02, peak: 0.05 * v, out });
    }
  }
  s_jumpscare(t, out, v) {
    const g = this.gain(0);
    const sh = this.ctx.createWaveShaper();
    sh.curve = distortionCurve(200);
    g.connect(sh).connect(out);
    for (const x of [220, 233, 311, 466, 698, 1397]) {
      const o = this.osc('sawtooth', x * 2);
      o.frequency.exponentialRampToValueAtTime(x * 0.7, t + 1.6);
      o.connect(g);
      this.start([o], t, 1.8);
    }
    const n = this.noise();
    const nf = this.filt('bandpass', 2500, 1.5);
    const lfo = this.osc('sine', 38);
    const lg = this.gain(900);
    lfo.connect(lg).connect(nf.frequency);
    n.connect(nf).connect(g);
    this.start([n, lfo], t, 1.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.02);
    g.gain.setValueAtTime(0.5 * v, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    this.burst(t, { type: 'lowpass', f: 300, d: 0.8, peak: 1.5 * v, out, brown: true });
  }
  s_monsterStep(t, out, v, o = {}) {
    const k = v * (0.6 + (o.run || 0) * 0.6);
    this.tone(t, { f: 55, to: 32, d: 0.22, peak: 0.9 * k, out });
    this.burst(t, { type: 'lowpass', f: 180, d: 0.2, peak: 0.8 * k, out, brown: true });
    if (Math.random() < 0.5) this.s_bones(t + 0.04, out, 0.5 * v);
  }
  s_bones(t, out, v) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 0.25;
      this.burst(tt, { type: 'highpass', f: 2500 + Math.random() * 2000, d: 0.012, peak: 0.4 * v, out });
      this.tone(tt, { type: 'triangle', f: 400 + Math.random() * 600, d: 0.015, peak: 0.1 * v, out });
    }
  }
  s_growl(t, out, v, o = {}) {
    const d = o.dur || 1.6;
    const n = this.noise(true);
    const f = this.filt('bandpass', 260, 3);
    const am = this.osc('sawtooth', 31);
    const amg = this.gain(0.5);
    const g = this.gain(0);
    const vca = this.gain(0.5);
    am.connect(amg).connect(vca.gain);
    n.connect(f).connect(vca).connect(g).connect(out);
    f.frequency.setValueAtTime(220, t);
    f.frequency.linearRampToValueAtTime(420, t + d * 0.6);
    f.frequency.linearRampToValueAtTime(180, t + d);
    this.env(g, t, 0.2, 1.6 * v, d);
    this.start([n, am], t, d + 0.2);
  }
  s_whisper(t, out, v, o = {}) {
    const syl = o.syllables || 8;
    for (let i = 0; i < syl; i++) {
      const tt = t + i * (0.13 + Math.random() * 0.08);
      const f = [1100, 1700, 2400, 2900][Math.floor(Math.random() * 4)];
      this.burst(tt, { f, q: 6, a: 0.02, d: 0.09 + Math.random() * 0.06, peak: 0.3 * v, out });
      if (Math.random() < 0.4) this.burst(tt, { type: 'highpass', f: 5000, a: 0.01, d: 0.06, peak: 0.15 * v, out });
    }
  }
  s_laugh(t, out, v, o = {}) {
    const n = o.count || 5;
    const f0 = o.pitch || 230;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.2;
      const s = this.osc('sawtooth', f0 * (1 - i * 0.02));
      const f1 = this.filt('bandpass', 750, 6), f2 = this.filt('bandpass', 1200, 6);
      const g = this.gain(0);
      s.connect(f1).connect(g);
      s.connect(f2).connect(g);
      g.connect(out);
      this.env(g, tt, 0.02, 0.4 * v, 0.14);
      this.start([s], tt, 0.18);
      this.burst(tt, { f: 1500, q: 2, a: 0.01, d: 0.05, peak: 0.08 * v, out });
    }
  }
  s_drip(t, out, v) { this.tone(t, { f: 1400 + Math.random() * 500, to: 500, d: 0.06, peak: 0.12 * v, out }); }
  s_pickup(t, out, v) {
    this.tone(t, { f: 660, d: 0.5, peak: 0.08 * v, out });
    this.tone(t + 0.07, { f: 990, d: 0.6, peak: 0.06 * v, out });
    this.s_rustle(t, out, 0.3 * v, { dur: 0.2 });
  }
  s_paper(t, out, v) { this.s_rustle(t, out, 0.8 * v, { dur: 0.35 }); }
  s_chime(t, out, v, o = {}) {
    const n = o.count || 3;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 1.6;
      for (const [r, p] of [[1, 0.3], [2.76, 0.12], [5.4, 0.06], [0.5, 0.18]]) this.tone(tt, { f: 392 * r, d: 3, peak: p * v, out, a: 0.004 });
    }
  }
  s_tapeClick(t, out, v) {
    this.s_click(t, out, v);
    this.burst(t + 0.05, { type: 'lowpass', f: 600, d: 0.08, peak: 0.3 * v, out });
    this.tone(t + 0.2, { type: 'sawtooth', f: 60, to: 90, d: 0.4, peak: 0.03 * v, out, filter: { f: 300 } });
  }
  s_musicNote(t, out, v, o = {}) {
    const f = o.f || 440;
    this.tone(t, { type: 'sine', f, d: o.d || 1.2, peak: 0.12 * v, out, detune: o.detune || 0 });
    this.tone(t, { type: 'triangle', f: f * 3, d: 0.25, peak: 0.02 * v, out, detune: o.detune || 0 });
  }
  s_squelch(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 400, d: 0.3, peak: 0.6 * v, out, brown: true, sweep: 120 });
    this.s_bones(t + 0.1, out, 0.8 * v);
  }
  s_crack(t, out, v) {
    this.s_bones(t, out, 1.2 * v);
    this.burst(t, { type: 'highpass', f: 1800, d: 0.18, peak: 0.6 * v, out });
    this.tone(t, { type: 'square', f: 90, to: 40, d: 0.2, peak: 0.2 * v, out });
  }

  // ---------------------------------------------------------------- loops
  loop(name, opts = {}) {
    if (!this.e.ready) return { stop() {}, set() {} };
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this.dest(opts.bus || 'amb', opts.position);
    const g = this.gain(0);
    g.connect(out);
    const nodes = [];
    const vol = opts.volume ?? 1;
    if (name === 'rain') {
      const n = this.noise();
      const hp = this.filt('highpass', 500), lp = this.filt('lowpass', 2600);
      n.connect(hp).connect(lp).connect(g);
      const n2 = this.noise(true);
      const lp2 = this.filt('lowpass', 300);
      const g2 = this.gain(0.5);
      n2.connect(lp2).connect(g2).connect(g);
      nodes.push(n, n2);
    } else if (name === 'room') {
      const n = this.noise(true, 0.6);
      n.connect(this.filt('lowpass', 140)).connect(g);
      const hum = this.osc('sine', 50);
      const hg = this.gain(0.08);
      hum.connect(hg).connect(g);
      nodes.push(n, hum);
    } else if (name === 'buzz') {
      const s = this.osc('sawtooth', 120);
      s.connect(this.filt('lowpass', 500)).connect(g);
      nodes.push(s);
    } else if (name === 'static') {
      const n = this.noise();
      n.connect(this.filt('bandpass', 2400, 0.6)).connect(g);
      nodes.push(n);
    } else if (name === 'hiss') {
      const n = this.noise();
      n.connect(this.filt('highpass', 3500)).connect(g);
      nodes.push(n);
    } else if (name === 'breathing') {
      const n = this.noise(true);
      const f = this.filt('bandpass', 320, 2);
      const lfo = this.osc('sine', 0.35);
      const lg = this.gain(0.5);
      const vca = this.gain(0.5);
      lfo.connect(lg).connect(vca.gain);
      n.connect(f).connect(vca).connect(g);
      nodes.push(n, lfo);
    } else if (name === 'tinnitus') {
      const s = this.osc('sine', 7400);
      s.connect(g);
      nodes.push(s);
    }
    for (const n of nodes) n.start(t);
    g.gain.setTargetAtTime(vol, t, opts.fade ?? 0.5);
    const h = {
      gain: g,
      set: (v, time = 0.3) => g.gain.setTargetAtTime(v, ctx.currentTime, time),
      stop: (fade = 0.5) => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
        for (const n of nodes) n.stop(ctx.currentTime + fade + 0.1);
      },
      pos: (p) => { if (out.positionX) this.e.setPannerPos(out, p); },
    };
    return h;
  }
}

export function distortionCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return c;
}
