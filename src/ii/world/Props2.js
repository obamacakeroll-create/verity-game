import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSignMesh } from './Door.js';

// Procedural prop library. Static parts go through the Builder (batched,
// baked AO); animated / lit / interactive parts are returned as objects.

// local frame: rotate (lx, lz) by `rot` around (x, z)
export function frame(x, y, z, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
}

function emissiveMat(color, intensity, base = 0xffffff) {
  return new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
}

// ------------------------------------------------------------------ lighting fixtures
export function fluoTrough(b, x, y, z, o = {}) {
  const len = o.len ?? 1.22, rot = o.rot ?? 0;
  const T = frame(x, y, z, rot);
  b.box(0.32, 0.07, len, T(0, -0.035, 0), { r: 'metalPaint', color: 0xe6e4dc, grime: 0.6 }, { rot: [0, rot, 0], bevel: 0.008, cast: false });
  const tubeMat = emissiveMat(o.color ?? 0xdff4ff, 0);
  const tubes = new THREE.Group();
  for (const dx of [-0.07, 0.07]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len - 0.08, 10), tubeMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(dx, -0.085, 0);
    tubes.add(tube);
  }
  if (o.diffuser !== false) {
    const dif = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, len - 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: o.color ?? 0xdff4ff, emissiveIntensity: 0, transparent: true, opacity: 0.55, roughness: 0.3 }));
    dif.position.y = -0.105;
    tubes.add(dif);
    tubeMat.userData.diffuser = dif.material;
  }
  tubes.position.set(...T(0, 0, 0));
  tubes.rotation.y = rot;
  b.add(tubes);
  const f = b.light({
    type: 'fluo', position: new THREE.Vector3(...T(0, -0.25, 0)), color: o.color ?? 0xdff4ff, intensity: o.intensity ?? 4.5, range: o.range ?? 8,
    zone: b.zone, emissive: tubeMat, emissiveBase: o.emissive ?? 5, state: o.state || 'on', volScale: o.volScale ?? 1,
  });
  // diffuser follows the tube intensity
  const baseUpd = f.update.bind(f);
  f.update = (t, dt) => { baseUpd(t, dt); if (tubeMat.userData.diffuser) tubeMat.userData.diffuser.emissiveIntensity = tubeMat.emissiveIntensity * 0.35; };
  return f;
}

export function bulb(b, x, y, z, o = {}) {
  const cord = o.cord ?? 0.5;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, cord, 6), b.lib.plain({ color: 0x151515, rough: 0.6 }));
  wire.position.y = cord / 2;
  g.add(wire);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 12), b.lib.get('brushed', { color: 0x6a5a40 }));
  sock.position.y = 0.02;
  g.add(sock);
  const glass = emissiveMat(o.color ?? 0xffc98a, 0, 0xfff4e0);
  const bulbM = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), glass);
  bulbM.position.y = -0.03;
  g.add(bulbM);
  if (o.shade) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 24, 1, true), b.lib.get('metalPaint', { color: o.shadeColor ?? 0x2c3a33, side: THREE.DoubleSide }));
    shade.position.y = 0.0;
    g.add(shade);
  }
  b.add(g);
  const f = b.light({
    type: 'bulb', position: new THREE.Vector3(x, y - 0.08, z), color: o.color ?? 0xffc98a, intensity: o.intensity ?? 5, range: o.range ?? 7,
    zone: b.zone, emissive: glass, emissiveBase: o.emissive ?? 18, state: o.state || 'on', volScale: o.volScale ?? 1.4,
  });
  f.mesh = g;
  return f;
}

export function wallLamp(b, x, y, z, rot, o = {}) {
  const T = frame(x, y, z, rot);
  b.box(0.12, 0.2, 0.05, T(0, 0, 0.025), { r: 'brushed', color: 0x77705f }, { rot: [0, rot, 0], bevel: 0.01 });
  const m = emissiveMat(o.color ?? 0xffd5a0, 0, 0xfff8ee);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 16, 1), m);
  lens.position.set(...T(0, 0, 0.09));
  b.add(lens);
  return b.light({ type: 'bulb', position: new THREE.Vector3(...T(0, 0, 0.25)), color: o.color ?? 0xffd5a0, intensity: o.intensity ?? 3, range: o.range ?? 6, zone: b.zone, emissive: m, emissiveBase: 6, state: o.state || 'on' });
}

export function exitSign(b, x, y, z, rot, text = 'EXIT') {
  const T = frame(x, y, z, rot);
  b.box(0.36, 0.16, 0.06, T(0, 0, 0.03), { r: 'plastic', color: 0xe8e8e0 }, { rot: [0, rot, 0], bevel: 0.01 });
  const s = makeSignMesh(text, 0.3, 0.1, { bg: '#0a7a3a', fg: '#e8ffe8', emissive: 2.2 });
  s.position.set(...T(0, 0, 0.062));
  s.rotation.y = rot;
  b.add(s);
  return b.light({ type: 'sign', position: new THREE.Vector3(...T(0, -0.1, 0.25)), color: 0x40ff80, intensity: 0.5, range: 3, zone: b.zone, emissive: s.material, emissiveBase: 2.2, volScale: 2 });
}

