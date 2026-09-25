import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldUV } from '../render/MaterialLib.js';
import { recipeWorld } from '../render/recipes.js';
import { ReflectionProbe, bakeVertexAO, setFlatAO } from '../render/Probes.js';
import { NavGrid } from './NavGrid.js';

// A Level is a set of zones (rooms / areas). Static geometry is added through
// a Builder, gets world-scale UVs, and is batched per (zone, material) at
// finalize() time; then vertex AO is baked and reflection probes captured.

export class Zone {
  constructor(level, id, o) {
    this.level = level;
    this.id = id;
    this.name = o.name || id;
    this.min = new THREE.Vector3(o.x0, o.floorY ?? 0, o.z0);
    this.max = new THREE.Vector3(o.x1, (o.floorY ?? 0) + (o.h ?? 3), o.z1);
    this.floorY = o.floorY ?? 0;
    this.layer = o.layer ?? 0;
    this.group = new THREE.Group();
    this.group.name = 'zone:' + id;
    level.root.add(this.group);
    this.neighbors = new Set(o.neighbors || []);
    this.grade = o.grade || 'night';
    this.fog = { density: 0.035, heightFalloff: 0.2, ambient: [0.0005, 0.0006, 0.0007], noise: 0.75, ...(o.fog || {}) };
    this.reverb = o.reverb || 'room';
    this.ambience = o.ambience || null;
    this.envIntensity = o.envIntensity ?? 1;
    this.exposure = o.exposure ?? 1;
    this.anyLayer = !!o.anyLayer;
    this.matDefaults = o.mat || {};
    this.outdoor = !!o.outdoor;
    this.probeAt = o.probe ? new THREE.Vector3(...o.probe) : new THREE.Vector3((o.x0 + o.x1) / 2, this.floorY + Math.min(1.6, (o.h ?? 3) * 0.55), (o.z0 + o.z1) / 2);
    this.probe = null;
    this.parts = new Map(); // material → geometries
    this.meshes = [];
    this.fixtures = [];
  }
  contains(p, pad = 0) {
    return p.x >= this.min.x - pad && p.x <= this.max.x + pad && p.z >= this.min.z - pad && p.z <= this.max.z + pad &&
      p.y >= this.min.y - 1.5 && p.y <= this.max.y + 1.5;
  }
}

export class Level {
  constructor(game, name) {
    this.game = game;
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = 'level:' + name;
    this.zones = new Map();
    this.colliders = [];
    this.interactables = [];
    this.hides = [];
    this.anchors = {};
    this.doors = {};
    this.dynamic = new THREE.Group();
    this.root.add(this.dynamic);
    this.updaters = [];
    this.nav = null;
    this.lib = game.lib;
  }

  zone(id, o) {
    const z = new Zone(this, id, o);
    this.zones.set(id, z);
    return z;
  }

  zoneAt(p, layer = null) {
    let best = null, bestVol = Infinity;
    for (const z of this.zones.values()) {
      if (layer != null && !z.anyLayer && z.layer !== layer) continue;
      if (!z.contains(p)) continue;
      const v = (z.max.x - z.min.x) * (z.max.z - z.min.z);
      if (v < bestVol) { best = z; bestVol = v; }
    }
    return best;
  }

  builder(zoneId) { return new Builder(this, this.zones.get(zoneId)); }

  addCollider(c) {
    c.enabled = c.enabled ?? true;
    c.layer = c.layer ?? 0;
    this.colliders.push(c);
    this._hash = null;
    this._walls = null;
    return c;
  }

  // wall colliders on a layer (cached) for line-of-sight tests
  walls(layer = 0) {
    this._walls = this._walls || new Map();
    if (!this._walls.has(layer)) this._walls.set(layer, this.colliders.filter((c) => (c.layer ?? 0) === layer && (c.tag === 'wall' || c.tag?.startsWith('door'))));
    return this._walls.get(layer);
  }

