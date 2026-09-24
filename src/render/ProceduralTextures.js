import * as THREE from 'three';
import { makeRng } from '../core/util.js';

// Every surface in the game is painted procedurally on canvases at load time,
// so the build ships without any external image assets.

const rng = makeRng(1107);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// Tileable value noise ------------------------------------------------------
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = period;
  const m = (n) => ((n % p) + p) % p;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, period, octaves = 4, seed = 1) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, period * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// Returns a Float32Array heightfield of fbm noise.
function noiseField(size, period, octaves, seed) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = fbm((x / size) * period, (y / size) * period, period, octaves, seed);
    }
  }
  return out;
}

// Normal map from a grayscale canvas (red channel as height).
function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function applyNoise(ctx, size, field, amount, tint = [0, 0, 0]) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const n = (field[i] - 0.5) * amount;
    d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + n * 255 + tint[0]));
    d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + n * 255 + tint[1]));
    d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + n * 255 + tint[2]));
  }
  ctx.putImageData(img, 0, 0);
}

function stains(ctx, size, count, color, maxR, alpha = 0.35) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size, y = rng() * size, r = maxR * (0.3 + rng() * 0.7);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(0.7, `rgba(${color},${alpha * 0.4})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Drips running down from the top (water damage).
function drips(ctx, size, count, color, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const len = size * (0.2 + rng() * 0.8);
    const w = 2 + rng() * 8;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
  }
}

// ---------------------------------------------------------------------------
// Wallpaper: aged damask with stripes. `rot` 0..1 makes it progressively worse.
export function makeWallpaper(rot = 0, size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  const hc = canvas(size), hx = hc.getContext('2d');
  ctx.fillStyle = '#8d8163';
  ctx.fillRect(0, 0, size, size);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, size, size);
  // stripes
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * size;
    ctx.fillStyle = i % 2 ? 'rgba(70,60,40,0.18)' : 'rgba(180,165,120,0.10)';
    ctx.fillRect(x, 0, size / 16, size);
  }
  // damask motif
  const motif = (cx, cy, s, fill, hfill) => {
    for (const [g, f] of [[ctx, fill], [hx, hfill]]) {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = f;
      g.beginPath();
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.7, s * 0.1, 0, s);
      g.bezierCurveTo(-s * 0.7, s * 0.1, -s * 0.6, -s * 0.6, 0, -s);
      g.fill();
      g.beginPath();
      g.ellipse(0, -s * 0.15, s * 0.18, s * 0.32, 0, 0, Math.PI * 2);
      g.fillStyle = f === fill ? 'rgba(141,129,99,0.9)' : '#888';
      g.fill();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * s * 0.62, s * 0.35, s * 0.16, s * 0.3, sx * 0.6, 0, Math.PI * 2);
        g.fillStyle = f;
        g.fill();
      }
      g.restore();
    }
  };
  const step = size / 4;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const ox = (y % 2) * step * 0.5;
      motif(x * step + ox, y * step, step * 0.28, 'rgba(92,80,52,0.55)', '#9a9a9a');
    }
  }
  const field = noiseField(size, 8, 5, 3);
  applyNoise(ctx, size, field, 0.22);
  applyNoise(hx, size, field, 0.15);
  stains(ctx, size, 6 + rot * 18, '70,52,25', size * 0.25, 0.25 + rot * 0.3);
  drips(ctx, size, 3 + rot * 20, '60,45,20', 0.2 + rot * 0.4);
  if (rot > 0.5) {
    stains(ctx, size, rot * 10, '40,10,8', size * 0.12, 0.5 * rot);
    drips(ctx, size, rot * 12, '45,8,6', 0.55 * rot);
  }
  return { map: tex(c), normalMap: tex(normalFromHeight(hc, 3), { srgb: false }) };
}

export function makeWoodFloor(size = 1024) {
  const c = canvas(size), ctx = c.getContext('2d');
  const hc = canvas(size), hx = hc.getContext('2d');
  const rc = canvas(size), rx = rc.getContext('2d');
  const planks = 10;
  const pw = size / planks;
  const img = ctx.createImageData(size, size);
  const himg = hx.createImageData(size, size);
  const rimg = rx.createImageData(size, size);
  const wear = noiseField(size / 4, 8, 4, 9);
  // precompute plank segments: for each column, list of [start, end, tone, seed]
  const segs = [];
  for (let i = 0; i < planks; i++) {
    const list = [];
    let y = -rng() * size * 0.6;
    while (y < size) {
      const len = size * (0.35 + rng() * 0.5);
      list.push([y, y + len, 0.75 + rng() * 0.45, rng() * 100]);
      y += len;
    }
    segs.push(list);
  }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = Math.min(planks - 1, (px / pw) | 0);
      const lx = px - i * pw;
      const seg = segs[i].find((s) => py >= s[0] && py < s[1]) || segs[i][0];
      const tone = seg[2];
      const grain = Math.sin((lx + seg[3]) * 0.33 + Math.sin(py * 0.018 + seg[3]) * 3.2) * 0.5 + 0.5;
      const fine = Math.sin(lx * 1.7 + py * 0.05 + seg[3]) * 0.5 + 0.5;
      const w = wear[((py >> 2) % (size >> 2)) * (size >> 2) + ((px >> 2) % (size >> 2))];
      const k = (0.62 + grain * 0.28 + fine * 0.08) * tone * (0.8 + (w - 0.5) * 0.7);
      const seam = lx < 2 || Math.abs(py - seg[0]) < 2;
      const o = (py * size + px) * 4;
      if (seam) {
        img.data[o] = 12; img.data[o + 1] = 7; img.data[o + 2] = 4;
        himg.data[o] = himg.data[o + 1] = himg.data[o + 2] = 0;
      } else {
        img.data[o] = Math.min(255, 118 * k);
        img.data[o + 1] = Math.min(255, 76 * k);
        img.data[o + 2] = Math.min(255, 44 * k);
        const h = 150 + grain * 30;
        himg.data[o] = himg.data[o + 1] = himg.data[o + 2] = h;
      }
      const r = seam ? 255 : 150 + (1 - w) * 80;
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = r;
      img.data[o + 3] = himg.data[o + 3] = rimg.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  hx.putImageData(himg, 0, 0);
  rx.putImageData(rimg, 0, 0);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(hc, 4), { srgb: false }),
    roughnessMap: tex(rc, { srgb: false }),
  };
}

export function makeWainscot(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  const hc = canvas(size), hx = hc.getContext('2d');
  ctx.fillStyle = '#7a5234';
  ctx.fillRect(0, 0, size, size);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const g = Math.sin(y * 0.08 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(40,20,8,${0.08 + g * 0.16})`;
    ctx.fillRect(0, y, size, 1);
  }
  // raised panel
  const m = size * 0.12;
  hx.fillStyle = '#b0b0b0';
  hx.fillRect(m, m, size - 2 * m, size - 2 * m);
  hx.fillStyle = '#d0d0d0';
  hx.fillRect(m + 12, m + 12, size - 2 * m - 24, size - 2 * m - 24);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(m, m, size - 2 * m, size - 2 * m);
  ctx.strokeStyle = 'rgba(120,80,50,0.25)';
  ctx.strokeRect(m + 12, m + 12, size - 2 * m - 24, size - 2 * m - 24);
  const field = noiseField(size, 8, 4, 21);
  applyNoise(ctx, size, field, 0.12);
  return { map: tex(c), normalMap: tex(normalFromHeight(hc, 4), { srgb: false }) };
}