export function sign(b, text, x, y, z, rot, w, h, o = {}) {
  const s = makeSignMesh(text, w, h, o);
  s.position.set(x, y, z);
  s.rotation.y = rot;
  s.receiveShadow = true;
  b.add(s);
  return s;
}

// ------------------------------------------------------------------ furniture (apartment)
export function sofa(b, x, z, rot, o = {}) {
  const y = b.y;
  const T = frame(x, y, z, rot);
  const fab = { r: 'fabric', color: o.color ?? 0x5b5f55, scale: 1.6 };
  const r = [0, rot, 0];
  b.box(2.0, 0.22, 0.86, T(0, 0.2, 0), fab, { rot: r, bevel: 0.05, collide: true });
  for (const dx of [-0.49, 0.49]) b.box(0.96, 0.18, 0.66, T(dx, 0.4, 0.06), fab, { rot: r, bevel: 0.07 });
  b.box(2.0, 0.5, 0.2, T(0, 0.6, -0.33), fab, { rot: r, bevel: 0.08 });
  for (const dx of [-0.49, 0.49]) b.box(0.94, 0.42, 0.16, T(dx, 0.62, -0.2), fab, { rot: [0.12, rot, 0], bevel: 0.07 });
  for (const s of [-1, 1]) b.box(0.18, 0.55, 0.86, T(s * 0.96, 0.42, 0), fab, { rot: r, bevel: 0.08 });
  for (const [lx, lz] of [[-0.9, -0.36], [0.9, -0.36], [-0.9, 0.36], [0.9, 0.36]]) b.box(0.05, 0.09, 0.05, T(lx, 0.045, lz), { r: 'wood', color: 0x3a2618 }, { rot: r });
}

export function coffeeTable(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(1.1, 0.04, 0.55, T(0, 0.42, 0), { r: 'wood', color: 0x8a6a4c }, { rot: r, bevel: 0.01, collide: 'low' });
  b.box(1.02, 0.02, 0.48, T(0, 0.16, 0), { r: 'wood', color: 0x7a5b40 }, { rot: r });
  for (const [lx, lz] of [[-0.5, -0.23], [0.5, -0.23], [-0.5, 0.23], [0.5, 0.23]]) b.box(0.04, 0.4, 0.04, T(lx, 0.2, lz), { r: 'wood', color: 0x5a4030 }, { rot: r });
}

export function tvStand(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(1.6, 0.46, 0.42, T(0, 0.23, 0), { r: 'laminate', color: 0x2a2826 }, { rot: r, bevel: 0.01, collide: true });
  for (const dx of [-0.4, 0.4]) b.box(0.74, 0.36, 0.01, T(dx, 0.25, 0.212), { r: 'laminate', color: 0x1c1b1a }, { rot: r });
}

// Returns { screen: Mesh } — a flat TV with a canvas-driven screen.
export function flatTV(b, x, y, z, rot, canvasTex) {
  const T = frame(x, y, z, rot);
  const r = [0, rot, 0];
  b.box(1.24, 0.72, 0.05, T(0, 0, 0), { r: 'plastic', color: 0x121212, rough: 0.5 }, { rot: r, bevel: 0.012 });
  b.box(0.3, 0.03, 0.2, T(0, -0.42, 0.02), { r: 'plastic', color: 0x111111 }, { rot: r });
  b.box(0.06, 0.1, 0.04, T(0, -0.37, 0), { r: 'plastic', color: 0x111111 }, { rot: r });
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: canvasTex, emissiveIntensity: 0, roughness: 0.15, metalness: 0.1 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.66), mat);
  screen.position.set(...T(0, 0.01, 0.027));
  screen.rotation.y = rot;
  b.add(screen);
  return { screen, mat };
}