  // colliders near a point on a layer (spatial hash, rebuilt lazily)
  near(x, z, layer = 0) {
    if (!this._hash) {
      this._hash = new Map();
      for (const c of this.colliders) {
        for (let gx = Math.floor(c.minX / 4); gx <= Math.floor(c.maxX / 4); gx++) {
          for (let gz = Math.floor(c.minZ / 4); gz <= Math.floor(c.maxZ / 4); gz++) {
            const k = gx * 73856093 ^ gz * 19349663;
            if (!this._hash.has(k)) this._hash.set(k, []);
            this._hash.get(k).push(c);
          }
        }
      }
    }
    const out = new Set();
    const gx0 = Math.floor(x / 4), gz0 = Math.floor(z / 4);
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
      const l = this._hash.get(gx * 73856093 ^ gz * 19349663);
      if (l) for (const c of l) if (c.layer === layer) out.add(c);
    }
    return [...out];
  }

  interact(mesh, spec) {
    mesh.userData.interactable = spec;
    this.interactables.push(mesh);
    return mesh;
  }

  onUpdate(fn) { this.updaters.push(fn); }

  update(dt, t) { for (const f of this.updaters) f(dt, t); }

  // Batch geometry, bake AO, build nav, capture probes.
  async finalize({ ao = true, aoAsync = false, probeSize = 128, onProgress } = {}) {
    const zones = [...this.zones.values()];
    // 1. batch per zone/material
    const aoTargets = [], occ = [];
    for (const z of zones) {
      for (const [m, list] of z.parts) {
        const geos = list.map((g) => normalizeAttrs(g));
        const merged = mergeGeometries(geos, false);
        list.forEach((g) => g.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, m.mat);
        mesh.castShadow = m.cast !== false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.name = `${z.id}:${m.mat.name}`;
        z.group.add(mesh);
        z.meshes.push(mesh);
        if (m.ao !== false) aoTargets.push(merged);
        if (m.occlude !== false) occ.push(merged);
        if (m.ao === false) setFlatAO(merged, 1);
      }
      z.parts.clear();
    }
    onProgress?.(0.05, 'batching');
    if (this.game.debug) console.log('LOG aoTargets', aoTargets.length, aoTargets.reduce((n, g) => n + g.attributes.position.count, 0), 'occ', occ.reduce((n, g) => n + g.attributes.position.count, 0), [...this.zones.values()].map((z) => z.id + ':' + z.meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0)).join(' '));
    // 2. baked AO
    if (ao) {
      const key = aoKey(this.name, aoTargets);
      const cached = await cacheGet(key);
      if (cached && applyAO(aoTargets, cached)) onProgress?.(0.8, 'baking light');
      else if (aoAsync) {
        // first visit: play with flat AO while the bake runs in the background
        aoTargets.forEach((g) => setFlatAO(g, 1));
        this.aoTask = bakeVertexAO(aoTargets, occ, { budget: 9 }).then(() => { if (!this.disposed) cachePut(key, packAO(aoTargets)); });
      } else {
        await bakeVertexAO(aoTargets, occ, { onProgress: (p) => onProgress?.(0.05 + p * 0.75, 'baking light') });
        cachePut(key, packAO(aoTargets));
      }
    }
    else aoTargets.forEach((g) => setFlatAO(g, 1));
    // 3. navigation
    this.nav = new NavGrid(this.colliders, this.bounds());
    onProgress?.(0.85, 'mapping');
    // 4. probes (created now, captured by the game once lights exist)
    for (const z of zones) {
      z.probe = new ReflectionProbe(this.game.renderer.renderer, { position: z.probeAt, min: z.min, max: z.max, size: probeSize });
    }
    onProgress?.(0.9, 'reflections');
  }

  bounds() {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const z of this.zones.values()) {
      b.minX = Math.min(b.minX, z.min.x); b.maxX = Math.max(b.maxX, z.max.x);
      b.minZ = Math.min(b.minZ, z.min.z); b.maxZ = Math.max(b.maxZ, z.max.z);
    }
    return b;
  }

  dispose() {
    this.disposed = true;
    this.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    for (const z of this.zones.values()) z.probe?.dispose();
    this.root.removeFromParent();
  }
}

