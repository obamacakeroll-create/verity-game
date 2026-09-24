import * as THREE from 'three';
import * as T from '../render/ProceduralTextures.js';
import { clamp } from '../core/util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The house: an L-shaped P.T.-style hallway with a bathroom, a bedroom,
// a coat closet, a front door that leads to the porch and an end door that
// loops you back to the start.
//
//   z=0  ──[start door]──
//        |  Hall A      |  window (left)  radio table (right)
//  front door (left, z=-4)
//   closet (left, z=-8.4)   bathroom door (right, z=-9)
//        |              └────────── Hall B ──────────[end door x=7]
//  z=-14 ───────────────────[bedroom door x=4.5]──────
//                                   Bedroom

export const H = 2.7; // ceiling height
const WT = 0.16; // wall thickness

export class House {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'house';
    scene.add(this.root);
    this.colliders = [];
    this.doors = {};
    this.interactables = [];
    this.hidingSpots = {};
    this.anchors = {};
    this.decals = [];
    this.rotLevel = 0;
    this.buildMaterials();
    this.buildShell();
    this.buildDoors();
    this.buildNav();
  }

  // ------------------------------------------------------------------ materials
  buildMaterials() {
    this.wallpapers = [T.makeWallpaper(0), T.makeWallpaper(0.55), T.makeWallpaper(1)];
    const floor = T.makeWoodFloor();
    const wains = T.makeWainscot();
    const plaster = T.makePlaster(0.3);
    const tiles = T.makeTiles();
    const door = T.makeDoorWood();
    const runner = T.makeRunner();
    this.mats = {
      wall: new THREE.MeshStandardMaterial({ ...this.wallpapers[0], roughness: 0.92 }),
      bedWall: new THREE.MeshStandardMaterial({ ...T.makeWallpaper(0.3), color: 0xa8b4bc, roughness: 0.92 }),
      wainscot: new THREE.MeshStandardMaterial({ ...wains, roughness: 0.55 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x24150c, roughness: 0.5 }),
      floor: new THREE.MeshStandardMaterial({ ...floor, roughness: 0.9 }),
      ceiling: new THREE.MeshStandardMaterial({ ...plaster, roughness: 0.95 }),
      tile: new THREE.MeshStandardMaterial({ ...tiles, roughness: 0.4 }),
      ext: new THREE.MeshStandardMaterial({ map: wains.map, normalMap: wains.normalMap, color: 0x55606a, roughness: 0.85 }),
      door: new THREE.MeshStandardMaterial({ ...door, roughness: 0.55 }),
      doorPlain: new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.6 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: 0.35 }),
      black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      runner: new THREE.MeshStandardMaterial({ ...runner, roughness: 1 }),
      glass: new THREE.MeshStandardMaterial({
        map: T.makeWindowGlass(), roughness: 0.05, metalness: 0.2,
        emissive: 0x0b1320, emissiveIntensity: 0.6,
      }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    };
  }

  setRot(level) {
    const idx = clamp(Math.round(level * 2), 0, 2);
    if (idx === this.rotLevel) return;
    this.rotLevel = idx;
    this.mats.wall.map = this.wallpapers[idx].map;
    this.mats.wall.normalMap = this.wallpapers[idx].normalMap;
    this.mats.wall.needsUpdate = true;
  }

  // ------------------------------------------------------------------ helpers
  static worldUV(geo, tile, tileY = tile) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      let u, v;
      if (nx >= ny && nx >= nz) { u = p.getZ(i); v = p.getY(i); }
      else if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
      else { u = p.getX(i); v = p.getY(i); }
      uv.setXY(i, u / tile, v / tileY);
    }
    uv.needsUpdate = true;
    return geo;
  }

  box(w, h, d, x, y, z, mat, { uv = 0, uvY, cast = true, receive = true, parent = this.root } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y, z);
    if (uv) House.worldUV(geo, uv, uvY || uv);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.userData.static = parent === this.root;
    parent.add(m);
    return m;
  }

  // Merge every static, non-interactive mesh that shares a material into one
  // draw call. Cuts the frame from ~1400 draw calls to a couple of hundred.
  batchStatic() {
    const buckets = new Map();
    const removed = [];
    const add = (mat, geo, cast, receive) => {
      const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { mat, cast, receive, geos: [] });
      buckets.get(key).geos.push(geo);
    };
    for (const m of this.root.children) {
      if (!m.isMesh || !m.userData.static || m.userData.interactable || !m.visible) continue;
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) continue;
      if (Array.isArray(m.material)) {
        const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
        for (const gr of groups) {
          const sub = new THREE.BufferGeometry();
          for (const [name, attr] of Object.entries(g.attributes)) {
            const size = attr.itemSize;
            sub.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(gr.start * size, (gr.start + gr.count) * size), size));
          }
          add(m.material[gr.materialIndex], sub, m.castShadow, m.receiveShadow);
        }
      } else {
        g.clearGroups();
        add(m.material, g, m.castShadow, m.receiveShadow);
      }
      removed.push(m);
    }
    for (const m of removed) { this.root.remove(m); m.geometry.dispose(); }
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.name = 'batched';
      this.root.add(mesh);
    }
    return { removed: removed.length, batches: buckets.size };
  }

  addCollider(minX, maxX, minZ, maxZ, tag = 'wall') {
    const c = { minX, maxX, minZ, maxZ, tag, enabled: true };
    this.colliders.push(c);
    return c;
  }

  // Axis aligned wall. `axis` 'x' → wall runs along X at z=c; 'z' → along Z at x=c.
  // sides: {pos: style, neg: style} for the +normal and -normal faces.
  wall(axis, c, s0, s1, sides, openings = []) {
    if (s0 > s1) [s0, s1] = [s1, s0];
    const ops = openings.map((o) => ({ bottom: 0, top: 2.12, ...o })).sort((a, b) => a.a - b.a);
    let cur = s0;
    for (const o of ops) {
      if (o.a > cur) this.wallPiece(axis, c, cur, o.a, 0, H, sides, true);
      this.wallPiece(axis, c, o.a, o.b, o.top, H, sides, false);
      if (o.bottom > 0) this.wallPiece(axis, c, o.a, o.b, 0, o.bottom, sides, true);
      cur = o.b;
    }
    if (s1 > cur) this.wallPiece(axis, c, cur, s1, 0, H, sides, true);
  }

  styleMat(style) {
    return { hall: this.mats.wall, bath: this.mats.tile, bed: this.mats.bedWall, ext: this.mats.ext, void: this.mats.black }[style] || this.mats.wall;
  }

  wallPiece(axis, c, a, b, y0, y1, sides, collide) {
    const L = b - a, mid = (a + b) / 2, h = y1 - y0, ym = (y0 + y1) / 2;
    const pos = this.styleMat(sides.pos), neg = this.styleMat(sides.neg);
    let geo, mats;
    if (axis === 'x') {
      geo = new THREE.BoxGeometry(L, h, WT);
      geo.translate(mid, ym, c);
      mats = [pos, pos, this.mats.trim, this.mats.trim, pos, neg];
    } else {
      geo = new THREE.BoxGeometry(WT, h, L);
      geo.translate(c, ym, mid);
      mats = [pos, neg, this.mats.trim, this.mats.trim, pos, pos];
    }
    House.worldUV(geo, 1.2);
    const m = new THREE.Mesh(geo, mats);
    m.receiveShadow = true;
    m.castShadow = true;
    m.userData.static = true;
    this.root.add(m);
    if (collide && y0 < 1) {
      if (axis === 'x') this.addCollider(a, b, c - WT / 2, c + WT / 2);
      else this.addCollider(c - WT / 2, c + WT / 2, a, b);
    }
    // trims on hall-style faces
    for (const [style, sign] of [[sides.pos, 1], [sides.neg, -1]]) {
      if (style !== 'hall' && style !== 'bed') continue;
      const off = c + sign * (WT / 2);
      const put = (th, hh, yy, mat, uv) => {
        const o = off + sign * th / 2;
        if (axis === 'x') this.box(L, hh, th, mid, yy, o, mat, { uv, cast: false });
        else this.box(th, hh, L, o, yy, mid, mat, { uv, cast: false });
      };
      if (y0 < 0.01 && y1 > 1) {
        if (style === 'hall') put(0.025, 1.0, 0.5, this.mats.wainscot, 1.0);
        put(0.05, 0.05, 1.0, this.mats.trim);
        put(0.04, 0.14, 0.07, this.mats.trim);
      } else if (y0 < 0.01 && y1 <= 1.01) {
        if (style === 'hall') put(0.025, y1, y1 / 2, this.mats.wainscot, 1.0);
        put(0.04, 0.14, 0.07, this.mats.trim);
      }
      if (y1 >= H - 0.01) put(0.06, 0.09, H - 0.045, this.mats.trim);
    }
  }

  floorRect(x0, x1, z0, z1, mat, { ceiling = true, ceilMat, y = 0, tile = 2 } = {}) {
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    House.worldUV(g, tile);
    const f = new THREE.Mesh(g, mat);
    f.receiveShadow = true;
    f.userData.static = true;
    this.root.add(f);
    if (ceiling) {
      const cg = new THREE.PlaneGeometry(w, d);
      cg.rotateX(Math.PI / 2);
      cg.translate((x0 + x1) / 2, H, (z0 + z1) / 2);
      House.worldUV(cg, 2.5);
      const cm = new THREE.Mesh(cg, ceilMat || this.mats.ceiling);
      cm.receiveShadow = true;
      cm.userData.static = true;
      this.root.add(cm);
    }
    return f;
  }

  // ------------------------------------------------------------------ shell
  buildShell() {
    const m = this.mats;
    // floors
    this.floorRect(-1, 1, -14, 0, m.floor);
    this.floorRect(1, 7, -14, -12, m.floor);
    this.floorRect(1, 4.2, -10.8, -7.2, m.tile, { tile: 1.6 });
    this.floorRect(2.5, 6.5, -18, -14, m.floor);
    this.floorRect(-1.8, -1, -8.8, -8.0, m.floor);
    this.floorRect(7, 8.4, -13.5, -12.5, m.black, { ceilMat: m.black });
    // porch (outside the front door) — no ceiling, wet dark boards
    const porch = this.floorRect(-5, -1, -6.5, -1.5, new THREE.MeshStandardMaterial({
      map: m.floor.map, normalMap: m.floor.normalMap, color: 0x5a5a60, roughness: 0.25, metalness: 0.1,
    }), { ceiling: false });
    porch.name = 'porch';
    // big dark ground outside
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-30, -0.12, -8);
    ground.receiveShadow = true;
    this.root.add(ground);

    // runners
    const r1 = new THREE.PlaneGeometry(0.95, 10.6);
    r1.rotateX(-Math.PI / 2);
    r1.translate(0, 0.006, -6.3);
    const uv = r1.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 5.3);
    m.runner.map.wrapT = THREE.RepeatWrapping;
    const run = new THREE.Mesh(r1, m.runner);
    run.receiveShadow = true;
    this.root.add(run);
    const r2 = new THREE.PlaneGeometry(0.9, 4.6);
    r2.rotateX(-Math.PI / 2);
    r2.rotateY(Math.PI / 2);
    r2.translate(4.2, 0.006, -13);
    const uv2 = r2.attributes.uv;
    for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i), uv2.getY(i) * 2.3);
    const run2 = new THREE.Mesh(r2, m.runner);
    run2.receiveShadow = true;
    this.root.add(run2);

    // Hall A
    this.wall('x', 0, -1, 1, { pos: 'ext', neg: 'hall' }, [{ a: -0.45, b: 0.45 }]);
    this.wall('z', -1, 0, -14, { pos: 'hall', neg: 'ext' }, [
      { a: -1.9, b: -0.9, bottom: 1.0, top: 2.05 }, // window
      { a: -4.45, b: -3.55 }, // front door
      { a: -8.8, b: -8.0 }, // closet
    ]);
    this.wall('z', 1, 0, -12, { pos: 'bath', neg: 'hall' }, [{ a: -9.45, b: -8.55 }]);
    // corner / south wall with bedroom door
    this.wall('x', -14, -1, 7, { pos: 'hall', neg: 'bed' }, [{ a: 4.05, b: 4.95 }]);
    // Hall B north wall
    this.wall('x', -12, 1, 7, { pos: 'ext', neg: 'hall' });
    // end wall with the loop door
    this.wall('z', 7, -12, -14, { pos: 'void', neg: 'hall' }, [{ a: -13.45, b: -12.55 }]);
    // void vestibule behind end door
    this.wall('x', -12.5, 7, 8.4, { pos: 'void', neg: 'void' });
    this.wall('x', -13.5, 7, 8.4, { pos: 'void', neg: 'void' });
    this.wall('z', 8.4, -12.5, -13.5, { pos: 'void', neg: 'void' });
    // bathroom
    this.wall('x', -7.2, 1, 4.2, { pos: 'ext', neg: 'bath' });
    this.wall('x', -10.8, 1, 4.2, { pos: 'bath', neg: 'ext' });
    this.wall('z', 4.2, -7.2, -10.8, { pos: 'ext', neg: 'bath' });
    // bedroom
    this.wall('z', 2.5, -14, -18, { pos: 'bed', neg: 'ext' });
    this.wall('z', 6.5, -14, -18, { pos: 'ext', neg: 'bed' }, []);
    this.wall('x', -18, 2.5, 6.5, { pos: 'bed', neg: 'ext' }, [{ a: 3.6, b: 4.8, bottom: 1.0, top: 2.1 }]);
    // closet niche
    this.wall('z', -1.8, -8.0, -8.8, { pos: 'hall', neg: 'ext' });
    this.wall('x', -8.0, -1.8, -1, { pos: 'ext', neg: 'hall' });
    this.wall('x', -8.8, -1.8, -1, { pos: 'hall', neg: 'ext' });
    // exterior backside of the hall-B/bath area so the outside isn't see-through
    this.wall('z', -1.08, -14, -18, { pos: 'ext', neg: 'ext' });

    // windows (glass + frames)
    this.window('z', -1, -1.4, 1.0, 2.05, 1.0);
    this.window('x', -18, 4.2, 1.0, 2.1, 1.2);

    // porch posts, railing, steps (seen in the escape ending)
    for (const z of [-1.6, -6.4]) this.box(0.14, 2.6, 0.14, -4.9, 1.3, z, m.ext);
    this.box(4.1, 0.12, 5.2, -3, 2.62, -4, m.ext, { cast: false });
    this.box(0.08, 0.08, 4.8, -4.9, 0.9, -4, m.ext);
    for (let i = 0; i < 3; i++) this.box(0.4, 0.12, 1.4, -5.2 - i * 0.4, -0.06 - i * 0.12, -4, m.ext);
    this.addCollider(-5.1, -4.8, -6.6, -1.4, 'porch');
    this.addCollider(-5.1, -1, -6.8, -6.5, 'porch');
    this.addCollider(-5.1, -1, -1.5, -1.2, 'porch');
  }

  window(axis, c, s, y0, y1, w) {
    const h = y1 - y0;
    const g = new THREE.PlaneGeometry(w, h);
    const glass = new THREE.Mesh(g, this.mats.glass);
    if (axis === 'z') { glass.rotation.y = Math.PI / 2; glass.position.set(c - 0.02, (y0 + y1) / 2, s); }
    else { glass.position.set(s, (y0 + y1) / 2, c + 0.02); }
    this.root.add(glass);
    const t = this.mats.trim;
    const f = 0.06;
    if (axis === 'z') {
      this.box(0.22, f, w + 0.12, c, y0, s, t);
      this.box(0.22, f, w + 0.12, c, y1, s, t);
      this.box(0.22, h, f, c, (y0 + y1) / 2, s - w / 2, t);
      this.box(0.22, h, f, c, (y0 + y1) / 2, s + w / 2, t);
      this.box(0.2, 0.03, w, c, (y0 + y1) / 2, s, t);
      this.box(0.2, h, 0.03, c, (y0 + y1) / 2, s, t);
    } else {
      this.box(w + 0.12, f, 0.22, s, y0, c, t);
      this.box(w + 0.12, f, 0.22, s, y1, c, t);
      this.box(f, h, 0.22, s - w / 2, (y0 + y1) / 2, c, t);
      this.box(f, h, 0.22, s + w / 2, (y0 + y1) / 2, c, t);
      this.box(w, 0.03, 0.2, s, (y0 + y1) / 2, c, t);
      this.box(0.03, h, 0.2, s, (y0 + y1) / 2, c, t);
    }
  }

  // ------------------------------------------------------------------ doors
  buildDoors() {
    this.doors.start = new Door(this, { id: 'start', axis: 'x', c: 0, center: 0, width: 0.9, hinge: -1, swing: -1, label: 'Door' });
    this.doors.front = new Door(this, { id: 'front', axis: 'z', c: -1, center: -4, width: 0.9, hinge: 1, swing: 1, label: 'Front door', peephole: true });
    this.doors.closet = new Door(this, { id: 'closet', axis: 'z', c: -1, center: -8.4, width: 0.8, hinge: -1, swing: 1, label: 'Closet', slats: true });
    this.doors.bath = new Door(this, { id: 'bath', axis: 'z', c: 1, center: -9, width: 0.9, hinge: 1, swing: 1, label: 'Bathroom' });
    this.doors.bedroom = new Door(this, { id: 'bedroom', axis: 'x', c: -14, center: 4.5, width: 0.9, hinge: 1, swing: -1, label: 'Bedroom' });
    this.doors.end = new Door(this, { id: 'end', axis: 'z', c: 7, center: -13, width: 0.9, hinge: 1, swing: 1, label: 'Door' });
    this.doors.front.locked = true;
    this.doors.start.locked = true;
    this.doors.end.locked = true;

    // Closet is a hiding spot.
    this.hidingSpots.closet = {
      id: 'closet', door: this.doors.closet,
      inside: new THREE.Vector3(-1.42, 0, -8.4), yaw: -Math.PI / 2,
      exit: new THREE.Vector3(-0.45, 0, -8.4),
    };
  }

  // ------------------------------------------------------------------ nav graph
  buildNav() {
    const N = (id, x, z) => ({ id, x, z, links: [] });
    const nodes = [
      N('a0', 0, -0.8), N('a1', 0, -2.6), N('a2', 0, -4.0), N('a3', 0, -6.0), N('a4', 0, -8.4),
      N('a5', 0, -10.2), N('a6', 0, -11.8), N('c', 0, -13.0),
      N('b1', 2.2, -13.0), N('b2', 4.5, -13.0), N('b3', 6.4, -13.0),
      N('bt0', 1.5, -9.0), N('bt1', 2.6, -9.0), N('bt2', 3.4, -8.1),
      N('bd0', 4.5, -14.5), N('bd1', 4.5, -15.8), N('bd2', 3.3, -16.9), N('bd3', 5.6, -16.9), N('bd4', 5.6, -15.5),
      N('cl', -0.45, -8.4), N('fd', -0.45, -4.0),
    ];
    const map = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const link = (a, b) => { map[a].links.push(map[b]); map[b].links.push(map[a]); };
    ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'c', 'b1', 'b2', 'b3'].reduce((p, n) => (link(p, n), n));
    link('a4', 'bt0'); link('a5', 'bt0'); link('bt0', 'bt1'); link('bt1', 'bt2');
    link('b2', 'bd0'); link('bd0', 'bd1'); link('bd1', 'bd2'); link('bd1', 'bd3'); link('bd1', 'bd4'); link('bd3', 'bd4');
    link('a4', 'cl'); link('a3', 'cl'); link('a2', 'fd'); link('a1', 'fd');
    // door-gated links
    map.bt0.gate = 'bath'; map.bd0.gate = 'bedroom';
    this.nav = { nodes, map };
  }

  // Which room is a point in?
  roomAt(x, z) {
    if (x >= -1 && x <= 1 && z <= 0 && z >= -12) return 'hallA';
    if (x >= -1 && x <= 7 && z < -12 && z >= -14) return x < 1 ? 'corner' : 'hallB';
    if (x > 1 && x <= 4.2 && z <= -7.2 && z >= -10.8) return 'bath';
    if (x >= 2.5 && x <= 6.5 && z < -14 && z >= -18) return 'bedroom';
    if (x < -1 && x > -1.8 && z <= -8 && z >= -8.8) return 'closet';
    if (x > 7) return 'void';
    if (x < -1) return 'porch';
    return 'none';
  }

  addInteractable(obj) {
    this.interactables.push(obj);
    for (const m of obj.meshes) m.userData.interactable = obj;
    return obj;
  }
  get interactMeshes() {
    const out = [];
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      out.push(...it.meshes);
    }
    return out;
  }

  update(dt) {
    for (const d of Object.values(this.doors)) d.update(dt);
  }
}