export function kitchen(b, x0, z0, len, rot, o = {}) {
  // a run of base cabinets with worktop, sink, hob and wall cabinets
  const T = frame(x0, b.y, z0, rot);
  const r = [0, rot, 0];
  const n = Math.round(len / 0.6);
  for (let i = 0; i < n; i++) {
    const lx = 0.3 + i * 0.6;
    if (o.fridgeAt === i) continue;
    b.box(0.58, 0.8, 0.56, T(lx, 0.47, 0), { r: 'laminate', color: o.color ?? 0xd8d4c8 }, { rot: r, bevel: 0.006 });
    b.box(0.08, 0.02, 0.02, T(lx, 0.78, 0.29), { r: 'brushed' }, { rot: r });
    b.box(0.56, 0.08, 0.5, T(lx, 0.04, -0.03), { r: 'plastic', color: 0x222222 }, { rot: r });
  }
  b.box(len, 0.04, 0.62, T(len / 2, 0.9, 0.02), { r: 'terrazzo', color: 0x9a948a, scale: 0.5 }, { rot: r, bevel: 0.006 });
  b.colliderBox(T(len / 2, 0, 0), len, 0.64, rot);
  // sink
  if (o.sinkAt != null) {
    const sx = 0.3 + o.sinkAt * 0.6;
    b.box(0.46, 0.012, 0.38, T(sx, 0.922, 0.02), { r: 'brushed' }, { rot: r });
    b.box(0.04, 0.26, 0.04, T(sx, 1.05, -0.22), { r: 'brushed' }, { rot: r });
    b.box(0.03, 0.03, 0.2, T(sx, 1.17, -0.13), { r: 'brushed' }, { rot: r });
  }
  if (o.hobAt != null) {
    const hx = 0.3 + o.hobAt * 0.6;
    b.box(0.56, 0.012, 0.5, T(hx, 0.925, 0.02), { r: 'plastic', color: 0x0c0c0c, rough: 0.15 }, { rot: r });
    for (const [a, c] of [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.13], [0.13, 0.13]]) b.box(0.18, 0.004, 0.18, T(hx + a, 0.933, c), { r: 'rust', color: 0x333333 }, { rot: r });
  }
  // wall cabinets
  for (let i = 0; i < n; i++) {
    if (o.fridgeAt === i || o.hoodAt === i) continue;
    b.box(0.58, 0.7, 0.34, T(0.3 + i * 0.6, 1.85, -0.12), { r: 'laminate', color: o.color ?? 0xd8d4c8 }, { rot: r, bevel: 0.006 });
  }
}

export function fridge(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(0.62, 1.82, 0.64, T(0, 0.91, 0), { r: 'plastic', color: 0xe4e2dc, rough: 0.35 }, { rot: r, bevel: 0.02, collide: true });
  b.box(0.6, 0.006, 0.01, T(0, 1.22, 0.325), { r: 'plastic', color: 0x999999 }, { rot: r });
  b.box(0.03, 0.4, 0.04, T(-0.25, 1.45, 0.345), { r: 'brushed' }, { rot: r });
  b.box(0.03, 0.5, 0.04, T(-0.25, 0.85, 0.345), { r: 'brushed' }, { rot: r });
  return { freezerPos: new THREE.Vector3(...T(0, 1.5, 0.33)), fridgePos: new THREE.Vector3(...T(0, 0.8, 0.33)) };
}

export function bed(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(1.5, 0.3, 2.05, T(0, 0.2, 0), { r: 'wood', color: 0x5a4332 }, { rot: r, bevel: 0.02, collide: true });
  b.box(1.42, 0.22, 1.96, T(0, 0.46, 0.02), { r: 'fabric', color: 0xd6d2c6, scale: 2 }, { rot: r, bevel: 0.08 });
  b.box(1.48, 0.1, 1.5, T(0, 0.58, 0.28), { r: 'fabric', color: o.color ?? 0x55606e, scale: 2 }, { rot: [0.02, rot, 0], bevel: 0.05 });
  for (const dx of [-0.36, 0.36]) b.box(0.6, 0.14, 0.38, T(dx, 0.62, -0.72), { r: 'fabric', color: 0xe8e4da, scale: 2 }, { rot: r, bevel: 0.07 });
  b.box(1.56, 1.0, 0.07, T(0, 0.55, -1.04), { r: 'wood', color: 0x4a3526 }, { rot: r, bevel: 0.02 });
}

export function nightstand(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(0.45, 0.55, 0.4, T(0, 0.275, 0), { r: 'wood', color: 0x5a4332 }, { rot: r, bevel: 0.01, collide: true });
  b.box(0.08, 0.02, 0.02, T(0, 0.4, 0.21), { r: 'brushed' }, { rot: r });
  return T(0, 0.56, 0);
}

export function wardrobe(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(1.1, 2.0, 0.6, T(0, 1.0, 0), { r: 'wood', color: 0x6a5240 }, { rot: r, bevel: 0.012, collide: true });
  b.box(0.004, 1.9, 0.01, T(0, 1.0, 0.301), { r: 'plastic', color: 0x111111 }, { rot: r });
  for (const dx of [-0.06, 0.06]) b.box(0.02, 0.2, 0.03, T(dx, 1.05, 0.315), { r: 'brushed' }, { rot: r });
}

export function bookshelf(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const w = o.w ?? 0.9, h = o.h ?? 1.9;
  const wood = { r: 'wood', color: o.color ?? 0x6d5645 };
  for (const s of [-1, 1]) b.box(0.03, h, 0.32, T(s * (w / 2 - 0.015), h / 2, 0), wood, { rot: r });
  b.box(w, h, 0.01, T(0, h / 2, -0.155), wood, { rot: r });
  b.colliderBox(T(0, 0, 0), w, 0.34, rot);
  const shelves = 5;
  let seed = (x * 91 + z * 17) | 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < shelves; i++) {
    const sy = 0.05 + (i * (h - 0.1)) / (shelves - 1);
    b.box(w - 0.04, 0.025, 0.3, T(0, sy, 0), wood, { rot: r });
    if (i === shelves - 1) continue;
    let bx = -w / 2 + 0.05;
    while (bx < w / 2 - 0.1) {
      const bw = 0.025 + rnd() * 0.045, bh = 0.18 + rnd() * 0.12;
      if (rnd() < 0.15) { bx += bw * 2; continue; }
      const col = new THREE.Color().setHSL(rnd(), 0.35 + rnd() * 0.3, 0.2 + rnd() * 0.25);
      b.box(bw, bh, 0.2 + rnd() * 0.05, T(bx + bw / 2, sy + 0.013 + bh / 2, 0.02), { r: 'fabric', color: col.getHex(), scale: 0.5 }, { rot: [0, rot, rnd() < 0.1 ? 0.2 : 0] });
      bx += bw + 0.004;
    }
  }
}

