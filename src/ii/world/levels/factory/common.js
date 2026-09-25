import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { frame } from '../../Props2.js';
import { posterCanvas, drawBall } from '../../Screens.js';

// Shared pieces for the factory: interaction hitboxes, collectibles, hiding
// spots, posters, scrawls and the car.

export function hitbox(b, pos, size, spec) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(...pos);
  b.add(m);
  return b.level.interact(m, spec);
}

// A dynamic (non-batched) mesh in the zone
export function dyn(b, geo, mat, pos, rot = [0, 0, 0], cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = cast;
  m.receiveShadow = true;
  b.add(m);
  return m;
}

// Cassette recorder with a tape inside.
export function tapeDeck(b, id, x, y, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.07, 0.15, 2, 0.012), b.lib.get('plastic', { color: 0x2a2a2c, zone: b.zone }));
  body.position.y = 0.035;
  body.castShadow = true;
  g.add(body);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), b.lib.plain({ color: 0x5a4a3a, rough: 0.2, zone: b.zone }));
  win.rotation.x = -Math.PI / 2;
  win.position.set(-0.04, 0.0705, 0);
  g.add(win);
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.02), b.lib.get('brushed', { zone: b.zone }));
    k.position.set(0.05 + i * 0.03, 0.075, 0.045);
    g.add(k);
  }
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.005, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 3 }));
  led.rotation.x = -Math.PI / 2;
  led.position.set(0.1, 0.0712, -0.04);
  g.add(led);
  b.add(g);
  b.level.collect.tapes[id] = g;
  b.level.interact(body, {
    label: (game) => (game.state.tapes.includes(id) ? null : 'Play the tape'),
    onInteract: (game) => game.story.collect('tape', id, g),
  });
  return g;
}

// A sheet of paper / document on a surface.
export function paper(b, id, x, y, z, rot = 0, o = {}) {
  const w = o.w ?? 0.21, h = o.h ?? 0.29;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 176;
  const x2 = c.getContext('2d');
  x2.fillStyle = o.color || '#ece6d6';
  x2.fillRect(0, 0, 128, 176);
  x2.fillStyle = 'rgba(40,40,50,.55)';
  for (let i = 0; i < 16; i++) x2.fillRect(12, 16 + i * 9, 40 + ((i * 37) % 64), 3);
  if (o.stamp) { x2.fillStyle = 'rgba(190,30,30,.7)'; x2.font = 'bold 20px Arial'; x2.fillText(o.stamp, 16, 160); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  if (o.wall) { m.position.set(x, y, z); m.rotation.y = rot; } else { m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y + 0.002, z); }
  m.receiveShadow = true;
  b.add(m);
  b.level.collect.docs[id] = m;
  b.level.interact(m, { label: o.label || 'Read', onInteract: (game) => game.story.collect('doc', id, m) });
  return m;
}

// A little Verity figurine — collectible. nv: only visible through night vision.
export function figure(b, idx, x, y, z, o = {}) {
  const L = b.level;
  const g = new THREE.Group();
  g.position.set(x, y + b.oy, z);
  g.rotation.y = o.rot ?? 0;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xffcf2a, roughness: 0.35, clearcoat: 0.8, emissive: 0x3a2400, emissiveIntensity: o.nv ? 2 : 0.4 }));
  ball.position.y = 0.047;
  ball.castShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 16), b.lib.get('wood', { color: 0x4a3526, zone: b.zone }));
  base.position.y = 0.006;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), faceMat());
  face.position.set(0, 0.049, 0.0352);
  g.add(ball, base, face);
  (o.nv ? L.nvLayer : b.zone.group).add(g);
  L.collect.figures[idx] = g;
  L.interact(ball, { label: (game) => (game.state.figures.includes(idx) ? null : 'Pick up the little figure'), onInteract: (game) => game.story.collect('figure', idx, g) });
  return g;
}

let _faceMat = null;
function faceMat() {
  if (_faceMat) return _faceMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  drawBall(x, 64, 64, 64, 'smile');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _faceMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, transparent: true });
  return _faceMat;
}

