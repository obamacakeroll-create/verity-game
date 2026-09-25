import * as THREE from 'three';
import { VerityFace } from '../../entities/VerityFace.js';
import { resolveCircle } from '../../core/physics.js';
import { damp, clamp } from '../../core/util.js';
import { patch } from '../render/MaterialLib.js';

export const BALL_RADIUS = 0.17;

// Verity (part two): a glossy FDM-printed ball with a printed face.
// Her glow is a pooled light fixture so showing/hiding her never changes
// the scene's light count.
export class VerityBall2 {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'verity';
    game.scene.add(this.root);
    this.body = new THREE.Group();
    this.root.add(this.body);
    const set = game.lib.set('pla');
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xffcf2a, map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 0.55, clearcoatRoughness: 0.35,
      emissive: 0x5a3a00, emissiveIntensity: 0.5, sheen: 0.25, sheenColor: new THREE.Color(0xfff0a0), sheenRoughness: 0.5,
    });
    patch(this.mat, { grime: 0 });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 72, 54), this.mat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
    this.body.add(this.sphere);

    this.face = new VerityFace(1024);
    const capGeo = new THREE.SphereGeometry(BALL_RADIUS * 1.003, 72, 54, 0, Math.PI, 0, Math.PI);
    const pos = capGeo.attributes.position, uv = capGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (BALL_RADIUS * 2) + 0.5, pos.getY(i) / (BALL_RADIUS * 2) + 0.5);
    this.faceMat = new THREE.MeshPhysicalMaterial({
      map: this.face.texture, transparent: true, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    this.faceMesh = new THREE.Mesh(capGeo, this.faceMat);
    this.body.add(this.faceMesh);

    this.fixture = game.lights.add({ type: 'verity', position: new THREE.Vector3(), color: 0xffc830, intensity: 0.6, range: 2.8, volScale: 0.5, persistent: true });
    this.fixture.power = 0;
    this.vel = new THREE.Vector3();
    this.mode = 'hidden';
    this.target = new THREE.Vector3();
    this.lookTarget = null;
    this.t = 0;
    this.spin = 0;
    this.bobAmount = 1;
    this.facingLerp = 6;
    this.visible = false;
    this.root.visible = false;
    this.side = 1;
    this.eyeGlow = 0;
    this.squash = 0;
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  get position() { return this.root.position; }

  show(v = true) {
    this.visible = v;
    this.root.visible = v;
    this.fixture.power = v ? 1 : 0;
  }

  setMode(mode) { this.mode = mode; }

  place(p) { this.root.position.copy(p); this.vel.set(0, 0, 0); }

  // Move smoothly to a point (cutscenes). Resolves on arrival.
  flyTo(p, speed = 1.5) {
    this.mode = 'path';
    this.target.copy(p);
    this.pathSpeed = speed;
    return new Promise((r) => { this._arrive = r; });
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.face.update(dt);
    this.fixture.position.copy(this.root.position);
    if (!this.visible) return;
    const cam = g.camera;
    const ins = g.state.insanity || 0;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const p = this.root.position;

    if (this.mode === 'follow') {
      const chatting = g.chatting;
      const dist = chatting ? 0.95 : clamp(1.05 - ins * 0.004, 0.62, 1.05);
      const side = chatting ? 0 : (0.55 - ins * 0.003) * this.side;
      this.target.set(
        cam.position.x + fwd.x * dist + right.x * side,
        cam.position.y - (chatting ? 0.07 : 0.18),
        cam.position.z + fwd.z * dist + right.z * side,
      );
      const k = chatting ? 7 : 3.2;
      this.vel.x = damp(this.vel.x, (this.target.x - p.x) * k, 6, dt);
      this.vel.y = damp(this.vel.y, (this.target.y - p.y) * k, 6, dt);
      this.vel.z = damp(this.vel.z, (this.target.z - p.z) * k, 6, dt);
      p.addScaledVector(this.vel, dt);
      if (g.level) {
        const before = p.clone();
        resolveCircle(p, BALL_RADIUS + 0.05, g.level.near(p.x, p.z, g.player.layer));
        // if a wall pushed her, try the other side of the player next time
        if (before.distanceToSquared(p) > 0.0004 && Math.random() < 0.02) this.side *= -1;
      }
      const fy = g.player.pos.y;
      p.y = clamp(p.y, fy + 0.4, fy + 2.4);
    } else if (this.mode === 'path') {
      const d = this.target.clone().sub(p);
      const len = d.length();
      if (len < 0.02) {
        p.copy(this.target);
        this.vel.set(0, 0, 0);
        this.mode = 'hold';
        const r = this._arrive; this._arrive = null; r?.();
      } else {
        const sp = Math.min(len * 3, this.pathSpeed || 1.5);
        this.vel.lerp(d.multiplyScalar(sp / len), 1 - Math.exp(-5 * dt));
        p.addScaledVector(this.vel, dt);
      }
    }

    // bob + turn to face the player (or a look target)
    const bob = Math.sin(this.t * 1.8) * 0.022 * this.bobAmount;
    this.body.position.y = bob;
    const talkK = this.face.talking ? 1 : 0;
    this.squash = damp(this.squash, talkK * (0.5 + 0.5 * Math.sin(this.t * 22)), 12, dt);
    this.body.scale.set(1 + this.squash * 0.015, 1 - this.squash * 0.02, 1 + this.squash * 0.015);
    const look = this.lookTarget || cam.position;
    this._m.lookAt(look, this.root.position, new THREE.Vector3(0, 1, 0));
    this._q.setFromRotationMatrix(this._m);
    if (this.spin > 0) {
      this.body.rotateY(this.spin * dt);
      this.spin = Math.max(0, this.spin - dt * 6);
      if (this.spin < 0.5) this.spin = 0;
    } else {
      this.body.quaternion.slerp(this._q, 1 - Math.exp(-this.facingLerp * dt));
    }
    // glitchy jitter at high insanity
    if (ins > 80 && Math.random() < 0.02) this.body.rotateZ((Math.random() - 0.5) * 0.3);
    const local = cam.position.clone();
    this.body.worldToLocal(local);
    this.face.lookX = clamp(local.x * 1.5, -1, 1);
    this.face.lookY = clamp(-local.y * 1.5, -1, 1);

    const hue = 0.12 - ins * 0.0011;
    this.fixture.color.setHSL(Math.max(0, hue), 1, 0.55);
    this.fixture.intensity = 0.45 + talkK * 0.3;
    this.mat.emissiveIntensity = 0.5 - ins * 0.0022 + talkK * 0.12;
    this.mat.emissive.setRGB(0.5 + ins * 0.001, 0.3 - ins * 0.0016, 0.0);
  }
}