export function table(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const w = o.w ?? 1.2, d = o.d ?? 0.8, h = o.h ?? 0.75;
  b.box(w, 0.035, d, T(0, h, 0), { r: o.top || 'wood', color: o.color ?? 0x7a5c44 }, { rot: r, bevel: 0.008, collide: 'low' });
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.04, h, 0.04, T(lx * (w / 2 - 0.05), h / 2, lz * (d / 2 - 0.05)), { r: o.leg || 'wood', color: o.legColor ?? 0x4a3526 }, { rot: r });
  return T(0, h + 0.02, 0);
}

export function chair(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const m = { r: 'wood', color: o.color ?? 0x6d5140 };
  b.box(0.42, 0.03, 0.42, T(0, 0.45, 0), m, { rot: r, bevel: 0.006 });
  for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(0.03, 0.45, 0.03, T(lx, 0.225, lz), m, { rot: r });
  b.box(0.42, 0.45, 0.025, T(0, 0.7, -0.2), m, { rot: [-0.08, rot, 0], bevel: 0.006 });
}

export function officeChair(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const fab = { r: 'fabric', color: o.color ?? 0x2a3440, scale: 1.2 };
  b.box(0.48, 0.08, 0.46, T(0, 0.48, 0), fab, { rot: r, bevel: 0.03 });
  b.box(0.44, 0.52, 0.07, T(0, 0.82, -0.22), fab, { rot: [-0.12, rot, 0], bevel: 0.03 });
  b.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), { r: 'brushed' }, T(0, 0.3, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rot;
    b.box(0.3, 0.03, 0.04, [x + Math.sin(a) * 0.14, b.y + 0.07, z + Math.cos(a) * 0.14], { r: 'plastic', color: 0x1a1a1a }, { rot: [0, a + Math.PI / 2, 0] });
    b.geo(new THREE.SphereGeometry(0.025, 8, 6), { r: 'plastic', color: 0x111111 }, [x + Math.sin(a) * 0.28, b.y + 0.025, z + Math.cos(a) * 0.28]);
  }
  for (const s of [-1, 1]) b.box(0.04, 0.2, 0.28, T(s * 0.25, 0.6, 0), { r: 'plastic', color: 0x1a1a1a }, { rot: r, bevel: 0.01 });
}

// ------------------------------------------------------------------ office
export function desk(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const w = o.w ?? 1.5, d = o.d ?? 0.75;
  b.box(w, 0.03, d, T(0, 0.74, 0), { r: 'laminate', color: o.color ?? 0xcfc6b4 }, { rot: r, bevel: 0.006, collide: 'low' });
  b.box(w - 0.1, 0.5, 0.02, T(0, 0.48, -d / 2 + 0.06), { r: 'metalPaint', color: 0x55595a }, { rot: r });
  b.box(0.42, 0.7, d - 0.06, T(w / 2 - 0.24, 0.37, 0), { r: 'metalPaint', color: 0x5f6363 }, { rot: r, bevel: 0.006 });
  for (let i = 0; i < 3; i++) {
    b.box(0.38, 0.2, 0.01, T(w / 2 - 0.24, 0.16 + i * 0.22, d / 2 - 0.025), { r: 'metalPaint', color: 0x6d7272 }, { rot: r });
    b.box(0.12, 0.015, 0.02, T(w / 2 - 0.24, 0.22 + i * 0.22, d / 2 - 0.01), { r: 'brushed' }, { rot: r });
  }
  b.box(0.04, 0.72, d - 0.06, T(-w / 2 + 0.04, 0.36, 0), { r: 'metalPaint', color: 0x5f6363 }, { rot: r });
  return T(0, 0.755, 0);
}

