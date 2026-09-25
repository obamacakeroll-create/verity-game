import { Emitter } from '../../core/util.js';

const KEY = 'verity2.settings.v1';

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
  camcorder: 'KeyQ',
  nightvision: 'KeyN',
  throw: 'KeyG',
  journal: 'KeyJ',
  hint: 'KeyH',
};

export const DEFAULTS = {
  quality: 'high', // low | medium | high | ultra
  resolutionScale: 1,
  dynamicResolution: true,
  ao: true,
  volumetrics: true,
  bloom: true,
  motionBlur: true,
  dof: true,
  grain: true,
  chromatic: true,
  headBob: true,
  cameraShake: true,
  fov: 72,
  brightness: 1,
  sensitivity: 1,
  invertY: false,
  gamepadSensitivity: 1,
  masterVolume: 0.9,
  musicVolume: 0.75,
  sfxVolume: 0.9,
  voiceVolume: 1,
  voiceMode: 'tts', // tts | synth
  voiceName: '',
  subtitles: true,
  subtitleSize: 'medium',
  textSpeed: 1,
  reduceFlashing: false,
  showHints: true,
  keys: { ...DEFAULT_KEYS },
};

export class Settings2 extends Emitter {
  constructor() {
    super();
    this.values = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(this.values, parsed);
        this.values.keys = { ...DEFAULT_KEYS, ...(parsed.keys || {}) };
      } else {
        this.values.quality = guessQuality();
      }
    } catch { /* storage unavailable */ }
    const q = new URLSearchParams(location.search).get('quality');
    if (q) this.values.quality = q;
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    this.save();
    this.emit('change', k, v);
  }
  reset() {
    const q = this.values.quality;
    this.values = structuredClone(DEFAULTS);
    this.values.quality = q;
    this.save();
    for (const k of Object.keys(this.values)) this.emit('change', k, this.values[k]);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }
}

// First-run guess from the GPU string.
function guessQuality() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
    if (/(rtx|radeon rx [6-9]|rx 7|apple m[2-9]|arc a7)/i.test(name)) return 'ultra';
    if (/(gtx 1[06-9]|rtx|radeon|apple m1|arc)/i.test(name)) return 'high';
    if (/intel|mali|adreno|powervr/i.test(name)) return 'medium';
    return 'high';
  } catch { return 'medium'; }
}