// Register a hiding spot: an interactable mesh + where you sit + where you exit.
export function hideSpot(b, mesh, spot) {
  const L = b.level;
  spot.layer = b.layer;
  L.hides.push(spot);
  L.interact(mesh, {
    label: (game) => (game.player.hidden ? null : spot.label || 'Hide'),
    onInteract: (game) => game.story.hide(spot),
  });
  return spot;
}

// Locker you can hide in (door swings on a hinge).
export function hideLocker(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const col = o.color ?? 0x4f6a78;
  const shell = { r: 'metalPaint', color: col, grime: 0.8 };
  b.box(0.5, 1.9, 0.03, T(0, 0.95, -0.25), shell, { rot: r });
  for (const s of [-1, 1]) b.box(0.03, 1.9, 0.5, T(s * 0.25, 0.95, 0), shell, { rot: r });
  b.box(0.5, 0.03, 0.5, T(0, 1.9, 0), shell, { rot: r });
  b.box(0.5, 0.03, 0.5, T(0, 0.02, 0), shell, { rot: r });
  b.colliderBox(T(0, 0, 0), 0.52, 0.52, rot, 'prop');
  // door
  const pivot = new THREE.Group();
  pivot.position.set(...T(-0.24, 0, 0.25));
  pivot.rotation.y = rot;
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.48, 1.86, 0.02, 2, 0.006), b.lib.get('metalPaint', { color: col, zone: b.zone, grime: 0.8 }));
  door.position.set(0.24, 0.95, 0);
  door.castShadow = true;
  pivot.add(door);
  // vents (you peer through these)
  for (let i = 0; i < 7; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.004), b.lib.plain({ color: 0x050505, zone: b.zone }));
    v.position.set(0.24, 1.5 + i * 0.03, 0.012);
    pivot.add(v);
  }
  b.add(pivot);
  const lockDoor = { open: 0, target: 0, pivot };
  b.level.onUpdate((dt) => {
    lockDoor.open += (lockDoor.target - lockDoor.open) * Math.min(1, dt * 10);
    pivot.rotation.y = rot - lockDoor.open * 1.6;
  });
  const inside = new THREE.Vector3(...T(0, b.oy, -0.02));
  const exit = new THREE.Vector3(...T(0, b.oy, 0.75));
  return hideSpot(b, door, {
    inside, exit, yaw: rot, exitYaw: rot, range: 0.25, pitch: -0.05, label: 'Hide in the locker', door: lockDoor, kind: 'locker', vents: true,
  });
}

// An open VERITY shipping box big enough to crouch inside.
export function hideBox(b, x, z, rot) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const card = { r: 'cardboard', color: 0xffffff };
  const W = 1.0, H = 1.05;
  b.box(W, H, 0.02, T(0, H / 2, -W / 2), card, { rot: r });
  for (const s of [-1, 1]) b.box(0.02, H, W, T(s * W / 2, H / 2, 0), card, { rot: r });
  b.box(W, H * 0.35, 0.02, T(0, H * 0.175, W / 2), card, { rot: r });
  // flaps folded open
  b.box(W, 0.02, 0.45, T(0, H, -W / 2 - 0.2), card, { rot: [0.5, rot, 0] });
  for (const s of [-1, 1]) b.box(0.45, 0.02, W, T(s * (W / 2 + 0.2), H, 0), card, { rot: [0, rot, s * -0.5] });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), boxLabelMat());
  label.position.set(...T(0, H * 0.7, -W / 2 - 0.012));
  label.rotation.y = rot + Math.PI;
  b.add(label);
  b.colliderBox(T(0, 0, 0), W + 0.04, W + 0.04, rot, 'prop');
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(...T(0, 0.6, 0));
  hit.rotation.y = rot;
  b.add(hit);
  return hideSpot(b, hit, {
    inside: new THREE.Vector3(...T(0, b.oy, 0)), exit: new THREE.Vector3(...T(0, b.oy, W / 2 + 0.55)), yaw: rot, exitYaw: rot, range: 1.2, crouch: true, pitch: 0.2,
    label: 'Climb into the box', kind: 'box',
  });
}

let _labelMat = null;
export function boxLabelMat() {
  if (_labelMat) return _labelMat;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c21a'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#1a1a1a';
  x.font = 'bold 110px Arial';
  x.textAlign = 'center';
  x.fillText('VERITY', 256, 120);
  x.font = '30px Arial';
  x.fillText('YOUR PERSONAL HELPER FRIEND', 256, 175);
  x.fillText('THIS WAY UP  ↑↑', 256, 225);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _labelMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return _labelMat;
}