// CRT monitor + keyboard; returns a screen mesh with its own emissive canvas.
export function crt(b, x, y, z, rot, tex = null) {
  const T = frame(x, y, z, rot);
  const r = [0, rot, 0];
  const beige = { r: 'plastic', color: 0xcfc6ae, grime: 0.9 };
  b.box(0.38, 0.33, 0.32, T(0, 0.19, -0.03), beige, { rot: r, bevel: 0.03 });
  b.box(0.3, 0.26, 0.2, T(0, 0.18, -0.26), beige, { rot: r, bevel: 0.05 });
  b.box(0.22, 0.03, 0.22, T(0, 0.015, -0.05), beige, { rot: r, bevel: 0.01 });
  b.box(0.44, 0.025, 0.15, T(0, 0.012, 0.25), beige, { rot: [0.06, rot, 0], bevel: 0.006 });
  for (let i = 0; i < 4; i++) b.box(0.4, 0.008, 0.025, T(0, 0.03, 0.2 + i * 0.03), { r: 'plastic', color: 0xb9b19a }, { rot: r });
  const mat = new THREE.MeshStandardMaterial({ color: 0x050805, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: tex ? 1.2 : 0, roughness: 0.1, metalness: 0.2 });
  const geo = new THREE.PlaneGeometry(0.29, 0.22, 8, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 * (1 - (p.getX(i) / 0.145) ** 2 * 0.5 - (p.getY(i) / 0.11) ** 2 * 0.5));
  geo.computeVertexNormals();
  const screen = new THREE.Mesh(geo, mat);
  screen.position.set(...T(0, 0.2, 0.131));
  screen.rotation.y = rot;
  b.add(screen);
  return { screen, mat };
}

export function cubicle(b, x, z, rot, o = {}) {
  // L-shaped fabric partitions + desk + chair + CRT
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const fab = { r: 'fabric', color: o.color ?? 0x6f7680, scale: 3 };
  const trim = { r: 'metalPaint', color: 0x9a9a92 };
  const W = 1.8, H = 1.45;
  b.box(W, H, 0.06, T(0, H / 2, -0.9), fab, { rot: r, collide: true });
  b.box(W, 0.03, 0.07, T(0, H, -0.9), trim, { rot: r });
  b.box(0.06, H, 1.8, T(-0.9, H / 2, 0), fab, { rot: r, collide: true });
  b.box(0.07, 0.03, 1.8, T(-0.9, H, 0), trim, { rot: r });
  const top = desk(b, ...T(0.05, 0, -0.5).filter((_, i) => i !== 1), rot, { w: 1.6, d: 0.7 });
  void top;
  officeChair(b, ...T(0.1, 0, 0.1).filter((_, i) => i !== 1), rot + Math.PI + (o.chairRot ?? 0.3));
  return T(-0.1, 0.755, -0.55);
}

export function filingCabinet(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const h = o.h ?? 1.32;
  b.box(0.46, h, 0.62, T(0, h / 2, 0), { r: 'metalPaint', color: o.color ?? 0x7d807a }, { rot: r, bevel: 0.008, collide: true });
  const n = Math.round(h / 0.33);
  for (let i = 0; i < n; i++) {
    b.box(0.42, 0.3, 0.012, T(0, 0.17 + i * 0.33, 0.31), { r: 'metalPaint', color: o.color ?? 0x858880 }, { rot: r });
    b.box(0.14, 0.02, 0.03, T(0, 0.26 + i * 0.33, 0.325), { r: 'brushed' }, { rot: r });
    b.box(0.07, 0.035, 0.005, T(0, 0.29 + i * 0.33, 0.318), { r: 'plastic', color: 0xe8e0c8 }, { rot: r });
  }
}

export function waterCooler(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(0.32, 0.95, 0.32, T(0, 0.475, 0), { r: 'plastic', color: 0xe0dcd0 }, { rot: r, bevel: 0.02, collide: true });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 20), new THREE.MeshPhysicalMaterial({ color: 0x6fa6c6, roughness: 0.08, transparent: true, opacity: 0.45, clearcoat: 1 }));
  bottle.position.set(...T(0, 1.15, 0));
  b.add(bottle);
}

export function vending(b, x, z, rot, tex) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  b.box(0.9, 1.85, 0.8, T(0, 0.925, 0), { r: 'metalPaint', color: 0x7a1d1d }, { rot: r, bevel: 0.02, collide: true });
  const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.3), mat);
  front.position.set(...T(-0.08, 1.1, 0.403));
  front.rotation.y = rot;
  b.add(front);
  b.box(0.16, 0.5, 0.02, T(0.33, 1.2, 0.41), { r: 'brushed' }, { rot: r });
  return b.light({ type: 'sign', position: new THREE.Vector3(...T(0, 1.1, 0.8)), color: 0xbfe8ff, intensity: 1.2, range: 4, zone: b.zone, emissive: mat, emissiveBase: 1.1, state: 'buzz' });
}

export function plant(b, x, z, o = {}) {
  b.geo(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 20), { r: 'plastic', color: o.pot ?? 0x9a6a4a }, [x, b.y + 0.2, z]);
  b.geo(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), { r: 'concrete', color: 0x3a2a1a }, [x, b.y + 0.39, z]);
  b.colliderBox([x, 0, z], 0.4, 0.4);
  // dead stems
  let s = (x * 131 + z * 71) | 0;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 7; i++) {
    const h = 0.4 + rnd() * 0.8;
    const g = new THREE.CylinderGeometry(0.004, 0.008, h, 5);
    g.translate(0, h / 2, 0);
    b.geo(g, { r: 'wood', color: 0x4a3a22 }, [x + (rnd() - 0.5) * 0.1, b.y + 0.4, z + (rnd() - 0.5) * 0.1], [(rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7]);
  }
}

