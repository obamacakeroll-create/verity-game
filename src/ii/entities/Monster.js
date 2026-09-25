import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, makeRng, noise1 } from '../../core/util.js';
import { patch } from '../render/MaterialLib.js';

// Verity's true form, rebuilt for part two: a procedurally generated,
// skinned, emaciated yellow humanoid (≈2.6 m) with a real skeleton,
// ribbed torso, knuckled limbs, 4-fingered hands, and a jaw full of teeth.
// Animated procedurally: planted feet with two-bone IK, hunched spine sway,
// head tracking, twitches, reaching arms, a jaw that opens to scream.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Monster {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'monster';
    game.scene.add(this.root);
    this.rng = makeRng(666);
    this.bones = {};
    this.rest = {}; // rest world positions
    this.buildSkeleton();
    this.buildMaterials();
    this.buildBody();
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.moveDir = V(0, 0, 1);
    this.unfold = 1;
    this.mode = 'walk'; // idle | walk | run | reach | lunge | stand | crouch
    this.jaw = 0;
    this.jawTarget = 0;
    this.lookAt = null; // world point to track with the head
    this.reachAt = null;
    this.twitch = { t: 0, roll: 0, yaw: 0, pitch: 0, next: 1.5 };
    this.onStep = null;
    this.visible = false;
    this.root.visible = false;
    this.lean = 0;
    this.crouch = 0;
    this.feet = [
      { side: 1, plant: V(0.14, 0, 0), from: V(), to: V(), swing: false, off: 0 },
      { side: -1, plant: V(-0.14, 0, 0), from: V(), to: V(), swing: false, off: 0.5 },
    ];
    this._q = new THREE.Quaternion();
    this._v = V(0, 0, 0);
  }

  get position() { return this.root.position; }
  show(v = true) {
    this.visible = v;
    this.root.visible = v;
    if (v) this.resetFeet();
  }

  // ------------------------------------------------------------------ skeleton
  buildSkeleton() {
    const b = this.bones, R = this.rest;
    const mk = (name, parent, pos) => {
      const bone = new THREE.Bone();
      bone.name = name;
      b[name] = bone;
      R[name] = pos.clone();
      if (parent) {
        bone.position.copy(pos).sub(R[parent.name]);
        parent.add(bone);
      } else bone.position.copy(pos);
      return bone;
    };
    const hips = mk('hips', null, V(0, 1.3, 0));
    const s0 = mk('spine0', hips, V(0, 1.42, -0.01));
    const s1 = mk('spine1', s0, V(0, 1.62, -0.02));
    const s2 = mk('spine2', s1, V(0, 1.84, -0.01));
    const n0 = mk('neck0', s2, V(0, 2.04, 0.02));
    const n1 = mk('neck1', n0, V(0, 2.18, 0.06));
    const head = mk('head', n1, V(0, 2.3, 0.09));
    mk('headTip', head, V(0, 2.62, 0.08));
    mk('jaw', head, V(0, 2.32, 0.08));
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const cl = mk('clav' + n, s2, V(0.04 * s, 1.99, 0.0));
      const up = mk('upper' + n, cl, V(0.21 * s, 1.97, -0.03));
      const fo = mk('fore' + n, up, V(0.25 * s, 1.5, -0.04));
      const ha = mk('hand' + n, fo, V(0.27 * s, 1.05, 0.0));
      mk('handTip' + n, ha, V(0.28 * s, 0.93, 0.02));
      for (let f = 0; f < 4; f++) {
        const fx = (0.27 + (f - 1.5) * 0.02) * s;
        const fz = 0.02 + (f - 1.5) * 0.018;
        const a = mk(`f${f}a${n}`, ha, V(fx, 0.93, fz));
        const bb = mk(`f${f}b${n}`, a, V(fx + 0.005 * s, 0.76 - f * 0.005, fz + 0.01));
        mk(`f${f}c${n}`, bb, V(fx + 0.008 * s, 0.6 - f * 0.01, fz + 0.03));
      }
      const th = mk('thigh' + n, hips, V(0.11 * s, 1.26, 0));
      const sh = mk('shin' + n, th, V(0.12 * s, 0.7, 0.04));
      const ft = mk('foot' + n, sh, V(0.12 * s, 0.09, -0.02));
      mk('toe' + n, ft, V(0.12 * s, 0.02, 0.19));
    }
    this.skeletonRoot = hips;
    this.root.add(hips);
    const list = Object.values(b);
    this.boneList = list;
    this.skeleton = new THREE.Skeleton(list);
    // rest-pose local direction to the child, for IK
    this.restDir = {};
    const child = { thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR', upperL: 'foreL', foreL: 'handL', upperR: 'foreR', foreR: 'handR', neck0: 'neck1', neck1: 'head', footL: 'toeL', footR: 'toeR' };
    for (const [k, c] of Object.entries(child)) this.restDir[k] = b[c].position.clone().normalize();
    this.len = {
      thigh: R.thighL.distanceTo(R.shinL), shin: R.shinL.distanceTo(R.footL),
      upper: R.upperL.distanceTo(R.foreL), fore: R.foreL.distanceTo(R.handL),
    };
  }

  buildMaterials() {
    const g = this.game;
    const skin = g.lib.set('skin');
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xc4a24c, map: skin.map, normalMap: skin.normalMap, roughnessMap: skin.orm, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(1.7, 1.7), sheen: 0.45, sheenColor: new THREE.Color(0xffe39a), sheenRoughness: 0.45,
      clearcoat: 0.25, clearcoatRoughness: 0.4,
    });
    patch(this.mat, { grime: 0.2 });
    this.sss = { value: 0.18 };
    this.bruise = { value: 0 };
    const prev = this.mat.onBeforeCompile;
    this.mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.uniforms.uSSS = this.sss;
      sh.uniforms.uBruise = this.bruise;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSSS, uBruise;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
          // thin-skin back-scatter approximation: warm rim + lifted shadows
          totalEmissiveRadiance += vec3(0.5, 0.33, 0.08) * fres * uSSS * (0.4 + 0.6 * diffuseColor.r);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.5, 0.45), uBruise * smoothstep(0.4, 0.8, fres + 0.2));`);
    };
    this.mat.customProgramCacheKey = () => 'monster-skin';
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0203, roughness: 0.4, metalness: 0 });
    this.gumMat = new THREE.MeshPhysicalMaterial({ color: 0x5a1512, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    this.toothMat = new THREE.MeshPhysicalMaterial({ color: 0xe9dfbf, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.15, metalness: 0 });
    this.pupilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 2.5, roughness: 0.1 });
  }

  // ------------------------------------------------------------------ mesh
  // Generalised skinned tube between two rest points.
  tube(boneA, boneB, p0, p1, radius, o = {}) {
    const segs = o.segs ?? 10, rad = o.radial ?? 14;
    const ex = o.ex ?? 1, ez = o.ez ?? 1;
    const t0 = o.t0 ?? -0.06, t1 = o.t1 ?? 1.06;
    const D = p1.clone().sub(p0);
    const L = D.length();
    const dir = D.clone().normalize();
    const up = Math.abs(dir.y) < 0.95 ? V(0, 1, 0) : V(0, 0, 1);
    const N = up.clone().cross(dir).normalize();
    const B = dir.clone().cross(N).normalize();
    const ia = this.boneList.indexOf(this.bones[boneA]);
    const ib = boneB ? this.boneList.indexOf(this.bones[boneB]) : ia;
    const pos = [], idx = [], si = [], sw = [];
    for (let i = 0; i <= segs; i++) {
      const t = lerp(t0, t1, i / segs);
      const r = radius(clamp(t, 0, 1));
      const c = p0.clone().addScaledVector(D, t);
      for (let j = 0; j < rad; j++) {
        const a = (j / rad) * Math.PI * 2;
        let rr = r * (o.shape ? o.shape(clamp(t, 0, 1), a) : 1);
        const off = N.clone().multiplyScalar(Math.cos(a) * rr * ex).addScaledVector(B, Math.sin(a) * rr * ez);
        const v = c.clone().add(off);
        pos.push(v.x, v.y, v.z);
        const wB = boneB ? clamp((t - 0.7) / 0.35, 0, 1) * 0.5 : 0;
        si.push(ia, ib, 0, 0);
        sw.push(1 - wB, wB, 0, 0);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
      const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad);
      idx.push(a, c, b, b, c, d);
    }
    // caps
    const cap = (ring, point, flip) => {
      const ci = pos.length / 3;
      pos.push(point.x, point.y, point.z);
      si.push(flip ? ib : ia, 0, 0, 0); sw.push(1, 0, 0, 0);
      for (let j = 0; j < rad; j++) {
        const a = ring * rad + j, b = ring * rad + ((j + 1) % rad);
        if (flip) idx.push(a, b, ci); else idx.push(b, a, ci);
      }
    };
    if (o.capStart !== false) cap(0, p0.clone().addScaledVector(D, t0 - 0.02), false);
    if (o.capEnd !== false) cap(segs, p0.clone().addScaledVector(D, t1 + (o.tipPoint ?? 0.02)), true);
    return this.skinned(pos, idx, si, sw);
  }

  skinned(pos, idx, si, sw) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    // cylindrical-ish uv for the skin texture
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      uv[i * 2] = Math.atan2(x, z) / (Math.PI * 2) * 3 + x * 4;
      uv[i * 2 + 1] = y * 5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  // Rigid part (fully weighted to one bone), from a regular geometry in rest world space.
  rigid(geo, bone, bone2 = null, w2fn = null) {
    const g = geo;
    if (g.index) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const ia = this.boneList.indexOf(this.bones[bone]);
    const ib = bone2 ? this.boneList.indexOf(this.bones[bone2]) : ia;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position, i);
      const w = w2fn ? clamp(w2fn(p), 0, 1) : 0;
      si[i * 4] = ia; si[i * 4 + 1] = ib;
      sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    return g;
  }

  buildBody() {
    const R = this.rest;
    const parts = { skin: [], dark: [], gum: [], tooth: [], eye: [], pupil: [] };
    const knob = (base, tip, bulge = 0.35) => (t) => {
      const k = lerp(base, tip, t);
      return k * (1 + Math.pow(Math.abs(t - 0.5) * 2, 6) * bulge);
    };
    // ---- torso: pelvis → emaciated waist → ribcage, with rib ridges and a sunken belly
    {
      const segs = 34, rad = 22;
      const y0 = 1.16, y1 = 2.1;
      const pos = [], idx = [], si = [], sw = [];
      const sb = ['hips', 'spine0', 'spine1', 'spine2'].map((n) => this.boneList.indexOf(this.bones[n]));
      const ys = [1.3, 1.42, 1.62, 1.84];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const y = lerp(y0, y1, t);
        // width / depth profiles
        const sh = t > 0.84 ? Math.pow((t - 0.84) / 0.16, 1.6) : 0;
        const w = t < 0.18 ? lerp(0.15, 0.13, t / 0.18) : t < 0.42 ? lerp(0.13, 0.085, (t - 0.18) / 0.24) : t < 0.84 ? lerp(0.085, 0.165, Math.pow((t - 0.42) / 0.42, 0.6)) : lerp(0.165, 0.035, sh);
        const d = t < 0.18 ? 0.09 : t < 0.42 ? lerp(0.09, 0.06, (t - 0.18) / 0.24) : t < 0.84 ? lerp(0.06, 0.11, (t - 0.42) / 0.42) : lerp(0.11, 0.035, sh);
        const ribs = t > 0.48 && t < 0.86 ? Math.pow(Math.max(0, Math.sin((t - 0.48) * 66)), 0.6) * 0.2 * Math.sin(((t - 0.48) / 0.38) * Math.PI) : 0;
        const zc = lerp(0, -0.01, t);
        // bone weights by height
        let k = 0;
        while (k < 3 && y > ys[k + 1]) k++;
        const f = k < 3 ? clamp((y - ys[k]) / (ys[k + 1] - ys[k]), 0, 1) : 0;
        for (let j = 0; j < rad; j++) {
          const a = (j / rad) * Math.PI * 2;
          const cs = Math.cos(a), sn = Math.sin(a);
          const front = Math.max(0, sn); // sn>0 → +z (front)
          const back = Math.max(0, -sn);
          let rx = w, rz = d;
          const belly = t > 0.2 && t < 0.48 ? 1 - front * 0.35 * Math.sin(((t - 0.2) / 0.28) * Math.PI) : 1;
          const ribK = 1 + ribs * (0.4 + Math.abs(cs) * 0.6) * (1 - back * 0.7);
          const spine = back * (0.012 / Math.max(rz, 0.05)) * (Math.sin(t * 60) > 0 ? 1 : 0.4); // vertebrae nubs
          const scap = t > 0.7 && t < 0.9 ? back * Math.abs(cs) * 0.12 : 0;
          const x = cs * rx * ribK;
          const z = zc + sn * rz * belly * ribK * (1 + spine + scap);
          pos.push(x, y, z);
          si.push(sb[k], sb[Math.min(3, k + 1)], 0, 0);
          sw.push(1 - f * 0.6, f * 0.6, 0, 0);
        }
      }
      for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
        const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, dd = (i + 1) * rad + ((j + 1) % rad);
        idx.push(a, c, b, b, c, dd);
      }
      parts.skin.push(this.skinned(pos, idx, si, sw));
    }
    // pelvis: close the bottom of the torso and bridge into the hips
    {
      const pel = new THREE.SphereGeometry(0.155, 24, 16);
      pel.scale(1, 0.62, 0.68);
      pel.translate(0, 1.17, -0.005);
      parts.skin.push(this.rigid(pel, 'hips'));
      for (const n of ['L', 'R']) {
        const hj = new THREE.SphereGeometry(0.078, 16, 12);
        hj.scale(1, 1.25, 1);
        const c = R['thigh' + n];
        hj.translate(c.x * 0.92, c.y - 0.01, c.z);
        parts.skin.push(this.rigid(hj, 'thigh' + n, 'hips', () => 0.35));
      }
    }
    // clavicles + shoulder knobs
    for (const n of ['L', 'R']) {
      parts.skin.push(this.tube('clav' + n, 'upper' + n, R['clav' + n].clone().setY(2.0), R['upper' + n].clone().add(V(0, 0.02, 0)), () => 0.03, { segs: 6, radial: 10 }));
      const sph = new THREE.SphereGeometry(0.044, 14, 10);
      sph.scale(1.15, 0.95, 1.0);
      sph.translate(R['upper' + n].x, R['upper' + n].y, R['upper' + n].z);
      parts.skin.push(this.rigid(sph, 'upper' + n));
    }
    // neck with vertebra ridges
    parts.skin.push(this.tube('neck0', 'neck1', R.neck0.clone().setY(2.0), R.neck1, knob(0.036, 0.032, 0.25), { segs: 8, radial: 14, shape: (t, a) => 1 + Math.max(0, -Math.sin(a)) * 0.25 * (Math.sin(t * 25) > 0.3 ? 1 : 0) }));
    parts.skin.push(this.tube('neck1', 'head', R.neck1, R.head, knob(0.032, 0.04, 0.2), { segs: 6, radial: 14 }));
    // arms
    for (const n of ['L', 'R']) {
      parts.skin.push(this.tube('upper' + n, 'fore' + n, R['upper' + n], R['fore' + n], knob(0.045, 0.034, 0.5), { segs: 12 }));
      parts.skin.push(this.tube('fore' + n, 'hand' + n, R['fore' + n], R['hand' + n], knob(0.036, 0.026, 0.6), { segs: 12, shape: (t, a) => 1 + (t > 0.2 && t < 0.6 ? Math.max(0, Math.cos(a)) * 0.15 : 0) }));
      parts.skin.push(this.tube('hand' + n, 'handTip' + n, R['hand' + n], R['handTip' + n], knob(0.03, 0.036, 0.1), { segs: 5, ex: 1.4, ez: 0.6 }));
      for (let f = 0; f < 4; f++) {
        const a = `f${f}a${n}`, b = `f${f}b${n}`, c = `f${f}c${n}`;
        parts.skin.push(this.tube(a, b, R[a], R[b], knob(0.012, 0.01, 0.8), { segs: 6, radial: 8 }));
        parts.skin.push(this.tube(b, c, R[b], R[c], (t) => lerp(0.01, 0.004, t) * (1 + Math.pow(Math.abs(t - 0.1) * 2, 6) * 0.3), { segs: 6, radial: 8, tipPoint: 0.06 }));
        // nail
        const nail = new THREE.ConeGeometry(0.006, 0.03, 6);
        nail.rotateX(Math.PI);
        nail.translate(R[c].x, R[c].y - 0.01, R[c].z);
        parts.dark.push(this.rigid(nail, b));
      }
      // legs
      parts.skin.push(this.tube('thigh' + n, 'shin' + n, R['thigh' + n], R['shin' + n], knob(0.075, 0.045, 0.45), { segs: 12 }));
      parts.skin.push(this.tube('shin' + n, 'foot' + n, R['shin' + n], R['foot' + n], knob(0.05, 0.03, 0.5), { segs: 12, shape: (t, a) => 1 + (t < 0.4 ? Math.max(0, -Math.sin(a)) * 0.25 * (1 - t / 0.4) : 0) }));
      parts.skin.push(this.tube('foot' + n, 'toe' + n, R['foot' + n].clone().add(V(0, -0.02, -0.04)), R['toe' + n], knob(0.035, 0.022, 0.2), { segs: 8, ex: 1.3, ez: 0.55 }));
      // kneecap
      const kc = new THREE.SphereGeometry(0.045, 12, 8);
      kc.scale(1, 1.2, 0.8);
      kc.translate(R['shin' + n].x, R['shin' + n].y + 0.02, R['shin' + n].z + 0.035);
      parts.skin.push(this.rigid(kc, 'shin' + n));
      // bony joints to hide the seams: elbow, wrist, ankle
      for (const [bn, r, sc] of [['fore', 0.042, [1, 1.1, 1]], ['hand', 0.03, [1.2, 1, 0.8]], ['foot', 0.036, [1, 1, 1.1]]]) {
        const j = new THREE.SphereGeometry(r, 14, 10);
        j.scale(...sc);
        const c = R[bn + n];
        j.translate(c.x, c.y, c.z);
        parts.skin.push(this.rigid(j, bn + n));
      }
      // knuckles
      for (let f = 0; f < 4; f++) {
        const kn = new THREE.SphereGeometry(0.013, 8, 6);
        const c = R[`f${f}a${n}`];
        kn.translate(c.x, c.y, c.z);
        parts.skin.push(this.rigid(kn, `f${f}a${n}`));
      }
    }
    this.buildHead(parts);

    this.root.updateMatrixWorld(true);
    this.skeleton.calculateInverses();
    const mk = (list, m) => {
      if (!list.length) return null;
      const geo = mergeGeometries(list.map((g) => {
        if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
        if (!g.attributes.normal) g.computeVertexNormals();
        return g;
      }), false);
      const mesh = new THREE.SkinnedMesh(geo, m);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    };
    this.meshes = [mk(parts.skin, this.mat), mk(parts.dark, this.darkMat), mk(parts.gum, this.gumMat), mk(parts.tooth, this.toothMat), mk(parts.eye, this.eyeMat), mk(parts.pupil, this.pupilMat)].filter(Boolean);
    // blob contact shadow
    const blobTex = makeBlob();
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7, color: 0x000000 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.01;
    this.root.add(this.blob);
  }

  buildHead(parts) {
    const R = this.rest;
    const hc = R.head.clone().add(V(0, 0.16, 0.03)); // skull centre
    const HR = 0.2;
    // the face: a crescent grin (ear to ear) and two sagging black eyes
    const MA = 1.32; // mouth half-angle (radians around the head)
    const upperY = (a) => -0.035 + 0.075 * Math.pow(Math.abs(a) / MA, 1.7);
    const lowerY = (a) => -0.035 - 0.105 * Math.cos((a / MA) * Math.PI * 0.5) + 0.075 * Math.pow(Math.abs(a) / MA, 1.7);
    const eyes = [1, -1].map((s) => ({ a: s * 0.42, y: 0.075, rw: 0.21, rh: 0.07 }));
    const skull = new THREE.SphereGeometry(HR, 64, 48);
    const p = skull.attributes.position;
    const inMouth = (a, y) => Math.abs(a) < MA && y < upperY(a) && y > lowerY(a);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // proportions: tall cranium, narrow pointed chin, hollow cheeks
      y *= 1.12;
      if (y < -0.06) { const k = (-0.06 - y) / 0.17; x *= 1 - k * 0.3; z *= 1 - k * 0.12; }
      if (z < 0) z *= 0.9;
      const a = Math.atan2(x, z);
      const front = z > 0;
      let push = 0;
      if (front && inMouth(a, y)) {
        const edge = Math.min(upperY(a) - y, y - lowerY(a));
        push = 0.03 + Math.min(1, edge / 0.02) * 0.07; // deep cavity
      }
      for (const e of eyes) {
        const da = (a - e.a) / e.rw, dy = (y - e.y + Math.abs(a - e.a) * 0.06) / e.rh; // sag outward
        const r = da * da + dy * dy;
        if (front && r < 1) push = Math.max(push, 0.028 * (1 - r) + 0.006);
      }
      // lips: a raised rim around the grin
      if (front && Math.abs(a) < MA + 0.05) {
        const du = Math.abs(y - upperY(a)), dl = Math.abs(y - lowerY(a));
        const rim = Math.max(0, 1 - Math.min(du, dl) / 0.012) * (inMouth(a, y) ? 0 : 1);
        push -= rim * 0.006;
      }
      // cheek hollows under the eyes
      if (front && y < 0.02 && y > -0.02 && Math.abs(a) > 0.6 && Math.abs(a) < 1.1) push += 0.008;
      const len = Math.hypot(x, y, z);
      const k = (len - push) / len;
      p.setXYZ(i, x * k + hc.x, y * k + hc.y, z * k + hc.z);
    }
    parts.skin.push(this.rigid(skull, 'head', 'jaw', (v) => {
      const lx = v.x - hc.x, ly = v.y - hc.y, lz = v.z - hc.z;
      const a = Math.atan2(lx, lz);
      return lz > -0.05 && ly < lowerY(clamp(a, -MA, MA)) + 0.005 ? 1 : ly < -0.12 ? 1 : 0;
    }));
    // inner mouth: dark curved sheet behind the teeth
    {
      const pos = [], idx = [], si = [], sw = [];
      const ih = this.boneList.indexOf(this.bones.head), ij = this.boneList.indexOf(this.bones.jaw);
      const NA = 40, NY = 6;
      for (let i = 0; i <= NA; i++) {
        const a = lerp(-MA, MA, i / NA);
        for (let j = 0; j <= NY; j++) {
          const y = lerp(upperY(a) + 0.01, lowerY(a) - 0.01, j / NY);
          const r = HR * 0.8;
          pos.push(Math.sin(a) * r + hc.x, y + hc.y, Math.cos(a) * r * 0.92 + hc.z);
          const w = j / NY;
          si.push(ih, ij, 0, 0); sw.push(1 - w, w, 0, 0);
        }
      }
      for (let i = 0; i < NA; i++) for (let j = 0; j < NY; j++) {
        const a = i * (NY + 1) + j, b = a + 1, c = a + NY + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      parts.dark.push(this.skinned(pos, idx, si, sw));
    }
    // gums + two rows of crowded, uneven teeth
    const row = (fy, inset) => {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = lerp(-MA * 0.97, MA * 0.97, i / 48);
        const r = HR * 1.12 * (1 - inset);
        const y = fy(a);
        const shrink = Math.cos(Math.min(1.2, Math.abs(a)) * 0.4);
        pts.push(V(Math.sin(a) * r * 0.9 * shrink / Math.cos(0) , y, Math.cos(a) * r * 0.88));
      }
      return pts;
    };
    const up = row((a) => upperY(a) * 1.12 - 0.004, 0.1), lo = row((a) => lowerY(a) * 1.12 + 0.004, 0.1);
    const teeth = (pts, top) => {
      for (let i = 1; i < pts.length - 1; i++) {
        const t = i / (pts.length - 1);
        const c = pts[i];
        const mid = Math.sin(t * Math.PI);
        const len = (0.02 + mid * 0.028) * (0.8 + this.rng() * 0.45) * (i % 4 === 0 ? 1.25 : 1);
        const w = 0.0085 + mid * 0.003;
        const tooth = new THREE.ConeGeometry(w, len, 6, 1);
        tooth.scale(1, 1, 0.6);
        tooth.translate(0, len / 2, 0);
        if (top) tooth.rotateX(Math.PI);
        tooth.rotateZ((this.rng() - 0.5) * 0.25);
        tooth.rotateX((this.rng() - 0.5) * 0.2 + (top ? 0.15 : -0.15));
        tooth.rotateY(Math.atan2(c.x, c.z));
        tooth.translate(c.x + hc.x, c.y + hc.y, c.z + hc.z);
        parts.tooth.push(this.rigid(tooth.toNonIndexed(), top ? 'head' : 'jaw'));
      }
      const curve = new THREE.CatmullRomCurve3(pts.map((v) => v.clone().add(hc).add(V(0, top ? 0.006 : -0.006, 0))));
      parts.gum.push(this.rigid(new THREE.TubeGeometry(curve, 48, 0.008, 6, false).toNonIndexed(), top ? 'head' : 'jaw'));
    };
    teeth(up, true);
    teeth(lo, false);
    // eyes: glossy black orbs deep in the sockets, pin-prick glints
    for (const e of eyes) {
      const r = HR * 0.93;
      const ex = Math.sin(e.a) * r, ez = Math.cos(e.a) * r;
      const orb = new THREE.SphereGeometry(1, 20, 14);
      orb.scale(0.052, 0.026, 0.03);
      orb.rotateY(e.a);
      orb.rotateZ(-Math.sign(e.a) * 0.18);
      orb.translate(ex + hc.x, e.y * 1.12 - 0.004 + hc.y, ez + hc.z - 0.004);
      parts.eye.push(this.rigid(orb, 'head'));
      const pupil = new THREE.SphereGeometry(0.0045, 8, 6);
      pupil.translate(Math.sin(e.a * 0.9) * (r + 0.02) + hc.x, e.y * 1.12 - 0.006 + hc.y, Math.cos(e.a * 0.9) * (r + 0.02) + hc.z);
      parts.pupil.push(this.rigid(pupil.toNonIndexed(), 'head'));
    }
    this.skullCentre = hc;
  }

  // ------------------------------------------------------------------ animation
  resetFeet() {
    const m = new THREE.Matrix4().makeRotationY(this.root.rotation.y);
    for (const f of this.feet) {
      f.plant.set(0.13 * f.side, 0, 0.02).applyMatrix4(m).add(this.root.position);
      f.plant.y = this.root.position.y;
      f.swing = false;
    }
  }

  aimBone(bone, dirWorld, restDir, blend = 1) {
    // rotate `bone` so its rest child direction points along dirWorld
    const parentQ = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentQ);
    const local = dirWorld.clone().applyQuaternion(parentQ.invert()).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(restDir, local);
    if (blend >= 1) bone.quaternion.copy(q); else bone.quaternion.slerp(q, blend);
    bone.updateMatrixWorld(true);
  }

  // two-bone IK: point a (upper) and b (lower) bones so the chain end reaches target
  ik(upperName, lowerName, target, pole, la, lb) {
    const up = this.bones[upperName], lo = this.bones[lowerName];
    const A = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
    const T = target.clone();
    let d = A.distanceTo(T);
    d = clamp(d, Math.abs(la - lb) + 0.01, la + lb - 0.005);
    const dir = T.clone().sub(A).normalize();
    // knee/elbow position in the plane containing the pole
    const a = (la * la - lb * lb + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, la * la - a * a));
    const poleDir = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const K = A.clone().addScaledVector(dir, a).addScaledVector(poleDir, h);
    this.aimBone(up, K.clone().sub(A).normalize(), this.restDir[upperName]);
    this.aimBone(lo, A.clone().addScaledVector(dir, d).sub(K).normalize(), this.restDir[lowerName]);
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    const b = this.bones;
    const t = this.t;
    const yaw = this.root.rotation.y;
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    const right = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const sp = this.speed;
    const run = clamp((sp - 1.8) / 1.6, 0, 1);
    const mode = this.mode;
    // ---- twitches
    const tw = this.twitch;
    tw.t += dt;
    if (tw.t > tw.next) {
      tw.t = 0;
      tw.next = 0.5 + this.rng() * 2.5;
      tw.roll = (this.rng() - 0.5) * 1.1;
      tw.yaw = (this.rng() - 0.5) * 0.8;
      tw.pitch = (this.rng() - 0.5) * 0.4;
    }
    const twk = Math.exp(-tw.t * 7);
    // ---- gait phase
    const L = 0.55 + sp * 0.28;
    this.phase += (sp * dt) / (2 * L);
    const unf = this.unfold;
    const breath = Math.sin(t * 2.1) * 0.5 + 0.5;
    // ---- hips & spine
    const hipDrop = mode === 'crouch' ? 0.7 : this.crouch;
    const bob = Math.abs(Math.sin(this.phase * Math.PI * 2)) * (0.03 + run * 0.05) * clamp(sp, 0, 1);
    const hipY = lerp(0.35, 1.3, unf) - hipDrop * 0.55 - bob - run * 0.12;
    b.hips.position.set(0, hipY, 0);
    b.hips.rotation.set(run * 0.2, Math.sin(this.phase * Math.PI * 2) * 0.12 * clamp(sp, 0, 1), Math.sin(this.phase * Math.PI * 2) * 0.05);
    const hunch = lerp(1.2, 0.42, unf) + run * 0.45 + (mode === 'reach' ? 0.15 : 0) + hipDrop * 0.3 + (mode === 'lunge' ? 0.4 : 0);
    const sway = Math.sin(this.phase * Math.PI * 2) * 0.06;
    b.spine0.rotation.set(hunch * 0.3, 0, sway);
    b.spine1.rotation.set(hunch * 0.35 + breath * 0.02, 0, -sway * 0.5);
    b.spine2.rotation.set(hunch * 0.35, this.lean * 0.4, this.lean * 0.5);
    b.spine2.scale.set(1 + breath * 0.02, 1, 1 + breath * 0.03);
    // ---- head tracking
    this.root.updateMatrixWorld(true);
    let hy = tw.yaw * twk, hp = tw.pitch * twk, hr = tw.roll * twk + Math.sin(t * 0.7) * 0.08;
    if (this.lookAt) {
      const hp0 = new THREE.Vector3().setFromMatrixPosition(b.neck1.matrixWorld);
      const d = this.lookAt.clone().sub(hp0);
      const localYaw = Math.atan2(d.x, d.z) - yaw;
      const ly = Math.atan2(Math.sin(localYaw), Math.cos(localYaw));
      hy += clamp(ly, -1.3, 1.3);
      hp += clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.8, 0.8) - hunch * 0.9;
    } else hp += -hunch * 0.7;
    b.neck0.rotation.set(hp * 0.4 - 0.2, hy * 0.4, hr * 0.3);
    b.neck1.rotation.set(hp * 0.3, hy * 0.3, hr * 0.3);
    b.head.rotation.set(hp * 0.3, hy * 0.3, hr * 0.4);
    // jaw
    this.jaw = damp(this.jaw, this.jawTarget, 10, dt);
    b.jaw.rotation.set(this.jaw * 0.55 + Math.max(0, Math.sin(t * 13)) * 0.04 * this.jaw, 0, 0);
    // ---- arms
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const ph = this.phase * Math.PI * 2 + (s > 0 ? Math.PI : 0);
      b['clav' + n].rotation.set(0, 0, s * (0.05 + run * 0.1));
      if ((mode === 'reach' || mode === 'lunge') && this.reachAt) {
        this.root.updateMatrixWorld(true);
        const sh = new THREE.Vector3().setFromMatrixPosition(b['upper' + n].matrixWorld);
        const target = this.reachAt.clone().add(right.clone().multiplyScalar(s * 0.18));
        const dd = target.clone().sub(sh);
        const len = Math.min(dd.length(), this.len.upper + this.len.fore - 0.02);
        const tgt = sh.clone().addScaledVector(dd.normalize(), len);
        this.ik('upper' + n, 'fore' + n, tgt, V(0, -1, 0).addScaledVector(right, s * 0.6), this.len.upper, this.len.fore);
        b['hand' + n].rotation.set(-0.3, 0, 0);
      } else {
        const swing = Math.sin(ph) * (0.35 + run * 0.5) * clamp(sp, 0, 1.2);
        b['upper' + n].rotation.set(-swing - run * 0.6 - hunch * 0.35, 0, s * (0.12 + run * 0.25 + Math.sin(t * 1.3 + s) * 0.03));
        b['fore' + n].rotation.set(-0.25 - run * 0.7 + Math.cos(ph) * 0.15, 0, 0);
        b['hand' + n].rotation.set(-0.15 + Math.sin(t * 2 + s) * 0.1, 0, 0);
      }
      for (let f = 0; f < 4; f++) {
        const curl = 0.35 + Math.sin(t * 3.1 + f * 0.9 + s) * 0.25 + (mode === 'reach' ? -0.2 : 0);
        b[`f${f}a${n}`].rotation.set(curl * 0.8, 0, 0);
        b[`f${f}b${n}`].rotation.set(curl, 0, 0);
      }
    }
    this.root.updateMatrixWorld(true);
    // ---- legs: planted feet + IK
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const f of this.feet) {
      const n = f.side > 0 ? 'L' : 'R';
      const hipW = new THREE.Vector3().setFromMatrixPosition(b['thigh' + n].matrixWorld);
      const home = this.root.position.clone().addScaledVector(right, 0.13 * f.side * (1 + hipDrop * 0.6));
      home.y = this.root.position.y;
      const localPhase = ((this.phase + f.off) % 1 + 1) % 1;
      const swinging = sp > 0.08 && localPhase > 0.62;
      if (swinging && !f.swing) {
        f.swing = true;
        f.from.copy(f.plant);
        f.to.copy(home).addScaledVector(this.moveDir, L * 0.55);
      }
      if (f.swing) {
        const k = clamp((localPhase - 0.62) / 0.38, 0, 1);
        if (!swinging || k >= 0.999) {
          f.swing = false;
          f.plant.copy(f.to);
          this.onStep?.(run > 0.3, f.plant);
        } else {
          f.to.copy(home).addScaledVector(this.moveDir, L * 0.55);
          f.cur = f.from.clone().lerp(f.to, k);
          f.cur.y += Math.sin(k * Math.PI) * (0.09 + run * 0.1);
        }
      }
      // idle: re-plant if the body drifted too far
      if (!f.swing && f.plant.distanceTo(home) > 0.55) {
        f.swing = true; f.from.copy(f.plant); f.to.copy(home);
        this.phase = f.off + 0.62;
      }
      const footPos = f.swing && f.cur ? f.cur : f.plant;
      const ankle = footPos.clone().add(V(0, 0.08, 0)).addScaledVector(fwd, -0.03);
      const pole = fwd.clone().multiplyScalar(1).add(V(0, 0.1, 0)).addScaledVector(right, f.side * 0.15);
      this.ik('thigh' + n, 'shin' + n, ankle, pole, this.len.thigh, this.len.shin);
      // foot stays flat, pointing forward
      const toeDir = fwd.clone().add(V(0, f.swing ? -0.3 : -0.35, 0)).normalize();
      this.aimBone(b['foot' + n], toeDir, this.restDir['foot' + n]);
    }
    // blob shadow
    this.blob.position.set(0, 0.012, 0);
    this.blob.material.opacity = 0.55 * unf + 0.2;
  }

  headWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return out.setFromMatrixPosition(this.bones.head.matrixWorld).add(V(0, 0.15, 0));
  }
  faceWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    this.bones.head.getWorldQuaternion(q);
    return out.setFromMatrixPosition(this.bones.head.matrixWorld).add(V(0, 0.12, 0.2).applyQuaternion(q));
  }
}

function makeBlob() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}
