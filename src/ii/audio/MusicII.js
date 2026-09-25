import { Music } from '../../audio/Music.js';

// Part two's score: part one's drones / lullaby / chase, plus the HELPFUL
// FRIENDS jingle (a toy-piano commercial tune that warps with insanity), an
// industrial factory bed, stalking pulses, glassy cold pads and a formant choir.

const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
// "Ve-ri-ty! Your per-so-nal hel-per friend! Ask me a-ny-thing!"
const JINGLE = [
  [67, 0.5], [76, 0.5], [72, 1], [74, 0.5], [76, 0.5], [77, 0.5], [76, 0.5], [74, 0.5], [72, 1.5],
  [72, 0.5], [74, 0.5], [76, 0.5], [79, 1], [77, 0.5], [76, 0.5], [74, 1], [0, 1],
  [67, 0.5], [76, 0.5], [72, 1], [74, 0.5], [76, 0.5], [77, 0.5], [79, 0.5], [81, 0.5], [79, 1.5],
  [77, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [72, 2], [0, 2],
];
const JBASS = [48, 53, 55, 48, 45, 53, 55, 48];

export class MusicII extends Music {
  build() {
    super.build();
    const ctx = this.ctx;
    this.layer('jingle');
    this.layer('metal');
    this.layer('pulse');
    // glass: high detuned sines
    const glass = this.layer('glass');
    this.glassOscs = [];
    for (const [m, d] of [[88, 0], [95, 7], [100, -9], [91, 4]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = MIDI(m);
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.012;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.1 + Math.random() * 0.2;
      const lg = ctx.createGain();
      lg.gain.value = 0.012;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(glass);
      o.start(); lfo.start();
      this.glassOscs.push(o);
    }
    // choir: saw pads through vowel formants
    const choir = this.layer('choir');
    this.choirOscs = [];
    const formants = [[730, 1090, 2440], [570, 840, 2410]];
    for (const [m, fi] of [[45, 0], [52, 1], [57, 0], [60, 1], [64, 0]]) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = MIDI(m);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.02;
        for (const f of formants[fi]) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 8;
          o.connect(bp).connect(g);
        }
        g.connect(choir);
        o.start();
        this.choirOscs.push(o);
      }
    }
    this.jIdx = 0;
    this.jNext = 0;
    this.metalNext = 0;
    this.pulseNext = 0;
    this.pulseRate = 1.2;
  }

  setMood(mood, fade = 2.5) {
    this.mood = mood;
    const t = this.ctx.currentTime;
    const L = {
      silence: {},
      menu: { drone: 0.3, air: 0.12, jingle: 0.55, pad: 0.15, glass: 0.2 },
      calm: { drone: 0.25, air: 0.1, pad: 0.12 },
      apartment: { drone: 0.18, air: 0.08, pad: 0.15, box: 0.25 },
      jingle: { jingle: 1, pad: 0.1 },
      uneasy: { drone: 0.5, dissonance: 0.2, air: 0.3, metal: 0.3 },
      factory: { drone: 0.45, dissonance: 0.08, air: 0.25, metal: 0.55, pad: 0.05 },
      stalk: { drone: 0.7, dissonance: 0.45, air: 0.4, pulse: 1, metal: 0.25 },
      dread: { drone: 0.85, dissonance: 0.6, air: 0.5, box: 0.2, pulse: 0.5 },
      cold: { drone: 0.3, air: 0.35, glass: 0.9, dissonance: 0.1 },
      lab: { drone: 0.2, air: 0.15, box: 0.7, glass: 0.4, pad: 0.15 },
      core: { drone: 0.7, air: 0.4, choir: 0.9, dissonance: 0.3, pulse: 0.4 },
      chase: { drone: 0.7, dissonance: 0.5, air: 0.3, chase: 1 },
      ending: { drone: 0.2, air: 0.1, box: 0.5, pad: 0.4, choir: 0.2 },
      dawn: { pad: 0.5, glass: 0.3, box: 0.35, choir: 0.25 },
      lullaby: { drone: 0.25, dissonance: 0.02, air: 0.1, box: 0.7, pad: 0.2 },
    }[mood] || {};
    for (const [k, g] of Object.entries(this.layers)) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(L[k] ?? 0, t, fade / 3);
    }
    if (mood === 'chase') { this.chaseStep = 0; this.nextChase = t + 0.05; }
    if (mood === 'jingle' || mood === 'menu') { this.jIdx = 0; this.jNext = t + 0.1; }
  }

  setIntensity(v) {
    super.setIntensity(v);
    const t = this.ctx.currentTime;
    this.choirOscs?.forEach((o, i) => o.detune.setTargetAtTime((i % 2 ? 8 : -8) - v * (20 + (i % 5) * 12), t, 1.5));
    this.glassOscs?.forEach((o, i) => o.detune.setTargetAtTime(v * (i % 2 ? 40 : -55), t, 2));
  }

  // how close the threat is (0..1) — drives the stalking pulse tempo
  setThreat(v) { this.pulseRate = 1.4 - Math.min(1, v) * 0.95; }

  schedule() {
    super.schedule();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const ahead = t + 0.2;
    // jingle (toy piano with tape warble)
    if (this.layers.jingle.gain.value > 0.01 || this.mood === 'jingle' || this.mood === 'menu') {
      const warp = this.intensity;
      const bpm = (this.mood === 'menu' ? 92 : 128) * (1 - warp * 0.35);
      if (this.jNext < t) this.jNext = t + 0.05;
      while (this.jNext < ahead) {
        const [m, beats] = JINGLE[this.jIdx % JINGLE.length];
        const dur = (60 / bpm) * beats;
        const wob = Math.sin(this.jNext * 2.1) * (8 + warp * 70) - warp * 60;
        if (m) this.toy(this.jNext, MIDI(this.mood === 'menu' ? m - 12 : m), dur, wob);
        if (this.jIdx % 3 === 0) this.toy(this.jNext, MIDI(JBASS[Math.floor(this.jIdx / 4) % JBASS.length] - 12), dur * 2, wob * 0.5, 0.5);
        this.jIdx++;
        this.jNext += dur;
      }
    }
    // metallic factory pings
    if (this.layers.metal.gain.value > 0.02) {
      if (this.metalNext < t) this.metalNext = t + 0.5 + Math.random() * 3;
      if (this.metalNext < ahead) {
        this.ping(this.metalNext, 80 + Math.random() * 300);
        this.metalNext += 1.5 + Math.random() * 5;
      }
    }
    // stalking pulse (sub thump pairs)
    if (this.layers.pulse.gain.value > 0.02) {
      if (this.pulseNext < t) this.pulseNext = t + 0.05;
      while (this.pulseNext < ahead) {
        this.thump(this.pulseNext, 1);
        this.thump(this.pulseNext + 0.22, 0.6);
        this.pulseNext += this.pulseRate;
      }
    }
  }

  toy(t, f, d, detune, vol = 1) {
    const ctx = this.ctx;
    const out = this.layers.jingle;
    for (const [mult, type, v, dd] of [[1, 'triangle', 0.1, Math.min(d * 1.2, 0.9)], [2, 'sine', 0.05, d * 0.4], [5.1, 'sine', 0.012, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dd);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dd + 0.05);
    }
  }

  ping(t, f) {
    const ctx = this.ctx;
    const out = this.layers.metal;
    for (const m of [1, 2.76, 5.4, 8.93]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 / m, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 / Math.sqrt(m));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 2.6);
    }
  }

  thump(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.layers.pulse);
    o.start(t);
    o.stop(t + 0.35);
  }
}
