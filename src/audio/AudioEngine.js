import { Sfx } from './Sfx.js';
import { Music } from './Music.js';
import { Voice } from './Voice.js';

// Web Audio graph: buses → muffle filter → compressor → speakers.
// Everything is synthesised; no audio files are required.
export class AudioEngine {
  constructor(settings, opts = {}) {
    this.settings = settings;
    this.opts = opts;
    this.ready = false;
    this.ctx = null;
    settings.on('change', (k) => { if (/Volume$/.test(k)) this.applyVolumes(); });
  }

  // Must be called from a user gesture.
  init() {
    if (this.ready) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.muffle).connect(this.comp).connect(ctx.destination);
    this.buses = {};
    for (const b of ['music', 'sfx', 'voice', 'amb']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    // shared reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.2);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.sends = {};
    for (const b of ['music', 'sfx', 'voice', 'amb']) {
      const s = ctx.createGain();
      s.gain.value = { music: 0.5, sfx: 0.35, voice: 0.28, amb: 0.2 }[b];
      s.connect(this.reverb);
      this.buses[b].connect(s);
      this.sends[b] = s;
    }
    this.noise = this.makeNoise(3);
    this.brown = this.makeBrown(4);
    this.applyVolumes();
    this.sfx = new Sfx(this);
    this.music = new Music(this);
    this.voice = new Voice(this, this.settings);
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ready && !this.master) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.get('masterVolume'), t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.get('musicVolume') * 0.8, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.get('sfxVolume'), t, 0.05);
    this.buses.amb.gain.setTargetAtTime(s.get('sfxVolume') * 0.8, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(s.get('voiceVolume'), t, 0.05);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
    return buf;
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeBrown(seconds) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  // 3D panner at a world position (THREE.Vector3-like).
  panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.rolloffFactor = 1.3;
    p.maxDistance = 40;
    if (pos) this.setPannerPos(p, pos);
    return p;
  }
  setPannerPos(p, pos) {
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  updateListener(camera) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const f = { x: 0, y: 0, z: -1 };
    const e = camera.matrixWorld.elements;
    f.x = -e[8]; f.y = -e[9]; f.z = -e[10];
    const u = { x: e[4], y: e[5], z: e[6] };
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  setMuffle(on) {
    if (!this.ready) return;
    this.muffle.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, 0.15);
  }

  // Temporarily lower music + ambience (e.g. while Verity speaks).
  duck(amount = 0.5, time = 0.3) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(this.settings.get('musicVolume') * 0.8 * amount, t, time);
  }
  unduck(time = 0.8) {
    if (!this.ready) return;
    this.buses.music.gain.setTargetAtTime(this.settings.get('musicVolume') * 0.8, this.ctx.currentTime, time);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
}
