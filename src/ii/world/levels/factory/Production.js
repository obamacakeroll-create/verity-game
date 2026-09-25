import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as P from '../../Props2.js';
import { Door, makeSignMesh } from '../../Door.js';
import { CanvasScreen, drawCRT } from '../../Screens.js';
import { drawExpression } from '../../../../entities/VerityFace.js';
import { hitbox, tapeDeck, paper, figure, hideLocker, hideBox, poster, scrawl, dyn, boxLabelMat } from './common.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

// A texture for instanced printed balls: yellow with a face at u = 0.75 (-Z).
export function printedFaceTexture(expr = 'smile') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ffd84a'); g.addColorStop(1, '#d9a414');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 3) { x.fillStyle = `rgba(0,0,0,${0.04 + (y % 6 ? 0 : 0.03)})`; x.fillRect(0, y, 512, 1); }
  x.save();
  x.translate(384, 128);
  x.scale(0.17, 0.24);
  x.translate(-512, -512);
  drawExpression(x, expr, { lookX: 0, lookY: 0, blink: 0 });
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Instanced printed balls that turn to face you whenever you aren't looking.
class WatchingBalls {
  constructor(b, positions, o = {}) {
    this.pos = positions.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    this.yaw = positions.map((p) => p.ry ?? 0);
    this.r = o.r ?? 0.17;
    const geo = new THREE.SphereGeometry(this.r, 24, 16);
    this.mat = new THREE.MeshPhysicalMaterial({ map: printedFaceTexture(o.expr || 'smile'), roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.4, emissive: 0x2a1800, emissiveIntensity: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, positions.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    b.add(this.mesh);
    this.enabled = true;
    this.forceAll = 0;
    this.write();
  }
  write() {
    for (let i = 0; i < this.pos.length; i++) {
      _q.setFromEuler(_e.set(0, this.yaw[i], 0));
      _m.compose(this.pos[i], _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(game) {
    if (!this.enabled || !this.mesh.parent?.visible) return;
    const cam = game.camera;
    let changed = false;
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      const want = Math.atan2(cam.position.x - p.x, cam.position.z - p.z) + Math.PI;
      _v.copy(p).project(cam);
      const inView = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      if ((!inView || this.forceAll > 0) && Math.abs(want - this.yaw[i]) > 0.01) { this.yaw[i] = want; changed = true; }
    }
    this.forceAll = Math.max(0, this.forceAll - 1);
    if (changed) this.write();
  }
}

// Print lab, control room, warehouse, dispatch, returns cage, freight elevator.
export function buildProduction(L, game) {
  const lib = game.lib;
  const R = {};
  const glassMat = (zone) => lib.plain({ color: 0x8ea4a8, rough: 0.04, metal: 0, transparent: true, opacity: 0.2, zone, physical: { clearcoat: 1 } });
  const addGlass = (b, w, h, pos, rotY = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat(b.zone)); m.position.set(...pos); m.rotation.y = rotY; b.add(m); return m; };

  // ================================================================ PRINT LAB
  let b = L.builder('printlab');
  const labWall = { r: 'panel', color: 0xc8ccc4, grime: 1.3 };
  b.room({
    x0: -16, z0: -46, x1: 16, z1: -22, h: 5.5, wall: labWall, floor: { r: 'concrete', color: 0x8a9a90, rough: 0.55 }, ceil: { r: 'corrugated', color: 0x5a5e60, metal: 0.15 },
    base: false, skip: ['e'], sides: { s: [{ at: 16, w: 2.2, h: 2.6, frame: { r: 'metalPaint', color: 0x3a3d3f } }] },
  });
  R.labDoors = new Door(L, { id: 'labDoors', zone: 'printlab', x: 0, z: -22, w: 2.2, h: 2.6, axis: 'x', kind: 'slideGlass', hinge: -1 });
  // walkway lines
  for (const x of [-4, 4]) b.box(0.1, 0.004, 22, [x, 0.003, -34], { r: 'plain', color: 0xd8b21a, rough: 0.6 }, { cast: false, ao: false });
  b.box(28, 0.004, 0.1, [2, 0.003, -34], { r: 'plain', color: 0xd8b21a, rough: 0.6 }, { cast: false, ao: false });
  // roof trusses + pipes
  for (let x = -14; x <= 14; x += 4) {
    b.box(0.12, 0.35, 24, [x, 5.2, -34], { r: 'metalPaint', color: 0x4a4e50 }, { seg: 4 });
  }
  P.pipe(b, [[-15.8, 4.6, -45], [-15.8, 4.6, -24], [-10, 4.6, -23], [15, 4.6, -23]], 0.1, { r: 'metalPaint', color: 0x6a7a6f });
  P.pipe(b, [[-15.6, 4.2, -45.6], [15.6, 4.2, -45.6]], 0.14, { r: 'metalPaint', color: 0x8a3a2a });
  // printers: two rows of five
  const ballMat = new THREE.MeshPhysicalMaterial({ map: printedFaceTexture('smile'), roughness: 0.45, clearcoat: 0.5, emissive: 0x2a1800, emissiveIntensity: 0.25 });
  R.printers = [];
  for (const z of [-29.5, -38.5]) for (const x of [-6, -2, 2, 6, 10]) R.printers.push(P.printer(b, x, z, z > -34 ? 0 : Math.PI, { ballMat, period: 22 + Math.random() * 10 }));
  R.printLights = [];
  for (const z of [-26, -34, -42]) for (const x of [-8, 0, 8]) R.printLights.push(P.bulb(b, x, 5.1, z, { cord: 0.6, shade: true, shadeColor: 0x2c3a33, intensity: 7, range: 11, color: 0xf2f6ff, state: (x + z) % 3 === 0 ? 'flicker' : 'on' }));
  P.sign(b, 'PRINT FLOOR 2 · QUALITY CONTROL', 0, 4.3, -22.1, Math.PI, 3.6, 0.4, { bg: '#1c3a5a', fg: '#e8eef4', font: 'bold 60px Arial' });
  P.sign(b, 'EVERY FRIEND IS INSPECTED BY HAND', 0, 3.6, -45.9, 0, 3.6, 0.3, { bg: '#e8e2d0', fg: '#1c3a5a', font: 'bold 50px Arial' });
  poster(b, 'safety', -15.9, 1.7, -36, Math.PI / 2, 0.6, 0.84);
  // QC benches along the north wall with rows of finished units (watching)
  const qc = [];
  for (const [i, x] of [-1, 4.5, 10].entries()) {
    b.box(4.2, 0.06, 1.0, [x, 0.92, -44.6], { r: 'brushed', color: 0xb8bcb8, rough: 0.4 }, { bevel: 0.01, collide: 'low' });
    for (const s of [-1, 1]) b.box(0.06, 0.9, 0.9, [x + s * 2.0, 0.45, -44.6], { r: 'metalPaint', color: 0x55595a }, {});
    b.box(4.0, 0.04, 0.8, [x, 0.3, -44.6], { r: 'metalPaint', color: 0x55595a }, {});
    for (let k = 0; k < 9; k++) qc.push({ x: x - 1.8 + k * 0.45, y: 0.95 + 0.17 + 0.02, z: -44.75 + (k % 2) * 0.3, ry: 0 });
    // inspection lamps
    b.geo(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6), { r: 'brushed' }, [x + 1.6, 1.35, -45.0]);
    if (i === 1) R.benchLamp = P.bulb(b, x + 1.6, 1.8, -44.8, { cord: 0.02, shade: true, intensity: 2.5, range: 4, color: 0xfff2d8 });
  }
  R.watchers = new WatchingBalls(b, qc);
  // the fuse tin
  const tin = dyn(b, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 20), lib.get('metalPaint', { color: 0xb02a1a, rough: 0.4, zone: b.zone }), [10.9, 1.0, -44.3]);
  R.fuseTin = tin;
  L.interact(tin, { label: (g) => (g.state.items.includes('fuse') ? null : 'Take a fuse'), onInteract: (g) => g.story.takeFuse?.() });
  paper(b, 'd6', 3.4, 0.95, -44.3, 0.2, { label: 'Read the QC report', stamp: 'REJECT' });
  figure(b, 5, 6.3, 1.72, -38.5);
  // reject bins (wire cages full of half-printed shells)
  const shells = [];
  for (const [bx, bz] of [[-13.5, -43.5], [-10.5, -43.5]]) {
    P.chainFence(b, bx - 1.2, bz - 1.2, bx + 1.2, bz - 1.2, 1.4);
    P.chainFence(b, bx - 1.2, bz + 1.2, bx + 1.2, bz + 1.2, 1.4);
    P.chainFence(b, bx - 1.2, bz - 1.2, bx - 1.2, bz + 1.2, 1.4);
    P.chainFence(b, bx + 1.2, bz - 1.2, bx + 1.2, bz + 1.2, 1.4);
    for (let i = 0; i < 26; i++) shells.push([bx + (Math.random() - 0.5) * 2, 0.15 + Math.random() * 0.9, bz + (Math.random() - 0.5) * 2]);
  }
  {
    const g = new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6);
    const m = new THREE.InstancedMesh(g, lib.plain({ color: 0xc89a24, rough: 0.5, side: THREE.DoubleSide, zone: b.zone }), shells.length);
    shells.forEach((p, i) => { _q.setFromEuler(_e.set(Math.random() * 3, Math.random() * 6, Math.random() * 3)); _m.compose(new THREE.Vector3(...p), _q, _s); m.setMatrixAt(i, _m); });
    m.castShadow = true;
    b.add(m);
  }
  const lid = dyn(b, new THREE.BoxGeometry(2.4, 0.04, 2.4), lib.get('metalPaint', { color: 0x6a6e6a, zone: b.zone }), [-10.5, 1.42, -43.5]);
  R.binLid = lid;
  R.binSpawn = [new THREE.Vector3(-10.5, 0, -41.8), new THREE.Vector3(-13.5, 0, -41.8)];
  P.sign(b, 'REJECTS — KEEP LOCKED — DO NOT TURN YOUR BACK', -12, 1.75, -42.28, 0, 2.6, 0.22, { bg: '#c9372c', fg: '#fff', font: 'bold 44px Arial' });
  scrawl(b, 'LOOK AT THEM', -15.88, 2.6, -40, Math.PI / 2, { w: 2.6 });
  scrawl(b, 'they only want to be finished', 15.8, 2.4, -30, -Math.PI / 2, { nv: true, w: 3.4 });
  // throwable rejects on the floor
  R.throwSpots = [[-8, 0.07, -40], [3, 0.07, -26], [12, 0.07, -41]];

