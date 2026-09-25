import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as P from '../../Props2.js';
import { Door, makeSignMesh } from '../../Door.js';
import { CanvasScreen, drawCRT, drawVending, drawBall } from '../../Screens.js';
import { hitbox, tapeDeck, paper, figure, hideLocker, poster, scrawl, dyn } from './common.js';

// Front of house: reception lobby, security office, the office floor,
// manager's office, break room, and the production corridor.
export function buildFront(L, game) {
  const lib = game.lib;
  const R = {};
  const cream = { r: 'paint', color: 0xd9d2bf, grime: 1.1 };
  const tileCeil = { r: 'ceilingTile', color: 0xcfc9b8, grime: 0.8 };
  const glassMat = (zone) => lib.plain({ color: 0x8ea4a8, rough: 0.04, metal: 0, transparent: true, opacity: 0.18, zone, physical: { clearcoat: 1 } });
  const addGlass = (b, w, h, pos, rotY = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat(b.zone)); m.position.set(...pos); m.rotation.y = rotY; b.add(m); return m; };

  // ================================================================ LOBBY
  let b = L.builder('lobby');
  b.room({
    x0: -8, z0: -10, x1: 8, z1: 4, h: 4.5, wall: cream, floor: { r: 'terrazzo', color: 0xd8d2c6, rough: 0.45 }, ceil: tileCeil,
    baseMat: { r: 'wood', color: 0x4a3a2c, rough: 0.6 },
    sides: {
      s: [{ at: 3, w: 3.2, h: 2.4, sill: 0.9 }, { at: 8, w: 2.3, h: 2.6, frame: { r: 'brushed', color: 0x8a8d8c } }, { at: 13, w: 3.2, h: 2.4, sill: 0.9 }],
      w: [{ at: 7, w: 1.9, h: 2.5, frame: { r: 'brushed', color: 0x8a8d8c } }],
      e: [{ at: 10, w: 0.95, h: 2.1 }],
      n: [{ at: 8, w: 2.1, h: 2.4, frame: { r: 'metalPaint', color: 0x3a3d3f } }],
    },
  });
  for (const x of [-5, 5]) addGlass(b, 3.2, 2.4, [x, 2.1, 4.0]);
  // wainscot panels
  for (const [x0, z0, x1, z1] of [[-8, -10, 8, -10], [-8, -10, -8, 4], [8, -10, 8, 4]]) {
    const ax = x0 === x1;
    b.box(ax ? 0.03 : x1 - x0, 1.1, ax ? z1 - z0 : 0.03, [ax ? x0 + (x0 < 0 ? 0.095 : -0.095) : 0, 0.55, ax ? (z0 + z1) / 2 : z0 + 0.095], { r: 'wood', color: 0x6a5242, rough: 0.55 }, { ao: false });
  }
  // entrance doors (double glass)
  R.entryL = new Door(L, { id: 'entryL', zone: 'lobby', x: -0.575, z: 4, w: 1.15, h: 2.6, axis: 'x', hinge: -1, swing: -1, kind: 'glass' });
  R.entryR = new Door(L, { id: 'entryR', zone: 'lobby', x: 0.575, z: 4, w: 1.15, h: 2.6, axis: 'x', hinge: 1, swing: -1, kind: 'glass' });
  // entry mat + leak puddle
  b.box(2.4, 0.01, 1.6, [0, 0.005, 2.9], { r: 'carpet', color: 0x2a2a2e }, { cast: false });
  b.box(3.5, 0.004, 3.0, [-2.4, 0.003, 0.4], { r: 'terrazzo', color: 0xd8d2c6, rough: 0.2, wet: 1.4 }, { cast: false, ao: false });
  // reception desk (curved front made of angled panels)
  const deskZ = -5.2;
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.16;
    const x = Math.sin(a) * 6, z = deskZ + 5.2 - Math.cos(a) * 5.2 + 0.9;
    b.box(0.92, 1.1, 0.12, [x, 0.55, z], { r: 'wood', color: 0x7a5a3e, rough: 0.5 }, { rot: [0, -a, 0], bevel: 0.01 });
    b.box(0.98, 0.05, 0.5, [x - Math.sin(a) * 0.15, 1.12, z - Math.cos(a) * 0.15], { r: 'laminate', color: 0xe8e2d4, rough: 0.3 }, { rot: [0, -a, 0], bevel: 0.01 });
  }
  b.colliderBox([0, 0, deskZ + 0.95], 6.4, 0.9);
  b.box(4.2, 0.05, 0.7, [0, 0.75, deskZ + 0.35], { r: 'laminate', color: 0xcfc6b4 }, { bevel: 0.01 });
  const dt = P.crt(b, -1.2, 0.775, deskZ + 0.35, Math.PI + 0.3);
  const lobbyCRT = new CanvasScreen(256, 192, drawCRT(['HELPFUL FRIENDS CO.', 'RECEPTION TERMINAL', '', 'VISITORS TODAY: 1', '> WELCOME BACK', ''], { title: 'HF-OS 3.1' }), { fps: 2 });
  dt.mat.emissiveMap = lobbyCRT.texture;
  dt.mat.emissiveIntensity = 0;
  R.lobbyCRT = { screen: lobbyCRT, mat: dt.mat };
  P.officeChair(b, 0.6, deskZ - 0.4, Math.PI);
  // a bell + a visitor book
  b.geo(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { r: 'brushed', color: 0xc8b070, rough: 0.2 }, [0.9, 1.145, deskZ + 1.05]);
  const bell = hitbox(b, [0.9, 1.19, deskZ + 1.05], [0.14, 0.1, 0.14], { label: 'Ring the bell', onInteract: (g) => g.story.ringBell?.() });
  R.bell = bell;
  paper(b, 'd2', -1.5, 1.145, deskZ + 1.12, 0.3, { label: 'Read the brochure', color: '#f7d84a', w: 0.2, h: 0.28 });
  figure(b, 0, -2.2, 0.775, deskZ + 0.4, { rot: 0.5 });
  // logo wall
  b.box(9, 3.2, 0.12, [0, 2.4, -9.86], { r: 'wood', color: 0x5a4030, rough: 0.5 }, { ao: false });
  const logoC = document.createElement('canvas');
  logoC.width = 1024; logoC.height = 512;
  {
    const x = logoC.getContext('2d');
    x.clearRect(0, 0, 1024, 512);
    drawBall(x, 190, 256, 150, 'smile');
    x.fillStyle = '#f2e6c8';
    x.font = 'bold 120px Georgia';
    x.fillText('Helpful', 380, 230);
    x.fillText('Friends', 380, 360);
    x.font = 'italic 40px Georgia';
    x.fillText('"Ask me anything!"', 400, 440);
  }
  const logoTex = new THREE.CanvasTexture(logoC);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0 }));
  logo.position.set(0, 2.5, -9.79);
  b.add(logo);
  R.logo = logo;
  // wall uplights for the logo
  for (const x of [-3.5, 3.5]) R['logoLight' + x] = P.wallLamp(b, x, 1.0, -9.8, 0, { intensity: 2.5, range: 5, color: 0xffd8a0, state: 'off' });
  // display case with the demo unit
  const cx = 4.6, cz = -1.6;
  b.box(0.8, 1.0, 0.8, [cx, 0.5, cz], { r: 'wood', color: 0x3a2a20, rough: 0.4 }, { collide: true, bevel: 0.02 });
  b.box(0.84, 0.04, 0.84, [cx, 1.02, cz], { r: 'brushed', color: 0xb8a060, rough: 0.25 }, { bevel: 0.01 });
  const caseGrp = new THREE.Group();
  caseGrp.position.set(cx, 1.04, cz);
  b.add(caseGrp);
  const cg = glassMat(b.zone);
  for (const [w, h, px, py, pz, ry] of [[0.76, 0.7, 0, 0.35, 0.38, 0], [0.76, 0.7, 0, 0.35, -0.38, 0], [0.76, 0.7, 0.38, 0.35, 0, Math.PI / 2], [0.76, 0.7, -0.38, 0.35, 0, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cg);
    m.position.set(px, py, pz);
    m.rotation.y = ry;
    caseGrp.add(m);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.78), cg);
  lid.position.y = 0.71;
  caseGrp.add(lid);
  const plaque = makeSignMesh('VERITY™ DEMONSTRATION UNIT', 0.5, 0.1, { bg: '#b8a060', fg: '#1a1208', font: 'bold 40px Georgia', sub: 'press the button to say hello!' });
  plaque.position.set(cx, 0.8, cz + 0.405);
  b.add(plaque);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xaa1a10, emissive: 0xff2a10, emissiveIntensity: 0.0, roughness: 0.3 });
  const btn = dyn(b, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), btnMat, [cx + 0.2, 0.62, cz + 0.41], [Math.PI / 2, 0, 0]);
  const caseLight = game.lights.add({ type: 'bulb', position: new THREE.Vector3(cx, 2.0, cz), color: 0xfff0d0, intensity: 0, range: 3, zone: b.zone, volScale: 2 });
  R.displayCase = { pos: new THREE.Vector3(cx, 1.3, cz), lid, btn, btnMat, light: caseLight, group: caseGrp };
  L.interact(btn, { label: (g) => g.story.caseLabel?.(), onInteract: (g) => g.story.pressDemo?.() });
  hitbox(b, [cx, 1.4, cz], [0.8, 0.8, 0.8], { label: (g) => g.story.caseLabel?.(), onInteract: (g) => g.story.pressDemo?.() });
  // waiting area
  P.sofa(b, -5.4, -1.6, Math.PI / 2, { color: 0x6a2a2a });
  P.sofa(b, -2.4, -1.6, -Math.PI / 2, { color: 0x6a2a2a });
  P.coffeeTable(b, -3.9, -1.6, Math.PI / 2);
  P.plant(b, -7.3, 3.3);
  P.plant(b, 7.3, 3.3);
  P.plant(b, -7.3, -9.3);
  // the mascot: a fiberglass Verity on a plinth
  b.box(1.4, 0.6, 1.4, [-5.6, 0.3, -7.6], { r: 'concrete', color: 0xb8b2a8 }, { collide: true, bevel: 0.03 });
  const mascotC = document.createElement('canvas');
  mascotC.width = 1024; mascotC.height = 512;
  {
    const x = mascotC.getContext('2d');
    x.fillStyle = '#e8b818'; x.fillRect(0, 0, 1024, 512);
    x.save(); x.translate(768 - 256, 0); x.scale(0.5, 0.5);
    drawBall(x, 512, 512, 512, 'smile');
    x.restore();
  }
  const mascotTex = new THREE.CanvasTexture(mascotC);
  mascotTex.colorSpace = THREE.SRGBColorSpace;
  const mascot = dyn(b, new THREE.SphereGeometry(0.62, 48, 32), new THREE.MeshPhysicalMaterial({ map: mascotTex, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }), [-5.6, 1.22, -7.6], [0, -Math.PI / 2 + 0.6, 0]);
  R.mascot = mascot;
  P.sign(b, 'OUR FIRST FRIEND · 1996', -5.6, 0.35, -6.89, 0, 0.9, 0.12, { bg: '#b8a060', fg: '#1a1208', font: 'bold 40px Georgia' });
  // lobby lights (off until the breaker)
  R.lobbyFluo = [];
  for (const [x, z] of [[-4, -6], [0, -6], [4, -6], [-4, -1], [0, -1], [4, -1], [-4, 2.5], [4, 2.5]]) R.lobbyFluo.push(P.fluoTrough(b, x, 4.5, z, { state: 'off', intensity: 6, range: 9 }));
  P.exitSign(b, 0, 2.95, 3.9, Math.PI);
  P.exitSign(b, -7.9, 2.8, -3, Math.PI / 2, 'OFFICES');
  poster(b, 'meet', 7.9, 1.8, -6, -Math.PI / 2, 0.8, 1.1);
  poster(b, 'missing', -7.9, 1.6, 1.4, Math.PI / 2, 0.42, 0.6);
  P.corkboard(b, 7.91, 1.6, 1.8, -Math.PI / 2, 1.4, 0.9);
  scrawl(b, 'SHE KNOWS YOU CAME BACK', 7.88, 2.9, -2.2, -Math.PI / 2, { nv: true, w: 3.2 });
  // production doors (keycard)
  R.prodL = new Door(L, { id: 'prodL', zone: 'lobby', x: -0.525, z: -10, w: 1.05, h: 2.4, axis: 'x', hinge: -1, swing: 1, kind: 'metal', color: 0x3e4a50, locked: true, lockLabel: 'PRODUCTION — staff only', window: true });
  R.prodR = new Door(L, { id: 'prodR', zone: 'lobby', x: 0.525, z: -10, w: 1.05, h: 2.4, axis: 'x', hinge: 1, swing: 1, kind: 'metal', color: 0x3e4a50, locked: true, lockLabel: 'PRODUCTION — staff only', window: true });
  P.sign(b, 'PRODUCTION · AUTHORISED STAFF ONLY', 0, 2.8, -9.9, 0, 2.0, 0.22, { bg: '#c9372c', fg: '#fff', font: 'bold 48px Arial' });
  b.box(0.1, 0.16, 0.04, [1.35, 1.25, -9.88], { r: 'plastic', color: 0x222222 }, { bevel: 0.01 });
  const readerLED = dyn(b, new THREE.CircleGeometry(0.01, 10), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 }), [1.35, 1.3, -9.855], [0, 0, 0], false);
  R.reader = { led: readerLED };
  hitbox(b, [1.35, 1.25, -9.8], [0.2, 0.3, 0.15], { label: (g) => g.story.readerLabel?.(), onInteract: (g) => g.story.swipeCard?.() });
  R.secDoor = new Door(L, { id: 'security', zone: 'lobby', x: 8, z: 0, w: 0.95, h: 2.1, axis: 'z', hinge: -1, swing: -1, kind: 'wood', color: 0x5a6a70, sign: 'SECURITY' });

  // ================================================================ SECURITY
  b = L.builder('security');
  b.room({ x0: 8, z0: -6, x1: 14, z1: 4, h: 3, wall: { r: 'paint', color: 0xa8b0a8, grime: 1.3 }, floor: { r: 'vct', color: 0xa8a498 }, ceil: tileCeil, skip: ['w'], sides: { s: [{ at: 3, w: 2, h: 1.2, sill: 1.1 }] } });
  addGlass(b, 2, 1.2, [11, 1.7, 4.0]);
  // desk + CCTV monitors
  P.desk(b, 11, -1.2, 0, { w: 2.2, d: 0.8 });
  const cams = [];
  const camLines = [['CAM 01 — LOBBY', '', '', '     NO SIGNAL'], ['CAM 04 — PRINT LAB', '', '  ▒▒ ▒ ▒▒▒ ▒', '  MOTION'], ['CAM 07 — WAREHOUSE', '', '', '     NO SIGNAL'], ['CAM 09 — COLD STORE', '', '', '  ■ REC  03:00']];
  for (let i = 0; i < 4; i++) {
    const x = 10.3 + (i % 2) * 1.2, y = 0.775 + (i >> 1) * 0.42;
    if (i >= 2) b.box(1.0, 0.03, 0.4, [10.9, 1.18, -1.4], { r: 'metalPaint', color: 0x3a3a3a }, {});
    const c = P.crt(b, x, i >= 2 ? 1.2 : 0.775, -1.35 - (i >= 2 ? 0.05 : 0), 0);
    const s = new CanvasScreen(256, 192, drawCRT(camLines[i], { title: '', color: '#b8ffc8' }), { fps: i === 1 ? 6 : 1 });
    c.mat.emissiveMap = s.texture;
    c.mat.emissiveIntensity = 0;
    cams.push({ screen: s, mat: c.mat });
  }
  R.cctv = cams;
  P.officeChair(b, 11, -0.2, Math.PI + 0.4);
  tapeDeck(b, 'r1', 12.0, 0.775, -1.0, -0.4);
  // breaker board on the north wall
  b.box(0.9, 1.1, 0.14, [9.4, 1.5, -5.86], { r: 'metalPaint', color: 0x8a8e88, grime: 1.2 }, { bevel: 0.01 });
  const leverMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const lever = dyn(b, new THREE.BoxGeometry(0.06, 0.18, 0.05), leverMat, [9.4, 1.5, -5.75], [0.6, 0, 0]);
  const lampOn = dyn(b, new THREE.CircleGeometry(0.015, 10), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 }), [9.65, 1.85, -5.785], [0, 0, 0], false);
  P.sign(b, 'FRONT OF HOUSE', 9.4, 1.95, -5.785, 0, 0.5, 0.08, { bg: '#e8e2d0', fg: '#222', font: 'bold 40px Arial' });
  R.frontBreaker = { lever, lamp: lampOn };
  hitbox(b, [9.4, 1.5, -5.7], [0.9, 1.1, 0.2], { label: (g) => g.story.frontBreakerLabel?.(), onInteract: (g) => g.story.frontBreaker?.() });
  // shelves: camcorder, figure (nv), key rack
  b.box(1.6, 0.04, 0.35, [12.6, 1.6, -5.78], { r: 'metalPaint', color: 0x6a6e6a }, { });
  b.box(1.6, 0.04, 0.35, [12.6, 1.1, -5.78], { r: 'metalPaint', color: 0x6a6e6a }, { });
  const camGrp = new THREE.Group();
  camGrp.position.set(12.3, 1.12, -5.72);
  camGrp.rotation.y = 0.4;
  const camBody = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.12, 0.24, 2, 0.02), lib.get('plastic', { color: 0x1c1c1e, zone: b.zone }));
  camBody.position.y = 0.06;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 16).rotateX(Math.PI / 2), lib.get('plastic', { color: 0x0a0a0a, zone: b.zone }));
  lens.position.set(0, 0.07, -0.15);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), lib.get('leather', { zone: b.zone }));
  strap.position.set(0.07, 0.07, 0);
  strap.rotation.y = Math.PI / 2;
  camGrp.add(camBody, lens, strap);
  camGrp.traverse((o) => { o.castShadow = true; });
  b.add(camGrp);
  R.camcorder = camGrp;
  L.interact(camBody, { label: (g) => (g.player.camcorder.has ? null : 'Take the camcorder'), onInteract: (g) => g.story.takeCamcorder?.() });
  figure(b, 1, 13.2, 1.62, -5.7, { nv: true });
  P.sign(b, 'NIGHT SHIFT — CHECK THE BINS EVERY HOUR', 12.6, 2.1, -5.9, 0, 1.6, 0.14, { bg: '#e8e2d0', fg: '#222', font: 'bold 36px Arial' });
  hideLocker(b, 13.5, 2.4, -Math.PI / 2, { color: 0x5a6a5a });
  P.filingCabinet(b, 13.5, 0.9, -Math.PI / 2);
  R.secFluo = P.fluoTrough(b, 11, 3, -1.5, { state: 'off', intensity: 4 });

  // ================================================================ OFFICES
  b = L.builder('offices');
  const offWall = { r: 'paint', color: 0xc8c4b4, grime: 1.2 };
  b.floor(-32, -18, -8, 4, { r: 'carpet', color: 0x55606a });
  b.ceiling(-32, -18, -8, 4, 3, tileCeil);
  b.wall(-32, -18, -8, -18, { h: 3, mat: offWall });
  b.wall(-32, -18, -32, 4, { h: 3, mat: offWall });
  b.wall(-8, -18, -8, -10, { h: 3, mat: offWall });
  b.wall(-32, 4, -8, 4, { h: 3, mat: offWall, openings: [2, 6, 10, 14, 18].map((a) => ({ at: a + 1.5, w: 2.4, h: 1.4, sill: 1.0 })) });
  for (const a of [2, 6, 10, 14, 18]) {
    addGlass(b, 2.4, 1.4, [-32 + a + 1.5, 1.7, 4.0]);
    for (let i = 0; i < 14; i++) b.box(2.36, 0.05, 0.01, [-32 + a + 1.5, 1.05 + i * 0.1, 3.9], { r: 'plastic', color: 0xd8d4c8 }, { rot: [0.7, 0, 0], ao: false, cast: false });
  }
  // cubicle grid
  const cubes = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = -22 + c * 3.4, z = -13.5 + r * 4.6;
    cubes.push(P.cubicle(b, x, z, 0, { color: [0x6f7680, 0x7a6f68, 0x5f6f6a][r], chairRot: (r * 4 + c) * 0.7 }));
  }
  // two cubicles with live CRTs: emails
  R.emails = [];
  for (const [i, id, lines] of [[1, 'd3', ['FROM: D. OKAFOR', 'RE: RE: RE: returns', '', 'Gunnar, we are getting', 'them back again...', '', '[E] READ']], [6, 'd4', ['FROM: R. PENROSE', 'SUBJECT: safe', '', "I've changed the safe", "to Vera's birthday...", '', '[E] READ']]]) {
    const [x, y, z] = cubes[i];
    const c = P.crt(b, x, y, z, 0);
    const s = new CanvasScreen(256, 192, drawCRT(lines, { title: 'HF MAIL' }), { fps: 2 });
    c.mat.emissiveMap = s.texture;
    c.mat.emissiveIntensity = 0;
    R.emails.push({ screen: s, mat: c.mat });
    L.collect.docs[id] = c.screen;
    L.interact(c.screen, { label: (g) => (g.story.powerFront ? 'Read the email' : null), onInteract: (g) => g.story.collect('doc', id, c.screen) });
  }
  // dead CRTs on the rest
  for (const i of [0, 3, 4, 9, 11]) { const [x, y, z] = cubes[i]; P.crt(b, x, y, z, (i % 3) * 0.2 - 0.2); }
  // the ringing phone
  const [phx, phy, phz] = cubes[5];
  b.box(0.2, 0.07, 0.22, [phx + 0.5, phy + 0.035, phz + 0.1], { r: 'plastic', color: 0xcfc6ae }, { bevel: 0.02 });
  const handset = dyn(b, new RoundedBoxGeometry(0.22, 0.05, 0.06, 2, 0.02), lib.get('plastic', { color: 0xcfc6ae, zone: b.zone }), [phx + 0.5, phy + 0.09, phz + 0.1]);
  R.phone = { pos: new THREE.Vector3(phx + 0.5, phy + 0.1, phz + 0.1), handset };
  L.interact(handset, { label: (g) => g.story.phoneLabel?.(), onInteract: (g) => g.story.answerPhone?.() });
  figure(b, 2, cubes[10][0] + 0.5, cubes[10][1], cubes[10][2] + 0.2);
  // filing cabinets, copier, water cooler
  for (let i = 0; i < 6; i++) P.filingCabinet(b, -24 + i * 0.5, -17.6, 0, { h: i % 2 ? 1.32 : 0.99 });
  b.box(1.1, 1.0, 0.7, [-12, 0.5, -17.3], { r: 'plastic', color: 0xd8d2c4 }, { bevel: 0.03, collide: true });
  P.waterCooler(b, -9, -17.4, 0);
  P.plant(b, -8.7, 3.4);
  P.corkboard(b, -8.1, 1.6, -14, -Math.PI / 2, 1.4, 0.9);
  poster(b, 'safety', -8.09, 1.6, -8, -Math.PI / 2, 0.5, 0.7);
  scrawl(b, 'ASK ME ANYTHING', -31.9, 1.8, -6, Math.PI / 2, { nv: true, w: 3.4 });
  scrawl(b, 'why did you leave', -15, 2.2, -17.9, 0, { w: 2.2 });
  R.officeFluo = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) R.officeFluo.push(P.fluoTrough(b, -22 + c * 3.4, 3, -14 + r * 4.6, { state: 'off', intensity: 4 }));
  // manager's office (NW)
  const mz = L.builder('manager');
  mz.floor(-32, -18, -25, -11, { r: 'hardwood', color: 0x8a6a4c }, { t: 0.02, y: 0.012 });
  mz.wall(-25, -18, -25, -11, { h: 3, mat: { r: 'paint', color: 0xb8b0a0 }, openings: [{ at: 4.5, w: 0.95, h: 2.1 }] });
  mz.wall(-32, -11, -25, -11, { h: 3, mat: { r: 'paint', color: 0xb8b0a0 }, openings: [{ at: 3.5, w: 2.4, h: 1.2, sill: 1.0 }] });
  addGlass(mz, 2.4, 1.2, [-28.5, 1.6, -11]);
  R.mgrDoor = new Door(L, { id: 'manager', zone: 'manager', x: -25, z: -13.5, w: 0.95, h: 2.1, axis: 'z', hinge: 1, swing: 1, kind: 'wood', color: 0x6a4a30, sign: 'G. LINDQVIST' });
  const md = P.desk(mz, -28.5, -15.6, 0, { w: 1.8, d: 0.85, color: 0x6a4a30 });
  P.officeChair(mz, -28.5, -16.5, 0.2);
  paper(mz, 'd5', md[0] + 0.4, md[1], md[2] + 0.1, 0.4, { label: 'Read the birthday card', color: '#f4d0e0', w: 0.16, h: 0.22 });
  P.bookshelf(mz, -31.75, -14.5, Math.PI / 2, { w: 1.2, h: 1.9 });
  tapeDeck(mz, 'r2', -31.6, 1.52, -15.6, Math.PI / 2);
  P.filingCabinet(mz, -31.6, -12, Math.PI / 2);
  P.plant(mz, -25.6, -17.4);
  // the safe
  const sx = -26.2, sz = -17.55;
  mz.box(0.7, 0.8, 0.6, [sx, 0.4, sz], { r: 'metalPaint', color: 0x2e3432, rough: 0.4, grime: 0.8 }, { bevel: 0.03, collide: true });
  const safePivot = new THREE.Group();
  safePivot.position.set(sx - 0.33, 0.4, sz + 0.3);
  const safeDoor = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.72, 0.05, 2, 0.01), lib.get('metalPaint', { color: 0x363c3a, rough: 0.35, zone: mz.zone }));
  safeDoor.position.set(0.31, 0, 0.02);
  safeDoor.castShadow = true;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24).rotateX(Math.PI / 2), lib.get('brushed', { zone: mz.zone }));
  dial.position.set(0.31, 0.1, 0.06);
  const pad = makeSignMesh('0 1 2 3 4 5 6 7 8 9', 0.16, 0.12, { bg: '#1a1a1a', fg: '#9aa', font: 'bold 30px monospace' });
  pad.position.set(0.31, -0.12, 0.047);
  safePivot.add(safeDoor, dial, pad);
  mz.add(safePivot);
  const card = dyn(mz, new THREE.BoxGeometry(0.085, 0.002, 0.054), new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.4 }), [sx, 0.42, sz], [0, 0.3, 0]);
  card.visible = false;
  R.safe = { pivot: safePivot, door: safeDoor, card, open: 0 };
  L.interact(safeDoor, { label: (g) => g.story.safeLabel?.(), onInteract: (g) => g.story.useSafe?.() });
  L.interact(card, { label: (g) => (card.visible ? 'Take the keycard' : null), onInteract: (g) => g.story.takeKeycard?.() });
  L.onUpdate((d) => { safePivot.rotation.y = -R.safe.open * 1.7; });
  R.mgrLamp = P.bulb(mz, -28.5, 2.95, -14.5, { cord: 0.3, shade: true, intensity: 3, state: 'off', color: 0xffd8a0 });
  // framed photo: Ruth, Vera and the first Verity
  const photoC = document.createElement('canvas');
  photoC.width = 256; photoC.height = 200;
  {
    const x = photoC.getContext('2d');
    x.fillStyle = '#7a6a52'; x.fillRect(0, 0, 256, 200);
    x.fillStyle = '#3a3026'; x.fillRect(60, 60, 50, 140); x.beginPath(); x.arc(85, 50, 22, 0, 7); x.fill();
    x.fillStyle = '#4a3a2a'; x.fillRect(130, 120, 36, 80); x.beginPath(); x.arc(148, 108, 16, 0, 7); x.fill();
    drawBall(x, 196, 150, 26, 'smile');
    x.fillStyle = 'rgba(255,240,200,.15)'; x.fillRect(0, 0, 256, 200);
  }
  const photoT = new THREE.CanvasTexture(photoC);
  photoT.colorSpace = THREE.SRGBColorSpace;
  const photo = dyn(mz, new THREE.PlaneGeometry(0.3, 0.24), new THREE.MeshStandardMaterial({ map: photoT, roughness: 0.3 }), [-29.5, 1.7, -17.9], [0, 0, 0], false);
  mz.box(0.34, 0.28, 0.02, [-29.5, 1.7, -17.92], { r: 'wood', color: 0x3a2a1a }, {});
  L.interact(photo, { label: 'Look at the photo', onInteract: (g) => g.showNote('Framed photograph', 'Dr. Ruth Penrose, a girl of eight or nine in a yellow raincoat, and a yellow ball on a stand between them. Someone has written on the glass in marker: "SMILE VERA".', null, { style: 'paper' }) });
  // break room (SW)
  const br = L.builder('breakroom');
  br.floor(-32, -3, -25, 4, { r: 'vct', color: 0xb8b0a0 }, { t: 0.02, y: 0.012 });
  br.wall(-25, -3, -25, 4, { h: 3, mat: { r: 'paint', color: 0xc8b890 }, openings: [{ at: 3.2, w: 1.1, h: 2.1 }] });
  br.wall(-32, -3, -25, -3, { h: 3, mat: { r: 'paint', color: 0xc8b890 } });
  const vt = new CanvasScreen(256, 512, drawVending, { fps: 0 });
  R.vending = P.vending(br, -31.5, 1.5, Math.PI / 2, vt.texture);
  R.vending.state = 'off';
  P.table(br, -28.5, 0.5, 0, { w: 1.4, d: 0.9 });
  P.chair(br, -28.5, -0.2, 0);
  P.chair(br, -28.1, 1.3, Math.PI + 0.4);
  P.chair(br, -29.4, 1.2, Math.PI - 0.3);
  P.fridge(br, -25.6, -2.5, 0);
  figure(br, 3, -25.6, 1.84, -2.6);
  br.box(1.8, 0.9, 0.6, [-30.5, 0.45, -2.65], { r: 'laminate', color: 0xb8b0a0 }, { collide: true, bevel: 0.01 });
  br.box(0.5, 0.3, 0.36, [-30.9, 1.05, -2.7], { r: 'plastic', color: 0xe8e4dc }, { bevel: 0.02 });
  paper(br, 'note_yoghurt', -28.3, 0.76, 0.4, 0.2, { label: 'Read the note', color: '#f0e68c', w: 0.12, h: 0.12 });
  L.collect.docs.note_yoghurt.userData.interactable.onInteract = (g) => g.showNote('Sticky note', 'WHOEVER KEEPS ASKING THE BREAK ROOM VERITY WHO ATE MY YOGHURT — STOP. SHE TOLD ME. SHE TOLD ME WHO. AND SHE TOLD ME WHERE THEY ARE NOW.\n— Pat', null, { style: 'memo' });
  R.breakFluo = P.fluoTrough(br, -28.5, 3, 0.5, { state: 'off', intensity: 4 });

  // ================================================================ PRODUCTION CORRIDOR
  b = L.builder('prodhall');
  b.room({ x0: -2, z0: -22, x1: 2, z1: -10, h: 3, wall: { r: 'cinder', color: 0xb8bab0, grime: 1.4 }, floor: { r: 'concrete', color: 0x9a9890 }, ceil: { r: 'paint', color: 0xb8b8b0 }, skip: ['s'], sides: { n: [{ at: 2, w: 2.2, h: 2.6, frame: { r: 'metalPaint', color: 0x3a3d3f } }] } });
  R.hallLockers = [];
  for (let i = 0; i < 9; i++) {
    const z = -20.8 + i * 0.52;
    if (i === 2 || i === 6) R.hallLockers.push(hideLocker(b, -1.72, z, Math.PI / 2, { color: 0x4f6a78 }));
    else P.locker(b, -1.72, z, Math.PI / 2, { color: 0x4f6a78 });
  }
  for (let i = 0; i < 6; i++) {
    const z = -20.8 + i * 0.52;
    if (i === 3) R.hallLockers.push(hideLocker(b, 1.72, z, -Math.PI / 2, { color: 0x6a4f4f }));
    else P.locker(b, 1.72, z, -Math.PI / 2, { color: 0x6a4f4f });
  }
  figure(b, 4, -1.72, 1.9, -17.7, { nv: true });
  b.box(0.35, 0.45, 1.6, [-0.9, 0.225, -18.2], { r: 'wood', color: 0x7a6a50 }, { collide: 'low', bevel: 0.02 });
  // time clock + card rack
  b.box(0.3, 0.4, 0.15, [1.85, 1.4, -13.2], { r: 'plastic', color: 0x8a8070 }, { bevel: 0.02 });
  for (let i = 0; i < 12; i++) b.box(0.08, 0.14, 0.004, [1.9, 1.0 + (i % 4) * 0.16, -12.2 + Math.floor(i / 4) * 0.12], { r: 'plastic', color: 0xe8e0c8 }, { rot: [0, -Math.PI / 2, 0], ao: false });
  poster(b, 'safety', 1.9, 1.6, -11.2, -Math.PI / 2, 0.5, 0.7);
  poster(b, 'employee', -1.9, 1.6, -11.2, Math.PI / 2, 0.5, 0.7);
  scrawl(b, 'DONT LOOK AWAY', 1.88, 2.3, -16, -Math.PI / 2, { w: 2.0 });
  R.hallFluo = [P.fluoTrough(b, 0, 3, -13, { rot: Math.PI / 2, state: 'buzz', intensity: 3.5 }), P.fluoTrough(b, 0, 3, -18.5, { rot: Math.PI / 2, state: 'flicker', intensity: 3.5 })];
  L.onUpdate((d) => {
    lobbyCRT.update(d);
    for (const c of cams) c.screen.update(d);
    for (const e of R.emails) e.screen.update(d);
  });
  return R;
}
