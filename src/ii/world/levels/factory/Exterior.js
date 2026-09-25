import * as THREE from 'three';
import * as P from '../../Props2.js';
import { makeSignMesh } from '../../Door.js';
import { cityBackdrop, windowGlass, skyDome } from '../../Exterior.js';
import { car, dyn } from './common.js';

// The car park in the rain, the building's face, the loading-dock yard,
// and a stretch of night road for the drive.
export function buildExterior(L, game) {
  const lib = game.lib;
  const asphalt = { r: 'asphalt', color: 0x8a8a8a, wet: 1, grime: 0.3 };
  // ------------------------------------------------------------ car park
  let b = L.builder('lot');
  b.floor(-34, 4, 14, 36, asphalt, { seg: 2 });
  b = L.builder('yard');
  b.floor(14, -6, 64, 36, asphalt, { seg: 2 });
  // ground beyond the fence (verge + street) — no AO
  b = L.builder('lot');
  b.box(260, 0.1, 200, [15, -0.07, 60], { r: 'asphalt', color: 0x5a5a5a, wet: 1, scale: 2 }, { cast: false, ao: false, seg: 40 });
  // parking bays
  for (let i = 0; i < 9; i++) {
    const x = -28 + i * 3.2;
    b.box(0.1, 0.005, 5, [x, 0.003, 12], { r: 'plain', color: 0xd8d4c0, rough: 0.7 }, { cast: false, ao: false });
    b.box(0.1, 0.005, 5, [x, 0.003, 26], { r: 'plain', color: 0xd8d4c0, rough: 0.7 }, { cast: false, ao: false });
  }
  // kerbs + planters along the facade
  b.box(48, 0.15, 0.3, [-10, 0.075, 5.2], { r: 'concrete', color: 0xa09c94 }, { ao: false });
  for (const x of [-24, -14, 10.5]) {
    b.box(2.4, 0.5, 1.0, [x, 0.25, 6], { r: 'concrete', color: 0x8c8880 }, { collide: true, bevel: 0.03 });
    P.plant(b, x - 0.6, 6);
    P.plant(b, x + 0.6, 6);
  }
  // your car
  const carRef = car(b, 4, 20, 0.12, { color: 0x3c1a1a });
  // an abandoned staff car, windows smashed
  car(b, -22, 26, Math.PI + 0.05, { color: 0x3c4a52 });
  // dumpster + bins
  b.box(2.0, 1.3, 1.2, [-30, 0.65, 8], { r: 'metalPaint', color: 0x2a4a2a, grime: 1.2, wet: 1 }, { collide: true, bevel: 0.03 });
  b.box(2.1, 0.08, 1.3, [-30, 1.34, 8], { r: 'plastic', color: 0x1a1a1a }, { rot: [0.12, 0, 0] });
  // fence around the site
  P.chainFence(b, -34, 36, 14, 36, 2.6);
  P.chainFence(b, -34, 4, -34, 36, 2.6);
  b = L.builder('yard');
  P.chainFence(b, 14, 36, 64, 36, 2.6);
  P.chainFence(b, 64, -6, 64, 36, 2.6);
  P.chainFence(b, 60, -6, 64, -6, 2.6);
  // lamp posts (sodium)
  b = L.builder('lot');
  const lamps = [];
  for (const [bz, x, z] of [['lot', -18, 18], ['lot', 6, 30], ['yard', 30, 14], ['yard', 50, 6], ['lot', -6, 9.5]]) {
    const bb = L.builder(bz);
    bb.geo(new THREE.CylinderGeometry(0.07, 0.1, 7, 12), { r: 'metalPaint', color: 0x3a3a38, wet: 1 }, [x, 3.5, z]);
    bb.box(0.9, 0.12, 0.3, [x + 0.4, 7.0, z], { r: 'metalPaint', color: 0x2a2a28 }, { bevel: 0.03 });
    bb.colliderBox([x, 0, z], 0.3, 0.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffa040, emissiveIntensity: 0 }));
    m.position.set(x + 0.5, 6.93, z);
    bb.add(m);
    const f = game.lights.add({ type: 'lamp', position: new THREE.Vector3(x + 0.5, 6.6, z), color: 0xffa24a, intensity: 18, range: 18, zone: bb.zone, emissive: m.material, emissiveBase: 8, state: x === 30 ? 'dying' : 'on', volScale: 1.6 });
    lamps.push(f);
  }
  // street lamps outside the fence
  for (let i = 0; i < 6; i++) {
    const x = -30 + i * 16;
    b.geo(new THREE.CylinderGeometry(0.06, 0.08, 6, 10), { r: 'metalPaint', color: 0x3a3a38 }, [x, 3, 41]);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff9a3a, emissiveIntensity: 6 }));
    m.position.set(x, 6.1, 41);
    b.add(m);
  }
  const city = cityBackdrop(260, 60, 11);
  city.position.set(15, 18, 150);
  city.rotation.y = Math.PI;
  L.dynamic.add(city);
  const city2 = cityBackdrop(200, 50, 5);
  city2.position.set(-120, 14, 0);
  city2.rotation.y = Math.PI / 2;
  L.dynamic.add(city2);
  const sky = skyDome(220);
  L.dynamic.add(sky);
  L.onUpdate(() => sky.position.copy(game.camera.position).setY(0));

  // ------------------------------------------------------------ facade
  const brick = { r: 'brick', color: 0x9a6a58, wet: 0.6, grime: 1.2 };
  const clad = { r: 'corrugated', color: 0x9aa4a2, grime: 1.4, wet: 0.6 };
  // brick plinth on the outside of the front walls
  for (const [x0, x1] of [[-32, -1.3], [1.3, 14]]) b.box(x1 - x0, 1.1, 0.12, [(x0 + x1) / 2, 0.55, 4.14], brick, { ao: false });
  // cladding bands above windows
  b.box(46, 1.2, 0.1, [-9, 3.05 + 0.5, 4.14], clad, { ao: false });
  b.box(16.4, 2.4, 0.3, [0, 5.6, 4.0], clad, { ao: false }); // lobby parapet
  b.box(24.4, 0.7, 0.3, [-20, 3.35, 4.0], clad, { ao: false });
  b.box(6.2, 0.7, 0.3, [11, 3.35, 4.0], clad, { ao: false });
  // canopy
  b.box(6.4, 0.18, 3.2, [0, 3.45, 5.6], { r: 'metalPaint', color: 0x2a2c2e, wet: 1 }, { bevel: 0.03 });
  for (const s of [-1, 1]) b.geo(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 12), { r: 'brushed', color: 0x777777 }, [s * 2.9, 1.7, 6.9]);
  for (const s of [-1, 1]) b.colliderBox([s * 2.9, 0, 6.9], 0.2, 0.2);
  const canopyLamp = P.bulb(b, 0, 3.34, 5.6, { cord: 0.02, intensity: 5, range: 8, color: 0xfff0d8, state: 'flicker' });
  // HELPFUL FRIENDS sign (neon letters on a backing box)
  const signBack = makeSignMesh('HELPFUL FRIENDS Co.', 9, 1.3, { bg: '#0d0d10', fg: '#ffd33a', font: 'bold 110px Georgia', emissive: 1.2, sub: 'ASK ME ANYTHING!' });
  signBack.position.set(0, 5.6, 4.17);
  b.add(signBack);
  const signF = game.lights.add({ type: 'sign', position: new THREE.Vector3(0, 5.2, 5.2), color: 0xffc840, intensity: 5, range: 9, zone: b.zone, emissive: signBack.material, emissiveBase: 1.2, state: 'flicker', volScale: 2 });
  // NOW HIRING banner, torn
  const banner = makeSignMesh('NOW HIRING', 3.2, 0.8, { bg: '#e8e2d0', fg: '#b02a1a', font: 'bold 90px Arial', sub: 'friendly staff wanted · ask inside' });
  banner.position.set(-14, 2.1, 4.2);
  banner.rotation.z = 0.04;
  b.add(banner);
  // unit number
  P.sign(b, 'UNIT 9', 9.5, 2.6, 4.2, 0, 1.2, 0.4, { bg: '#2a2a2a', fg: '#e8e8e8', font: 'bold 60px Arial' });
  // site sign by the gate
  b.geo(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), { r: 'metalPaint', color: 0x444444 }, [9, 1.1, 34]);
  b.geo(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), { r: 'metalPaint', color: 0x444444 }, [11.6, 1.1, 34]);
  const site = makeSignMesh('KESSLER INDUSTRIAL PARK', 2.8, 1.0, { bg: '#1c3a5a', fg: '#e8eef4', font: 'bold 60px Arial', sub: 'UNIT 9 · HELPFUL FRIENDS CO. · DELIVERIES VIA YARD' });
  site.position.set(10.3, 1.7, 33.95);
  site.rotation.y = Math.PI;
  b.add(site);

  // ------------------------------------------------------------ yard: loading docks
  b = L.builder('yard');
  for (const [i, x] of [26, 34, 42, 50].entries()) {
    for (const s of [-1, 1]) b.box(0.25, 0.5, 0.3, [x + s * 1.8, 1.0, -5.75], { r: 'rubber', color: 0x1a1a1a }, { bevel: 0.03 });
    P.sign(b, 'DOCK ' + (i + 1), x, 4.2, -5.9, 0, 1.0, 0.35, { bg: '#e8c21a', fg: '#111', font: 'bold 60px Arial' });
    P.wallLamp(b, x - 2.4, 3.9, -5.92, 0, { intensity: 3.5, range: 9, color: 0xfff2d8, state: i === 2 ? 'dying' : 'on' });
    // bollards
    for (const s of [-1, 1]) {
      b.geo(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 14), { r: 'metalPaint', color: 0xd8b21a, wet: 1 }, [x + s * 2.2, 0.5, -4.6]);
      b.colliderBox([x + s * 2.2, 0, -4.6], 0.24, 0.24);
    }
  }
  // a trailer abandoned at dock 2
  b.box(2.5, 2.8, 9, [34, 1.9, 0.2], { r: 'corrugated', color: 0xc8c8c0, grime: 1.5, wet: 1 }, { collide: true });
  b.box(2.4, 0.3, 8.6, [34, 0.35, 0.2], { r: 'metalPaint', color: 0x222222 }, {});
  for (const lz of [3.4, 2.2]) for (const s of [-1, 1]) b.geo(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 20).rotateZ(Math.PI / 2), { r: 'rubber' }, [34 + s * 1.05, 0.48, lz]);
  P.sign(b, 'HELPFUL FRIENDS', 35.27, 2.3, 0.2, Math.PI / 2, 5, 0.9, { bg: '#c8c8c0', fg: '#b08a10', font: 'bold 90px Georgia', sub: 'delivering friendship since 1996' });
  for (let i = 0; i < 5; i++) P.pallet(b, 44 + (i % 2) * 1.4, (i >> 1) * 0.15, 10 + i * 0.1, i * 0.2);
  P.barrel(b, 56, -3.8);
  P.barrel(b, 56.7, -3.3, { color: 0x8a2a1a });

  // ------------------------------------------------------------ the drive (a stretch of road, far away)
  const road = buildRoad(L, game);

  return { carRef, lamps, canopyLamp, signF, sky, city, road };
}