  // ---- control room (west, glass)
  const cb = L.builder('control');
  cb.floor(-16, -31, -9, -22, { r: 'vct', color: 0x8a8a80 }, { t: 0.02, y: 0.012 });
  cb.ceiling(-16, -31, -9, -22, 3, { r: 'ceilingTile', color: 0xc8c4b8 });
  cb.wall(-9, -31, -9, -22, { h: 3, mat: labWall, openings: [{ at: 2.2, w: 3.2, h: 1.4, sill: 1.0, frame: { r: 'metalPaint', color: 0x3a3d3f } }, { at: 5.6, w: 0.95, h: 2.1 }, { at: 7.6, w: 1.6, h: 1.4, sill: 1.0, frame: { r: 'metalPaint', color: 0x3a3d3f } }] });
  cb.wall(-16, -31, -9, -31, { h: 3, mat: labWall, openings: [{ at: 3.5, w: 4, h: 1.4, sill: 1.0, frame: { r: 'metalPaint', color: 0x3a3d3f } }] });
  addGlass(cb, 3.2, 1.4, [-9, 1.7, -28.8], Math.PI / 2);
  addGlass(cb, 1.6, 1.4, [-9, 1.7, -23.4], Math.PI / 2);
  addGlass(cb, 4, 1.4, [-12.5, 1.7, -31]);
  // control room walls above 3 m up to the lab ceiling
  cb.box(0.16, 2.5, 9, [-9, 4.25, -26.5], labWall, {});
  cb.box(7, 2.5, 0.16, [-12.5, 4.25, -31], labWall, {});
  R.ctrlDoor = new Door(L, { id: 'control', zone: 'control', x: -9, z: -25.4, w: 0.95, h: 2.1, axis: 'z', hinge: -1, swing: 1, kind: 'metal', color: 0x4a5a60, window: true, sign: 'CONTROL' });
  const cd = P.desk(cb, -11.2, -29.9, 0, { w: 2.2, d: 0.8 });
  const status = new CanvasScreen(256, 192, (ctx, w, h, t, s) => drawCRT(s.lines || ['POWER BUDGET', '', 'LOADING...'], { title: 'HF-GRID', color: s.color || '#7dff9c' })(ctx, w, h, t), { fps: 3 });
  const sc = P.crt(cb, cd[0] - 0.4, cd[1], cd[2] + 0.05, Math.PI + 0.1);
  sc.mat.emissiveMap = status.texture;
  sc.mat.emissiveIntensity = 1.1;
  R.gridScreen = status;
  tapeDeck(cb, 'r3', cd[0] + 0.6, cd[1], cd[2] + 0.1, 0.4);
  figure(cb, 6, -15.6, 2.2, -30.6, { nv: true });
  P.officeChair(cb, -11.2, -29.0, 2.8);
  hideLocker(cb, -15.7, -24, Math.PI / 2, { color: 0x5a6a5a });
  // the big breaker panel on the west wall
  cb.box(0.2, 1.8, 2.6, [-15.86, 1.55, -27], { r: 'metalPaint', color: 0x7a7e78, grime: 1.3 }, { bevel: 0.02 });
  const bp = makeSignMesh('DISTRIBUTION BOARD 2 · 100 A', 2.4, 0.18, { bg: '#e8e2d0', fg: '#222', font: 'bold 44px Arial' });
  bp.position.set(-15.75, 2.35, -27);
  bp.rotation.y = Math.PI / 2;
  cb.add(bp);
  R.gridLevers = [];
  for (let i = 0; i < 6; i++) {
    const lv = dyn(cb, new THREE.BoxGeometry(0.05, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), [-15.72, 1.5, -28.05 + i * 0.42], [0, 0, 0.6]);
    const led = dyn(cb, new THREE.CircleGeometry(0.014, 10), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x30ff40, emissiveIntensity: 0 }), [-15.745, 1.8, -28.05 + i * 0.42], [0, Math.PI / 2, 0], false);
    R.gridLevers.push({ lv, led });
  }
  const fuseSlot = dyn(cb, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), lib.get('plastic', { color: 0x111111, zone: cb.zone }), [-15.72, 1.05, -27], [0, 0, Math.PI / 2]);
  R.fuseSlot = fuseSlot;
  hitbox(cb, [-15.7, 1.55, -27], [0.3, 1.8, 2.6], { label: (g) => g.story.gridLabel?.(), onInteract: (g) => g.story.useGrid?.() });
  R.ctrlFluo = P.fluoTrough(cb, -12.5, 3, -26.5, { state: 'flicker', intensity: 3.5 });

  // ================================================================ WAREHOUSE
  b = L.builder('warehouse');
  const wh = { r: 'cinder', color: 0xa8aaa0, grime: 1.5 };
  const whUp = { r: 'corrugated', color: 0x8a948e, grime: 1.3 };
  b.floor(16, -50, 60, -6, { r: 'concrete', color: 0x9a9890, rough: 0.7 }, { seg: 1.5 });
  // roof + trusses + skylights
  b.ceiling(16, -50, 60, -6, 9, { r: 'corrugated', color: 0x4a4e50, metal: 0.15 }, { seg: 3 });
  for (let z = -48; z <= -8; z += 5) b.box(44, 0.5, 0.14, [38, 8.6, z], { r: 'metalPaint', color: 0x3a3e40 }, { seg: 4, cast: false });
  const skylights = [];
  for (const [x, z] of [[27, -18], [39, -30], [51, -42], [33, -42], [45, -18]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), lib.plain({ color: 0x1a2430, rough: 0.1, emissive: 0x0a1018, emissiveIntensity: 1, zone: b.zone }));
    g.rotation.x = Math.PI / 2;
    g.position.set(x, 8.94, z);
    b.add(g);
    skylights.push(g);
    b.box(3.2, 0.004, 3.2, [x, 0.004, z], { r: 'concrete', color: 0x8a8880, rough: 0.2, wet: 1.6 }, { cast: false, ao: false });
  }
  R.skylights = skylights;
  // walls: cinder to 3 m, corrugated above
  const docks = [26, 34, 42, 50];
  b.wall(14, -6, 60, -6, { h: 3.9, mat: wh, base: false, openings: docks.map((x) => ({ at: x - 14, w: 3.4, h: 3.8, frame: { r: 'metalPaint', color: 0xd8b21a } })) });
  b.box(46, 5.1, 0.16, [37, 6.45, -6], whUp, { seg: 2 });
  b.wall(16, -50, 60, -50, { h: 9, mat: wh, base: false });
  b.wall(60, -50, 60, -6, { h: 9, mat: wh, base: false });
  b.wall(16, -50, 16, -6, { h: 9, mat: wh, base: false, openings: [{ at: 16, w: 3.0, h: 3.2, frame: { r: 'metalPaint', color: 0xd8b21a } }] });
  for (const [x0, z0, x1, z1] of [[16, -49.9, 60, -49.9], [59.9, -50, 59.9, -6], [16.1, -50, 16.1, -6]]) {
    const ax = x0 === x1;
    b.box(ax ? 0.04 : x1 - x0, 5.8, ax ? z1 - z0 : 0.04, [ax ? x0 + (x0 > 30 ? -0.08 : 0.08) : (x0 + x1) / 2, 6.0, ax ? (z0 + z1) / 2 : z0 + 0.08], whUp, { seg: 3, ao: false });
  }
  R.labRoller = new Door(L, { id: 'labRoller', zone: 'warehouse', x: 16, z: -34, w: 3.0, h: 3.2, axis: 'z', kind: 'roller', locked: true, lockLabel: 'No power to the shutter' });
  R.docks = docks.map((x, i) => new Door(L, { id: 'dock' + (i + 1), zone: 'warehouse', x, z: -6, w: 3.4, h: 3.8, axis: 'x', kind: 'roller', locked: true, lockLabel: `DOCK ${i + 1} — locked from the office`, speed: 0.6 }));
  // racking rows with VERITY boxes
  b.noAO = true;
  const rackRows = [24, 30, 36, 42, 48];
  R.racks = [];
  for (const x of rackRows) {
    for (const zc of [-42.2, -33.8, -25.4]) {
      const rk = P.racking(b, x, zc, Math.PI / 2, { bays: 3, levels: 4, lvlH: 2.0 });
      R.racks.push({ x, z: zc, rk });
      // boxes on each level
      for (let l = 0; l <= 4; l++) for (let bay = 0; bay < 3; bay++) {
        if ((x * 7 + zc * 3 + l * 5 + bay) % 5 === 0) continue;
        const lz = zc - 4.05 + (bay + 0.5) * 2.7;
        const y = l === 0 ? 0 : l * 2.0 - 0.2 + 0.08;
        const n = 2 + ((l + bay) % 2);
        for (let k = 0; k < n; k++) P.cardboardBox(b, x + (k % 2 ? 0.25 : -0.25), y, lz - 0.9 + k * 0.62, (k * 0.13) % 0.2 - 0.1, 0.55, 0.5 + (k % 2) * 0.1, 0.5);
      }
    }
  }
  b.noAO = false;
  // box labels (instanced planes) on aisle-facing sides
  {
    const g = new THREE.PlaneGeometry(0.4, 0.2);
    const inst = new THREE.InstancedMesh(g, boxLabelMat(), 300);
    let n = 0;
    for (const x of rackRows) for (const zc of [-42.2, -33.8, -25.4]) for (let l = 0; l <= 3; l++) for (let bay = 0; bay < 3 && n < 300; bay++) {
      if ((x * 7 + zc * 3 + l * 5 + bay) % 5 === 0) continue;
      const lz = zc - 4.05 + (bay + 0.5) * 2.7;
      const y = (l === 0 ? 0 : l * 2.0 - 0.12) + 0.3;
      for (const s of [-1, 1]) {
        _q.setFromEuler(_e.set(0, s * Math.PI / 2, 0));
        _m.compose(new THREE.Vector3(x + s * 0.53, y, lz - 0.6), _q, _s);
        inst.setMatrixAt(n++, _m);
      }
    }
    inst.count = n;
    b.add(inst);
  }
  // forklift + pallets
  P.forklift(b, 45, -30, 0.2);
  for (let i = 0; i < 4; i++) P.pallet(b, 19 + i * 1.3, 0, -47.5, i * 0.1);
  // big boxes you can climb into
  R.boxHides = [hideBox(b, 27, -19.2, 0.1), hideBox(b, 39.2, -47.5, Math.PI), hideBox(b, 51, -21.5, -0.2), hideBox(b, 33, -30.2, Math.PI / 2)];
  // aisle lights
  R.whLights = [];
  for (const x of [27, 33, 39, 45]) for (const z of [-44, -32, -20]) R.whLights.push(P.bulb(b, x, 8.4, z, { cord: 1.2, shade: true, shadeColor: 0x3a3e40, intensity: 12, range: 14, color: 0xfff0d8, state: (x + z) % 4 === 0 ? 'dying' : 'on', volScale: 1.6 }));
  figure(b, 7, 36.3, 2.12, -40.1);
  scrawl(b, 'YOUR BOX SHIPS TOMORROW', 59.85, 3.4, -30, -Math.PI / 2, { w: 4.4 });
  scrawl(b, 'sign for it', 16.2, 2.5, -40, Math.PI / 2, { nv: true, w: 2.4 });
  // ---- conveyor sorting line
  const lineZ = -14;
  P.conveyor(b, 18.5, lineZ, 53, lineZ, { h: 0.85 });
  R.line = { z: lineZ, x0: 18.5, x1: 53, h: 0.85 };
  R.diverters = [];
  for (const [i, x] of [28, 36, 44].entries()) {
    P.conveyor(b, x, lineZ - 0.45, x, lineZ - 5.5, { h: 0.85, color: 0x5c3f3f });
    P.sign(b, 'SHIPPING', x, 1.5, lineZ - 5.8, 0, 1.0, 0.25, { bg: '#1c3a5a', fg: '#fff', font: 'bold 50px Arial' });
    b.box(0.9, 0.8, 0.8, [x, 0.4, lineZ - 6.3], { r: 'cardboard' }, { collide: true });
    // the gate arm (animated) and its lever
    const arm = new THREE.Group();
    arm.position.set(x + 0.5, 0.95, lineZ + 0.42);
    const armM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.04), lib.get('metalPaint', { color: 0xd8b21a, zone: b.zone }));
    armM.position.x = -0.55;
    armM.castShadow = true;
    arm.add(armM);
    b.add(arm);
    b.box(0.25, 1.1, 0.2, [x - 0.8, 0.55, lineZ + 1.0], { r: 'metalPaint', color: 0x3a3e40 }, { collide: true, bevel: 0.02 });
    const lever = new THREE.Group();
    lever.position.set(x - 0.8, 1.12, lineZ + 1.0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), lib.get('brushed', { zone: b.zone }));
    stick.position.y = 0.17;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9372c, roughness: 0.3 }));
    knob.position.y = 0.35;
    lever.add(stick, knob);
    b.add(lever);
    const lbl = makeSignMesh(`DIVERTER ${i + 1}`, 0.3, 0.1, { bg: '#e8e2d0', fg: '#222', font: 'bold 40px Arial', sub: 'L · R' });
    lbl.position.set(x - 0.8, 0.95, lineZ + 1.105);
    b.add(lbl);
    const d = { x, arm, lever, knob, state: 'R', idx: i };
    R.diverters.push(d);
    L.interact(knob, { label: (g) => g.story.diverterLabel?.(d), onInteract: (g) => g.story.toggleDiverter?.(d) });
    L.interact(stick, { label: (g) => g.story.diverterLabel?.(d), onInteract: (g) => g.story.toggleDiverter?.(d) });
  }
  // control desk with START
  b.box(1.4, 1.0, 0.8, [21, 0.5, lineZ + 2.2], { r: 'metalPaint', color: 0x3a4a3e, grime: 1 }, { collide: true, bevel: 0.02 });
  const startBtn = dyn(b, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x1a8a2a, emissive: 0x30ff40, emissiveIntensity: 0.3, roughness: 0.3 }), [21.3, 1.02, lineZ + 2.1]);
  R.startBtn = startBtn;
  P.sign(b, 'SORTER CONTROL', 21, 1.3, lineZ + 2.61, 0, 0.9, 0.16, { bg: '#e8e2d0', fg: '#222', font: 'bold 40px Arial' });
  L.interact(startBtn, { label: (g) => g.story.startLabel?.(), onInteract: (g) => g.story.startSorter?.() });
  // your box, waiting at the intake
  const myBox = new THREE.Group();
  const mb = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.42, 2, 0.01), lib.get('cardboard', { zone: b.zone }));
  mb.castShadow = true;
  myBox.add(mb);
  const mlC = document.createElement('canvas');
  mlC.width = 256; mlC.height = 128;
  const mlT = new THREE.CanvasTexture(mlC);
  mlT.colorSpace = THREE.SRGBColorSpace;
  const ml = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshStandardMaterial({ map: mlT, roughness: 0.8 }));
  ml.position.set(0, 0.03, 0.212);
  myBox.add(ml);
  const ml2 = ml.clone();
  ml2.position.set(0, 0.212, 0);
  ml2.rotation.x = -Math.PI / 2;
  myBox.add(ml2);
  myBox.position.set(19.2, lineZ === -14 ? 0.85 + 0.21 : 1, lineZ);
  b.add(myBox);
  R.myBox = { group: myBox, labelCanvas: mlC, labelTex: mlT };
  L.interact(mb, { label: 'Read the label', onInteract: (g) => g.story.readMyBox?.() });
  // ---- returns cage (east)
  const cx0 = 53.2, cx1 = 59.8, cz0 = -20, cz1 = -9;
  P.chainFence(b, cx0, cz0, cx1, cz0, 3);
  P.chainFence(b, cx0, cz0, cx0, -16, 3);
  P.chainFence(b, cx0, -12.6, cx0, cz1, 3);
  P.chainFence(b, cx0, cz1, cx1, cz1, 3);
  // chute from the end of the line into the cage
  b.box(1.2, 0.05, 1.4, [53.6, 0.6, lineZ], { r: 'brushed', color: 0x9a9a9a }, { rot: [0, 0, -0.35] });
  P.sign(b, 'RETURNS', 53.2, 3.2, lineZ, -Math.PI / 2, 1.6, 0.4, { bg: '#c9372c', fg: '#fff', font: 'bold 70px Arial' });
  // gate (chain-link panel on a hinge)
  const gatePivot = new THREE.Group();
  gatePivot.position.set(cx0, 0, -12.6);
  const gateMesh = P.chainFence({ ...b, add: (m) => gatePivot.add(m), geo: () => {}, collider: () => ({}) , y: 0, zone: b.zone, lib: b.lib }, 0, 0, 0, -3.4, 2.6);
  void gateMesh;
  b.add(gatePivot);
  R.cageGate = { pivot: gatePivot, open: 0, target: 0, locked: true };
  R.cageGate.col = L.addCollider({ minX: cx0 - 0.05, maxX: cx0 + 0.05, minZ: -16, maxZ: -12.6, tag: 'door:cage', layer: 0 });
  L.onUpdate((d) => {
    const G = R.cageGate;
    G.open += (G.target - G.open) * Math.min(1, d * 3);
    gatePivot.rotation.y = -G.open * 1.6;
    G.col.enabled = G.open < 0.5;
  });
  const gateHit = hitbox(b, [cx0, 1.3, -14.3], [0.2, 2.4, 3.4], { label: (g) => g.story.cageLabel?.(), onInteract: (g) => g.story.useCage?.() });
  void gateHit;
  // inside: returned boxes, the key, tape 4
  for (let i = 0; i < 14; i++) P.cardboardBox(b, 55 + (i % 4) * 1.1, Math.floor(i / 8) * 0.5, -18.6 + Math.floor((i % 8) / 4) * 1.4, (i * 0.37) % 0.6 - 0.3, 0.6, 0.5, 0.5);
  b.box(1.0, 0.8, 0.8, [58.8, 0.4, -11], { r: 'wood', color: 0x7a6040 }, { collide: true });
  tapeDeck(b, 'r4', 58.7, 0.8, -11.1, -0.5);
  b.box(0.4, 0.3, 0.05, [59.85, 1.5, -13], { r: 'wood', color: 0x5a4030 }, { rot: [0, -Math.PI / 2, 0] });
  const key = dyn(b, new THREE.BoxGeometry(0.02, 0.12, 0.004), lib.get('brushed', { color: 0xc8a850, zone: b.zone }), [59.8, 1.45, -13]);
  const tag = dyn(b, new THREE.BoxGeometry(0.004, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0xc9372c }), [59.8, 1.36, -13]);
  R.elevKey = { key, tag };
  L.interact(key, { label: (g) => (g.state.items.includes('elevKey') ? null : 'Take the elevator key'), onInteract: (g) => g.story.takeElevKey?.() });
  L.interact(tag, { label: (g) => (g.state.items.includes('elevKey') ? null : 'Take the elevator key'), onInteract: (g) => g.story.takeElevKey?.() });
  // ---- dispatch office (NW corner)
  const db = L.builder('dispatch');
  db.floor(16, -50, 23, -43, { r: 'vct', color: 0x9a968a }, { t: 0.02, y: 0.012 });
  db.ceiling(16, -50, 23, -43, 3, { r: 'ceilingTile', color: 0xc8c4b8 });
  db.wall(23, -50, 23, -43, { h: 3, mat: { r: 'paint', color: 0xb8b4a0 }, openings: [{ at: 2.4, w: 2.4, h: 1.2, sill: 1.0 }] });
  db.wall(16, -43, 23, -43, { h: 3, mat: { r: 'paint', color: 0xb8b4a0 }, openings: [{ at: 4.5, w: 0.95, h: 2.1 }, { at: 1.6, w: 1.8, h: 1.2, sill: 1.0 }] });
  addGlass(db, 2.4, 1.2, [23, 1.6, -47.6], Math.PI / 2);
  addGlass(db, 1.8, 1.2, [17.6, 1.6, -43]);
  R.dispDoor = new Door(L, { id: 'dispatch', zone: 'dispatch', x: 20.5, z: -43, w: 0.95, h: 2.1, axis: 'x', hinge: 1, swing: -1, kind: 'wood', color: 0x6a7a80, sign: 'DISPATCH' });
  const dd = P.desk(db, 19.3, -48.8, 0, { w: 1.8 });
  paper(db, 'd7', dd[0] + 0.2, dd[1], dd[2] + 0.05, 0.1, { label: 'Read the manifest', stamp: 'BAY 3' });
  P.crt(db, dd[0] - 0.55, dd[1], dd[2] - 0.05, 0);
  P.officeChair(db, 19.3, -47.9, Math.PI + 0.3);
  hideLocker(db, 22.6, -49.4, -Math.PI / 2, { color: 0x6a5a4a });
  hideLocker(db, 22.6, -48.8, -Math.PI / 2, { color: 0x6a5a4a });
  P.filingCabinet(db, 16.5, -45, Math.PI / 2);
  figure(db, 8, 16.5, 1.34, -45.1, { nv: true });
  P.corkboard(db, 16.1, 1.6, -47.5, Math.PI / 2, 1.2, 0.8);
  // dock controls on the dispatch wall
  db.box(0.5, 0.7, 0.12, [18, 1.4, -43.08], { r: 'metalPaint', color: 0x5a6a5a }, { bevel: 0.01 });
  hitbox(db, [18, 1.4, -43.2], [0.5, 0.7, 0.2], { label: (g) => g.story.dockPanelLabel?.(), onInteract: (g) => g.story.dockPanel?.() });
  R.dispLamp = P.fluoTrough(db, 19.5, 3, -46.5, { state: 'flicker', intensity: 3.5 });

  // ================================================================ FREIGHT ELEVATOR (shaft spans both floors)
  const eb = L.builder('elevator');
  const shaftM = { r: 'concrete', color: 0x8a8a84, grime: 1.5 };
  // west wall with two landing openings (y 0 and y -8)
  const ex0 = 54.6, ex1 = 60, ez0 = -50, ez1 = -44.4, gz = -47.2, gw = 2.8;
  const Y0 = 0; // floor-relative: the shaft bottom is B1, the top landing is at +8
  const TOP = 8;
  const H = 17;
  const wallPart = (x, z, w, d, y0, y1) => eb.box(w, y1 - y0, d, [x, y0 + (y1 - y0) / 2, z], shaftM, { seg: 1.2 });
  wallPart(ex0, (ez0 + gz - gw / 2) / 2, 0.2, gz - gw / 2 - ez0, Y0, Y0 + H);
  wallPart(ex0, (gz + gw / 2 + ez1) / 2, 0.2, ez1 - gz - gw / 2, Y0, Y0 + H);
  wallPart(ex0, gz, 0.2, gw, Y0 + 2.8, TOP);
  wallPart(ex0, gz, 0.2, gw, TOP + 2.8, Y0 + H);
  wallPart((ex0 + ex1) / 2, ez1, ex1 - ex0, 0.2, Y0, Y0 + H);
  wallPart((ex0 + ex1) / 2, ez0 + 0.1, ex1 - ex0, 0.2, Y0, Y0 + H);
  wallPart(ex1 - 0.1, (ez0 + ez1) / 2, 0.2, ez1 - ez0, Y0, Y0 + H);
  for (const layer of [0, -1]) {
    for (const c of [[ex0 - 0.1, ez0, ex0 + 0.1, gz - gw / 2], [ex0 - 0.1, gz + gw / 2, ex0 + 0.1, ez1], [ex0, ez1 - 0.1, ex1, ez1 + 0.1], [ex0, ez0, ex1, ez0 + 0.2], [ex1 - 0.2, ez0, ex1, ez1]]) {
      L.addCollider({ minX: c[0], minZ: c[1], maxX: c[2], maxZ: c[3], tag: 'wall', layer });
    }
  }
  P.sign(eb, 'FREIGHT', ex0 - 0.11, TOP + 3.2, gz, -Math.PI / 2, 1.2, 0.3, { bg: '#d8b21a', fg: '#111', font: 'bold 60px Arial' });
  P.sign(eb, 'FREIGHT · B1', ex0 - 0.11, Y0 + 3.2, gz, -Math.PI / 2, 1.2, 0.3, { bg: '#d8b21a', fg: '#111', font: 'bold 60px Arial' });
  R.gateTop = new Door(L, { id: 'gateTop', zone: 'warehouse', x: ex0, z: gz, w: gw, h: 2.7, axis: 'z', kind: 'roller', locked: true, lockLabel: 'FREIGHT ELEVATOR — key required', speed: 1.2 });
  R.gateBottom = new Door(L, { id: 'gateBottom', zone: 'coldhall', x: ex0, z: gz, w: gw, h: 2.7, axis: 'z', kind: 'roller', locked: true, lockLabel: 'The gate won’t lift', speed: 1.2 });
  // key switch at the top landing
  eb.box(0.14, 0.26, 0.08, [ex0 - 0.15, TOP + 1.35, gz + gw / 2 + 0.35], { r: 'brushed', color: 0x9a9a9a }, { bevel: 0.01 });
  hitbox(eb, [ex0 - 0.2, TOP + 1.35, gz + gw / 2 + 0.35], [0.2, 0.35, 0.2], { label: (g) => g.story.elevKeyLabel?.(), onInteract: (g) => g.story.useElevKey?.() });
  // the cab
  const cab = new THREE.Group();
  cab.position.set((ex0 + ex1) / 2 + 0.1, 0, (ez0 + ez1) / 2);
  const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 5.2), lib.get('rust', { color: 0x8a8a8a, zone: eb.zone }));
  cabFloor.position.y = -0.06;
  cabFloor.receiveShadow = true;
  cab.add(cabFloor);
  const cabRail = lib.get('metalPaint', { color: 0xd8b21a, zone: eb.zone });
  for (const [w, d, x, z] of [[5, 0.06, 0, -2.55], [5, 0.06, 0, 2.55], [0.06, 5.2, 2.45, 0]]) {
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), cabRail);
    r1.position.set(x, 1.0, z);
    r1.castShadow = true;
    cab.add(r1);
  }
  const cabTop = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 5.2), lib.get('metalPaint', { color: 0x3a3e40, zone: eb.zone }));
  cabTop.position.y = 3.2;
  cab.add(cabTop);
  for (const [x, z] of [[-2.4, -2.5], [2.4, -2.5], [-2.4, 2.5], [2.4, 2.5]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 0.1), cabRail);
    post.position.set(x, 1.6, z);
    cab.add(post);
  }
  const panelMesh = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.4, 0.06, 2, 0.01), lib.get('brushed', { zone: eb.zone }));
  panelMesh.position.set(-2.35, 1.3, 1.9);
  panelMesh.rotation.y = Math.PI / 2;
  cab.add(panelMesh);
  const panelLED = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 }));
  panelLED.position.set(-2.315, 1.42, 1.9);
  panelLED.rotation.y = Math.PI / 2;
  cab.add(panelLED);
  eb.add(cab);
  const cabLight = game.lights.add({ type: 'bulb', position: new THREE.Vector3(), color: 0xffe8c0, intensity: 3, range: 6, zone: eb.zone, state: 'buzz', volScale: 1 });
  R.cab = { group: cab, light: cabLight, led: panelLED, y: 0, x0: ex0 + 0.15, x1: ex1 - 0.2, z0: ez0 + 0.2, z1: ez1 - 0.1 };
  L.interact(panelMesh, { label: (g) => g.story.cabLabel?.(), onInteract: (g) => g.story.useCab?.() });
  L.onUpdate(() => {
    cab.position.y = R.cab.y;
    cabLight.position.set(cab.position.x, R.cab.y + 3.0, cab.position.z);
  });
  // cables up the shaft
  for (const x of [-0.6, 0.6]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 17, 6), lib.get('brushed', { color: 0x444444, zone: eb.zone }));
    cable.position.set(cab.position.x + x, Y0 + 8.5, cab.position.z);
    eb.add(cable);
  }
  L.onUpdate((d) => {
    R.watchers.update(game);
    status.update(d);
    for (const p of R.printers) if (!p.stopped) p.update(d * (R.printSpeed ?? 1));
    // the sorter arms follow their lever
    for (const dv of R.diverters) {
      const want = dv.state === 'L' ? -1.1 : 0;
      dv.arm.rotation.y += (want - dv.arm.rotation.y) * Math.min(1, d * 6);
      dv.lever.rotation.x += ((dv.state === 'L' ? -0.5 : 0.5) - dv.lever.rotation.x) * Math.min(1, d * 10);
    }
  });
  return R;
}