export function poster(b, kind, x, y, z, rot, w = 0.5, h = 0.7) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: posterCanvas(kind), roughness: 0.75 }));
  m.position.set(x, y, z);
  m.rotation.y = rot;
  m.receiveShadow = true;
  b.add(m);
  return m;
}

// Hand-written scrawl on a wall (canvas text). nv: only visible through night vision.
export function scrawl(b, text, x, y, z, rot, o = {}) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const x2 = c.getContext('2d');
  x2.fillStyle = o.color || (o.nv ? '#ffffff' : '#7a1a12');
  x2.font = `${o.font || 'bold 120px "Permanent Marker", "Comic Sans MS", cursive'}`;
  x2.textAlign = 'center';
  x2.textBaseline = 'middle';
  let fs = 120;
  while (x2.measureText(text).width > 980 && fs > 30) { fs -= 6; x2.font = x2.font.replace(/\d+px/, `${fs}px`); }
  x2.translate(512, 128);
  x2.rotate((o.tilt ?? -0.03));
  x2.fillText(text, 0, 0);
  // drips
  if (!o.nv) for (let i = 0; i < 10; i++) { const dx = (Math.random() - 0.5) * 900; x2.fillRect(dx, 20, 3, 30 + Math.random() * 80); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const w = o.w ?? 2.4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({
    map: t, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3,
    emissive: o.nv ? 0xffffff : 0x000000, emissiveMap: o.nv ? t : null, emissiveIntensity: o.nv ? 1.5 : 0,
  }));
  m.position.set(x, y + b.oy, z);
  m.rotation.y = rot;
  (o.nv ? b.level.nvLayer : b.zone.group).add(m);
  return m;
}

// A compact 90s hatchback (static, batched). Returns useful local points.
export function car(b, x, z, rot, o = {}) {
  const T = frame(x, b.y, z, rot);
  const r = [0, rot, 0];
  const paint = { r: 'metalPaint', color: o.color ?? 0x4a1c1c, rough: 0.35, metal: 0.6, grime: 0.7, wet: 1 };
  const glass = { r: 'plain', color: 0x0a0e10, rough: 0.05, metal: 0.4 };
  const trim = { r: 'plastic', color: 0x111111, rough: 0.5 };
  b.box(1.66, 0.62, 3.9, T(0, 0.62, 0), paint, { rot: r, bevel: 0.14, collide: true });
  b.box(1.5, 0.55, 2.1, T(0, 1.18, 0.3), glass, { rot: r, bevel: 0.12 });
  b.box(1.54, 0.08, 1.9, T(0, 1.47, 0.35), paint, { rot: r, bevel: 0.04 });
  b.box(1.7, 0.18, 3.95, T(0, 0.33, 0), trim, { rot: r, bevel: 0.06 });
  for (const s of [-1, 1]) {
    for (const lz of [-1.25, 1.3]) {
      b.geo(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 22).rotateZ(Math.PI / 2), { r: 'rubber' }, T(s * 0.74, 0.31, lz), r);
      b.geo(new THREE.CylinderGeometry(0.19, 0.19, 0.21, 16).rotateZ(Math.PI / 2), { r: 'brushed', color: 0x888888 }, T(s * 0.745, 0.31, lz), r);
    }
    b.box(0.2, 0.1, 0.03, T(s * 0.55, 0.72, -1.96), { r: 'plain', color: 0xeeeeee, rough: 0.1, emissive: 0x332a18, emissiveIntensity: 0.5 }, { rot: r });
    b.box(0.22, 0.1, 0.03, T(s * 0.58, 0.8, 1.96), { r: 'plain', color: 0x550000, rough: 0.2, emissive: 0x220000, emissiveIntensity: 0.6 }, { rot: r });
    b.box(0.1, 0.07, 0.14, T(s * 0.86, 1.0, -0.55), trim, { rot: r });
  }
  return { T, door: new THREE.Vector3(...T(-1.2, 0, -0.1)), seat: new THREE.Vector3(...T(-0.36, 1.14, 0.12)) };
}
