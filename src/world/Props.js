import * as THREE from 'three';
import * as T from '../render/ProceduralTextures.js';
import { H } from './House.js';
import { makeRng } from '../core/util.js';

// Furniture, clutter and the interactive objects in the house.
const rng = makeRng(42);

export class Props {
  constructor(house) {
    this.house = house;
    this.root = house.root;
    this.m = house.mats;
    this.items = {};
    this.photos = [];
    this.anchors = {};
    this.buildMaterials();
    this.hallA();
    this.bathroom();
    this.bedroom();
    this.hallB();
    this.buildAnchors();
  }

  buildMaterials() {
    const wood = new THREE.MeshStandardMaterial({ map: this.m.door.map, color: 0x7a5a45, roughness: 0.5 });
    this.mats = {
      wood,
      darkWood: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.45 }),
      porcelain: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.18, metalness: 0.05 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 1 }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x5b4f45, roughness: 1 }),
      sheet: new THREE.MeshStandardMaterial({ color: 0xb7ae9c, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ ...T.makeMetal(), roughness: 0.6, metalness: 0.7 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5 }),
      radio: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.4 }),
      grille: new THREE.MeshStandardMaterial({ color: 0x2b261f, roughness: 0.9 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0x8a9290, roughness: 0.04, metalness: 1 }),
      curtain: new THREE.MeshStandardMaterial({ color: 0xa9a58f, roughness: 0.9, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
      paper: new THREE.MeshStandardMaterial({ color: 0xd9d1bb, roughness: 1, side: THREE.DoubleSide }),
    };
  }

  box(w, h, d, x, y, z, mat, opts) { return this.house.box(w, h, d, x, y, z, mat, opts); }
  mesh(geo, mat, x, y, z, parent = this.root) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    m.userData.static = parent === this.root;
    parent.add(m);
    return m;
  }
  collide(minX, maxX, minZ, maxZ, tag = 'prop') { return this.house.addCollider(minX, maxX, minZ, maxZ, tag); }

  interact(meshes, label, onInteract, enabled) {
    const obj = { meshes: Array.isArray(meshes) ? meshes : [meshes], label, onInteract, enabled };
    return this.house.addInteractable(obj);
  }

  cardboardBox(x, z, w, h, d, label = '', rotY = 0, y = 0) {
    const mat = new THREE.MeshStandardMaterial({ ...T.makeCardboard(label, 256), roughness: 0.95 });
    const top = new THREE.MeshStandardMaterial({ ...T.makeCardboard('', 256), roughness: 0.95 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, top, top, mat, mat]);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    m.userData.static = true;
    this.root.add(m);
    return m;
  }

  // ---------------------------------------------------------------- Hall A
  hallA() {
    const { wood, darkWood, radio, grille, plastic } = this.mats;
    // side table
    const tx = 0.74, tz = -3.0;
    this.box(0.42, 0.04, 0.95, tx, 0.8, tz, darkWood);
    this.box(0.38, 0.14, 0.9, tx, 0.71, tz, darkWood);
    for (const [dx, dz] of [[-0.17, -0.42], [0.17, -0.42], [-0.17, 0.42], [0.17, 0.42]]) {
      this.box(0.04, 0.78, 0.04, tx + dx, 0.39, tz + dz, darkWood);
    }
    this.box(0.02, 0.07, 0.3, tx - 0.2, 0.71, tz, this.m.brass);
    this.collide(tx - 0.22, tx + 0.22, tz - 0.5, tz + 0.5);

    // old radio
    const r = new THREE.Group();
    r.position.set(tx, 0.82, tz - 0.22);
    this.root.add(r);
    this.mesh(new THREE.BoxGeometry(0.22, 0.2, 0.36), radio, 0, 0.1, 0, r);
    const gr = this.mesh(new THREE.PlaneGeometry(0.22, 0.12), grille, -0.111, 0.11, -0.04, r);
    gr.rotation.y = -Math.PI / 2;
    for (const dz of [0.1, 0.14]) {
      const k = this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 14), plastic, -0.115, 0.08, dz, r);
      k.rotation.z = Math.PI / 2;
    }
    const dial = this.mesh(new THREE.PlaneGeometry(0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a30, emissiveIntensity: 0 }), -0.112, 0.16, 0.12, r);
    dial.rotation.y = -Math.PI / 2;
    const ant = this.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.4), this.mats.chrome, 0, 0.35, 0.12, r);
    ant.rotation.x = 0.4;
    this.radio = { group: r, dial, on: false };
    this.radioInteract = this.interact(r.children.filter((c) => c.isMesh), () => 'Radio', null);

    // wall clock above the table
    const clock = new THREE.Group();
    clock.position.set(0.9, 1.85, tz);
    clock.rotation.y = -Math.PI / 2;
    this.root.add(clock);
    const faceC = document.createElement('canvas');
    faceC.width = faceC.height = 256;
    this.clockCanvas = faceC;
    const faceTex = new THREE.CanvasTexture(faceC);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    this.clockTex = faceTex;
    const rim = this.mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 32), darkWood, 0, 0, 0, clock);
    rim.rotation.x = Math.PI / 2;
    const face = this.mesh(new THREE.CircleGeometry(0.165, 32), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }), 0, 0, 0.026, clock);
    this.clock = { group: clock, face, time: null, stuck: false };
    this.drawClock(2, 57);
    this.clockInteract = this.interact([rim, face], () => 'Clock', null);

    // framed photographs (tenants), some interactive
    this.photoFrame('p1', 0.92, 1.55, -1.7, -Math.PI / 2, 0);
    this.photoFrame('p2', -0.92, 1.6, -2.65, Math.PI / 2, 1);
    this.photoFrame('p3', 0.92, 1.5, -5.6, -Math.PI / 2, 2);
    this.photoFrame('p4', -0.92, 1.55, -6.3, Math.PI / 2, 3, false);
    this.photoFrame('p5', 0.92, 1.62, -11.0, -Math.PI / 2, 4, false);

    // coat hooks by the front door
    this.box(0.04, 0.08, 0.6, -0.92, 1.7, -5.0, darkWood);
    for (let i = 0; i < 3; i++) {
      const h = this.mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1), this.m.brass, -0.87, 1.66, -5.2 + i * 0.2);
      h.rotation.z = Math.PI / 2 + 0.4;
    }
    const coat = this.mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.95, 10, 1, true), this.mats.fabric, -0.8, 1.2, -5.0);
    coat.material = coat.material.clone();
    coat.material.side = THREE.DoubleSide;
    coat.material.color.set(0x2d2a27);

    // moving boxes
    this.cardboardBox(-0.62, -0.45, 0.5, 0.42, 0.5, 'KITCHEN', 0.1);
    this.cardboardBox(-0.6, -0.5, 0.42, 0.34, 0.42, 'MUGS', -0.2, 0.42);
    this.collide(-0.9, -0.34, -0.72, -0.18);
    this.cardboardBox(-0.62, -10.6, 0.56, 0.5, 0.6, 'BOOKS', 0.05);
    this.cardboardBox(-0.66, -11.25, 0.46, 0.36, 0.5, 'FRAGILE', -0.15);
    this.cardboardBox(-0.6, -10.8, 0.4, 0.3, 0.4, '', 0.4, 0.5);
    this.collide(-0.95, -0.32, -11.55, -10.28);

    // THE box (Verity's) sits in the corner light
    this.verityBoxPos = new THREE.Vector3(0.0, 0, -13.05);
  }

  photoFrame(id, x, y, z, rotY, variant, interactive = true) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.root.add(g);
    const w = 0.32, h = 0.42;
    const frame = this.mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.03), this.mats.darkWood, 0, 0, 0, g);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 336;
    drawTenantPhoto(c, variant, false);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const pic = this.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }), 0, 0, 0.017, g);
    const photo = { id, group: g, canvas: c, tex: t, variant, pic, frame, interactive, viewed: false, upsideDown: false };
    this.photos.push(photo);
    if (interactive) {
      photo.interact = this.interact([frame, pic], () => 'Look at photograph', null);
    }
    return photo;
  }

  setPhotosCorrupted(level) {
    for (const p of this.photos) {
      drawTenantPhoto(p.canvas, p.variant, level);
      p.tex.needsUpdate = true;
      if (level >= 2 && !p.upsideDown && rng() < 0.6) {
        p.group.rotation.z = Math.PI;
        p.upsideDown = true;
      }
    }
  }

  drawClock(hh, mm, broken = false) {
    const c = this.clockCanvas, ctx = c.getContext('2d');
    ctx.fillStyle = '#d9cfb5';
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.fillStyle = '#1a140c';
    ctx.font = '26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillText(broken && i === 3 ? '3' : String(i), Math.sin(a) * 95, -Math.cos(a) * 95);
    }
    const hand = (ang, len, w) => {
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = '#0c0a07';
      ctx.fillRect(-w / 2, -len, w, len + 10);
      ctx.restore();
    };
    hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2, 55, 7);
    hand((mm / 60) * Math.PI * 2, 85, 4);
    if (broken) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-100, -40); ctx.lineTo(10, 5); ctx.lineTo(90, 70);
      ctx.moveTo(10, 5); ctx.lineTo(-20, 100);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.clockTex) this.clockTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- Bathroom
  bathroom() {
    const { porcelain, chrome, mirror, curtain } = this.mats;
    // tub
    const tx = 3.8, tz = -9.85;
    const tub = new THREE.Group();
    tub.position.set(tx, 0, tz);
    this.root.add(tub);
    this.mesh(new THREE.BoxGeometry(0.72, 0.1, 1.68), porcelain, 0, 0.05, 0, tub);
    this.mesh(new THREE.BoxGeometry(0.06, 0.55, 1.68), porcelain, -0.33, 0.3, 0, tub);
    this.mesh(new THREE.BoxGeometry(0.06, 0.55, 1.68), porcelain, 0.33, 0.3, 0, tub);
    this.mesh(new THREE.BoxGeometry(0.72, 0.55, 0.06), porcelain, 0, 0.3, 0.81, tub);
    this.mesh(new THREE.BoxGeometry(0.72, 0.55, 0.06), porcelain, 0, 0.3, -0.81, tub);
    const water = this.mesh(new THREE.PlaneGeometry(0.6, 1.56), new THREE.MeshStandardMaterial({ color: 0x1d1a10, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.92 }), 0, 0.42, 0, tub);
    water.rotation.x = -Math.PI / 2;
    water.visible = false;
    this.tubWater = water;
    const faucet = this.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18), chrome, 0, 0.6, -0.78, tub);
    faucet.rotation.x = Math.PI / 2;
    this.collide(tx - 0.38, tx + 0.38, tz - 0.86, tz + 0.86);
    this.tubInteract = this.interact(tub.children.slice(0, 5), () => 'Bathtub', null);

    // shower curtain on a rail
    this.box(0.02, 0.02, 1.7, 3.42, 2.15, tz, chrome, { cast: false });
    const cg = new THREE.PlaneGeometry(1.1, 1.95, 24, 1);
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.035);
    cg.computeVertexNormals();
    const cur = this.mesh(cg, curtain, 3.42, 1.16, tz - 0.25);
    cur.rotation.y = Math.PI / 2;
    cur.userData.static = false;
    this.curtain = cur;

    // sink + mirror
    const sx = 2.7, sz = -7.46;
    this.mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.78, 14), porcelain, sx, 0.39, sz + 0.06);
    const basin = this.mesh(new THREE.BoxGeometry(0.55, 0.12, 0.42), porcelain, sx, 0.84, sz + 0.1);
    this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14), chrome, sx, 0.97, sz - 0.05);
    this.collide(sx - 0.3, sx + 0.3, sz - 0.1, sz + 0.34);
    this.box(0.6, 0.8, 0.02, sx, 1.62, -7.29, this.mats.darkWood);
    const mir = this.mesh(new THREE.PlaneGeometry(0.54, 0.74), mirror, sx, 1.62, -7.275);
    mir.rotation.y = Math.PI;
    this.mirror = mir;
    this.sinkInteract = this.interact([basin, mir], () => 'Sink', null);

    // toilet
    const tx2 = 3.85, tz2 = -7.62;
    this.mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 16), porcelain, tx2, 0.2, tz2 - 0.1);
    this.mesh(new THREE.BoxGeometry(0.4, 0.38, 0.18), porcelain, tx2, 0.6, tz2 + 0.25);
    this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 18), porcelain, tx2, 0.42, tz2 - 0.1);
    this.collide(tx2 - 0.22, tx2 + 0.22, tz2 - 0.3, tz2 + 0.4);
  }

  // ---------------------------------------------------------------- Bedroom
  bedroom() {
    const { darkWood, sheet, fabric, metal, plastic, wood } = this.mats;
    // bed
    const bx = 3.5, bz = -17.0;
    this.box(1.45, 0.3, 2.05, bx, 0.25, bz, darkWood);
    this.box(1.38, 0.22, 1.95, bx, 0.5, bz, sheet);
    this.box(1.45, 1.05, 0.08, bx, 0.52, -17.98, darkWood);
    const blanket = this.box(1.46, 0.08, 1.3, bx, 0.62, bz + 0.3, new THREE.MeshStandardMaterial({ color: 0x3d2e2a, roughness: 1 }));
    blanket.rotation.x = 0.02;
    this.mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), sheet, bx - 0.35, 0.66, -17.7);
    this.mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), sheet, bx + 0.35, 0.66, -17.7);
    this.collide(bx - 0.74, bx + 0.74, -18, bz + 1.04);
    this.bedMeshes = [blanket];

    // nightstand + lamp
    this.box(0.45, 0.55, 0.4, 4.6, 0.275, -17.7, darkWood);
    this.collide(4.37, 4.83, -17.92, -17.48);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 12), plastic, 4.6, 0.7, -17.72);
    const shade = this.mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 1, side: THREE.DoubleSide, emissive: 0x3a2a10, emissiveIntensity: 0 }), 4.6, 0.93, -17.72);
    this.bedLampShade = shade;

    // wardrobe (hiding spot)
    const wx = 6.15, wz = -15.4;
    const wg = new THREE.Group();
    wg.position.set(wx, 0, wz);
    this.root.add(wg);
    this.mesh(new THREE.BoxGeometry(0.6, 2.15, 0.05), darkWood, 0, 1.075, -0.575, wg);
    this.mesh(new THREE.BoxGeometry(0.6, 2.15, 0.05), darkWood, 0, 1.075, 0.575, wg);
    this.mesh(new THREE.BoxGeometry(0.6, 0.05, 1.2), darkWood, 0, 2.15, 0, wg);
    this.mesh(new THREE.BoxGeometry(0.6, 0.05, 1.2), darkWood, 0, 0.03, 0, wg);
    this.mesh(new THREE.BoxGeometry(0.04, 2.15, 1.2), darkWood, 0.28, 1.075, 0, wg);
    // louvred doors (two leaves hinged at the outer edges)
    this.wardrobeDoors = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.3, 0, s * 0.55);
      wg.add(pivot);
      const leaf = new THREE.Group();
      leaf.position.set(0, 1.08, -s * 0.275);
      pivot.add(leaf);
      this.mesh(new THREE.BoxGeometry(0.03, 2.06, 0.06), darkWood, 0, 0, -s * 0.245, leaf);
      this.mesh(new THREE.BoxGeometry(0.03, 2.06, 0.06), darkWood, 0, 0, s * 0.245, leaf);
      for (let i = 0; i < 15; i++) {
        const sl = this.mesh(new THREE.BoxGeometry(0.015, 0.07, 0.46), darkWood, 0, -0.95 + i * 0.135, 0, leaf);
        sl.rotation.z = -0.6;
      }
      const hit = this.mesh(new THREE.BoxGeometry(0.12, 2.06, 0.55), this.m.hit, 0, 0, 0, leaf);
      this.wardrobeDoors.push({ pivot, leaf, hit, s, open: 0, target: 0 });
    }
    this.collide(wx - 0.32, wx + 0.32, wz - 0.62, wz + 0.62, 'wardrobe');
    this.house.hidingSpots.wardrobe = {
      id: 'wardrobe', inside: new THREE.Vector3(wx + 0.02, 0, wz), yaw: Math.PI / 2,
      exit: new THREE.Vector3(wx - 0.85, 0, wz), wardrobe: this,
    };

    // fuse box on the wall by the bedroom door
    const fb = new THREE.Group();
    fb.position.set(2.62, 1.45, -14.75);
    this.root.add(fb);
    this.mesh(new THREE.BoxGeometry(0.1, 0.46, 0.34), metal, 0, 0, 0, fb);
    const fdPivot = new THREE.Group();
    fdPivot.position.set(0.055, 0, -0.17);
    fb.add(fdPivot);
    const fDoor = this.mesh(new THREE.BoxGeometry(0.015, 0.44, 0.33), metal, 0, 0, 0.165, fdPivot);
    const lever = this.mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), new THREE.MeshStandardMaterial({ color: 0x881a10, roughness: 0.5 }), 0.04, -0.05, 0, fb);
    const lamp = this.mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 0 }), 0.06, 0.16, 0.1, fb);
    this.fuseBox = { group: fb, doorPivot: fdPivot, door: fDoor, lever, lamp, opened: false, on: true };
    this.fuseInteract = this.interact([fDoor, lever, fb.children[0]], () => 'Fuse box', null);

    // chair in the corner
    const ch = new THREE.Group();
    ch.position.set(5.75, 0, -17.3);
    ch.rotation.y = -2.4;
    this.root.add(ch);
    this.mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), wood, 0, 0.45, 0, ch);
    this.mesh(new THREE.BoxGeometry(0.45, 0.55, 0.04), wood, 0, 0.75, -0.21, ch);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) this.mesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), wood, dx, 0.225, dz, ch);
    this.collide(5.45, 6.05, -17.6, -17.0);
    this.chair = ch;

    // curtains on bedroom window
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.5, 1.6, 12, 1);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 25) * 0.03);
      g.computeVertexNormals();
      this.mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a1616, roughness: 1, side: THREE.DoubleSide }), 4.2 + s * 0.75, 1.45, -17.85);
    }
    this.box(1.8, 0.02, 0.02, 4.2, 2.25, -17.86, this.m.brass, { cast: false });

    // photo album on the bed (chapter 4)
    const album = this.mesh(new THREE.BoxGeometry(0.28, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x4a1d18, roughness: 0.7 }), 3.2, 0.69, -16.4);
    album.rotation.y = 0.3;
    album.visible = false;
    this.album = album;
    this.albumInteract = this.interact(album, () => 'Photo album', null, () => album.visible);
  }

  // ---------------------------------------------------------------- Hall B
  hallB() {
    const { darkWood } = this.mats;
    this.box(0.9, 0.04, 0.3, 3.2, 0.9, -12.24, darkWood);
    this.box(0.04, 0.9, 0.28, 2.77, 0.45, -12.24, darkWood);
    this.box(0.04, 0.9, 0.28, 3.63, 0.45, -12.24, darkWood);
    this.box(0.88, 0.03, 0.28, 3.2, 0.3, -12.24, darkWood);
    this.collide(2.74, 3.66, -12.42, -12.08);
    const vase = this.mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.22, 14), this.mats.porcelain, 3.0, 1.03, -12.22);
    vase.material = vase.material.clone();
    vase.material.color.set(0x324a40);
    this.cardboardBox(6.2, -12.4, 0.5, 0.45, 0.5, 'BEDROOM', 0.3);
    this.collide(5.9, 6.5, -12.7, -12.08);
    this.photoFrame('p6', 5.0, 1.6, -12.09, Math.PI, 5, false);
  }

  // ---------------------------------------------------------------- items
  buildAnchors() {
    const A = (id, x, y, z, room) => (this.anchors[id] = { id, pos: new THREE.Vector3(x, y, z), room, used: false });
    A('sideTable', 0.72, 0.83, -2.72, 'hallA');
    A('bathSink', 2.55, 0.91, -7.5, 'bath');
    A('tub', 3.8, 0.12, -10.3, 'bath');
    A('toilet', 3.85, 0.8, -7.4, 'bath');
    A('bed', 3.1, 0.67, -16.2, 'bedroom');
    A('nightstand', 4.5, 0.56, -17.62, 'bedroom');
    A('chair', 5.75, 0.48, -17.3, 'bedroom');
    A('shelfB', 3.35, 0.93, -12.24, 'hallB');
    A('shelfLow', 3.2, 0.33, -12.24, 'hallB');
    A('boxes', -0.62, 0.52, -10.6, 'hallA');
    A('closetFloor', -1.45, 0.02, -8.65, 'closet');
    A('cornerFloor', -0.72, 0.02, -13.7, 'corner');
    A('wardrobe', 6.2, 0.06, -15.0, 'bedroom');
    A('endFloor', 6.6, 0.02, -13.6, 'hallB');
    A('startFloor', 0.7, 0.02, -0.4, 'hallA');
  }

  makeItemMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'tape') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.064), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4 }));
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.035), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }));
      lab.rotation.x = -Math.PI / 2;
      lab.position.y = 0.0085;
      g.add(body, lab);
    } else if (kind === 'note') {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), this.mats.paper);
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.003;
      g.add(p);
    } else if (kind === 'key') {
      const m = this.m.brass;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 16), m);
      ring.rotation.x = Math.PI / 2;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.01), m);
      shaft.position.x = 0.045;
      g.add(ring, shaft);
      g.position.y = 0.005;
    } else if (kind === 'battery') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.4, metalness: 0.4 }));
      b.rotation.z = Math.PI / 2;
      b.position.y = 0.014;
      g.add(b);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // generous invisible pick volume
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.28), this.m.hit);
    hit.position.y = 0.04;
    g.add(hit);
    g.userData.hit = hit;
    return g;
  }

  // Place a pickup at an anchor. Returns the item record.
  spawnItem(id, kind, anchorId, label, onPick) {
    const a = this.anchors[anchorId];
    const mesh = this.makeItemMesh(kind);
    mesh.position.copy(a.pos);
    mesh.rotation.y = rng() * Math.PI * 2;
    this.root.add(mesh);
    a.used = true;
    const item = { id, kind, anchor: a, mesh, collected: false };
    item.interact = this.interact(mesh.userData.hit, () => label, (game) => {
      if (item.collected) return;
      item.collected = true;
      mesh.visible = false;
      a.used = false;
      onPick?.(game, item);
    }, () => !item.collected);
    this.items[id] = item;
    return item;
  }

  removeItem(id) {
    const it = this.items[id];
    if (!it) return;
    it.collected = true;
    it.mesh.visible = false;
    it.anchor.used = false;
    this.root.remove(it.mesh);
    delete this.items[id];
  }

  freeAnchors(filter = () => true) {
    return Object.values(this.anchors).filter((a) => !a.used && filter(a));
  }

  update(dt, t) {
    for (const d of this.wardrobeDoors) {
      if (d.open !== d.target) {
        const step = dt * 2.2;
        const diff = d.target - d.open;
        d.open = Math.abs(diff) < step ? d.target : d.open + Math.sign(diff) * step;
        d.pivot.rotation.y = d.s * d.open * 1.6;
      }
    }
    // pickups gently catch the eye
    for (const it of Object.values(this.items)) {
      if (!it.collected && it.kind !== 'note') it.mesh.position.y = it.anchor.pos.y + Math.sin(t * 2 + it.anchor.pos.x) * 0.002;
    }
    if (this.fuseBox) {
      const target = this.fuseBox.opened ? 1.9 : 0;
      this.fuseBox.doorPivot.rotation.y += (target - this.fuseBox.doorPivot.rotation.y) * Math.min(1, dt * 6);
      this.fuseBox.lever.rotation.z += ((this.fuseBox.on ? 0 : 1.2) - this.fuseBox.lever.rotation.z) * Math.min(1, dt * 10);
    }
  }

  setWardrobeOpen(v) { for (const d of this.wardrobeDoors) d.target = v; }
}