export function corkboard(b, x, y, z, rot, w = 1.2, h = 0.8) {
  const T = frame(x, y, z, rot);
  b.box(w, h, 0.02, T(0, 0, 0.01), { r: 'cardboard', color: 0xb58a5a, scale: 0.4 }, { rot: [0, rot, 0] });
  b.box(w + 0.04, h + 0.04, 0.015, T(0, 0, 0.004), { r: 'wood', color: 0x6b4e32 }, { rot: [0, rot, 0] });
  let s = (x * 37 + z * 11) | 0;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const pw = 0.12 + rnd() * 0.12, ph = 0.14 + rnd() * 0.1;
    b.box(pw, ph, 0.003, T((rnd() - 0.5) * (w - pw), (rnd() - 0.5) * (h - ph), 0.024), { r: 'plastic', color: rnd() < 0.3 ? 0xf0e68c : 0xf2efe6 }, { rot: [0, rot, (rnd() - 0.5) * 0.2] });
  }
}

export function locker(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const col = o.color ?? 0x4f6a78;
  b.box(0.4, 1.85, 0.46, T(0, 0.925, 0), { r: 'metalPaint', color: col }, { rot: r, bevel: 0.006, collide: true });
  b.box(0.36, 1.78, 0.01, T(0, 0.925, 0.232), { r: 'metalPaint', color: col }, { rot: r });
  for (let i = 0; i < 6; i++) b.box(0.22, 0.012, 0.01, T(0, 1.6 + i * 0.03, 0.238), { r: 'plastic', color: 0x111111 }, { rot: r });
  for (let i = 0; i < 6; i++) b.box(0.22, 0.012, 0.01, T(0, 0.2 + i * 0.03, 0.238), { r: 'plastic', color: 0x111111 }, { rot: r });
  b.box(0.03, 0.12, 0.03, T(0.14, 1.0, 0.245), { r: 'brushed' }, { rot: r });
  return T(0, 0, 0);
}

// ------------------------------------------------------------------ industrial
export function racking(b, x, z, rot, o = {}) {
  // pallet racking: blue uprights, orange beams, wire decks
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const bays = o.bays ?? 3, bayW = 2.7, depth = 1.1, levels = o.levels ?? 4, lvlH = o.lvlH ?? 1.8;
  const H = levels * lvlH + 0.3;
  const up = { r: 'metalPaint', color: 0x2b4d8a, grime: 0.6 };
  const beam = { r: 'metalPaint', color: 0xd9621c, grime: 0.6 };
  for (let i = 0; i <= bays; i++) {
    const lx = -bays * bayW / 2 + i * bayW;
    for (const lz of [-depth / 2, depth / 2]) b.box(0.08, H, 0.08, T(lx, H / 2, lz), up, { rot: r, seg: 1.2 });
    for (let k = 0; k < 7; k++) b.box(0.03, 0.03, depth, T(lx, 0.4 + k * (H / 7), 0), up, { rot: [(k % 2 ? 0.6 : -0.6), rot, 0] });
  }
  for (let l = 1; l <= levels; l++) {
    const y = l * lvlH - 0.2;
    for (let i = 0; i < bays; i++) {
      const lx = -bays * bayW / 2 + (i + 0.5) * bayW;
      for (const lz of [-depth / 2, depth / 2]) b.box(bayW - 0.08, 0.12, 0.05, T(lx, y, lz), beam, { rot: r, seg: 1.5 });
      b.box(bayW - 0.1, 0.02, depth, T(lx, y + 0.07, 0), { r: 'rust', color: 0x6a6a6a }, { rot: r, seg: 1.5, cast: false });
    }
  }
  b.colliderBox(T(0, 0, 0), bays * bayW + 0.1, depth + 0.1, rot, 'wall');
  return { T, bays, bayW, depth, levels, lvlH };
}

export function pallet(b, x, y, z, rot) {
  const T = frame(x, y, z, rot);
  const r = [0, rot, 0];
  const w = { r: 'wood', color: 0x9a7a55, scale: 0.6 };
  for (let i = 0; i < 5; i++) b.box(1.2, 0.022, 0.12, T(0, 0.133, -0.4 + i * 0.2), w, { rot: r });
  for (const lx of [-0.55, 0, 0.55]) b.box(0.1, 0.09, 1.0, T(lx, 0.078, 0), w, { rot: r });
  for (let i = 0; i < 3; i++) b.box(1.2, 0.022, 0.12, T(0, 0.022, -0.4 + i * 0.4), w, { rot: r });
}

export function cardboardBox(b, x, y, z, rot, w, h, d, o = {}) {
  const T = frame(x, y, z, rot);
  const r = [0, rot, 0];
  b.box(w, h, d, T(0, h / 2, 0), { r: 'cardboard', color: o.color ?? 0xffffff }, { rot: r, bevel: 0.006, collide: o.collide });
  // tape strips
  b.box(0.05, 0.003, d + 0.004, T(0, h + 0.001, 0), { r: 'plastic', color: 0xb58a4c, rough: 0.3 }, { rot: r });
  b.box(0.05, h * 0.3, 0.003, T(0, h * 0.85, d / 2 + 0.001), { r: 'plastic', color: 0xb58a4c, rough: 0.3 }, { rot: r });
}

