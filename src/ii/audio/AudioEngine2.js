import { AudioEngine } from '../../audio/AudioEngine.js';
import { Voice } from '../../audio/Voice.js';
import { SfxII } from './SfxII.js';
import { MusicII } from './MusicII.js';

// Part two's audio graph: same buses, plus crossfading per-zone reverbs
// (small apartment → vast warehouse), occlusion filtering for sounds behind
// walls, and extra voice profiles.

const REVERBS = {
  car: [0.35, 6, 0.1],
  small: [0.8, 4, 0.35],
  room: [1.3, 3, 0.45],
  office: [1.1, 3.4, 0.4],
  hall: [2.6, 2.2, 0.55],
  huge: [5.5, 1.5, 0.75],
  tunnel: [3.2, 1.9, 0.7],
  freezer: [1.6, 2.6, 0.5],
  outdoor: [0.6, 5, 0.2],
  core: [7.5, 1.3, 0.85],
};

export class AudioEngine2 extends AudioEngine {
  constructor(settings) {
    super(settings, {
      introClip: '../audio/verity_intro.mp3',
      voices: {
        ruth: { pitch: 0.92, rate: 0.9, voice: 'female' },
        vera: { pitch: 1.9, rate: 0.95, voice: 'female', babble: 420 },
        falsity: { pitch: 0.2, rate: 0.82, voice: 'male', babble: 90 },
        radio: { pitch: 0.75, rate: 0.95, voice: 'male' },
        tv: { pitch: 1.45, rate: 1.08, voice: 'female' },
        manager: { pitch: 0.8, rate: 0.95, voice: 'male' },
      },
    });
    this.reverbType = 'room';
  }

  init() {
    if (this.ready) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.master.connect(this.muffle).connect(this.comp).connect(ctx.destination);
    this.buses = {};
    for (const b of ['music', 'sfx', 'voice', 'amb']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    this.noise = this.makeNoise(3);
    this.brown = this.makeBrown(4);
    // two convolvers we crossfade between when the room changes
    this.irs = {};
    for (const [k, [sec, dec]] of Object.entries(REVERBS)) this.irs[k] = this.impulse(sec, dec);
    this.revA = this.makeReverb('room');
    this.revB = this.makeReverb('room');
    this.revB.out.gain.value = 0;
    this.activeRev = this.revA;
    this.sends = {};
    for (const b of ['music', 'sfx', 'voice', 'amb']) {
      const s = ctx.createGain();
      s.gain.value = { music: 0.35, sfx: 0.5, voice: 0.3, amb: 0.3 }[b];
      s.connect(this.revA.in);
      s.connect(this.revB.in);
      this.buses[b].connect(s);
      this.sends[b] = s;
    }
    this.applyVolumes();
    this.sfx = new SfxII(this);
    this.music = new MusicII(this);
    this.voice = new Voice(this, this.settings);
    this.ready = true;
    this.setReverb('room', 0.01);
  }

  makeReverb(type) {
    const ctx = this.ctx;
    const conv = ctx.createConvolver();
    conv.buffer = this.irs[type];
    const out = ctx.createGain();
    out.gain.value = REVERBS[type][2];
    const input = ctx.createGain();
    input.connect(conv).connect(out).connect(this.master);
    return { in: input, conv, out, type };
  }

  setReverb(type, fade = 1.2) {
    if (!this.ready || !REVERBS[type] || this.reverbType === type) return;
    this.reverbType = type;
    const t = this.ctx.currentTime;
    const next = this.activeRev === this.revA ? this.revB : this.revA;
    next.conv.buffer = this.irs[type];
    next.type = type;
    next.out.gain.cancelScheduledValues(t);
    next.out.gain.setTargetAtTime(REVERBS[type][2], t, fade / 3);
    this.activeRev.out.gain.cancelScheduledValues(t);
    this.activeRev.out.gain.setTargetAtTime(0.0001, t, fade / 3);
    this.activeRev = next;
  }

  // positional destination with optional occlusion lowpass
  dest3d(bus, pos, occluded = false) {
    const p = this.panner(pos);
    if (occluded) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      p.connect(f).connect(this.buses[bus]);
    } else p.connect(this.buses[bus]);
    return p;
  }
}
