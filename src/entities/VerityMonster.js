import * as THREE from 'three';
import { makeSkin } from '../render/ProceduralTextures.js';
import { drawGrinMouth } from './VerityFace.js';
import { lerp, makeRng, noise1 } from '../core/util.js';

// Verity's true form: a tall, starved, yellow humanoid with a grin far too wide.
// Built from primitives on a joint hierarchy and animated procedurally.
export class VerityMonster {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'verity-monster';
    scene.add(this.root);
    const skin = makeSkin(512);
    this.mat = new THREE.MeshStandardMaterial({
      map: skin.map, normalMap: skin.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
      color: 0xd8c874, roughness: 0.55, metalness: 0,
    });
    this.rimStrength = { value: 0.35 };
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.rimStrength = this.rimStrength;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float rimStrength;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += vec3(0.55, 0.45, 0.12) * rim * rimStrength;`);
    };
    this.joints = {};
    this.build();
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.unfold = 1;
    this.mode = 'walk'; // walk | idle | lunge | reach
    this.twitch = { t: 0, roll: 0, yaw: 0, next: 1 };
    this.rng = makeRng(666);
    this.onStep = null;
    this.visible = false;
    this.root.visible = false;
    this.headLook = 0;
  }

  get position() { return this.root.position; }
  show(v = true) { this.visible = v; this.root.visible = v; }

  joint(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.joints[name] = g;
    return g;
  }

  limb(parent, len, r0, r1, { down = true } = {}) {
    const geo = new THREE.CylinderGeometry(r1, r0, len, 12, 4);
    geo.translate(0, down ? -len / 2 : len / 2, 0);
    // knobbly: bulge near the joints
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = Math.abs(p.getY(i)) / len;
      const bulge = 1 + Math.pow(Math.abs(y - 0.5) * 2, 6) * 0.35;
      p.setX(i, p.getX(i) * bulge);
      p.setZ(i, p.getZ(i) * bulge);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = true;
    parent.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.1, 12, 10), this.mat);
    cap.castShadow = true;
    parent.add(cap);
    return m;
  }

  build() {
    const J = this.joints;
    const hips = this.joint('hips', this.root, 0, 1.32, 0);
    // pelvis
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.mat);
    pelvis.scale.set(0.85, 0.55, 0.62);
    pelvis.castShadow = true;
    hips.add(pelvis);
    // torso (lathe) — a hollow, starved ribcage
    const spine = this.joint('spine', hips, 0, 0.02, 0);
    const prof = [[0.12, 0], [0.105, 0.08], [0.075, 0.2], [0.085, 0.3], [0.135, 0.42], [0.15, 0.52], [0.145, 0.6], [0.12, 0.68], [0.07, 0.74], [0.03, 0.77]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const tg = new THREE.LatheGeometry(prof, 24);
    tg.scale(1, 1, 0.62);
    const tp = tg.attributes.position;
    // sunken belly
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), z = tp.getZ(i);
      if (z > 0 && y > 0.12 && y < 0.36) tp.setZ(i, z * 0.75);
    }
    tg.computeVertexNormals();
    const torso = new THREE.Mesh(tg, this.mat);
    torso.castShadow = true;
    spine.add(torso);
    // ribs
    for (let i = 0; i < 6; i++) {
      const y = 0.37 + i * 0.045;
      const r = 0.148 + Math.sin((i / 5) * Math.PI) * 0.02;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 24, Math.PI * 0.85), this.mat);
      rib.rotation.x = Math.PI / 2 + 0.25;
      rib.rotation.z = Math.PI * 0.1 + Math.PI;
      rib.scale.set(1, 0.7, 1);
      rib.position.set(0, y, 0.01);
      spine.add(rib);
    }
    // collarbones
    for (const s of [-1, 1]) {
      const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.2, 8), this.mat);
      cb.rotation.z = Math.PI / 2 + s * 0.25;
      cb.position.set(s * 0.1, 0.7, 0.05);
      spine.add(cb);
    }
    // neck + head
    const neck = this.joint('neck', spine, 0, 0.74, 0.02);
    this.limb(neck, 0.26, 0.045, 0.035, { down: false });
    const head = this.joint('head', neck, 0, 0.27, 0.02);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24), this.mat);
    skull.scale.set(0.95, 1.38, 1.08);
    skull.position.y = 0.14;
    skull.castShadow = true;
    head.add(skull);
    this.buildFace(head);

    // arms
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      const sh = this.joint('shoulder' + side, spine, s * 0.19, 0.66, 0);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), this.mat);
      sh.add(knob);
      this.limb(sh, 0.64, 0.042, 0.032);
      const el = this.joint('elbow' + side, sh, 0, -0.64, 0);
      this.limb(el, 0.62, 0.034, 0.024);
      const wr = this.joint('wrist' + side, el, 0, -0.62, 0);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), this.mat);
      palm.position.y = -0.06;
      wr.add(palm);
      for (let f = 0; f < 4; f++) {
        const fj = this.joint(`finger${side}${f}`, wr, (f - 1.5) * 0.016, -0.12, 0);
        this.limb(fj, 0.13 + (f === 1 || f === 2 ? 0.03 : 0), 0.008, 0.005);
      }
      // legs
      const hp = this.joint('hip' + side, hips, s * 0.09, -0.02, 0);
      this.limb(hp, 0.66, 0.055, 0.036);
      const kn = this.joint('knee' + side, hp, 0, -0.66, 0);
      this.limb(kn, 0.62, 0.04, 0.026);
      const an = this.joint('ankle' + side, kn, 0, -0.62, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.22), this.mat);
      foot.position.set(0, -0.02, 0.07);
      foot.castShadow = true;
      an.add(foot);
    }
    this.J = this.joints;
  }

  buildFace(head) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(0.5, 0.5);
    const r = makeRng(3);
    // sunken eyes
    for (const ex of [400, 624]) {
      const g = ctx.createRadialGradient(ex, 330, 5, ex, 330, 90);
      g.addColorStop(0, 'rgba(10,0,0,1)');
      g.addColorStop(0.35, 'rgba(40,12,8,0.9)');
      g.addColorStop(1, 'rgba(60,40,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ex, 330, 90, 70, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      ctx.beginPath();
      ctx.arc(ex + 4, 334, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawGrinMouth(ctx, 512, 600, 0.85, r, 1.25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.SphereGeometry(0.1205, 48, 32, 0, Math.PI, 0, Math.PI);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.241 + 0.5, pos.getY(i) / 0.241 + 0.5);
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    const face = new THREE.Mesh(geo, faceMat);
    face.scale.set(0.97, 1.4, 1.1);
    face.position.y = 0.14;
    head.add(face);
    this.faceMesh = face;
  }

  // Blend the procedural pose. `dt` seconds.
  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    const J = this.J;
    const sp = this.speed;
    const run = Math.min(1, Math.max(0, (sp - 1.6) / 2.2));
    const stride = lerp(1.3, 2.3, run);
    const prev = this.phase;
    this.phase += (sp / stride) * Math.PI * 2 * dt;
    // footstep callback on each half-cycle
    if (this.onStep && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && sp > 0.2) this.onStep(run);
    const ph = this.phase;
    const moving = Math.min(1, sp / 1.2);
    const amp = lerp(0.35, 0.75, run) * moving;
    const tw = this.twitch;
    tw.next -= dt;
    if (tw.next <= 0) {
      tw.next = 0.4 + this.rng() * (this.mode === 'idle' ? 1.2 : 2.5);
      tw.roll = (this.rng() - 0.5) * (this.rng() < 0.3 ? 1.6 : 0.5);
      tw.yaw = (this.rng() - 0.5) * 0.8;
    }
    tw.t += (tw.roll - tw.t) * Math.min(1, dt * 22);

    const pose = {};
    // legs
    for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
      const s = Math.sin(ph + off);
      pose['hip' + side] = { x: -s * amp * 0.9 };
      pose['knee' + side] = { x: Math.max(0, Math.sin(ph + off + 1.2)) * amp * 1.5 + 0.08 };
      pose['ankle' + side] = { x: -0.1 + Math.max(0, -s) * amp * 0.3 };
    }
    // arms dangle and swing loosely, long fingers twitch
    for (const [side, off, sgn] of [['L', Math.PI, -1], ['R', 0, 1]]) {
      const s = Math.sin(ph + off);
      pose['shoulder' + side] = { x: -s * amp * 0.55 - run * 0.35 + Math.sin(this.t * 0.7) * 0.03, z: sgn * (0.12 + run * 0.1) };
      pose['elbow' + side] = { x: -0.12 - run * 0.5 - Math.max(0, s) * 0.2 };
      pose['wrist' + side] = { x: -0.1 };
      for (let f = 0; f < 4; f++) pose[`finger${side}${f}`] = { x: -0.3 - noise1(this.t * 3 + f + off) * 0.6 };
    }
    const hunch = 0.3 + run * 0.35;
    pose.spine = { x: hunch, z: Math.sin(ph) * 0.05 * moving };
    pose.neck = { x: -hunch * 0.6 + 0.25, z: 0 };
    pose.head = { x: -0.2 - run * 0.2 + this.headLook, z: tw.t, y: tw.yaw * 0.4 };
    pose.hips = { y: 0, bob: Math.abs(Math.sin(ph)) * 0.05 * moving };

    if (this.mode === 'idle') {
      pose.spine.x = 0.25 + Math.sin(this.t * 0.9) * 0.03;
      pose.head.z = tw.t * 1.2;
    } else if (this.mode === 'lunge' || this.mode === 'reach') {
      const k = this.mode === 'lunge' ? 1 : 0.6;
      pose.shoulderL = { x: -1.5 * k, z: -0.25 };
      pose.shoulderR = { x: -1.45 * k, z: 0.25 };
      pose.elbowL = { x: -0.2 }; pose.elbowR = { x: -0.25 };
      pose.spine.x = 0.5 * k;
      pose.head = { x: -0.45 * k, z: tw.t * 0.6, y: 0 };
    }
    // folding (transformation)
    const u = this.unfold;
    if (u < 1) {
      const f = 1 - u;
      const fold = {
        hipL: { x: -2.4 }, hipR: { x: -2.4 }, kneeL: { x: 2.7 }, kneeR: { x: 2.7 },
        shoulderL: { x: -0.5, z: -2.4 }, shoulderR: { x: -0.5, z: 2.4 }, elbowL: { x: -2.7 }, elbowR: { x: -2.7 },
        spine: { x: 1.4 }, neck: { x: 0.8 }, head: { x: 0.4 },
      };
      for (const k of Object.keys(fold)) {
        pose[k] = pose[k] || {};
        for (const ax of ['x', 'y', 'z']) if (fold[k][ax] !== undefined) pose[k][ax] = lerp(pose[k][ax] || 0, fold[k][ax], f);
      }
    }
    for (const [k, v] of Object.entries(pose)) {
      const j = J[k];
      if (!j) continue;
      if (v.x !== undefined) j.rotation.x = v.x;
      if (v.y !== undefined) j.rotation.y = v.y;
      if (v.z !== undefined) j.rotation.z = v.z;
    }
    J.hips.position.y = lerp(0.35, 1.32, u) - (pose.hips.bob || 0) - run * 0.08;
    const sc = lerp(0.3, 1, Math.min(1, u * 1.3));
    this.root.scale.setScalar(sc);
  }

  // World position of the head, used for jumpscare framing.
  headWorld(out = new THREE.Vector3()) {
    return this.J.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.14, 0));
  }
}