// A 3D printer enclosure; returns { update(dt), headPos, ball } for animation.
export function printer(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const frameM = { r: 'metalPaint', color: 0x2c2f31 };
  const W = 1.1, D = 1.0, H = 1.9;
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.05, H, 0.05, T(lx * W / 2, H / 2, lz * D / 2), frameM, { rot: r });
  for (const y of [0.05, 0.75, H]) for (const lz of [-D / 2, D / 2]) b.box(W, 0.05, 0.05, T(0, y, lz), frameM, { rot: r });
  for (const y of [0.05, 0.75, H]) for (const lx of [-W / 2, W / 2]) b.box(0.05, 0.05, D, T(lx, y, 0), frameM, { rot: r });
  b.box(W, 0.7, D, T(0, 0.4, 0), { r: 'metalPaint', color: 0x3a3d3f }, { rot: r, bevel: 0.01 });
  b.box(0.3, 0.12, 0.01, T(0.3, 0.55, D / 2 + 0.006), { r: 'plastic', color: 0x0a0a0a }, { rot: r });
  b.colliderBox(T(0, 0, 0), W + 0.1, D + 0.1, rot, 'prop');
  // glass panels
  const glassMat = b.lib.plain({ color: 0x9fb8bc, rough: 0.04, metal: 0, transparent: true, opacity: 0.16, zone: b.zone });
  for (const lz of [-D / 2, D / 2]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, H - 0.8), glassMat);
    g.position.set(...T(0, 0.75 + (H - 0.8) / 2, lz));
    g.rotation.y = rot;
    b.add(g);
  }
  // dynamic: gantry + head + growing ball
  const grp = new THREE.Group();
  grp.position.set(...T(0, 0, 0));
  grp.rotation.y = rot;
  b.add(grp);
  const steel = b.lib.get('brushed');
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.05, 0.06), steel);
  grp.add(gantry);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 0.1, 2, 0.015), b.lib.get('plastic', { color: 0x1a1a1a }));
  grp.add(head);
  const nozzleM = emissiveMat(0xff6a20, 2, 0x331100);
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 8), nozzleM);
  nozzle.rotation.x = Math.PI;
  head.add(nozzle);
  nozzle.position.y = -0.075;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), steel);
  bed.position.y = 0.78;
  grp.add(bed);
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const bm = o.ballMat.clone();
  bm.clippingPlanes = [clip];
  bm.clipShadows = true;
  bm.side = THREE.DoubleSide;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 32), bm);
  ball.position.y = 0.79 + 0.17;
  ball.castShadow = true;
  grp.add(ball);
  let t = Math.random() * 20;
  const period = o.period ?? 26;
  const state = {
    group: grp, ball, head,
    update(dt) {
      t += dt;
      const k = (t % period) / period; // progress
      const h = k * 0.34;
      const wy = grp.position.y + 0.79 + h;
      clip.constant = wy;
      const a = t * 9;
      head.position.set(Math.cos(a) * 0.16 * Math.sin(k * Math.PI), 0.79 + h + 0.1, Math.sin(a * 1.3) * 0.16 * Math.sin(k * Math.PI));
      gantry.position.set(0, head.position.y + 0.05, head.position.z);
      nozzleM.emissiveIntensity = 1.5 + Math.sin(t * 40) * 0.5;
      ball.scale.setScalar(1);
      ball.userData.progress = k;
    },
  };
  return state;
}

export function conveyor(b, x0, z0, x1, z1, o = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  const T = frame((x0 + x1) / 2, b.y, (z0 + z1) / 2, rot);
  const r = [0, rot, 0];
  const h = o.h ?? 0.8, w = o.w ?? 0.8;
  const side = { r: 'metalPaint', color: o.color ?? 0x3f5c3f };
  for (const s of [-1, 1]) b.box(0.06, 0.18, len, T(s * (w / 2 + 0.03), h - 0.02, 0), side, { rot: r, seg: 1.5 });
  const n = Math.floor(len / 1.5);
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) b.box(0.06, h - 0.1, 0.06, T(s * (w / 2), (h - 0.1) / 2, -len / 2 + (i * len) / Math.max(1, n)), side, { rot: r });
  b.box(w, 0.02, len, T(0, h - 0.05, 0), { r: 'rubber' }, { rot: r, seg: 1.5 });
  b.colliderBox(T(0, 0, 0), w + 0.2, len, rot, 'prop', { low: true });
  // rollers as instanced cylinders
  const count = Math.floor(len / 0.12);
  const geo = new THREE.CylinderGeometry(0.03, 0.03, w - 0.02, 10);
  geo.rotateZ(Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, b.lib.get('brushed'), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeRotationY(rot).setPosition(...T(0, h - 0.035, -len / 2 + 0.06 + i * 0.12));
    inst.setMatrixAt(i, m);
  }
  inst.receiveShadow = true;
  b.add(inst);
  return { len, rot, T, h };
}