// ---- baked AO cache (IndexedDB): the bake only runs the first time a level loads
const AO_VERSION = 3;
function aoKey(name, targets) {
  let n = 0, h = 0;
  for (const g of targets) {
    const p = g.attributes.position.array;
    n += p.length;
    for (let i = 0; i < p.length; i += 97) h = (h * 31 + Math.round(p[i] * 100)) | 0;
  }
  return `ao:${AO_VERSION}:${name}:${n}:${h}`;
}
function packAO(targets) {
  let n = 0;
  for (const g of targets) n += g.attributes.aAO.count;
  const out = new Uint8Array(n);
  let o = 0;
  for (const g of targets) { const a = g.attributes.aAO.array; for (let i = 0; i < a.length; i++) out[o++] = Math.round(a[i] * 255); }
  return out;
}
function applyAO(targets, data) {
  let n = 0;
  for (const g of targets) n += g.attributes.position.count;
  if (data.length !== n) return false;
  let o = 0;
  for (const g of targets) {
    const ao = new Float32Array(g.attributes.position.count);
    for (let i = 0; i < ao.length; i++) ao[i] = data[o++] / 255;
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  }
  return true;
}
function idb() {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open('verity2-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cacheGet(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cachePut(key, value) {
  const db = await idb();
  if (!db) return;
  try {
    const tx = db.transaction('kv', 'readwrite');
    const st = tx.objectStore('kv');
    // one entry per level: drop stale bakes
    const prefix = key.split(':').slice(0, 3).join(':');
    const c = st.openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) { st.put(value, key); return; } if (String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); };
  } catch { /* ignore */ }
}

function normalizeAttrs(g) {
  // merged geometries need identical attribute sets (position, normal, uv)
  // and must all be indexed; keep shared vertices shared (AO is per vertex)
  const geo = g;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.morphAttributes = {};
  return geo;
}

// ------------------------------------------------------------------ builder
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

export class Builder {
  constructor(level, zone) {
    this.level = level;
    this.zone = zone;
    this.lib = level.lib;
    this.layer = zone.layer;
    // coordinates passed to a builder are relative to the zone's floor
    this.y = 0;
    this.oy = zone.floorY;
  }

  // a light fixture at a floor-relative position
  light(o) {
    if (o.position) o.position = o.position.clone().setY(o.position.y + this.oy);
    return this.level.game.lights.add({ zone: this.zone, ...o });
  }

  // material spec → material (zone-aware, vertex-AO enabled)
  M(spec) {
    if (spec?.isMaterial) return { mat: spec, world: spec.userData.world ?? 1 };
    const s = typeof spec === 'string' ? { r: spec } : spec;
    const { r, ...o2 } = s;
    const opts = { ...this.zone.matDefaults, ...o2 };
    const mat = r === 'plain' ? this.lib.plain({ ...opts, zone: this.zone, vao: true }) : this.lib.get(r, { ...opts, zone: this.zone, vao: true });
    return { mat, world: (s.world ?? recipeWorld(r)) * (s.scale ?? 1), rot: s.uvRot || 0 };
  }