export function makePlaster(rot = 0, size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#9a968c';
  ctx.fillRect(0, 0, size, size);
  const field = noiseField(size, 8, 5, 5);
  applyNoise(ctx, size, field, 0.2);
  stains(ctx, size, 5 + rot * 10, '90,70,40', size * 0.3, 0.3);
  const hc = canvas(size), hx = hc.getContext('2d');
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, size, size);
  applyNoise(hx, size, noiseField(size, 32, 3, 8), 0.5);
  return { map: tex(c), normalMap: tex(normalFromHeight(hc, 1.5), { srgb: false }) };
}

export function makeDoorWood(size = 512) {
  const c = canvas(size, size * 2), ctx = c.getContext('2d');
  const hc = canvas(size, size * 2), hx = hc.getContext('2d');
  const W = size, H = size * 2;
  ctx.fillStyle = '#4a2c1a';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const g = Math.sin(x * 0.12 + Math.sin(x * 0.02) * 5) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(15,8,3,${0.1 + g * 0.25})`;
    ctx.fillRect(x, 0, 1, H);
  }
  hx.fillStyle = '#909090';
  hx.fillRect(0, 0, W, H);
  const panel = (x, y, w, h) => {
    hx.fillStyle = '#606060';
    hx.fillRect(x, y, w, h);
    hx.fillStyle = '#a0a0a0';
    hx.fillRect(x + 14, y + 14, w - 28, h - 28);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
  };
  const m = W * 0.12;
  panel(m, m, W / 2 - m * 1.5, H * 0.38);
  panel(W / 2 + m * 0.5, m, W / 2 - m * 1.5, H * 0.38);
  panel(m, H * 0.5, W / 2 - m * 1.5, H * 0.42);
  panel(W / 2 + m * 0.5, H * 0.5, W / 2 - m * 1.5, H * 0.42);
  const f = noiseField(size, 8, 4, 33);
  const tmp = canvas(size), tx = tmp.getContext('2d');
  tx.drawImage(c, 0, 0, W, H / 2, 0, 0, size, size);
  applyNoise(tx, size, f, 0.1);
  ctx.drawImage(tmp, 0, 0, size, size, 0, 0, W, H / 2);
  stains(ctx, W, 4, '10,5,2', W * 0.3, 0.3);
  return { map: tex(c, { repeat: false }), normalMap: tex(normalFromHeight(hc, 3), { srgb: false, repeat: false }) };
}

export function makeTiles(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  const hc = canvas(size), hx = hc.getContext('2d');
  ctx.fillStyle = '#4c4a44';
  ctx.fillRect(0, 0, size, size);
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, size, size);
  const n = 8, s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 185 + rng() * 25;
      ctx.fillStyle = `rgb(${v},${v * 0.98 | 0},${v * 0.9 | 0})`;
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      hx.fillStyle = '#c0c0c0';
      hx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
    }
  }
  applyNoise(ctx, size, noiseField(size, 8, 5, 12), 0.25);
  stains(ctx, size, 10, '60,55,30', size * 0.2, 0.3);
  const rc = canvas(size), rx = rc.getContext('2d');
  rx.drawImage(hc, 0, 0);
  rx.globalCompositeOperation = 'difference';
  rx.fillStyle = '#e0e0e0';
  rx.fillRect(0, 0, size, size);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(hc, 5), { srgb: false }),
    roughnessMap: tex(rc, { srgb: false }),
  };
}

export function makeRunner(size = 512) {
  const W = size / 2, H = size;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a0f0f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#b08a4a';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, -10, W - 28, H + 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(26, -10, W - 52, H + 20);
  for (let y = 0; y < 4; y++) {
    const cy = (y + 0.5) * (H / 4);
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 4;
    ctx.strokeRect(-30, -30, 60, 60);
    ctx.fillStyle = '#2a0808';
    ctx.fillRect(-16, -16, 32, 32);
    ctx.restore();
  }
  const f = noiseField(W, 16, 4, 44);
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (f[(y % W) * W + x] - 0.5) * 60 + (rng() - 0.5) * 30;
      img.data[i] += n; img.data[i + 1] += n * 0.6; img.data[i + 2] += n * 0.6;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c) };
}

export function makeCardboard(label = '', size = 512, { verity = false } = {}) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#9c7446';
  ctx.fillRect(0, 0, size, size);
  applyNoise(ctx, size, noiseField(size, 16, 5, 50 + label.length), 0.18);
  for (let y = 0; y < size; y += 6) {
    ctx.fillStyle = 'rgba(60,40,15,0.06)';
    ctx.fillRect(0, y, size, 3);
  }
  stains(ctx, size, 3, '70,45,20', size * 0.25, 0.25);
  // packing tape strip
  ctx.fillStyle = 'rgba(200,170,110,0.55)';
  ctx.fillRect(size * 0.42, 0, size * 0.16, size);
  if (label) {
    ctx.save();
    ctx.translate(size / 2, size * 0.5);
    ctx.rotate(-0.04);
    if (verity) {
      ctx.font = `900 ${size * 0.2}px "Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.035;
      ctx.strokeStyle = '#141008';
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = '#f2c40c';
      ctx.fillText(label, 0, 0);
      ctx.font = `600 ${size * 0.045}px "Fredoka", sans-serif`;
      ctx.fillStyle = '#1b1407';
      ctx.fillText('YOUR PERSONAL HELPER FRIEND', 0, size * 0.17);
      ctx.fillText('▲ THIS SIDE UP ▲   DO NOT OPEN', 0, size * 0.26);
    } else {
      ctx.font = `${size * 0.12}px "Special Elite", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,15,10,0.85)';
      ctx.fillText(label, 0, 0);
    }
    ctx.restore();
  }
  return { map: tex(c, { repeat: false }) };
}

// Horizontal layer lines like an FDM 3D print — used on Verity.
export function makePrintLines(size = 512, layers = 180) {
  const hc = canvas(size), hx = hc.getContext('2d');
  for (let y = 0; y < size; y++) {
    const t = (y / size) * layers;
    const v = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * 120 + 70 + (rng() - 0.5) * 12;
    hx.fillStyle = `rgb(${v},${v},${v})`;
    hx.fillRect(0, y, size, 1);
  }
  return tex(normalFromHeight(hc, 1.2), { srgb: false });
}

export function makeSkin(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  const f = noiseField(size, 8, 5, 77);
  const g = noiseField(size, 32, 3, 78);
  const img = ctx.createImageData(size, size);
  const hc = canvas(size), hx = hc.getContext('2d');
  const himg = hx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = f[i], m = g[i];
    const bruise = Math.max(0, n - 0.62) * 3;
    img.data[i * 4] = 190 + (n - 0.5) * 70 - bruise * 80;
    img.data[i * 4 + 1] = 168 + (n - 0.5) * 60 - bruise * 110;
    img.data[i * 4 + 2] = 72 + (m - 0.5) * 40 - bruise * 30;
    img.data[i * 4 + 3] = 255;
    const h = (Math.abs(m - 0.5) < 0.03 ? 0 : 1) * 60 + n * 190;
    himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = h;
    himg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  hx.putImageData(himg, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(hc, 3), { srgb: false }) };
}

export function makeMetal(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#5a5d5f';
  ctx.fillRect(0, 0, size, size);
  applyNoise(ctx, size, noiseField(size, 8, 5, 90), 0.3);
  stains(ctx, size, 8, '90,50,20', size * 0.2, 0.45);
  return { map: tex(c) };
}

// Scrawled wall writing decal (transparent).
export function makeScrawl(text, { color = '60,6,4', size = 1024, font = 'Special Elite' } = {}) {
  const c = canvas(size, size / 2), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size / 2);
  ctx.translate(size / 2, size / 4);
  ctx.rotate((rng() - 0.5) * 0.12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const fs = size / (Math.max(...lines.map((l) => l.length)) * 0.62);
  ctx.font = `${Math.min(fs, size * 0.16)}px "${font}", "Courier New", monospace`;
  lines.forEach((l, i) => {
    const y = (i - (lines.length - 1) / 2) * fs * 1.1;
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(${color},${0.35 + k * 0.2})`;
      ctx.fillText(l, (rng() - 0.5) * 6, y + (rng() - 0.5) * 6);
    }
    // drips below letters
    for (let d = 0; d < l.length; d++) {
      if (rng() < 0.35) {
        const x = (d - l.length / 2) * fs * 0.6;
        const len = 20 + rng() * 90;
        const gr = ctx.createLinearGradient(0, y, 0, y + len);
        gr.addColorStop(0, `rgba(${color},0.8)`);
        gr.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(x, y + fs * 0.2, 3 + rng() * 3, len);
      }
    }
  });
  return tex(c, { repeat: false });
}

// Rain-streaked window glass
export function makeWindowGlass(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#0d1420');
  g.addColorStop(1, '#05070b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    const x = rng() * size, y = rng() * size, l = 5 + rng() * 40;
    ctx.strokeStyle = `rgba(150,170,200,${0.05 + rng() * 0.15})`;
    ctx.lineWidth = 1 + rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y + l);
    ctx.stroke();
  }
  return tex(c);
}

// Radial falloff sprite for dust / glows.
export function makeGlowSprite(size = 128, color = '255,210,140') {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.3, `rgba(${color},0.35)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

// Flashlight cookie: hot centre, ring, and dirty lens noise.
export function makeFlashlightCookie(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(235,235,235,1)');
  g.addColorStop(0.4, 'rgba(160,160,160,1)');
  g.addColorStop(0.55, 'rgba(210,210,210,1)');
  g.addColorStop(0.62, 'rgba(90,90,90,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const n = fbm((x / size) * 6, (y / size) * 6, 6, 3, 60);
    const k = 0.8 + n * 0.3;
    img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}