// A night road for the drive cutscene: the car's interior stays put and the
// world streams past it.
function buildRoad(L, game) {
  const RX = 400, RZ = 0;
  const b = L.builder('road');
  const grp = new THREE.Group();
  grp.position.set(RX, 0, RZ);
  b.add(grp);
  // road surface (scrolling texture)
  const set = game.lib.set('asphalt');
  const roadTex = set.map.clone();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(2, 60);
  roadTex.needsUpdate = true;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, color: 0x777777, roughness: 0.35, metalness: 0 });
  const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 400), roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.z = -150;
  roadMesh.receiveShadow = true;
  grp.add(roadMesh);
  // lane markings: instanced dashes
  const dashGeo = new THREE.PlaneGeometry(0.14, 3);
  dashGeo.rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.4, emissive: 0x111008 }), 40);
  grp.add(dashes);
  // verges
  const verge = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), new THREE.MeshStandardMaterial({ color: 0x0c100a, roughness: 1 }));
  verge.rotation.x = -Math.PI / 2;
  verge.position.set(0, -0.02, -150);
  grp.add(verge);
  // lamp posts that stream by (their lights are pooled fixtures)
  const posts = [];
  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 8, 8);
  const postMat = game.lib.get('metalPaint', { color: 0x333333, zone: b.zone });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(postGeo, postMat);
    pole.position.y = 4;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), postMat);
    arm.position.set(i % 2 ? -0.8 : 0.8, 7.9, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff9a3a, emissiveIntensity: 10 }));
    head.position.set(i % 2 ? -1.4 : 1.4, 7.82, 0);
    g.add(pole, arm, head);
    g.position.set(i % 2 ? 6.2 : -6.2, 0, -i * 30);
    grp.add(g);
    const f = game.lights.add({ type: 'lamp', position: new THREE.Vector3(), color: 0xff9a40, intensity: 26, range: 20, zone: b.zone, volScale: 1.4 });
    posts.push({ g, f, head });
  }
  // trees / hedges as dark silhouettes
  const treeGeo = new THREE.ConeGeometry(1.6, 7, 7);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x050805, roughness: 1 }), 60);
  const tm = new THREE.Matrix4();
  const treeZ = [];
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (10 + Math.random() * 25), z = -Math.random() * 300, s = 0.7 + Math.random() * 0.8;
    treeZ.push([x, z, s]);
    tm.makeScale(s, s, s).setPosition(x, 3.5 * s, z);
    trees.setMatrixAt(i, tm);
  }
  grp.add(trees);
  // ---- the car interior (stays put)
  const car = new THREE.Group();
  car.position.set(-1.8, 0, 0);
  grp.add(car);
  const dash = game.lib.get('plastic', { color: 0x1c1c1e, zone: b.zone });
  const fab = game.lib.get('fabric', { color: 0x3a3a40, zone: b.zone });
  const paint = game.lib.get('metalPaint', { color: 0x3c1a1a, zone: b.zone, rough: 0.35 });
  const add = (geo, mat, p, r = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; car.add(m); return m; };
  add(new THREE.BoxGeometry(1.6, 0.35, 0.6), dash, [0, 0.95, -0.95], [-0.25, 0, 0]);
  add(new THREE.BoxGeometry(1.6, 0.12, 0.35), dash, [0, 1.08, -0.72]);
  add(new THREE.BoxGeometry(0.5, 0.52, 0.6), fab, [-0.36, 0.62, 0.35]);
  add(new THREE.BoxGeometry(0.5, 0.7, 0.14), fab, [-0.36, 1.05, 0.66], [0.15, 0, 0]);
  add(new THREE.BoxGeometry(0.5, 0.52, 0.6), fab, [0.36, 0.62, 0.35]);
  add(new THREE.BoxGeometry(0.5, 0.7, 0.14), fab, [0.36, 1.05, 0.66], [0.15, 0, 0]);
  add(new THREE.BoxGeometry(1.4, 0.45, 0.55), fab, [0, 0.6, 1.5]);
  add(new THREE.BoxGeometry(1.4, 0.65, 0.14), fab, [0, 1.05, 1.82], [0.12, 0, 0]);
  add(new THREE.BoxGeometry(1.7, 0.08, 3.2), paint, [0, 1.55, 0.4]);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 0.6, 3.2), paint, [s * 0.85, 0.55, 0.4]);
    add(new THREE.BoxGeometry(0.06, 0.62, 0.06), paint, [s * 0.8, 1.25, -0.72], [-0.5, 0, 0]);
  }
  const wheel = add(new THREE.TorusGeometry(0.17, 0.02, 10, 28), dash, [-0.36, 0.93, -0.56], [-1.1, 0, 0]);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), dash, [-0.36, 0.86, -0.68], [-1.1 + Math.PI / 2, 0, 0]);
  // gauges glow
  const gauges = add(new THREE.PlaneGeometry(0.36, 0.1), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x3aa0ff, emissiveIntensity: 0.6 }), [-0.36, 1.03, -0.78], [-0.9, 0, 0]);
  const radio = add(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x40ff90, emissiveIntensity: 0.9 }), [0, 0.95, -0.72], [-0.6, 0, 0]);
  // windscreen with rain
  const glass = windowGlass(1.55, 0.72);
  glass.position.set(0, 1.25, -0.82);
  glass.rotation.x = -0.55;
  car.add(glass);
  // wipers
  const wipers = [];
  for (const s of [-0.5, 0.2]) {
    const pv = new THREE.Group();
    pv.position.set(s, 0.98, -0.98);
    pv.rotation.x = -0.55;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.015, 0.012), dash);
    arm.position.x = 0.3;
    pv.add(arm);
    car.add(pv);
    wipers.push(pv);
  }
  // rear-view mirror with a fake reflection (who's in the back seat?)
  const mirC = document.createElement('canvas');
  mirC.width = 256; mirC.height = 96;
  const mirTex = new THREE.CanvasTexture(mirC);
  mirTex.colorSpace = THREE.SRGBColorSpace;
  const mirror = add(new THREE.PlaneGeometry(0.24, 0.08), new THREE.MeshStandardMaterial({ map: mirTex, emissive: 0xffffff, emissiveMap: mirTex, emissiveIntensity: 0.25, roughness: 0.2 }), [0.05, 1.38, -0.62], [0.1, 0, 0]);
  add(new THREE.BoxGeometry(0.26, 0.1, 0.03), dash, [0.05, 1.38, -0.635], [0.1, 0, 0]);
  // the box on the back seat (ending)
  const backBox = new THREE.Group();
  backBox.position.set(0.3, 0.83, 1.45);
  backBox.rotation.y = 0.3;
  const bx = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.42), game.lib.get('cardboard', { zone: b.zone }));
  bx.castShadow = true;
  backBox.add(bx);
  const lbl = makeSignMesh('RETURN TO SENDER', 0.38, 0.14, { bg: '#f2ede0', fg: '#a01a10', font: 'bold 60px Arial' });
  lbl.position.set(0, 0.05, 0.212);
  backBox.add(lbl);
  backBox.visible = false;
  car.add(backBox);
  // headlight beam — a pooled spot fixture
  const headF = game.lights.add({ type: 'spot', position: new THREE.Vector3(RX - 1.8, 0.8, RZ - 2.2), dir: new THREE.Vector3(0, -0.12, -1), angle: 0.6, penumbra: 0.5, color: 0xfff0d0, intensity: 40, range: 40, zone: b.zone, volScale: 0.6 });
  const dashF = game.lights.add({ type: 'bulb', position: new THREE.Vector3(RX - 2.1, 1.1, RZ - 0.6), color: 0x5aa0ff, intensity: 0.4, range: 1.6, zone: b.zone, volScale: 0 });
  const seat = new THREE.Vector3(RX - 1.8 - 0.36, 1.3, RZ + 0.3);
  const state = { speed: 0, wipe: true, wiperT: 0, dist: 0, mirrorFace: 0, dawn: 0 };
  const drawMirror = () => {
    const x = mirC.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, state.dawn > 0.5 ? '#b08a70' : '#0a0c10');
    g.addColorStop(1, state.dawn > 0.5 ? '#5a4030' : '#030304');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 96);
    x.fillStyle = '#16161a';
    x.fillRect(40, 50, 176, 46); // back seat
    if (state.mirrorFace > 0) {
      x.globalAlpha = state.mirrorFace;
      const r = 26 + state.mirrorFace * 6;
      x.fillStyle = '#e0a810';
      x.beginPath(); x.arc(150, 44, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#111';
      x.beginPath(); x.ellipse(140, 38, 4, 6, 0, 0, Math.PI * 2); x.ellipse(160, 38, 4, 6, 0, 0, Math.PI * 2); x.fill();
      x.lineWidth = 3; x.strokeStyle = '#111';
      x.beginPath(); x.arc(150, 44, 16, 0.2, Math.PI - 0.2); x.stroke();
      x.globalAlpha = 1;
    }
    mirTex.needsUpdate = true;
  };
  drawMirror();
  L.onUpdate((dt) => {
    if (!L.zones.get('road').group.visible) return;
    const v = state.speed * dt;
    state.dist += v;
    roadTex.offset.y += v / (400 / 60);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const z = -(((i * 10 - state.dist) % 400) + 400) % 400 + 20;
      m.makeTranslation(0, 0.005, z);
      dashes.setMatrixAt(i, m);
    }
    dashes.instanceMatrix.needsUpdate = true;
    for (const [i, p] of posts.entries()) {
      let z = -i * 30 + (state.dist % 240);
      if (z > 20) z -= 240;
      p.g.position.z = z;
      p.f.position.set(RX + p.g.position.x + (i % 2 ? -1.4 : 1.4), 7.4, RZ + z);
    }
    for (let i = 0; i < 60; i++) {
      const [x, z0, s] = treeZ[i];
      let z = z0 + (state.dist % 300);
      if (z > 20) z -= 300;
      m.makeScale(s, s, s).setPosition(x, 3.5 * s, z);
      trees.setMatrixAt(i, m);
    }
    trees.instanceMatrix.needsUpdate = true;
    if (state.wipe) {
      state.wiperT += dt * 1.6;
      const k = (Math.sin(state.wiperT * Math.PI) * 0.5 + 0.5);
      wipers.forEach((w) => (w.rotation.z = k * 2.4));
      if (Math.abs(Math.sin(state.wiperT * Math.PI)) > 0.995 && state.wipeSound !== Math.round(state.wiperT)) {
        state.wipeSound = Math.round(state.wiperT);
        game.audio.sfx.play('wiper', { volume: 0.6 });
      }
    }
    wheel.rotation.z = Math.sin(game.time * 0.4) * 0.05;
    drawMirror();
  });
  return { grp, state, seat, mirror, backBox, headF, dashF, gauges, radio, carGroup: car, glass };
}
