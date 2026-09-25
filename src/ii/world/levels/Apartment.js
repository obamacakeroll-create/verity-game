import * as THREE from 'three';
import { Level } from '../Level.js';
import { Door, makeSignMesh } from '../Door.js';
import * as P from '../Props2.js';
import { CanvasScreen, drawTV } from '../Screens.js';
import { cityBackdrop, windowGlass, skyDome } from '../Exterior.js';

// Chapter 0: your new apartment (4C), three nights after Wren Street.
export function buildApartment(game) {
  const L = new Level(game, 'apartment');
  const warm = { density: 0.018, heightFalloff: 0.3, ambient: [0.0004, 0.0004, 0.0005], noise: 0.5 };
  L.zone('corridor', { x0: -4, z0: -3, x1: 5, z1: 0, h: 2.7, grade: 'night', reverb: 'hall', neighbors: ['entry', 'stairs'], fog: { density: 0.03, heightFalloff: 0.25, ambient: [0.0005, 0.0006, 0.0006], noise: 0.8 }, envIntensity: 0.8 });
  L.zone('stairs', { x0: 5, z0: -3, x1: 8, z1: 0, h: 2.7, grade: 'night', reverb: 'hall', neighbors: ['corridor'] });
  L.zone('entry', { x0: -1, z0: 0, x1: 1.2, z1: 2.4, h: 2.6, grade: 'apartment', reverb: 'small', neighbors: ['corridor', 'living', 'hall'], fog: warm });
  L.zone('living', { x0: -5.5, z0: 2.4, x1: 1.2, z1: 8, h: 2.6, grade: 'apartment', reverb: 'room', neighbors: ['entry', 'hall', 'bath', 'bedroom'], fog: warm, probe: [-2.2, 1.4, 5.2] });
  L.zone('hall', { x0: 1.2, z0: 2.4, x1: 2.6, z1: 8, h: 2.6, grade: 'apartment', reverb: 'small', neighbors: ['living', 'bath', 'bedroom', 'entry'], fog: warm });
  L.zone('bath', { x0: 2.6, z0: 2.4, x1: 5, z1: 5, h: 2.6, grade: 'apartment', reverb: 'small', neighbors: ['hall'], fog: warm });
  L.zone('bedroom', { x0: 2.6, z0: 5, x1: 6, z1: 9.5, h: 2.6, grade: 'apartment', reverb: 'room', neighbors: ['hall', 'living'], fog: warm });

  // ---------------------------------------------------------------- corridor
  let b = L.builder('corridor');
  b.room({
    x0: -4, z0: -3, x1: 5, z1: 0, h: 2.7, wall: { r: 'paint', color: 0xa7a58c }, floor: { r: 'carpet', color: 0x8a4a42 }, ceil: { r: 'ceilingTile', color: 0xc9c4b4 },
    sides: { s: [{ at: 4, w: 0.95, h: 2.1 }, { at: 1, w: 0.95, h: 2.1 }, { at: 7.8, w: 0.95, h: 2.1 }], e: [{ at: 1.5, w: 1.0, h: 2.1 }] },
  });
  P.fluoTrough(b, -2.2, 2.7, -1.5, { rot: Math.PI / 2, state: 'buzz', intensity: 3.5, color: 0xe8f2d8 });
  const corridorFlicker = P.fluoTrough(b, 2.4, 2.7, -1.5, { rot: Math.PI / 2, state: 'flicker', intensity: 3.5, color: 0xe8f2d8 });
  P.exitSign(b, 4.9, 2.35, -1.5, -Math.PI / 2);
  for (const [x, label] of [[-3, '4B'], [3.8, '4D']]) {
    new Door(L, { id: 'door' + label, zone: 'corridor', x, z: 0, w: 0.95, h: 2.1, axis: 'x', hinge: -1, swing: -1, kind: 'wood', locked: true, lockLabel: `Apartment ${label}`, color: 0x6b4a36 });
    P.sign(b, label, x + 0.62, 1.55, -0.09, Math.PI, 0.12, 0.08, { bg: '#b89a4a', fg: '#1a1208', font: 'bold 64px Georgia' });
  }
  P.sign(b, '4C', 0.62, 1.55, -0.09, Math.PI, 0.12, 0.08, { bg: '#b89a4a', fg: '#1a1208', font: 'bold 64px Georgia' });
  // doormat + radiator
  b.box(0.8, 0.012, 0.5, [0, 0.006, -0.4], { r: 'carpet', color: 0x3a3226 }, { cast: false });
  b.box(1.0, 0.6, 0.1, [-1.6, 0.4, -2.93], { r: 'metalPaint', color: 0xd8d4c6 }, { bevel: 0.02 });
  // stairwell
  b = L.builder('stairs');
  b.room({ x0: 5, z0: -3, x1: 8, z1: 0, h: 2.7, wall: { r: 'cinder', color: 0xb8b8a8 }, floor: { r: 'concrete', color: 0x9a9a92 }, ceil: { r: 'paint', color: 0xcfcfc4 }, skip: ['w'] });
  for (let i = 0; i < 6; i++) b.box(1.2, 0.17, 0.3, [6.8, 0.085 + i * 0.17 * 0.5, -2.7 + i * 0.3], { r: 'concrete', color: 0x8a8a84 }, { cast: false });
  b.collider(6.1, -3, 8, -0.8, 'wall');
  P.bulb(b, 6.5, 2.55, -1.2, { cord: 0.12, intensity: 2.2, state: 'dying', color: 0xffd9a0 });
  new Door(L, { id: 'stairs', zone: 'corridor', x: 5, z: -1.5, w: 1.0, h: 2.1, axis: 'z', hinge: -1, kind: 'fire', color: 0x6a2a24, locked: true, lockLabel: 'Stairs' });

  // ---------------------------------------------------------------- apartment shell
  const aptWall = { r: 'paint', color: 0xd6cfc0 };
  const ceilP = { r: 'paint', color: 0xe4e0d6 };
  b = L.builder('entry');
  b.floor(-1, 0, 1.2, 2.4, { r: 'hardwood', color: 0xb49a7c });
  b.ceiling(-1, 0, 1.2, 2.4, 2.6, ceilP);
  b.wall(-1, 0, -1, 2.4, { h: 2.6, mat: aptWall });
  b.wall(1.2, 0, 1.2, 2.4, { h: 2.6, mat: aptWall });
  const front = new Door(L, { id: 'front', zone: 'entry', x: 0, z: 0, w: 0.95, h: 2.1, axis: 'x', hinge: 1, swing: 1, kind: 'wood', color: 0x7a563e });
  // coat hooks + shoe rack
  b.box(0.7, 0.05, 0.05, [-0.97, 1.7, 1.2], { r: 'wood', color: 0x4a3526 }, { rot: [0, Math.PI / 2, 0] });
  b.box(0.3, 0.9, 0.5, [-0.8, 0.45, 1.8], { r: 'wood', color: 0x5a4332 }, { collide: true, bevel: 0.01 });
  // intercom panel
  b.box(0.14, 0.24, 0.04, [1.17, 1.45, 0.7], { r: 'plastic', color: 0xe0dcd2 }, { rot: [0, -Math.PI / 2, 0], bevel: 0.01 });
  const intercomLED = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 0 }));
  intercomLED.position.set(1.145, 1.52, 0.7);
  intercomLED.rotation.y = -Math.PI / 2;
  b.add(intercomLED);
  const intercomHit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  intercomHit.position.set(1.15, 1.45, 0.7);
  b.add(intercomHit);

  b = L.builder('living');
  b.room({
    x0: -5.5, z0: 2.4, x1: 1.2, z1: 8, h: 2.6, wall: aptWall, floor: { r: 'hardwood', color: 0xb49a7c }, ceil: ceilP,
    sides: { n: [{ at: 5.6, w: 2.2, h: 2.6, frame: false }], e: [{ at: 2.2, w: 1.1, h: 2.1 }], w: [{ at: 1.6, w: 1.2, h: 1.35, sill: 0.9 }, { at: 4.1, w: 1.2, h: 1.35, sill: 0.9 }] },
  });
  // kitchenette along the north wall
  P.kitchen(b, -5.5, 2.72, 3.6, 0, { sinkAt: 3, hobAt: 1, fridgeAt: 0, color: 0xcfc9b6 });
  const fr = P.fridge(b, -5.18, 2.75, 0);
  P.table(b, -3.8, 5.2, 0.1, { w: 1.0, d: 0.8 });
  P.chair(b, -3.8, 4.55, 0.1);
  P.chair(b, -3.7, 5.9, Math.PI + 0.3);
  // living area: sofa facing the TV on the south wall
  P.sofa(b, -1.9, 5.4, 0);
  P.coffeeTable(b, -1.9, 6.45, 0);
  P.tvStand(b, -1.9, 7.75, Math.PI);
  const tvScreen = new CanvasScreen(512, 288, drawTV, { fps: 20 });
  const tv = P.flatTV(b, -1.9, 1.02, 7.72, Math.PI, tvScreen.texture);
  b.box(2.6, 0.012, 1.8, [-1.9, 0.006, 6.1], { r: 'carpet', color: 0x6a5f55 }, { cast: false });
  P.bookshelf(b, 0.8, 7.2, -Math.PI / 2, { w: 0.8, h: 1.8 });
  // floor lamp
  b.geo(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 20), { r: 'brushed', color: 0x333333 }, [-3.4, 0.015, 7.4]);
  b.geo(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), { r: 'brushed', color: 0x333333 }, [-3.4, 0.76, 7.4]);
  b.geo(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 20, 1, true), { r: 'fabric', color: 0xd8c8a8, side: THREE.DoubleSide }, [-3.4, 1.6, 7.4]);
  const lamp = game.lights.add({ type: 'lamp', position: new THREE.Vector3(-3.4, 1.55, 7.4), color: 0xffb870, intensity: 3.0, range: 6, zone: L.zones.get('living'), volScale: 0.6 });
  // moving boxes (you only moved in three days ago)
  const boxes = [[-4.8, 7.4, 0.2, 0.5, 0.4, 0.45], [-4.8, 6.8, -0.3, 0.6, 0.45, 0.45], [-4.75, 7.35, 0.1, 0.45, 0.35, 0.4, 0.4], [0.6, 3.1, 0.4, 0.55, 0.45, 0.45], [-0.3, 3.3, -0.1, 0.5, 0.35, 0.42]];
  for (const [x, z, r, w, h, d, y = 0] of boxes) P.cardboardBox(b, x, y, z, r, w, h, d, { collide: y === 0 });
  // windows: glass + city
  for (const wz of [4.0, 6.5]) {
    const g = windowGlass(1.2, 1.35);
    g.position.set(-5.49, 1.575, wz);
    g.rotation.y = Math.PI / 2;
    b.add(g);
    b.box(0.08, 0.04, 1.3, [-5.45, 0.9, wz], { r: 'paint', color: 0xeeeae0 });
    // curtains
    for (const s of [-1, 1]) b.box(0.05, 2.2, 0.4, [-5.4, 1.35, wz + s * 0.85], { r: 'fabric', color: 0x5d4d45, scale: 2 }, { bevel: 0.02 });
  }
  const city = cityBackdrop(80, 30, 7);
  city.position.set(-40, 6, 5);
  city.rotation.y = Math.PI / 2;
  L.dynamic.add(city);
  L.dynamic.add(skyDome());

  b = L.builder('hall');
  b.floor(1.2, 2.4, 2.6, 8, { r: 'hardwood', color: 0xb49a7c });
  b.ceiling(1.2, 2.4, 2.6, 8, 2.6, ceilP);
  b.wall(1.2, 2.4, 2.6, 2.4, { h: 2.6, mat: aptWall });
  b.wall(1.2, 8, 2.6, 8, { h: 2.6, mat: aptWall });
  b.wall(2.6, 2.4, 2.6, 8, { h: 2.6, mat: aptWall, openings: [{ at: 1.3, w: 0.8, h: 2.05 }, { at: 4.2, w: 0.85, h: 2.05 }] });
  P.bulb(b, 1.9, 2.55, 5.2, { cord: 0.05, intensity: 2.5, state: 'off', color: 0xffcf98 });
  P.corkboard(b, 1.22, 1.5, 6.8, Math.PI / 2, 0.6, 0.45);
  new Door(L, { id: 'bath', zone: 'hall', x: 2.6, z: 3.7, w: 0.8, h: 2.05, axis: 'z', hinge: -1, swing: -1, kind: 'wood', color: 0xe6e0d4 });
  new Door(L, { id: 'bedroom', zone: 'hall', x: 2.6, z: 6.6, w: 0.85, h: 2.05, axis: 'z', hinge: 1, swing: -1, kind: 'wood', color: 0xe6e0d4 });

  b = L.builder('bath');
  b.floor(2.6, 2.4, 5, 5, { r: 'ceramic', color: 0xd2d6d2, scale: 0.6 });
  b.ceiling(2.6, 2.4, 5, 5, 2.6, ceilP);
  const tile = { r: 'ceramic', color: 0xdfe4df };
  b.wall(2.6, 2.4, 5, 2.4, { h: 2.6, mat: tile, base: false });
  b.wall(5, 2.4, 5, 5, { h: 2.6, mat: tile, base: false });
  // tub
  b.box(0.75, 0.55, 1.65, [4.58, 0.275, 3.3], { r: 'plastic', color: 0xf2f0ea, rough: 0.2 }, { bevel: 0.05, collide: true });
  b.box(0.6, 0.02, 1.5, [4.58, 0.5, 3.3], { r: 'plastic', color: 0x9aa39a, rough: 0.05 });
  // toilet + sink + mirror
  b.box(0.38, 0.4, 0.5, [3.2, 0.2, 2.72], { r: 'plastic', color: 0xf2f0ea, rough: 0.2 }, { bevel: 0.08, collide: true });
  b.box(0.4, 0.35, 0.18, [3.2, 0.62, 2.52], { r: 'plastic', color: 0xf2f0ea, rough: 0.2 }, { bevel: 0.03 });
  b.box(0.5, 0.15, 0.4, [3.9, 0.85, 2.62], { r: 'plastic', color: 0xf2f0ea, rough: 0.2 }, { bevel: 0.04 });
  b.box(0.1, 0.72, 0.12, [3.9, 0.39, 2.55], { r: 'plastic', color: 0xf2f0ea, rough: 0.2 }, { bevel: 0.03 });
  b.colliderBox([3.9, 0, 2.6], 0.5, 0.42);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), game.lib.plain({ color: 0xaab0b0, rough: 0.02, metal: 1, zone: L.zones.get('bath'), envIntensity: 1.5 }));
  mirror.position.set(3.9, 1.55, 2.43);
  b.add(mirror);
  P.wallLamp(b, 3.9, 2.0, 2.42, 0, { intensity: 2.2, color: 0xfff1d6 });

  b = L.builder('bedroom');
  b.room({
    x0: 2.6, z0: 5, x1: 6, z1: 9.5, h: 2.6, wall: { r: 'wallpaper', color: 0xc9c2b0 }, floor: { r: 'carpet', color: 0x7a7066 }, ceil: ceilP, skip: ['w'],
    sides: { e: [{ at: 2.2, w: 1.2, h: 1.35, sill: 0.9 }] },
  });
  b.wall(2.6, 8, 2.6, 9.5, { h: 2.6, mat: { r: 'wallpaper', color: 0xc9c2b0 } });
  P.bed(b, 4.6, 8.3, Math.PI, { color: 0x44505e });
  const ns = P.nightstand(b, 3.55, 9.2, Math.PI);
  P.wardrobe(b, 3.2, 5.4, 0);
  const bedLamp = P.bulb(b, ns[0], ns[1] + 0.35, ns[2], { cord: 0.01, shade: true, shadeColor: 0x9a8a70, intensity: 1.8, state: 'off', color: 0xffc080 });
  const bw = windowGlass(1.2, 1.35);
  bw.position.set(5.99, 1.575, 7.2);
  bw.rotation.y = -Math.PI / 2;
  b.add(bw);
  P.cardboardBox(b, 5.4, 0, 5.6, 0.3, 0.5, 0.4, 0.4, { collide: true });
  P.cardboardBox(b, 5.45, 0.4, 5.62, 0.1, 0.4, 0.3, 0.35);

  // ---------------------------------------------------------------- anchors for the story
  L.anchors = {
    sofa: new THREE.Vector3(-1.9, 0, 5.45),
    tv: new THREE.Vector3(-1.9, 1.02, 7.7),
    doormat: new THREE.Vector3(0, 0, -0.55),
    coffeeTable: new THREE.Vector3(-1.9, 0.45, 6.45),
    intercom: new THREE.Vector3(1.15, 1.45, 0.7),
    peephole: new THREE.Vector3(0, 1.58, 0.05),
    freezer: fr.freezerPos,
    mirror: new THREE.Vector3(3.9, 1.55, 2.45),
    stairs: new THREE.Vector3(5, 0, -1.5),
    corridorEnd: new THREE.Vector3(-3.6, 0, -1.5),
  };
  L.refs = { tvScreen, tv, intercomLED, intercomHit, front, lamp, corridorFlicker, bedLamp, mirror, city };
  L.onUpdate((dt) => tvScreen.update(dt));
  L.surface = (p) => {
    if (p.z < 0) return p.x > 5 ? 'concrete' : 'carpet';
    if (p.x > 2.6 && p.z < 5) return 'tile';
    if (p.x > 2.6) return 'carpet';
    return 'wood';
  };
  return L;
}
