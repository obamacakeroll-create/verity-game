import { Sfx, distortionCurve } from '../../audio/Sfx.js';

// Part two's extra synthesized sounds (all Web Audio, no samples).
export class SfxII extends Sfx {
  play(name, opts = {}) {
    if (!this.e.ready) return;
    const t = this.ctx.currentTime + (opts.delay || 0);
    const out = opts.position ? this.e.dest3d(opts.bus || 'sfx', opts.position, opts.occluded) : this.e.buses[opts.bus || 'sfx'];
    const v = opts.volume ?? 1;
    const fn = this['s_' + name];
    if (fn) fn.call(this, t, out, v, opts);
  }

  // ---------------------------------------------------------------- footsteps
  s_step(t, out, v, o) {
    const surf = o.surface || 'concrete';
    const k = (o.intensity ?? 1) * v;
    const r = Math.random();
    switch (surf) {
      case 'carpet':
        this.burst(t, { type: 'lowpass', f: 420, d: 0.13, peak: 0.3 * k, out, brown: true });
        this.burst(t + 0.01, { f: 900, q: 0.8, d: 0.05, peak: 0.05 * k, out });
        break;
      case 'tile':
        this.burst(t, { f: 2900 + r * 600, q: 2.5, d: 0.04, peak: 0.26 * k, out });
        this.tone(t, { f: 210, to: 110, d: 0.05, peak: 0.1 * k, out });
        this.burst(t + 0.05, { f: 3800, q: 3, d: 0.03, peak: 0.08 * k, out });
        break;
      case 'metal':
        this.burst(t, { f: 1400 + r * 300, q: 4, d: 0.08, peak: 0.3 * k, out });
        for (const f of [412, 689, 1133]) this.tone(t, { f: f * (0.97 + r * 0.06), d: 0.35, peak: 0.03 * k, out });
        this.tone(t, { f: 90, to: 55, d: 0.12, peak: 0.25 * k, out });
        break;
      case 'grate':
        for (let i = 0; i < 3; i++) this.burst(t + i * 0.018, { f: 2200 + r * 800, q: 5, d: 0.03, peak: 0.16 * k, out });
        this.tone(t, { f: 140, to: 80, d: 0.1, peak: 0.15 * k, out });
        break;
      case 'puddle':
        this.burst(t, { f: 1600, q: 0.7, d: 0.16, peak: 0.28 * k, out, sweep: 700 });
        this.burst(t + 0.03, { type: 'highpass', f: 3000, d: 0.12, peak: 0.1 * k, out });
        this.tone(t, { f: 110, to: 70, d: 0.08, peak: 0.12 * k, out });
        break;
      case 'frost':
        for (let i = 0; i < 5; i++) this.burst(t + i * 0.012 + Math.random() * 0.01, { type: 'highpass', f: 2500 + Math.random() * 2500, d: 0.02, peak: 0.1 * k, out });
        this.burst(t, { type: 'lowpass', f: 500, d: 0.1, peak: 0.2 * k, out, brown: true });
        break;
      case 'wood':
        this.burst(t, { f: 600 + r * 400, q: 1.2, d: 0.08, peak: 0.28 * k, out });
        this.tone(t, { f: 95, to: 60, d: 0.09, peak: 0.25 * k, out });
        if (r < 0.2) this.s_creak(t + 0.02, out, 0.25 * k, { short: true });
        break;
      case 'asphalt':
        this.burst(t, { f: 1100, q: 0.9, d: 0.06, peak: 0.22 * k, out });
        this.burst(t, { type: 'highpass', f: 4000, d: 0.08, peak: 0.06 * k, out });
        break;
      default: // concrete
        this.burst(t, { f: 1500 + r * 500, q: 1.4, d: 0.05, peak: 0.26 * k, out });
        this.burst(t + 0.004, { type: 'highpass', f: 4200, d: 0.03, peak: 0.07 * k, out });
        this.tone(t, { f: 120, to: 70, d: 0.07, peak: 0.2 * k, out });
    }
  }