// ---------------------------------------------------------------------- Door
export class Door {
  constructor(house, o) {
    Object.assign(this, { locked: false, open: 0, target: 0, speed: 1.4, maxAngle: 1.75 }, o);
    this.house = house;
    const { axis, c, center, width, hinge } = o;
    const w = width - 0.02, h = 2.08, t = 0.05;
    // pivot at hinge
    this.pivot = new THREE.Group();
    const hingeS = center + hinge * (width / 2);
    if (axis === 'x') this.pivot.position.set(hingeS, 0, c);
    else this.pivot.position.set(c, 0, hingeS);
    house.root.add(this.pivot);
    const dirAlong = -hinge; // panel extends away from hinge
    this.dirAlong = dirAlong;
    this.panel = new THREE.Group();
    if (axis === 'x') this.panel.position.set(dirAlong * w / 2, h / 2, 0);
    else this.panel.position.set(0, h / 2, dirAlong * w / 2);
    this.pivot.add(this.panel);
    const dims = axis === 'x' ? [w, h, t] : [t, h, w];
    const mats = house.mats;
    if (o.slats) {
      // louvred closet door you can peek through
      const n = 13;
      const frameT = 0.07;
      const fr = (a, b, cc, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, cc), mats.doorPlain);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        this.panel.add(m);
      };
      if (axis === 'x') {
        fr(frameT, h, t, -w / 2 + frameT / 2, 0, 0); fr(frameT, h, t, w / 2 - frameT / 2, 0, 0);
        fr(w, frameT, t, 0, h / 2 - frameT / 2, 0); fr(w, frameT, t, 0, -h / 2 + frameT / 2, 0);
      } else {
        fr(t, h, frameT, 0, 0, -w / 2 + frameT / 2); fr(t, h, frameT, 0, 0, w / 2 - frameT / 2);
        fr(t, frameT, w, 0, h / 2 - frameT / 2, 0); fr(t, frameT, w, 0, -h / 2 + frameT / 2, 0);
      }
      for (let i = 0; i < n; i++) {
        const y = -h / 2 + frameT + 0.06 + i * ((h - 2 * frameT - 0.1) / (n - 1));
        const s = new THREE.Mesh(axis === 'x' ? new THREE.BoxGeometry(w - 0.1, 0.075, 0.018) : new THREE.BoxGeometry(0.018, 0.075, w - 0.1), mats.doorPlain);
        s.position.y = y;
        s.rotation[axis === 'x' ? 'x' : 'z'] = 0.6 * (axis === 'x' ? 1 : -1);
        s.castShadow = true;
        this.panel.add(s);
      }
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...dims), mats.door);
      m.castShadow = m.receiveShadow = true;
      this.panel.add(m);
    }
    // knobs
    const knobGeo = new THREE.SphereGeometry(0.035, 16, 12);
    for (const s of [-1, 1]) {
      const k = new THREE.Mesh(knobGeo, mats.brass);
      const along = dirAlong * (w / 2 - 0.08);
      if (axis === 'x') k.position.set(along, -0.08, s * 0.05);
      else k.position.set(s * 0.05, -0.08, along);
      k.castShadow = true;
      this.panel.add(k);
    }
    // invisible hit volume for raycasting
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(...dims.map((d, i) => (i === (axis === 'x' ? 2 : 0) ? 0.2 : d))), mats.hit);
    this.panel.add(this.hit);
    // frame
    const fw = 0.08, fd = 0.22;
    if (axis === 'x') {
      house.box(fw, 2.16, fd, center - width / 2 - fw / 2 + 0.02, 1.08, c, mats.trim);
      house.box(fw, 2.16, fd, center + width / 2 + fw / 2 - 0.02, 1.08, c, mats.trim);
      house.box(width + 0.16, fw, fd, center, 2.16, c, mats.trim);
      this.collider = house.addCollider(center - width / 2, center + width / 2, c - 0.06, c + 0.06, 'door:' + o.id);
    } else {
      house.box(fd, 2.16, fw, c, 1.08, center - width / 2 - fw / 2 + 0.02, mats.trim);
      house.box(fd, 2.16, fw, c, 1.08, center + width / 2 + fw / 2 - 0.02, mats.trim);
      house.box(fd, fw, width + 0.16, c, 2.16, center, mats.trim);
      this.collider = house.addCollider(c - 0.06, c + 0.06, center - width / 2, center + width / 2, 'door:' + o.id);
    }
    if (o.peephole) {
      const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10), mats.brass);
      ph.rotation.z = Math.PI / 2;
      ph.position.set(0, 0.55, 0);
      this.panel.add(ph);
    }
    // Chain + padlock (shown when chained)
    this.chain = new THREE.Group();
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.4 });
    for (let i = 0; i < 9; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), chainMat);
      link.position.set(0.1, -0.1 + Math.sin(i / 8 * Math.PI) * -0.06, -0.35 + i * 0.075);
      link.rotation.set(i % 2 ? Math.PI / 2 : 0, Math.PI / 2, 0);
      this.chain.add(link);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.06), mats.brass);
    lock.position.set(0.1, -0.2, 0);
    this.chain.add(lock);
    this.chain.visible = false;
    if (axis === 'z') {
      this.chain.position.set(c, 1.05, center);
      house.root.add(this.chain);
    }
    this.onInteract = null;
    house.addInteractable({
      meshes: [this.hit],
      label: () => this.promptLabel(),
      enabled: () => true,
      onInteract: (game) => this.onInteract ? this.onInteract(game, this) : this.toggle(game),
    });
  }

  promptLabel() {
    if (this.customLabel) return this.customLabel();
    if (this.locked) return `${this.label} (locked)`;
    return this.target > 0 ? `Close ${this.label.toLowerCase()}` : `Open ${this.label.toLowerCase()}`;
  }

  toggle(game) {
    if (this.locked) {
      game?.audio?.sfx.play('locked', { position: this.worldPos() });
      game?.ui?.toast(this.lockedText || 'It won’t open.');
      return;
    }
    this.setOpen(this.target > 0 ? 0 : 1, game);
  }

  setOpen(v, game, { silent = false, speed } = {}) {
    if (this.target === v) return;
    this.target = v;
    if (speed) this.speed = speed;
    if (!silent && game?.audio) game.audio.sfx.play(v > 0 ? 'doorOpen' : 'doorClose', { position: this.worldPos() });
  }

  snap(v) {
    this.target = this.open = v;
    this.apply();
  }

  worldPos() {
    return this.axis === 'x' ? new THREE.Vector3(this.center, 1.2, this.c) : new THREE.Vector3(this.c, 1.2, this.center);
  }

  apply() {
    const s = this.axis === 'x' ? -this.swing * this.dirAlong : this.swing * this.dirAlong;
    this.pivot.rotation.y = s * this.open * this.maxAngle * (this.slats ? 0.85 : 1);
    this.collider.enabled = this.open < 0.25;
  }

  update(dt) {
    if (this.open !== this.target) {
      const d = this.target - this.open;
      const step = this.speed * dt;
      this.open = Math.abs(d) < step ? this.target : this.open + Math.sign(d) * step;
      this.apply();
    }
  }
}