  // add world-space geometry with a material
  addGeo(geo, spec, matrix = null, flags = {}) {
    if (this.noAO && flags.ao === undefined) flags = { ...flags, ao: false };
    // small details don't need baked AO (screen-space AO covers them)
    if (flags.ao === undefined) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const b = geo.boundingBox;
      if (Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.45) flags = { ...flags, ao: false };
    }
    const { mat, world, rot } = this.M(spec);
    if (matrix) geo.applyMatrix4(matrix);
    if (!flags.keepUV) worldUV(geo, new THREE.Matrix4(), world, rot);
    let key = null;
    for (const k of this.zone.parts.keys()) if (k.mat === mat && k.cast === flags.cast && k.ao === flags.ao) { key = k; break; }
    if (!key) { key = { mat, cast: flags.cast, ao: flags.ao, occlude: flags.occlude }; this.zone.parts.set(key, []); }
    this.zone.parts.get(key).push(geo);
    return geo;
  }

  matrix(pos, rot = [0, 0, 0], scale) {
    _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(new THREE.Vector3(pos[0], pos[1] + this.oy, pos[2]), _q, scale ? new THREE.Vector3(...scale) : _s);
  }

  // subdivided box (for AO resolution) — pos is the centre
  box(w, h, d, pos, spec, o = {}) {
    const seg = o.seg ?? 0.6;
    const geo = o.bevel
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(o.bevel, w / 2.1, h / 2.1, d / 2.1))
      : new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / seg)), Math.max(1, Math.ceil(h / seg)), Math.max(1, Math.ceil(d / seg)));
    this.addGeo(geo, spec, this.matrix(pos, o.rot), o);
    if (o.collide) this.colliderBox(pos, w, d, o.rot?.[1] || 0, o.collide === true || o.collide === 'low' ? 'prop' : o.collide, { ...o, low: o.collide === 'low' });
    return geo;
  }

  // arbitrary geometry
  geo(geometry, spec, pos = [0, 0, 0], rot, o = {}) {
    this.addGeo(geometry, spec, this.matrix(pos, rot, o.scale), o);
    return geometry;
  }

  colliderBox(pos, w, d, ry = 0, tag = 'prop', o = {}) {
    // axis-aligned approximation of a (possibly rotated) footprint
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    return this.level.addCollider({
      minX: pos[0] - hw, maxX: pos[0] + hw, minZ: pos[2] - hd, maxZ: pos[2] + hd, tag, layer: this.layer,
      y0: o.y0 ?? this.y, y1: o.y1 ?? this.y + 3, low: !!o.low,
    });
  }

  collider(x0, z0, x1, z1, tag = 'wall', o = {}) {
    return this.level.addCollider({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), tag, layer: this.layer, y0: this.y, y1: this.y + 3, ...o });
  }

  floor(x0, z0, x1, z1, spec, o = {}) {
    const t = o.t ?? 0.1;
    const y = (o.y ?? this.y) - t / 2;
    this.box(x1 - x0, t, z1 - z0, [(x0 + x1) / 2, y, (z0 + z1) / 2], spec, { seg: o.seg ?? 0.75, cast: false, ...o, bevel: 0 });
  }

  ceiling(x0, z0, x1, z1, h, spec, o = {}) {
    const t = o.t ?? 0.1;
    this.box(x1 - x0, t, z1 - z0, [(x0 + x1) / 2, this.y + h + t / 2, (z0 + z1) / 2], spec, { seg: o.seg ?? 0.75, ...o, bevel: 0 });
  }

  // Axis-aligned wall from (x0,z0) to (x1,z1) with openings.
  // openings: [{ at: distance from start to opening centre, w, h, sill = 0, frame = spec|false, id }]
  wall(x0, z0, x1, z1, o = {}) {
    const h = o.h ?? 3, t = o.t ?? 0.16, spec = o.mat ?? 'paint';
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const dir = alongX ? Math.sign(x1 - x0) || 1 : Math.sign(z1 - z0) || 1;
    const P = (s, y, off = 0) => (alongX ? [x0 + dir * s, y, z0 + off] : [x0 + off, y, z0 + dir * s]);
    const seg = (s0, s1, y0, y1, sp = spec, thick = t, off = 0, opts = {}) => {
      if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
      const w = s1 - s0, hh = y1 - y0;
      const pos = P((s0 + s1) / 2, this.y + (y0 + y1) / 2, off);
      if (alongX) this.box(w, hh, thick, pos, sp, { seg: 0.5, ...opts });
      else this.box(thick, hh, w, pos, sp, { seg: 0.5, ...opts });
    };
    const ops = (o.openings || []).map((p) => ({ sill: 0, ...p, s0: p.at - p.w / 2, s1: p.at + p.w / 2 })).sort((a, b) => a.s0 - b.s0);
    let cur = 0;
    for (const p of ops) {
      seg(cur, p.s0, 0, h);
      if (p.sill > 0) seg(p.s0, p.s1, 0, p.sill);
      seg(p.s0, p.s1, p.sill + p.h, h);
      // frame / casing (both faces)
      if (p.frame !== false) {
        const fs = p.frame || { r: 'wood', color: 0xd8d2c4, rough: 0.9 };
        const ft = 0.06, fd = t + 0.04;
        seg(p.s0 - ft, p.s0, p.sill, p.sill + p.h + ft, fs, fd, 0, { bevel: 0.012 });
        seg(p.s1, p.s1 + ft, p.sill, p.sill + p.h + ft, fs, fd, 0, { bevel: 0.012 });
        seg(p.s0, p.s1, p.sill + p.h, p.sill + p.h + ft, fs, fd, 0, { bevel: 0.012 });
        if (p.sill > 0) seg(p.s0 - 0.04, p.s1 + 0.04, p.sill - 0.04, p.sill, fs, fd + 0.04, 0, { bevel: 0.01 });
      }
      cur = p.s1;
    }
    seg(cur, L, 0, h);
    // baseboards
    if (o.base !== false) {
      const bs = o.baseMat || { r: 'wood', color: 0xcfc8b8, rough: 0.8 };
      let c2 = 0;
      const doorOps = ops.filter((p) => p.sill <= 0.01);
      const spans = [];
      for (const p of doorOps) { spans.push([c2, p.s0 - 0.06]); c2 = p.s1 + 0.06; }
      spans.push([c2, L]);
      for (const [a, b] of spans) {
        for (const side of o.baseSides || [-1, 1]) seg(a, b, 0, 0.11, bs, 0.02, side * (t / 2 + 0.01), { bevel: 0.006, ao: true });
      }
    }
    // colliders (solid parts only)
    cur = 0;
    const colSeg = (s0, s1) => {
      if (s1 - s0 < 0.01) return;
      const a = P(s0, 0), b = P(s1, 0);
      this.collider(a[0] - (alongX ? 0 : t / 2), a[2] - (alongX ? t / 2 : 0), b[0] + (alongX ? 0 : t / 2), b[2] + (alongX ? t / 2 : 0), o.tag || 'wall');
    };
    for (const p of ops) {
      colSeg(Math.min(cur, p.s0), Math.max(cur, p.s0));
      if (p.sill > 0.05) colSeg(p.s0, p.s1); // windows block movement
      cur = p.s1;
    }
    colSeg(cur, L);
    return { alongX, L, dir, P };
  }

  // Rectangular room: floor, ceiling, walls with openings per side.
  // doors/openings per side: { n: [{at, w, h}], s, e, w }  (n = min z, s = max z, w = min x, e = max x)
  room(r) {
    const { x0, z0, x1, z1, h = 3 } = r;
    if (r.floor !== false) this.floor(x0, z0, x1, z1, r.floor || 'vct');
    if (r.ceil !== false) this.ceiling(x0, z0, x1, z1, h, r.ceil || 'ceilingTile');
    const wm = r.wall || 'paint';
    const sides = r.sides || {};
    const common = { h, mat: wm, t: r.t ?? 0.16, base: r.base, baseMat: r.baseMat };
    if (!r.skip?.includes('n')) this.wall(x0, z0, x1, z0, { ...common, openings: sides.n });
    if (!r.skip?.includes('s')) this.wall(x0, z1, x1, z1, { ...common, openings: sides.s });
    if (!r.skip?.includes('w')) this.wall(x0, z0, x0, z1, { ...common, openings: sides.w });
    if (!r.skip?.includes('e')) this.wall(x1, z0, x1, z1, { ...common, openings: sides.e });
  }

  // Non-batched object (animated / interactive) placed in this zone.
  add(obj) { obj.position.y += this.oy; this.zone.group.add(obj); return obj; }
}
