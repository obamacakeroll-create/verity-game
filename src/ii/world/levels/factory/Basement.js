import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as P from '../../Props2.js';
import { Door, makeSignMesh } from '../../Door.js';
import { drawBall } from '../../Screens.js';
import { hitbox, tapeDeck, paper, figure, hideLocker, poster, scrawl, dyn } from './common.js';
import { printedFaceTexture } from './Production.js';

const Y = -8;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

// Sub-basement: cold storage, the prototype archive, Dr. Penrose's lab,
// Vera's room, the service tunnel and the Core.
export function buildBasement(L, game) {
  const lib = game.lib;
  const R = {};
  const frostWall = { r: 'panel', color: 0xc8d0d4, grime: 1.2 };
  // ================================================================ COLD HALL
  let b = L.builder('coldhall');
  b.room({
    x0: 28, z0: -49, x1: 54.6, z1: -45, h: 3, wall: frostWall, floor: { r: 'concrete', color: 0x8a9094, rough: 0.5 }, ceil: { r: 'panel', color: 0xa8b0b4 },
    skip: ['e'], base: false,
    sides: { n: [{ at: 8, w: 1.2, h: 2.2 }, { at: 14, w: 1.2, h: 2.2 }, { at: 20, w: 1.2, h: 2.2 }], w: [{ at: 2, w: 1.2, h: 2.2 }] },
  });
  // the east end is the elevator shaft wall (built with the shaft); close the gaps
  // floor drains, pipes, frost-rimed ducts
  P.pipe(b, [[28.3, 2.7, -45.3], [54.3, 2.7, -45.3]], 0.1, { r: 'metalPaint', color: 0x6a7a7f, frost: true });
  P.pipe(b, [[28.3, 2.45, -45.4], [54.3, 2.45, -45.4]], 0.06, { r: 'brushed', color: 0x9aa0a4, frost: true });
  b.box(26, 0.35, 0.5, [41.3, 2.8, -48.6], { r: 'metalPaint', color: 0x8a9498, frost: true }, { seg: 2 });
  R.hallLights = [];
  for (const x of [32, 38, 44, 50]) R.hallLights.push(P.fluoTrough(b, x, 3, -47, { rot: Math.PI / 2, state: x === 44 ? 'flicker' : 'buzz', intensity: 3.2, color: 0xd8f0ff }));
  // freezer doors
  R.freezerDoors = [];
  for (const [i, x, label] of [[0, 36, 'FREEZER A'], [1, 42, 'FREEZER B'], [2, 48, 'ARCHIVE — PROTOTYPES']]) {
    R.freezerDoors.push(new Door(L, { id: 'fz' + i, zone: 'coldhall', x, z: -49, w: 1.2, h: 2.2, axis: 'x', hinge: -1, swing: -1, kind: 'freezer' }));
    P.sign(b, label, x, 2.5, -48.9, 0, 1.1, 0.18, { bg: '#1c3a5a', fg: '#e8eef4', font: 'bold 44px Arial' });
  }
  // lockers to hide in (south wall)
  R.coldLockers = [hideLocker(b, 34, -45.3, Math.PI, { color: 0x5a6a78 }), hideLocker(b, 46, -45.3, Math.PI, { color: 0x5a6a78 }), hideLocker(b, 52.5, -45.3, Math.PI, { color: 0x5a6a78 })];
  for (const x of [34.52, 46.52, 52.0]) P.locker(b, x, -45.3, Math.PI, { color: 0x5a6a78 });
  // the valve board (west end, beside the lab door)
  b.box(1.6, 1.2, 0.14, [30.4, 1.5, -45.1], { r: 'metalPaint', color: 0x6a7a7f, frost: true }, { bevel: 0.02 });
  const vb = makeSignMesh('LAB DOOR THAW — 3 VALVES', 1.5, 0.16, { bg: '#e8e2d0', fg: '#222', font: 'bold 44px Arial' });
  vb.position.set(30.4, 2.2, -45.19);
  vb.rotation.y = Math.PI;
  b.add(vb);
  R.valves = [];
  for (let i = 0; i < 3; i++) {
    const wheel = dyn(b, new THREE.TorusGeometry(0.12, 0.018, 8, 24), new THREE.MeshStandardMaterial({ color: [0x2a5aa8, 0x2a5aa8, 0x2a5aa8][i], roughness: 0.4, metalness: 0.5 }), [29.9 + i * 0.5, 1.4, -45.25], [0, 0, 0]);
    const n = makeSignMesh(String(i + 1), 0.1, 0.1, { bg: '#e8e2d0', fg: '#111', font: 'bold 70px Arial' });
    n.position.set(29.9 + i * 0.5, 1.12, -45.19);
    n.rotation.y = Math.PI;
    b.add(n);
    R.valves.push(wheel);
  }
  hitbox(b, [30.4, 1.4, -45.3], [1.6, 1.0, 0.3], { label: (g) => g.story.valveLabel?.(), onInteract: (g) => g.story.useValves?.() });
  paper(b, 'd8', 31.6, 1.55, -45.2, Math.PI, { wall: true, label: 'Read the maintenance note', color: '#f0e68c', w: 0.2, h: 0.2 });
  scrawl(b, 'SHE KEPT EVERYTHING COLD', 41, 1.6, -45.17, Math.PI, { w: 3.4 });
  scrawl(b, 'do the opposite', 29.5, 2.2, -48.9, 0, { nv: true, w: 2.0 });
  // the frozen lab door (west end)
  R.labDoor = new Door(L, { id: 'labDoor', zone: 'coldhall', x: 28, z: -47, w: 1.2, h: 2.2, axis: 'z', hinge: -1, swing: 1, kind: 'freezer', locked: true, lockLabel: 'Frozen shut' });
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 1.4, 4, 8, 6), lib.get('frost', { color: 0xdff4ff, zone: b.zone, rough: 0.3, metal: 0, transparent: true, opacity: 0.85 }));
  {
    const p = ice.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (Math.random() - 0.3) * 0.08);
    ice.geometry.computeVertexNormals();
  }
  ice.position.set(28.12, 1.15, -47);
  b.add(ice);
  R.labIce = ice;
  P.sign(b, 'DR. R. PENROSE — PRIVATE', 28.1, 2.5, -47, Math.PI / 2, 1.2, 0.18, { bg: '#e8e2d0', fg: '#222', font: 'bold 44px Georgia' });

  // ---- freezer A: racks of frozen boxes
  b = L.builder('freezerA');
  b.room({ x0: 33, z0: -57, x1: 39, z1: -49, h: 3, wall: frostWall, floor: { r: 'rust', color: 0x7a8084 }, ceil: { r: 'panel', color: 0xa8b0b4 }, skip: ['s'], base: false });
  b.noAO = true;
  for (const x of [34, 38]) for (let l = 0; l < 4; l++) {
    b.box(0.8, 0.04, 6.5, [x, 0.4 + l * 0.6, -53.4], { r: 'brushed', color: 0x9aa0a4, frost: true }, {});
    for (let k = 0; k < 8; k++) if ((k + l + x) % 3) P.cardboardBox(b, x, 0.42 + l * 0.6, -56.4 + k * 0.8, 0, 0.5, 0.4, 0.5);
  }
  for (const x of [33.62, 34.38, 37.62, 38.38]) for (const z of [-56.6, -50.2]) b.box(0.04, 2.6, 0.04, [x, 1.3, z], { r: 'brushed', frost: true }, {});
  b.noAO = false;
  b.colliderBox([34, 0, -53.4], 0.8, 6.6, 0, 'wall');
  b.colliderBox([38, 0, -53.4], 0.8, 6.6, 0, 'wall');
  R.fzALight = P.bulb(b, 36, 2.95, -53, { cord: 0.1, intensity: 2.4, range: 6, color: 0xd8f0ff, state: 'flicker' });
  // ---- freezer B: rows of chairs with boxes on their heads
  b = L.builder('freezerB');
  b.room({ x0: 39, z0: -57, x1: 45, z1: -49, h: 3, wall: frostWall, floor: { r: 'concrete', color: 0x8a9094 }, ceil: { r: 'panel', color: 0xa8b0b4 }, skip: ['s', 'w'], base: false });
  b.wall(39, -57, 39, -49, { h: 3, mat: frostWall, base: false });
  const people = [];
  const names = ['HARLOW, M.', 'HARLOW, D.', 'OKAFOR, D.', 'LINDQVIST, G.', 'PAT', 'WREN ST. #3', 'RETURNED', 'RETURNED', 'RETURNED'];
  let ni = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = 40.3 + c * 1.7, z = -55.8 + r * 1.9;
    P.chair(b, x, z, Math.PI);
    // a figure: slumped body in a coat with a box over its head
    const body = new THREE.Group();
    body.position.set(x, 0, z);
    body.rotation.y = Math.PI;
    const coat = lib.get('fabric', { color: [0x3a3a40, 0x4a3a30, 0x2a3440][(r + c) % 3], zone: b.zone, frost: true, scale: 2 });
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.62, 0.26, 3, 0.1), coat);
    torso.position.set(0, 0.8, 0.06);
    torso.rotation.x = -0.1;
    const legs = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.14, 0.45, 2, 0.06), coat);
    legs.position.set(0, 0.52, -0.16);
    const shins = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.45, 0.13, 2, 0.05), coat);
    shins.position.set(0, 0.25, -0.36);
    const arms = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.12, 0.3, 2, 0.05), coat);
    arms.position.set(0, 0.62, -0.12);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.32, 0.32, 2, 0.01), lib.get('cardboard', { zone: b.zone, frost: true }));
    head.position.set(0, 1.28, 0.04);
    const lbl = makeSignMesh(names[ni++], 0.24, 0.1, { bg: '#f2ede0', fg: '#a01a10', font: 'bold 40px Arial' });
    lbl.position.set(0, 0.03, -0.162);
    lbl.rotation.y = Math.PI;
    head.add(lbl);
    body.add(torso, legs, shins, arms, head);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    b.add(body);
    people.push({ body, head });
  }
  R.boxPeople = people;
  // one empty chair, your name on the box beside it
  P.chair(b, 44.1, -50.2, Math.PI + 0.4);
  R.emptyChairBox = dyn(b, new RoundedBoxGeometry(0.34, 0.32, 0.32, 2, 0.01), lib.get('cardboard', { zone: b.zone }), [44.5, 0.16, -49.8], [0, 0.4, 0]);
  L.interact(R.emptyChairBox, { label: 'Read the label', onInteract: (g) => g.story.readChairBox?.() });
  figure(b, 9, 42.0, 0.47, -52.0);
  R.fzBLight = P.bulb(b, 42, 2.95, -53, { cord: 0.1, intensity: 2.2, range: 6, color: 0xd8f0ff, state: 'buzz' });
  // ---- archive: prototype cabinets, F-01 in cabinet 4
  b = L.builder('archive');
  b.room({ x0: 45, z0: -57, x1: 51, z1: -49, h: 3, wall: frostWall, floor: { r: 'vct', color: 0x8a8e90 }, ceil: { r: 'panel', color: 0xa8b0b4 }, skip: ['s', 'w'], base: false });
  b.wall(45, -57, 45, -49, { h: 3, mat: frostWall, base: false });
  R.cabinets = [];
  for (let i = 0; i < 6; i++) {
    const x = 46 + (i % 3) * 2, z = i < 3 ? -56.3 : -52.6;
    const rot = i < 3 ? 0 : Math.PI;
    b.box(1.0, 1.9, 0.7, [x, 0.95, z + (i < 3 ? 0 : 0)], { r: 'metalPaint', color: 0x5a6468, frost: true }, { bevel: 0.02, collide: true });
    const n = makeSignMesh(`CABINET ${i + 1}`, 0.4, 0.1, { bg: '#e8e2d0', fg: '#222', font: 'bold 40px Arial', sub: i === 3 ? 'F-01 · DO NOT ANSWER' : ['V-00 · shell', 'V-02 · voice only', 'V-03 · melted', '', 'empty', 'empty'][i] });
    n.position.set(x, 1.75, z + (i < 3 ? 0.356 : -0.356));
    n.rotation.y = rot;
    b.add(n);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), lib.plain({ color: 0x8ea4a8, rough: 0.05, transparent: true, opacity: 0.25, zone: b.zone }));
    glass.position.set(x, 0.95 + 0.0, z + (i < 3 ? 0.353 : -0.353));
    glass.rotation.y = rot;
    b.add(glass);
    R.cabinets.push({ x, z, glass });
  }
  // the prototype: a grey, older ball with a single red eye
  const f01 = new THREE.Group();
  const fc = R.cabinets[3];
  f01.position.set(fc.x, 1.0, fc.z);
  const fShell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0x8a8e90, roughness: 0.6, metalness: 0.3, clearcoat: 0.2 }));
  const fEye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 3 }));
  fEye.position.set(0, 0.03, -0.16);
  const crack = new THREE.Mesh(new THREE.TorusGeometry(0.171, 0.004, 4, 48, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  crack.rotation.set(0.4, 0.3, 0);
  f01.add(fShell, fEye, crack);
  f01.rotation.y = Math.PI;
  b.add(f01);
  const f01Light = game.lights.add({ type: 'bulb', position: new THREE.Vector3(fc.x, Y + 1.0, fc.z - 0.4), color: 0xff2a1a, intensity: 0.5, range: 2.5, zone: b.zone, emissive: fEye.material, emissiveBase: 3, volScale: 1.5 });
  R.falsity = { group: f01, eye: fEye, light: f01Light, pos: new THREE.Vector3(fc.x, Y + 1.0, fc.z - 0.3) };
  hitbox(b, [fc.x, 1.0, fc.z - 0.4], [0.9, 1.2, 0.3], { label: (g) => g.story.falsityLabel?.(), onInteract: (g) => g.story.talkFalsity?.() });
  figure(b, 10, 50.5, 1.92, -56.3, { nv: true });
  R.archLight = P.bulb(b, 48, 2.95, -54.5, { cord: 0.1, intensity: 2.0, range: 6, color: 0xd8f0ff, state: 'dying' });

  // ================================================================ RUTH'S LAB
  b = L.builder('lab');
  const labW = { r: 'wallpaper', color: 0xb8c0b0, grime: 1.3 };
  b.room({ x0: 16, z0: -53, x1: 28, z1: -41, h: 3.2, wall: labW, floor: { r: 'vct', color: 0x9a9688 }, ceil: { r: 'ceilingTile', color: 0xb8b4a8 }, skip: ['e'], sides: { w: [{ at: 6, w: 1.4, h: 2.3 }] } });
  b.wall(28, -53, 28, -41, { h: 3.2, mat: labW, openings: [{ at: 6, w: 1.2, h: 2.2 }] });
  // benches, equipment, voice waveforms taped to the wall
  P.desk(b, 25.5, -52.3, 0, { w: 2.4 });
  P.desk(b, 25.5, -41.7, Math.PI, { w: 2.4 });
  const ld = P.desk(b, 17, -44.5, Math.PI / 2, { w: 1.8 });
  tapeDeck(b, 'r5', ld[0], ld[1], ld[2] - 0.3, Math.PI / 2);
  P.officeChair(b, 17.8, -44.5, -Math.PI / 2);
  // reel-to-reel machine
  b.box(0.6, 0.5, 0.35, [25.2, 1.0, -52.3], { r: 'plastic', color: 0x8a8070 }, { bevel: 0.02 });
  for (const dx of [-0.15, 0.15]) b.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24).rotateX(Math.PI / 2), { r: 'plastic', color: 0x2a2a2a }, [25.2 + dx, 1.12, -52.12]);
  P.corkboard(b, 22, 1.7, -52.9, 0, 2.4, 1.1);
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f2ede0'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#1a1a3a'; x.lineWidth = 2; x.beginPath();
    for (let k = 0; k < 256; k++) x.lineTo(k, 64 + Math.sin(k * 0.2 + i) * Math.sin(k * 0.03 + i) * 40 * Math.random());
    x.stroke();
    x.fillStyle = '#a01a10'; x.font = '18px Arial'; x.fillText(['"why is the sky blue"', '"do you love me"', '"where did mummy go"', '"ask me anything"', '"VERA 1996"'][i], 8, 20);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    dyn(b, new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), [20.9 + (i % 3) * 0.75, 1.55 + Math.floor(i / 3) * 0.35, -52.87], [0, 0, (Math.random() - 0.5) * 0.1], false);
  }
  // recording booth (glass cube with a microphone)
  const bx0 = 23, bx1 = 26.6, bz0 = -45, bz1 = -41.2;
  b.box(bx1 - bx0, 0.1, bz1 - bz0, [(bx0 + bx1) / 2, 0.05, (bz0 + bz1) / 2], { r: 'carpet', color: 0x2a2a30 }, { cast: false });
  for (const [w, px, pz, ry] of [[bx1 - bx0, (bx0 + bx1) / 2, bz0, 0], [bz1 - bz0 - 1.0, bx0, (bz0 + bz1) / 2 + 0.5, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), lib.plain({ color: 0x8ea4a8, rough: 0.04, transparent: true, opacity: 0.2, zone: b.zone }));
    m.position.set(px, 1.2, pz);
    m.rotation.y = ry;
    b.add(m);
  }
  b.collider(bx0 - 0.05, bz0 - 0.05, bx1, bz0 + 0.05);
  b.collider(bx0 - 0.05, bz0 + 1.0, bx0 + 0.05, bz1);
  b.geo(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), { r: 'brushed' }, [24.8, 0.75, -43.1]);
  b.geo(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), { r: 'brushed' }, [24.8, 0.015, -43.1]);
  const mic = dyn(b, new THREE.CapsuleGeometry(0.04, 0.08, 6, 12), lib.get('brushed', { color: 0x777777, zone: b.zone }), [24.8, 1.55, -43.1]);
  R.mic = mic;
  b.box(0.36, 0.52, 0.36, [25.8, 0.26, -42.2], { r: 'fabric', color: 0xd8b21a }, { bevel: 0.1, collide: true });
  const onAir = makeSignMesh('ON AIR', 0.5, 0.16, { bg: '#300', fg: '#ff3a2a', font: 'bold 70px Arial', emissive: 0 });
  onAir.position.set(24.8, 2.6, -45.03);
  b.add(onAir);
  R.onAir = onAir;
  L.interact(mic, { label: 'Speak into the microphone', onInteract: (g) => g.story.useMic?.() });
  R.labLights = [P.fluoTrough(b, 20, 3.2, -47, { state: 'off', intensity: 3.5 }), P.fluoTrough(b, 25, 3.2, -48, { state: 'off', intensity: 3.5 })];
  R.labLamp = P.bulb(b, 17.2, 1.35, -44.1, { cord: 0.02, shade: true, intensity: 1.6, range: 4, color: 0xffc890, state: 'on' });
  poster(b, 'missing', 27.85, 1.6, -44, -Math.PI / 2, 0.42, 0.6);
  scrawl(b, 'YOU CAN STOP NOW', 16.1, 2.6, -50, Math.PI / 2, { nv: true, w: 2.8 });
  // ---- Vera's room (tiny bedroom inside the lab)
  const vb2 = L.builder('vera');
  vb2.floor(16, -53, 21, -48, { r: 'carpet', color: 0xc89aa8 }, { t: 0.02, y: 0.012 });
  vb2.wall(21, -53, 21, -48, { h: 3.2, mat: { r: 'wallpaper', color: 0xe8c8d0 }, openings: [{ at: 3.8, w: 0.85, h: 2.05 }] });
  vb2.wall(16, -48, 21, -48, { h: 3.2, mat: { r: 'wallpaper', color: 0xe8c8d0 } });
  R.veraDoor = new Door(L, { id: 'vera', zone: 'vera', x: 21, z: -49.2, w: 0.85, h: 2.05, axis: 'z', hinge: 1, swing: -1, kind: 'wood', color: 0xf0e0e4, sign: "VERA'S ROOM" });
  P.bed(vb2, 17.2, -51.2, Math.PI / 2, { color: 0xe8a8c0 });
  const vn = P.nightstand(vb2, 17.0, -49.3, Math.PI / 2);
  R.nightlight = P.bulb(vb2, vn[0], vn[1] + 0.1, vn[2], { cord: 0.01, shade: true, shadeColor: 0xf2c21a, intensity: 1.2, range: 3.5, color: 0xffd080, state: 'on' });
  paper(vb2, 'd9', 18.4, 0.63, -51.2, 0.3, { label: 'Look at the drawing', color: '#fffdf4' });
  figure(vb2, 11, 17.0, 0.64, -52.1);
  // toys: a small yellow ball, blocks, a teddy
  dyn(vb2, new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshPhysicalMaterial({ map: printedFaceTexture('smile'), roughness: 0.4, clearcoat: 0.6 }), [19.6, 0.12, -50.2], [0, 2.4, 0]);
  for (let i = 0; i < 5; i++) vb2.box(0.08, 0.08, 0.08, [20.2 + (i % 3) * 0.1, 0.04 + Math.floor(i / 3) * 0.08, -52.4], { r: 'wood', color: [0xc9372c, 0x2b6bd2, 0xf2c21a, 0x3ea84a, 0xe07b1f][i] }, { rot: [0, i * 0.4, 0] });
  const ted = new THREE.Group();
  ted.position.set(20.3, 0.02, -48.5);
  const fur = lib.get('fabric', { color: 0x8a6a4a, zone: vb2.zone, scale: 0.5 });
  const tb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), fur); tb.position.y = 0.1; tb.scale.set(1, 1.2, 0.9);
  const th = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); th.position.y = 0.26;
  ted.add(tb, th);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), fur); e.position.set(s * 0.055, 0.32, 0); ted.add(e); }
  ted.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  vb2.add(ted);
  // stars on the ceiling (glow)
  const starC = document.createElement('canvas');
  starC.width = starC.height = 256;
  {
    const x = starC.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#b8ffb0';
    for (let i = 0; i < 26; i++) { const sx = Math.random() * 256, sy = Math.random() * 256; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, r = k % 2 ? 3 : 7; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.fill(); }
  }
  const starT = new THREE.CanvasTexture(starC);
  const stars = dyn(vb2, new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: starT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }), [18.5, 3.18, -50.5], [Math.PI / 2, 0, 0], false);
  void stars;
  // ================================================================ TUNNEL
  b = L.builder('tunnel');
  const tw = { r: 'concrete', color: 0x7a7a74, grime: 1.8 };
  b.floor(-3, -48.6, 16, -45.4, { r: 'concrete', color: 0x6a6a64, wet: 0.8 });
  b.ceiling(-3, -48.6, 16, -45.4, 2.6, tw);
  b.wall(-3, -48.6, 16, -48.6, { h: 2.6, mat: tw, base: false });
  b.wall(-3, -45.4, 16, -45.4, { h: 2.6, mat: tw, base: false });
  for (let x = 14; x > -2; x -= 3) b.box(0.25, 2.6, 3.4, [x, 1.3, -47], { r: 'concrete', color: 0x6a6a64 }, { ao: false }).userData = {};
  for (let x = 14; x > -2; x -= 3) { b.collider(x - 0.13, -48.6, x + 0.13, -48.3); b.collider(x - 0.13, -45.7, x + 0.13, -45.4); }
  P.pipe(b, [[15.8, 2.2, -45.7], [-2.8, 2.2, -45.7]], 0.12, { r: 'rust', color: 0x7a6a5a });
  P.pipe(b, [[15.8, 2.35, -48.3], [-2.8, 2.35, -48.3]], 0.08, { r: 'metalPaint', color: 0x5a6a5a });
  R.tunnelLights = [];
  for (let i = 0; i < 5; i++) R.tunnelLights.push(P.bulb(b, 13 - i * 3.6, 2.5, -47, { cord: 0.08, intensity: 2.2, range: 5, color: 0xffc88a, state: i === 2 ? 'dying' : i === 4 ? 'flicker' : 'on' }));
  scrawl(b, 'ASK ME ANYTHING', 6, 1.5, -45.47, Math.PI, { w: 2.6 });
  scrawl(b, 'ASK ME ANYTHING', 2, 1.8, -48.53, 0, { w: 2.6 });
  scrawl(b, 'ask me anything ask me anything ask me', 9, 1.2, -48.53, 0, { nv: true, w: 3.8 });

  // ================================================================ THE CORE
  b = L.builder('core');
  const C = new THREE.Vector3(-15, 0, -47), RAD = 12.5, CH = 14;
  b.floor(-28, -60, -2, -34, { r: 'concrete', color: 0x5a5a56, rough: 0.6, wet: 0.5 }, { seg: 2 });
  // circular wall from segments, doorway at the east (angle 0)
  const N = 56;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.08) {
      // doorway: only the part above the tunnel
      const x = C.x + Math.cos(am) * RAD, z = C.z + Math.sin(am) * RAD;
      b.box(0.5, CH - 2.6, (RAD * 2 * Math.PI) / N + 0.05, [x, 2.6 + (CH - 2.6) / 2, z], { r: 'concrete', color: 0x6a6a64 }, { rot: [0, -am, 0], seg: 2 });
      continue;
    }
    const x = C.x + Math.cos(am) * (RAD + 0.25), z = C.z + Math.sin(am) * (RAD + 0.25);
    b.box(0.5, CH, (RAD * 2 * Math.PI) / N + 0.05, [x, CH / 2, z], { r: 'concrete', color: 0x6a6a64, grime: 1.6 }, { rot: [0, -am, 0], seg: 2 });
    L.addCollider({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4, tag: 'wall', layer: -1 });
  }
  // dome-ish ceiling
  b.geo(new THREE.CylinderGeometry(RAD + 0.6, RAD + 0.6, 0.3, 48), { r: 'concrete', color: 0x4a4a46 }, [C.x, CH, C.z]);
  // the ball wall: the far half, forming a face
  const balls = [];
  const cols = [];
  const faceAt = (u, v) => {
    // u: -1..1 across, v: 0..1 up. eyes + crescent mouth are dark
    const ex = Math.abs(Math.abs(u) - 0.28), ey = v - 0.66;
    const eye = ex * ex / 0.012 + ey * ey / 0.018 < 1;
    const mr = Math.hypot(u, (v - 0.55) * 1.3);
    const mouth = mr > 0.42 && mr < 0.52 && v < 0.5 && Math.abs(u) < 0.6;
    return eye ? 2 : mouth ? 1 : 0;
  };
  const rb = 0.19;
  for (let row = 0; row < 36; row++) {
    const y = 0.2 + row * rb * 1.72;
    const rr = RAD - 0.25 - (row % 2) * 0.08;
    const n = Math.floor((Math.PI * 1.25 * rr) / (rb * 2));
    for (let k = 0; k < n; k++) {
      const a = Math.PI * 0.375 + (k + (row % 2) * 0.5) / n * Math.PI * 1.25;
      const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
      const u = (a - Math.PI) / (Math.PI * 0.625);
      const v = y / (36 * rb * 1.72);
      balls.push({ x, y, z, ry: -a + Math.PI / 2 + Math.PI, s: 0.95 + Math.random() * 0.1, f: faceAt(u, v) });
    }
  }
  const bgeo = new THREE.SphereGeometry(rb, 12, 8);
  const bmat = new THREE.MeshStandardMaterial({ map: printedFaceTexture('smile'), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.0 });
  const wall = new THREE.InstancedMesh(bgeo, bmat, balls.length);
  const col = new THREE.Color();
  balls.forEach((p, i) => {
    _q.setFromEuler(_e.set(0, p.ry, 0));
    _s.setScalar(p.s);
    _m.compose(new THREE.Vector3(p.x, p.y, p.z), _q, _s);
    wall.setMatrixAt(i, _m);
    col.set(p.f === 2 ? 0x0a0806 : p.f === 1 ? 0x100804 : 0xffffff);
    wall.setColorAt(i, col);
  });
  _s.set(1, 1, 1);
  wall.instanceColor.needsUpdate = true;
  wall.receiveShadow = true;
  b.add(wall);
  R.ballWall = { mesh: wall, balls, mat: bmat };
  // balls heaped on the floor against the wall
  const heap = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.PI * 0.4 + Math.random() * Math.PI * 1.2;
    const r = RAD - 0.4 - Math.pow(Math.random(), 2) * 4;
    heap.push({ x: C.x + Math.cos(a) * r, y: 0.17 + Math.max(0, (r - (RAD - 4.4)) / 4) * Math.random() * 0.9, z: C.z + Math.sin(a) * r, ry: Math.random() * 6 });
  }
  {
    const m = new THREE.InstancedMesh(bgeo, bmat, heap.length);
    heap.forEach((p, i) => { _q.setFromEuler(_e.set(Math.random(), p.ry, Math.random())); _m.compose(new THREE.Vector3(p.x, p.y, p.z), _q, _s); m.setMatrixAt(i, _m); m.setColorAt(i, col.set(0xffffff)); });
    m.castShadow = true;
    m.receiveShadow = true;
    b.add(m);
    R.ballHeap = m;
  }
  // the mother printer: a gantry over a half-built giant head
  const g = { r: 'metalPaint', color: 0x2a2e30, grime: 1.2 };
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    b.box(0.35, 11, 0.35, [C.x + dx, 5.5, C.z + dz], g, { seg: 2, collide: true });
  }
  for (const s of [-4, 4]) { b.box(8.4, 0.4, 0.4, [C.x, 11, C.z + s], g, { seg: 2 }); b.box(0.4, 0.4, 8.4, [C.x + s, 11, C.z], g, { seg: 2 }); }
  b.box(9, 0.3, 9, [C.x, 0.15, C.z], { r: 'brushed', color: 0x6a6e70, rough: 0.4 }, { seg: 1.5 });
  const mpHead = new THREE.Group();
  mpHead.position.set(C.x, 7, C.z);
  const hbox = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.0, 1.2, 2, 0.08), lib.get('metalPaint', { color: 0x1a1a1a, zone: b.zone }));
  const noz = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff6a20, emissiveIntensity: 3 }));
  noz.rotation.x = Math.PI;
  noz.position.y = -0.7;
  mpHead.add(hbox, noz);
  mpHead.traverse((o) => { o.castShadow = true; });
  b.add(mpHead);
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), Y + 3.2);
  const giantMat = new THREE.MeshPhysicalMaterial({ map: printedFaceTexture('grin'), roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, clippingPlanes: [clip], emissive: 0x2a1400, emissiveIntensity: 0.3 });
  const giant = new THREE.Mesh(new THREE.SphereGeometry(2.6, 64, 48), giantMat);
  giant.position.set(C.x, 0.3 + 2.6, C.z);
  giant.rotation.y = Math.PI / 2;
  giant.castShadow = true;
  b.add(giant);
  L.addCollider({ minX: C.x - 2.8, maxX: C.x + 2.8, minZ: C.z - 2.8, maxZ: C.z + 2.8, tag: 'prop', layer: -1 });
  const coreLight = game.lights.add({ type: 'bulb', position: new THREE.Vector3(C.x, Y + 6.2, C.z), color: 0xff8a30, intensity: 8, range: 16, zone: b.zone, emissive: noz.material, emissiveBase: 3, state: 'buzz', volScale: 1.4 });
  const wallLight = game.lights.add({ type: 'bulb', position: new THREE.Vector3(C.x - 6, Y + 5, C.z), color: 0xffc040, intensity: 0, range: 18, zone: b.zone, volScale: 0.8 });
  R.core = { C, RAD, head: mpHead, giant, clip, coreLight, wallLight, noz };
  L.onUpdate((dt, t) => {
    mpHead.position.x = C.x + Math.sin(t * 0.7) * 2.2;
    mpHead.position.z = C.z + Math.cos(t * 0.9) * 2.2;
  });
  // Vera's shoe under the gantry, the recall notice
  const shoe = dyn(b, new RoundedBoxGeometry(0.1, 0.07, 0.22, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xc9372c, roughness: 0.5 }), [C.x + 3.4, 0.33, C.z + 2.6], [0, 0.7, 0]);
  L.interact(shoe, { label: 'A child’s shoe', onInteract: (gm) => gm.story.shoe?.() });
  paper(b, 'd10', C.x + 5.5, 0.3, C.z - 1.2, 0.5, { label: 'Read the notice', stamp: 'RECALL' });
  R.coreSpot = new THREE.Vector3(C.x + 6.5, Y, C.z);
  return R;
}