// ---------------------------------------------------------------------------
// Tenant photographs: sepia family portraits where everyone holds a yellow ball.
// corruption: 0 normal, 1 faces scratched, 2 ball grinning / eyes blacked, 3 you are in it
export function drawTenantPhoto(c, variant, corruption = 0, you = false) {
  const ctx = c.getContext('2d');
  const W = c.width, Hh = c.height;
  const r = makeRng(900 + variant * 31);
  const bg = ctx.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, '#8a7a5c');
  bg.addColorStop(1, '#4a3d2a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, Hh);
  // doorway / hallway behind them — it's this house
  ctx.fillStyle = 'rgba(40,30,18,0.6)';
  ctx.fillRect(W * 0.35, Hh * 0.12, W * 0.3, Hh * 0.6);
  ctx.fillStyle = 'rgba(255,230,170,0.25)';
  ctx.beginPath();
  ctx.arc(W * 0.5, Hh * 0.08, 18, 0, Math.PI * 2);
  ctx.fill();
  const people = you ? 1 : 1 + ((variant * 7 + 3) % 3);
  const ballCol = corruption >= 2 ? '#d6b43a' : '#e8c64a';
  for (let i = 0; i < people; i++) {
    const x = W * ((i + 1) / (people + 1));
    const tall = Hh * (0.46 + r() * 0.12);
    const y0 = Hh - tall;
    ctx.fillStyle = `rgba(${30 + r() * 20},${24 + r() * 10},${16},0.95)`;
    // body
    ctx.beginPath();
    ctx.moveTo(x - 30, Hh);
    ctx.lineTo(x - 26, y0 + 60);
    ctx.quadraticCurveTo(x, y0 + 40, x + 26, y0 + 60);
    ctx.lineTo(x + 30, Hh);
    ctx.fill();
    // head
    ctx.fillStyle = '#b89c78';
    ctx.beginPath();
    ctx.ellipse(x, y0 + 30, 17, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    // face
    if (corruption >= 1) {
      ctx.strokeStyle = 'rgba(10,6,3,0.95)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.moveTo(x - 16 + r() * 6, y0 + 12 + r() * 8);
        ctx.lineTo(x + 16 - r() * 6, y0 + 42 + r() * 8);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(x - 7, y0 + 26, 3, 3);
      ctx.fillRect(x + 4, y0 + 26, 3, 3);
      ctx.fillRect(x - 5, y0 + 38, 10, 2);
    }
    // the yellow ball, held in front
    if (i === 0 || you) {
      const bx = x + 2, by = y0 + 100, br = 20;
      ctx.fillStyle = ballCol;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      if (corruption >= 2) {
        ctx.beginPath();
        ctx.ellipse(bx - 7, by - 5, 3.5, 4.5, 0, 0, Math.PI * 2);
        ctx.ellipse(bx + 7, by - 5, 3.5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(bx - 14, by + 3);
        ctx.quadraticCurveTo(bx, by + 18, bx + 14, by + 3);
        ctx.fill();
        ctx.fillStyle = '#eee';
        for (let t = -10; t <= 10; t += 4) ctx.fillRect(bx + t - 1, by + 5, 3, 4);
      } else {
        ctx.fillRect(bx - 8, by - 7, 3, 6);
        ctx.fillRect(bx + 5, by - 7, 3, 6);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by + 1, 10, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    }
  }
  if (corruption >= 3 || you) {
    ctx.fillStyle = 'rgba(120,0,0,0.25)';
    ctx.fillRect(0, 0, W, Hh);
  }
  // age: grain + vignette + scratches
  const img = ctx.getImageData(0, 0, W, Hh);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 40;
    const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    img.data[i] = l * 0.45 + img.data[i] * 0.55 + 18 + n;
    img.data[i + 1] = l * 0.45 + img.data[i + 1] * 0.55 + 8 + n;
    img.data[i + 2] = l * 0.45 + img.data[i + 2] * 0.55 - 8 + n;
  }
  ctx.putImageData(img, 0, 0);
  const v = ctx.createRadialGradient(W / 2, Hh / 2, W * 0.2, W / 2, Hh / 2, W * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, Hh);
  ctx.strokeStyle = 'rgba(255,245,220,0.25)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    const x = r() * W;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (r() - 0.5) * 30, Hh);
    ctx.stroke();
  }
  // handwritten caption
  ctx.fillStyle = 'rgba(30,20,10,0.8)';
  ctx.font = '16px "Special Elite", "Courier New", monospace';
  ctx.textAlign = 'center';
  const caps = ['The Harlows — move-in day', 'Dana & V.', 'Marcus + friend', 'Us. Day 2.', 'Best friends forever', 'Who took this?'];
  ctx.fillText(you ? 'You & V. — forever' : caps[variant % caps.length], W / 2, Hh - 10);
}