  // ---------------------------------------------------------------- devices
  s_intercom(t, out, v) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.7;
      const o = this.osc('square', 440);
      const o2 = this.osc('square', 453);
      const f = this.filt('bandpass', 900, 2);
      const g = this.gain(0);
      o.connect(f); o2.connect(f); f.connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.25 * v, tt + 0.01);
      g.gain.setValueAtTime(0.25 * v, tt + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.55);
      this.start([o, o2], tt, 0.6);
    }
  }
  s_phoneRing(t, out, v) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.45;
      const a = this.osc('sine', 440), b = this.osc('sine', 480);
      const am = this.osc('square', 20);
      const amg = this.gain(0.5);
      const vca = this.gain(0.5);
      am.connect(amg).connect(vca.gain);
      const g = this.gain(0);
      a.connect(vca); b.connect(vca); vca.connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.18 * v, tt + 0.01);
      g.gain.setValueAtTime(0.18 * v, tt + 0.38);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.4);
      this.start([a, b, am], tt, 0.42);
    }
  }
  s_beep(t, out, v, o = {}) { this.tone(t, { type: 'square', f: o.f || 1800, d: o.d || 0.07, peak: 0.1 * v, out, filter: { f: 3000 } }); }
  s_keypad(t, out, v, o = {}) {
    const rows = [697, 770, 852, 941], cols = [1209, 1336, 1477];
    const d = o.digit ?? Math.floor(Math.random() * 10);
    const r = d === 0 ? 3 : Math.floor((d - 1) / 3), c = d === 0 ? 1 : (d - 1) % 3;
    this.tone(t, { f: rows[r], d: 0.12, peak: 0.08 * v, out });
    this.tone(t, { f: cols[c], d: 0.12, peak: 0.08 * v, out });
  }
  s_keypadBad(t, out, v) { for (let i = 0; i < 3; i++) this.tone(t + i * 0.12, { type: 'square', f: 220, d: 0.09, peak: 0.12 * v, out, filter: { f: 1200 } }); }
  s_keypadGood(t, out, v) {
    this.tone(t, { type: 'square', f: 1320, d: 0.08, peak: 0.08 * v, out, filter: { f: 4000 } });
    this.tone(t + 0.1, { type: 'square', f: 1760, d: 0.14, peak: 0.08 * v, out, filter: { f: 4000 } });
    this.s_latch(t + 0.2, out, v);
  }
  s_latch(t, out, v) {
    this.burst(t, { f: 2600, q: 3, d: 0.03, peak: 0.4 * v, out });
    this.burst(t + 0.05, { type: 'lowpass', f: 700, d: 0.08, peak: 0.5 * v, out });
    this.tone(t + 0.05, { f: 160, to: 90, d: 0.08, peak: 0.25 * v, out });
  }
  s_card(t, out, v) { this.s_beep(t, out, v, { f: 2100, d: 0.09 }); this.s_latch(t + 0.18, out, v * 0.8); }
  s_breaker(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 900, d: 0.12, peak: 1.0 * v, out, brown: true });
    this.burst(t, { f: 3000, q: 2, d: 0.03, peak: 0.5 * v, out });
    this.tone(t, { f: 70, to: 45, d: 0.25, peak: 0.5 * v, out });
  }
  s_powerUp(t, out, v) {
    const o = this.osc('sawtooth', 40);
    o.frequency.setValueAtTime(40, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.6);
    const f = this.filt('lowpass', 300);
    const g = this.gain(0);
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    this.start([o], t, 2.1);
    for (let i = 0; i < 6; i++) this.s_fluoTick(t + 0.3 + i * (0.08 + Math.random() * 0.2), out, v * 0.7);
  }
  s_powerDown(t, out, v) {
    const o = this.osc('sawtooth', 120);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(25, t + 1.4);
    const f = this.filt('lowpass', 400);
    const g = this.gain(0);
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.3 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    this.start([o], t, 1.6);
    this.s_breaker(t, out, v * 0.6);
  }
  s_fluoTick(t, out, v) {
    this.burst(t, { f: 3500, q: 1.5, d: 0.015, peak: 0.25 * v, out });
    this.tone(t, { type: 'square', f: 120, d: 0.06, peak: 0.05 * v, out, filter: { f: 900 } });
  }
  s_sparks(t, out, v) {
    for (let i = 0; i < 10; i++) {
      const tt = t + Math.random() * 0.5;
      this.burst(tt, { type: 'highpass', f: 3000 + Math.random() * 4000, d: 0.015 + Math.random() * 0.03, peak: (0.2 + Math.random() * 0.4) * v, out });
    }
    this.tone(t, { type: 'sawtooth', f: 60, d: 0.4, peak: 0.1 * v, out, filter: { f: 500 } });
  }
  s_ding(t, out, v) {
    for (const [f, d] of [[1318.5, 1.8], [1046.5, 2.2]]) {
      this.tone(t + (f < 1200 ? 0.35 : 0), { f, d, peak: 0.12 * v, out });
      this.tone(t + (f < 1200 ? 0.35 : 0), { f: f * 2.76, d: d * 0.4, peak: 0.02 * v, out });
    }
  }
  s_alarm(t, out, v, o = {}) {
    const dur = o.dur || 4;
    const s = this.osc('sawtooth', 700);
    for (let k = 0; k < dur / 0.6; k++) {
      s.frequency.setValueAtTime(700, t + k * 0.6);
      s.frequency.linearRampToValueAtTime(1150, t + k * 0.6 + 0.3);
      s.frequency.linearRampToValueAtTime(700, t + k * 0.6 + 0.6);
    }
    const f = this.filt('bandpass', 1100, 1.5);
    const g = this.gain(0);
    s.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.05);
    g.gain.setValueAtTime(0.25 * v, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.start([s], t, dur + 0.05);
  }
  s_tvOn(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 180, d: 0.25, peak: 0.9 * v, out, brown: true });
    this.tone(t, { f: 15734 / 2, d: 1.8, peak: 0.02 * v, out });
    this.s_static(t + 0.05, out, v * 0.6, { dur: 0.6 });
  }
  s_camBeep(t, out, v) { this.tone(t, { type: 'square', f: 2600, d: 0.05, peak: 0.05 * v, out, filter: { f: 5000 } }); }
  s_camZoom(t, out, v) {
    const o = this.osc('sawtooth', 320);
    o.frequency.linearRampToValueAtTime(380, t + 0.25);
    const f = this.filt('bandpass', 1400, 4);
    const g = this.gain(0);
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    this.start([o], t, 0.3);
  }
  s_nvOn(t, out, v) {
    const o = this.osc('sine', 3000);
    o.frequency.setValueAtTime(2000, t);
    o.frequency.exponentialRampToValueAtTime(12000, t + 0.7);
    const g = this.gain(0);
    o.connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04 * v, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    this.start([o], t, 1);
    this.s_click(t, out, 0.5 * v);
  }
  s_battery(t, out, v) { this.s_click(t, out, v); this.burst(t + 0.1, { f: 2000, q: 2, d: 0.04, peak: 0.3 * v, out }); this.s_camBeep(t + 0.3, out, v); }

  // ---------------------------------------------------------------- doors & physics
  s_metalDoor(t, out, v) {
    this.s_latch(t, out, v);
    this.s_creak(t + 0.1, out, 0.6 * v, { dur: 1.1, pitch: 0.55 });
    for (const f of [180, 263, 347]) this.tone(t + 0.05, { f, d: 1.2, peak: 0.02 * v, out });
  }
  s_metalSlam(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 1200, d: 0.4, peak: 1.2 * v, out, brown: true });
    for (const f of [121, 197, 283, 419]) this.tone(t, { f, d: 1.6, peak: 0.06 * v, out });
    this.tone(t, { f: 55, to: 35, d: 0.5, peak: 0.8 * v, out });
  }
  s_glassDoor(t, out, v) {
    this.s_latch(t, out, v * 0.6);
    this.burst(t + 0.05, { f: 4000, q: 6, d: 0.3, peak: 0.08 * v, out });
    this.burst(t + 0.2, { type: 'lowpass', f: 400, d: 0.6, peak: 0.1 * v, out });
  }
  s_freezerDoor(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 250, d: 0.3, peak: 1.0 * v, out, brown: true });
    this.burst(t + 0.1, { type: 'highpass', f: 2500, d: 1.2, peak: 0.12 * v, out }); // seal hiss
    this.s_latch(t, out, v);
  }
  s_rollerDoor(t, out, v, o = {}) {
    const dur = o.dur || 3;
    for (let i = 0; i < dur / 0.07; i++) this.burst(t + i * 0.07, { f: 900 + Math.random() * 600, q: 3, d: 0.05, peak: 0.12 * v, out });
    const m = this.osc('sawtooth', 50);
    const g = this.gain(0);
    m.connect(this.filt('lowpass', 200)).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15 * v, t + 0.2);
    g.gain.setValueAtTime(0.15 * v, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.start([m], t, dur);
  }
  s_locker(t, out, v) {
    this.burst(t, { f: 900, q: 3, d: 0.2, peak: 0.5 * v, out });
    for (const f of [311, 467, 733]) this.tone(t, { f, d: 0.8, peak: 0.04 * v, out });
    this.s_click(t + 0.05, out, v);
  }
  s_box(t, out, v) {
    this.burst(t, { f: 700, q: 0.8, d: 0.15, peak: 0.5 * v, out, brown: true });
    this.burst(t + 0.05, { type: 'highpass', f: 2000, d: 0.25, peak: 0.15 * v, out });
  }
  s_tape(t, out, v) {
    this.burst(t, { type: 'highpass', f: 2500, d: 0.6, peak: 0.25 * v, out, sweep: 5000 });
    this.burst(t + 0.62, { type: 'highpass', f: 3500, d: 0.05, peak: 0.3 * v, out });
  }
  s_can(t, out, v) {
    this.burst(t, { f: 3200, q: 5, d: 0.05, peak: 0.6 * v, out });
    for (const f of [1870, 2690, 3740]) this.tone(t, { f: f * (0.95 + Math.random() * 0.1), d: 0.3, peak: 0.03 * v, out });
  }
  s_bounce(t, out, v) {
    this.tone(t, { f: 260 + Math.random() * 80, to: 180, d: 0.08, peak: 0.25 * v, out });
    this.burst(t, { f: 1800, q: 2, d: 0.03, peak: 0.15 * v, out });
  }
  s_glass(t, out, v) {
    for (let i = 0; i < 14; i++) this.burst(t + Math.random() * 0.4, { type: 'highpass', f: 3500 + Math.random() * 5000, d: 0.04 + Math.random() * 0.1, peak: (0.1 + Math.random() * 0.3) * v, out });
    this.burst(t, { type: 'lowpass', f: 1500, d: 0.2, peak: 0.6 * v, out });
  }
  s_thud(t, out, v) {
    this.burst(t, { type: 'lowpass', f: 250, d: 0.3, peak: 1.0 * v, out, brown: true });
    this.tone(t, { f: 60, to: 35, d: 0.3, peak: 0.7 * v, out });
  }
  s_collapse(t, out, v) {
    for (let i = 0; i < 16; i++) {
      const tt = t + i * 0.09 + Math.random() * 0.05;
      this.burst(tt, { type: 'lowpass', f: 400 + Math.random() * 800, d: 0.3, peak: (0.6 + Math.random() * 0.5) * v, out, brown: true });
      if (i % 3 === 0) for (const f of [97, 161, 233]) this.tone(tt, { f: f * (0.9 + Math.random() * 0.2), d: 0.9, peak: 0.05 * v, out });
    }
  }

  // ---------------------------------------------------------------- creatures
  s_skitter(t, out, v) {
    const n = 8 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.03 + Math.random() * 0.04);
      this.burst(tt, { f: 2400 + Math.random() * 1800, q: 6, d: 0.012, peak: (0.2 + Math.random() * 0.25) * v, out });
      this.tone(tt, { type: 'square', f: 700 + Math.random() * 400, d: 0.01, peak: 0.02 * v, out, filter: { f: 3000 } });
    }
  }
  s_click3(t, out, v) { for (let i = 0; i < 3; i++) this.burst(t + i * 0.06, { f: 3000, q: 8, d: 0.01, peak: 0.35 * v, out }); }
  s_faceTurn(t, out, v) {
    this.burst(t, { f: 1800, q: 4, d: 0.12, peak: 0.25 * v, out, sweep: 900 });
    this.s_click3(t + 0.1, out, v * 0.7);
  }
  s_giggle(t, out, v) {
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.13;
      const o = this.osc('triangle', 700 - i * 30);
      const f = this.filt('bandpass', 1400, 3);
      const g = this.gain(0);
      o.connect(f).connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.1 * v, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
      this.start([o], tt, 0.12);
    }
  }
  s_monsterBreath(t, out, v) {
    const n = this.noise(true);
    const f = this.filt('bandpass', 280, 3);
    const sh = this.ctx.createWaveShaper();
    sh.curve = distortionCurve(80);
    const g = this.gain(0);
    n.connect(f).connect(sh).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    this.start([n], t, 1.9);
  }
  s_screech(t, out, v) {
    for (const f of [1244, 1318, 1760, 2489]) {
      const o = this.osc('sawtooth', f);
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.7, t + 1.2);
      const vib = this.osc('sine', 9);
      const vg = this.gain(f * 0.03);
      vib.connect(vg).connect(o.frequency);
      const bp = this.filt('bandpass', f, 4);
      const g = this.gain(0);
      o.connect(bp).connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      this.start([o, vib], t, 1.35);
    }
  }

  // ---------------------------------------------------------------- vehicle
  s_carDoor(t, out, v) {
    this.s_latch(t, out, v);
    this.burst(t + 0.02, { type: 'lowpass', f: 300, d: 0.35, peak: 1.0 * v, out, brown: true });
    this.tone(t + 0.02, { f: 80, to: 50, d: 0.3, peak: 0.5 * v, out });
  }
  s_ignition(t, out, v) {
    for (let i = 0; i < 6; i++) this.burst(t + i * 0.11, { type: 'lowpass', f: 600, d: 0.09, peak: 0.5 * v, out, brown: true });
    this.tone(t + 0.7, { type: 'sawtooth', f: 45, to: 32, d: 0.8, peak: 0.25 * v, out, filter: { f: 400 } });
  }
  s_indicator(t, out, v) { this.burst(t, { f: 2000, q: 6, d: 0.02, peak: 0.25 * v, out }); this.burst(t + 0.38, { f: 1600, q: 6, d: 0.02, peak: 0.2 * v, out }); }
  s_wiper(t, out, v) { this.burst(t, { f: 1300, q: 1.5, d: 0.45, peak: 0.06 * v, out, sweep: 900 }); this.s_click(t + 0.46, out, 0.2 * v); }

  // ---------------------------------------------------------------- loops (extends part one's)
  loop(name, opts = {}) {
    const base = ['rain', 'room', 'buzz', 'static', 'hiss', 'breathing', 'tinnitus'];
    if (base.includes(name) || !this.e.ready) return super.loop(name, opts);
    const ctx = this.ctx, t = ctx.currentTime;
    const out = opts.position ? this.e.dest3d(opts.bus || 'amb', opts.position, opts.occluded) : this.e.buses[opts.bus || 'amb'];
    const g = this.gain(0);
    g.connect(out);
    const nodes = [];
    const timers = [];
    const vol = opts.volume ?? 1;
    const add = (...n) => nodes.push(...n);
    switch (name) {
      case 'roofRain': {
        const n = this.noise(); n.connect(this.filt('bandpass', 1400, 0.4)).connect(g);
        const n2 = this.noise(true); const g2 = this.gain(1.2); n2.connect(this.filt('lowpass', 180)).connect(g2).connect(g);
        add(n, n2);
        timers.push(setInterval(() => { if (Math.random() < 0.5) this.s_drip(ctx.currentTime, g, 0.2); }, 180));
        break;
      }
      case 'fluoro': {
        for (const [f, a] of [[120, 0.05], [240, 0.03], [360, 0.015], [7800, 0.004]]) { const o = this.osc(f > 1000 ? 'sine' : 'sawtooth', f); const og = this.gain(a); o.connect(this.filt('lowpass', 2000)).connect(og).connect(g); add(o); }
        break;
      }
      case 'machine': {
        const o = this.osc('sawtooth', 48); const og = this.gain(0.12); o.connect(this.filt('lowpass', 220)).connect(og).connect(g);
        const o2 = this.osc('square', 96.5); const og2 = this.gain(0.03); o2.connect(this.filt('lowpass', 600)).connect(og2).connect(g);
        const n = this.noise(true); const ng = this.gain(0.4); n.connect(this.filt('lowpass', 300)).connect(ng).connect(g);
        add(o, o2, n);
        break;
      }
      case 'printer': {
        const o = this.osc('square', 330); const f = this.filt('bandpass', 900, 5); const og = this.gain(0.02); o.connect(f).connect(og).connect(g); add(o);
        timers.push(setInterval(() => { const tt = ctx.currentTime; o.frequency.setTargetAtTime(220 + Math.floor(Math.random() * 6) * 70, tt, 0.01); }, 140));
        const fan = this.noise(); const fg = this.gain(0.15); fan.connect(this.filt('bandpass', 600, 0.8)).connect(fg).connect(g); add(fan);
        break;
      }
      case 'conveyor': {
        const m = this.osc('sawtooth', 38); const mg = this.gain(0.18); m.connect(this.filt('lowpass', 180)).connect(mg).connect(g); add(m);
        timers.push(setInterval(() => { this.burst(ctx.currentTime, { f: 800 + Math.random() * 500, q: 4, d: 0.03, peak: 0.08, out: g }); }, 95));
        break;
      }
      case 'freezer': {
        const o = this.osc('sawtooth', 59); const og = this.gain(0.08); o.connect(this.filt('lowpass', 160)).connect(og).connect(g);
        const n = this.noise(); const ng = this.gain(0.08); n.connect(this.filt('highpass', 5000)).connect(ng).connect(g);
        add(o, n);
        break;
      }
      case 'vending': {
        const o = this.osc('sine', 60); const og = this.gain(0.06); o.connect(og).connect(g);
        const o2 = this.osc('square', 180); const og2 = this.gain(0.01); o2.connect(this.filt('lowpass', 400)).connect(og2).connect(g);
        add(o, o2);
        break;
      }
      case 'crt': {
        const o = this.osc('sine', 15734); const og = this.gain(0.01); o.connect(og).connect(g); add(o);
        const n = this.noise(); const ng = this.gain(0.05); n.connect(this.filt('bandpass', 3000, 0.5)).connect(ng).connect(g); add(n);
        break;
      }
      case 'engine': {
        const o = this.osc('sawtooth', 34); const og = this.gain(0.2); o.connect(this.filt('lowpass', 160)).connect(og).connect(g);
        const o2 = this.osc('sawtooth', 68.3); const og2 = this.gain(0.06); o2.connect(this.filt('lowpass', 300)).connect(og2).connect(g);
        const n = this.noise(true); const ng = this.gain(0.5); n.connect(this.filt('lowpass', 250)).connect(ng).connect(g);
        add(o, o2, n);
        this._engine = { o, o2 };
        break;
      }
      case 'wind': {
        const n = this.noise(true); const f = this.filt('bandpass', 400, 0.7); n.connect(f).connect(g); add(n);
        const lfo = this.osc('sine', 0.08); const lg = this.gain(250); lfo.connect(lg).connect(f.frequency); add(lfo);
        break;
      }
      case 'elevator': {
        const m = this.osc('sawtooth', 55); const mg = this.gain(0.22); m.connect(this.filt('lowpass', 260)).connect(mg).connect(g); add(m);
        const n = this.noise(); const ng = this.gain(0.06); n.connect(this.filt('bandpass', 1200, 2)).connect(ng).connect(g); add(n);
        timers.push(setInterval(() => { if (Math.random() < 0.35) this.burst(ctx.currentTime, { f: 1500, q: 6, d: 0.05, peak: 0.1, out: g }); }, 300));
        break;
      }
      case 'drips': {
        timers.push(setInterval(() => { if (Math.random() < 0.4) this.s_drip(ctx.currentTime, g, 0.4 + Math.random() * 0.4); }, 400));
        const n = this.noise(true); const ng = this.gain(0.1); n.connect(this.filt('lowpass', 120)).connect(ng).connect(g); add(n);
        break;
      }
      case 'heartbeatLoop': {
        timers.push(setInterval(() => this.s_heartbeat(ctx.currentTime, g, 1), 850));
        break;
      }
      default: {
        const n = this.noise(true); n.connect(this.filt('lowpass', 200)).connect(g); add(n);
      }
    }
    for (const n of nodes) n.start(t);
    g.gain.setTargetAtTime(vol, t, opts.fade ?? 0.5);
    return {
      gain: g,
      set: (v, time = 0.3) => g.gain.setTargetAtTime(v, ctx.currentTime, time),
      stop: (fade = 0.5) => {
        timers.forEach(clearInterval);
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
        for (const n of nodes) { try { n.stop(ctx.currentTime + fade + 0.1); } catch { /* already stopped */ } }
      },
      pos: (p) => { if (out.positionX) this.e.setPannerPos(out, p); },
      rate: (k) => { if (this._engine && name === 'engine') { this._engine.o.frequency.setTargetAtTime(34 * k, ctx.currentTime, 0.2); this._engine.o2.frequency.setTargetAtTime(68.3 * k, ctx.currentTime, 0.2); } },
    };
  }
}
