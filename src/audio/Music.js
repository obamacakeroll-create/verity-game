// Generative score: drones, a detuning music box lullaby and a chase theme.
// Moods crossfade; `intensity` (0..1, usually insanity) bends everything out of tune.

const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
// lullaby in A minor (midi, beats)
const LULLABY = [
  [76, 1], [72, 1], [74, 1], [71, 1], [72, 2], [69, 2],
  [76, 1], [77, 1], [76, 1], [74, 1], [72, 3], [0, 1],
  [69, 1], [72, 1], [76, 1], [81, 1], [79, 2], [76, 2],
  [77, 1], [76, 1], [74, 1], [71, 1], [69, 3], [0, 1],
];
const BASS = [45, 41, 43, 40];

export class Music {
  constructor(engine) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.out = engine.buses.music;
    this.mood = 'silence';
    this.intensity = 0;
    this.layers = {};
    this.beat = 0;
    this.nextTime = 0;
    this.noteIdx = 0;
    this.chaseStep = 0;
    this.build();
    this.timer = setInterval(() => this.schedule(), 40);
  }

  layer(name) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    this.layers[name] = g;
    return g;
  }

  build() {
    const ctx = this.ctx;
    // drone: detuned saws through a slowly breathing low-pass
    const drone = this.layer('drone');
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 4;
    this.droneFilter.connect(drone);
    this.droneOscs = [];
    for (const [f, d] of [[55, -6], [55, 7], [82.4, 3], [110, -11]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(this.droneFilter.frequency);
    lfo.start();

    // dissonance: high sine cluster with tremolo
    const dis = this.layer('dissonance');
    this.disOscs = [];
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const tl = ctx.createOscillator();
    tl.frequency.value = 5.5;
    const tlg = ctx.createGain();
    tlg.gain.value = 0.5;
    tl.connect(tlg).connect(trem.gain);
    tl.start();
    trem.connect(dis);
    for (const f of [1244.5, 1318.5, 1864.7, 2637]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      o.connect(g).connect(trem);
      o.start();
      this.disOscs.push(o);
    }

    // air: filtered noise swell
    const air = this.layer('air');
    const n = ctx.createBufferSource();
    n.buffer = this.e.noise;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 700;
    nf.Q.value = 0.5;
    n.connect(nf).connect(air);
    n.start();
    this.airFilter = nf;

    this.layer('box'); // music box (scheduled)
    this.layer('chase'); // percussion + ostinato (scheduled)
    this.layer('pad');
    this.padOscs = [];
    for (const m of [57, 60, 64, 69]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = MIDI(m);
      const g = ctx.createGain();
      g.gain.value = 0.03;
      o.connect(g).connect(this.layers.pad);
      o.start();
      this.padOscs.push(o);
    }
  }

  setMood(mood, fade = 2.5) {
    this.mood = mood;
    const t = this.ctx.currentTime;
    const L = {
      silence: { drone: 0, dissonance: 0, air: 0, box: 0, chase: 0, pad: 0 },
      menu: { drone: 0.35, dissonance: 0.05, air: 0.15, box: 0.9, chase: 0, pad: 0.35 },
      calm: { drone: 0.3, dissonance: 0, air: 0.12, box: 0, chase: 0, pad: 0.12 },
      lullaby: { drone: 0.25, dissonance: 0.02, air: 0.1, box: 0.7, chase: 0, pad: 0.2 },
      uneasy: { drone: 0.55, dissonance: 0.25, air: 0.3, box: 0, chase: 0, pad: 0 },
      dread: { drone: 0.85, dissonance: 0.6, air: 0.5, box: 0.25, chase: 0, pad: 0 },
      chase: { drone: 0.7, dissonance: 0.5, air: 0.3, box: 0, chase: 1, pad: 0 },
      ending: { drone: 0.2, dissonance: 0, air: 0.1, box: 0.5, chase: 0, pad: 0.4 },
    }[mood] || {};
    for (const [k, g] of Object.entries(this.layers)) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(L[k] ?? 0, t, fade / 3);
    }
    if (mood === 'chase') { this.chaseStep = 0; this.nextChase = t + 0.05; }
  }

  setIntensity(v) {
    this.intensity = v;
    const t = this.ctx.currentTime;
    // everything slides flat and apart as she loses it
    this.droneOscs.forEach((o, i) => o.detune.setTargetAtTime((i % 2 ? 1 : -1) * (6 + v * 60) - v * 80, t, 1));
    this.droneFilter.Q.setTargetAtTime(4 + v * 8, t, 1);
    this.padOscs.forEach((o, i) => o.detune.setTargetAtTime(-v * (40 + i * 25), t, 1.5));
    this.airFilter.frequency.setTargetAtTime(700 + v * 1800, t, 1);
  }

  schedule() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const ahead = t + 0.2;
    // music box
    if (this.layers.box.gain.value > 0.01 || ['menu', 'lullaby', 'dread', 'ending'].includes(this.mood)) {
      if (this.nextTime < t) this.nextTime = t + 0.05;
      const bpm = 64 - this.intensity * 18;
      while (this.nextTime < ahead) {
        const [m, beats] = LULLABY[this.noteIdx % LULLABY.length];
        const dur = (60 / bpm) * beats;
        if (m) {
          const wob = (Math.random() - 0.5) * this.intensity * 90 - this.intensity * 40;
          this.note(this.nextTime, MIDI(m), dur * 1.6, wob, 1);
          if (this.noteIdx % 4 === 0) {
            const b = BASS[Math.floor(this.noteIdx / 6) % BASS.length];
            this.note(this.nextTime, MIDI(b + 12), dur * 3, wob * 0.5, 0.6);
          }
        }
        // sometimes the box skips / repeats a note
        if (this.intensity > 0.4 && Math.random() < this.intensity * 0.12) {
          this.nextTime += dur * 0.5;
        } else {
          this.noteIdx++;
          this.nextTime += dur;
        }
      }
    }
    // chase
    if (this.mood === 'chase') {
      const step = 60 / 150 / 2;
      if (!this.nextChase || this.nextChase < t) this.nextChase = t + 0.02;
      while (this.nextChase < ahead) {
        const s = this.chaseStep % 16;
        const tt = this.nextChase;
        const out = this.layers.chase;
        if (s % 4 === 0 || s === 7 || s === 14) this.kick(tt, out);
        if (s % 8 === 4) this.hit(tt, out);
        if (s % 2 === 0) this.bass(tt, out, [36, 36, 37, 36, 39, 36, 37, 42][(this.chaseStep / 2) % 8 | 0]);
        if (s === 0 && (this.chaseStep / 16) % 2 === 0) this.screech(tt, out);
        this.chaseStep++;
        this.nextChase += step;
      }
    }
  }

  note(t, f, d, detune, vol) {
    const ctx = this.ctx;
    const out = this.layers.box;
    for (const [mult, type, v, dd] of [[1, 'sine', 0.16, d], [4, 'sine', 0.025, d * 0.3], [2.01, 'triangle', 0.03, d * 0.5]]) {
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

  kick(t, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }
  hit(t, out) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.e.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.3);
    const m = ctx.createOscillator();
    m.type = 'square';
    m.frequency.value = 311 + Math.random() * 40;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.05, t);
    mg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    m.connect(mg).connect(out);
    m.start(t);
    m.stop(t + 0.45);
  }
  bass(t, out, midi) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = MIDI(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.22);
  }
  screech(t, out) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 3;
    g.connect(out);
    bp.connect(g);
    for (const f of [1567, 1661, 2349]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 3);
      const v = ctx.createOscillator();
      v.frequency.value = 6;
      const vg = ctx.createGain();
      vg.gain.value = 18;
      v.connect(vg).connect(o.frequency);
      o.connect(bp);
      o.start(t); v.start(t);
      o.stop(t + 3.2); v.stop(t + 3.2);
    }
  }
}
