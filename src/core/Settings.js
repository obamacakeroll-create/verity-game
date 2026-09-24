import { Emitter } from './util.js';

const KEY = 'verity.settings.v1';

export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  flashlight: 'KeyF',
  talk: 'KeyT',
  breath: 'Space',
};

export const DEFAULTS = {
  quality: 'high', // low | medium | high | ultra
  resolutionScale: 1,
  shadows: true,
  bloom: true,
  grain: true,
  chromatic: true,
  headBob: true,
  fov: 70,
  brightness: 1,
  sensitivity: 1,
  invertY: false,
  masterVolume: 0.9,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  voiceVolume: 1,
  voiceMode: 'tts', // tts | synth
  voiceName: '',
  subtitles: true,
  subtitleSize: 'medium', // small | medium | large
  textSpeed: 1,
  reduceFlashing: false,
  keys: { ...DEFAULT_KEYS },
};

export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.75, shadowMap: 512, pointShadows: false, samples: 0, bloom: false },
  medium: { pixelRatio: 1, shadowMap: 1024, pointShadows: false, samples: 0, bloom: true },
  high: { pixelRatio: 1.25, shadowMap: 1024, pointShadows: true, samples: 4, bloom: true },
  ultra: { pixelRatio: 2, shadowMap: 2048, pointShadows: true, samples: 4, bloom: true },
};

export class Settings extends Emitter {
  constructor() {
    super();
    this.values = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(this.values, parsed);
        this.values.keys = { ...DEFAULT_KEYS, ...(parsed.keys || {}) };
      }
    } catch { /* storage unavailable */ }
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    this.save();
    this.emit('change', k, v);
  }
  reset() {
    this.values = structuredClone(DEFAULTS);
    this.save();
    for (const k of Object.keys(this.values)) this.emit('change', k, this.values[k]);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }
}
