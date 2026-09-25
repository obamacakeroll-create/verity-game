import * as THREE from 'three';

// Procedural colour grading: builds 32³ 3D LUTs from a few film-style
// controls. Input/output are display-referred (sRGB-encoded) values.

const N = 32;

function luma(r, g, b) { return r * 0.2126 + g * 0.7152 + b * 0.0722; }
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function makeLUT(g = {}) {
  const {
    lift = [0, 0, 0], gamma = [1, 1, 1], gain = [1, 1, 1], saturation = 1, contrast = 1, pivot = 0.42,
    shadows = [1, 1, 1], highlights = [1, 1, 1], fade = 0, crush = 0, vibrance = 0, hueShift = 0,
  } = g;
  const data = new Uint8Array(N * N * N * 4);
  let i = 0;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    let r = ri / (N - 1), gg = gi / (N - 1), b = bi / (N - 1);
    // lift / gamma / gain (ASC CDL-ish)
    const c = [r, gg, b].map((v, k) => {
      v = v * gain[k] + lift[k] * (1 - v);
      return Math.pow(Math.max(v, 0), 1 / gamma[k]);
    });
    [r, gg, b] = c;
    // contrast around pivot (S-curve)
    const con = (v) => {
      const x = (v - pivot) * contrast + pivot;
      return x;
    };
    r = con(r); gg = con(gg); b = con(b);
    // split toning
    const l = luma(r, gg, b);
    const sh = 1 - smooth(0.0, 0.5, l), hi = smooth(0.45, 1.0, l);
    r *= 1 + (shadows[0] - 1) * sh + (highlights[0] - 1) * hi;
    gg *= 1 + (shadows[1] - 1) * sh + (highlights[1] - 1) * hi;
    b *= 1 + (shadows[2] - 1) * sh + (highlights[2] - 1) * hi;
    // saturation + vibrance
    const l2 = luma(r, gg, b);
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx - mn;
    const s = saturation * (1 + vibrance * (1 - sat));
    r = l2 + (r - l2) * s; gg = l2 + (gg - l2) * s; b = l2 + (b - l2) * s;
    if (hueShift) {
      // rotate around grey axis
      const cosA = Math.cos(hueShift), sinA = Math.sin(hueShift), k = (1 - cosA) / 3, sq = Math.sqrt(1 / 3) * sinA;
      const nr = r * (cosA + k) + gg * (k - sq) + b * (k + sq);
      const ng = r * (k + sq) + gg * (cosA + k) + b * (k - sq);
      const nb = r * (k - sq) + gg * (k + sq) + b * (cosA + k);
      r = nr; gg = ng; b = nb;
    }
    // crush blacks, then lift ("faded film")
    const cr = (v) => clamp((v - crush) / (1 - crush)) * (1 - fade) + fade;
    data[i++] = cr(r) * 255;
    data[i++] = cr(gg) * 255;
    data[i++] = cr(b) * 255;
    data[i++] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export const GRADES = {
  neutral: {},
  apartment: { gain: [1.04, 1.0, 0.94], lift: [0.0, 0.004, 0.012], contrast: 1.08, saturation: 0.9, shadows: [0.92, 1.0, 1.1], highlights: [1.06, 1.0, 0.9], fade: 0.012 },
  night: { gain: [0.95, 1.0, 1.06], contrast: 1.1, saturation: 0.78, shadows: [0.85, 1.0, 1.15], highlights: [1.0, 1.0, 0.98], crush: 0.01, fade: 0.01 },
  office: { gain: [0.97, 1.03, 0.98], lift: [0.0, 0.006, 0.004], contrast: 1.12, saturation: 0.72, shadows: [0.9, 1.05, 1.02], highlights: [1.0, 1.04, 0.94], fade: 0.015 },
  printlab: { gain: [1.05, 1.0, 0.88], contrast: 1.12, saturation: 0.8, shadows: [0.95, 1.0, 1.1], highlights: [1.08, 1.0, 0.85], fade: 0.01 },
  warehouse: { gain: [0.94, 1.0, 1.04], lift: [0, 0.004, 0.01], contrast: 1.18, saturation: 0.7, shadows: [0.85, 1.02, 1.12], highlights: [1.02, 1.02, 0.95], crush: 0.012 },
  cold: { gain: [0.9, 0.98, 1.1], contrast: 1.1, saturation: 0.6, shadows: [0.85, 0.95, 1.2], highlights: [0.95, 1.0, 1.06], fade: 0.02 },
  core: { gain: [1.1, 0.94, 0.86], contrast: 1.2, saturation: 0.85, shadows: [1.12, 0.9, 0.9], highlights: [1.1, 0.98, 0.8], crush: 0.015 },
  chase: { gain: [1.08, 0.94, 0.9], contrast: 1.28, saturation: 0.7, shadows: [1.1, 0.9, 0.92], highlights: [1.05, 0.95, 0.9], crush: 0.02 },
  title: { contrast: 1.15, saturation: 0.55, shadows: [0.9, 1.0, 1.08], highlights: [1.04, 1.0, 0.94], fade: 0.02 },
  dawn: { gain: [1.06, 1.02, 0.96], contrast: 1.05, saturation: 1.05, highlights: [1.08, 1.0, 0.9], fade: 0.02 },
  vhs: { contrast: 1.05, saturation: 0.75, lift: [0.02, 0.02, 0.03], fade: 0.03, highlights: [1.02, 1.0, 0.96] },
};

const cache = new Map();
export function grade(name) {
  if (!cache.has(name)) cache.set(name, makeLUT(GRADES[name] || GRADES.neutral));
  return cache.get(name);
}
