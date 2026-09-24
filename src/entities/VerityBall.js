import * as THREE from 'three';
import { VerityFace } from './VerityFace.js';
import { makePrintLines } from '../render/ProceduralTextures.js';
import { resolveCircle } from '../core/physics.js';
import { damp, clamp } from '../core/util.js';

// Verity: a 3D-printed yellow ball with a painted face that floats beside you.
export const BALL_RADIUS = 0.17;

export class VerityBall {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'verity';
    scene.add(this.root);
    this.body = new THREE.Group(); // rotates to face the player
    this.root.add(this.body);

    const lines = makePrintLines(512, 140);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffc30a, roughness: 0.62, metalness: 0.0, normalMap: lines,
      normalScale: new THREE.Vector2(0.55, 0.55), emissive: 0x6a4800, emissiveIntensity: 0.55,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 64, 48), this.mat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
    this.body.add(this.sphere);

    // face decal: front cap with planar UVs
    this.face = new VerityFace(512);
    const capGeo = new THREE.SphereGeometry(BALL_RADIUS * 1.004, 64, 48, 0, Math.PI, 0, Math.PI);
    // phi in [0, PI] already yields the +Z facing half-shell
    const pos = capGeo.attributes.position, uv = capGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / (BALL_RADIUS * 2) + 0.5, pos.getY(i) / (BALL_RADIUS * 2) + 0.5);
    }
    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.face.texture, transparent: true, roughness: 0.35, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    this.faceMesh = new THREE.Mesh(capGeo, this.faceMat);
    this.body.add(this.faceMesh);

    // soft light she casts on her surroundings (sits at her centre so it never hits her own face)
    this.glow = new THREE.PointLight(0xffc830, 0.35, 2.6, 2);
    this.glow.position.set(0, 0, 0);
    this.body.add(this.glow);

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
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  get position() { return this.root.position; }

  show(v = true) { this.visible = v; this.root.visible = v; }

  setMode(mode) { this.mode = mode; }

  // ctx: { camera, colliders, insanity, chatting, stalk }
  update(dt, ctx) {
    this.t += dt;
    this.face.update(dt);
    if (!this.visible) return;
    const cam = ctx.camera;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const ins = ctx.insanity || 0;

    if (this.mode === 'follow' || this.mode === 'stalk') {
      const dist = ctx.chatting ? 0.95 : clamp(1.05 - ins * 0.004, 0.6, 1.05);
      const side = ctx.chatting ? 0 : this.mode === 'stalk' ? -0.2 : 0.55 - ins * 0.003;
      const behind = this.mode === 'stalk' ? -1 : 1;
      this.target.set(
        cam.position.x + fwd.x * dist * behind + right.x * side,
        cam.position.y - (ctx.chatting ? 0.08 : 0.18),
        cam.position.z + fwd.z * dist * behind + right.z * side,
      );
      // spring towards target
      const k = ctx.chatting ? 7 : 3.2;
      const p = this.root.position;
      this.vel.x = damp(this.vel.x, (this.target.x - p.x) * k, 6, dt);
      this.vel.y = damp(this.vel.y, (this.target.y - p.y) * k, 6, dt);
      this.vel.z = damp(this.vel.z, (this.target.z - p.z) * k, 6, dt);
      p.addScaledVector(this.vel, dt);
      if (ctx.colliders) resolveCircle(p, BALL_RADIUS + 0.04, ctx.colliders);
      p.y = clamp(p.y, 0.4, 2.4);
    }

    // bob + slow turn to face the player
    const bob = Math.sin(this.t * 1.8) * 0.025 * this.bobAmount;
    this.body.position.y = bob;
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
    // eyes glance toward the camera offset
    const local = cam.position.clone();
    this.body.worldToLocal(local);
    this.face.lookX = clamp(local.x * 1.5, -1, 1);
    this.face.lookY = clamp(-local.y * 1.5, -1, 1);

    // glow colour sours with insanity
    const hue = 0.12 - ins * 0.0011;
    this.glow.color.setHSL(Math.max(0, hue), 1, 0.55);
    this.glow.intensity = (0.3 + (this.face.talking ? 0.25 : 0)) * (ctx.glowScale ?? 1);
    // a faint inner light so she always reads in the dark; it sours as she turns
    this.mat.emissiveIntensity = 0.55 - ins * 0.0025 + (this.face.talking ? 0.1 : 0);
    this.mat.emissive.setRGB(0.5 + ins * 0.001, 0.3 - ins * 0.0016, 0.0);
  }
}