export function forklift(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const yel = { r: 'metalPaint', color: 0xd6a51c, grime: 1 };
  b.box(1.1, 0.8, 1.9, T(0, 0.65, 0), yel, { rot: r, bevel: 0.05, collide: true });
  b.box(1.0, 0.6, 0.7, T(0, 0.55, -1.0), { r: 'metalPaint', color: 0x2a2a2a }, { rot: r, bevel: 0.05 });
  for (const s of [-1, 1]) {
    b.box(0.06, 1.3, 0.06, T(s * 0.5, 1.7, 0.1), { r: 'metalPaint', color: 0x222222 }, { rot: r });
    b.box(0.06, 1.3, 0.06, T(s * 0.5, 1.7, -0.7), { r: 'metalPaint', color: 0x222222 }, { rot: r });
    b.box(0.08, 2.6, 0.1, T(s * 0.35, 1.3, 1.0), { r: 'metalPaint', color: 0x303030 }, { rot: r });
    b.box(0.12, 0.05, 1.0, T(s * 0.25, 0.1, 1.55), { r: 'rust', color: 0x555555 }, { rot: r });
    for (const lz of [0.6, -0.6]) b.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 20).rotateZ(Math.PI / 2), { r: 'rubber' }, T(s * 0.55, 0.28, lz), r);
  }
  b.box(1.1, 0.06, 1.3, T(0, 2.35, -0.3), { r: 'metalPaint', color: 0x222222 }, { rot: r });
  b.box(0.3, 0.3, 0.35, T(0, 1.2, -0.2), { r: 'leather' }, { rot: r, bevel: 0.05 });
}

export function pipe(b, pts, radius = 0.08, spec = { r: 'metalPaint', color: 0x6a7a6f }) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05);
  b.geo(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 10), radius, 12, false), spec);
}

export function barrel(b, x, z, o = {}) {
  b.geo(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24, 3), { r: 'metalPaint', color: o.color ?? 0x2d5a8a }, [x, b.y + 0.44, z]);
  for (const y of [0.25, 0.63]) b.geo(new THREE.TorusGeometry(0.295, 0.012, 6, 24).rotateX(Math.PI / 2), { r: 'metalPaint', color: o.color ?? 0x2d5a8a }, [x, b.y + y, z]);
  b.colliderBox([x, 0, z], 0.6, 0.6);
}

export function chainFence(b, x0, z0, x1, z1, h = 3, zone = b.zone) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(x1 - x0, z1 - z0);
  const tex = chainTexture();
  tex.repeat.set(len / 0.6, h / 0.6);
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaMap: tex, alphaTest: 0.5, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide, color: 0x9a9a9a });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
  mesh.position.set((x0 + x1) / 2, b.y + h / 2, (z0 + z1) / 2);
  mesh.rotation.y = rot + Math.PI / 2;
  mesh.castShadow = true;
  b.add(mesh);
  const n = Math.ceil(len / 2.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.geo(new THREE.CylinderGeometry(0.03, 0.03, h, 8), { r: 'brushed', color: 0x888888 }, [x0 + (x1 - x0) * t, b.y + h / 2, z0 + (z1 - z0) * t]);
  }
  b.geo(new THREE.CylinderGeometry(0.02, 0.02, len, 8).rotateX(Math.PI / 2), { r: 'brushed', color: 0x888888 }, [(x0 + x1) / 2, b.y + h, (z0 + z1) / 2], [0, rot, 0]);
  b.collider(Math.min(x0, x1) - 0.03, Math.min(z0, z1) - 0.03, Math.max(x0, x1) + 0.03, Math.max(z0, z1) + 0.03, 'fence');
  void zone;
  return mesh;
}

let _chain = null;
function chainTexture() {
  if (_chain) return _chain.clone();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#fff'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
  _chain = new THREE.CanvasTexture(c);
  _chain.wrapS = _chain.wrapT = THREE.RepeatWrapping;
  return _chain.clone();
}

// Instanced field of Verity balls (display racks, bins, the Core wall).
export function ballField(b, positions, faceTex, o = {}) {
  const geo = new THREE.SphereGeometry(o.r ?? 0.17, 20, 14);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffc830, roughness: 0.45, metalness: 0, emissive: 0x2a1a00, emissiveIntensity: 0.3, map: faceTex || null });
  const inst = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  positions.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
    s.setScalar(p.s || 1);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = !!o.shadows;
  inst.receiveShadow = true;
  b.add(inst);
  return inst;
}

// UV-mapped face texture for instanced balls (face on +Z of the sphere's UVs).
export function ballFaceTexture(drawFace) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffc830';
  x.fillRect(0, 0, 512, 256);
  // sphere uv: u=0.25 faces -Z? three's SphereGeometry: u=0.75 faces +Z... draw at u=0.75
  x.save();
  x.translate(384, 128);
  x.scale(1.4, 1);
  drawFace(x);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
