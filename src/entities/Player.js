import * as THREE from 'three';
import { resolveCircle } from '../core/physics.js';
import { clamp, damp, dampAngle } from '../core/util.js';
import { makeFlashlightCookie } from '../render/ProceduralTextures.js';

const EYE = 1.62;
const CROUCH_EYE = 1.08;
const RADIUS = 0.28;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.renderer.camera;
    this.pos = new THREE.Vector3(0, 0, -1);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = EYE;
    this.crouching = false;
    this.stamina = 1;
    this.exhausted = false;
    this.staminaDelay = 0;
    this.bobT = 0;
    this.bobAmp = 0;
    this.stepDist = 0;
    this.canMove = true;
    this.canLook = true;
    this.hidden = null; // hiding spot while hidden
    this.breath = 1; // held breath meter
    this.holdingBreath = false;
    this.shake = 0;
    this.roll = 0;
    this.rollTarget = 0;
    this.speedMul = 1;
    this.lookClamp = null;

    // flashlight
    this.flashOn = false;
    this.battery = 1;
    this.hasFlashlight = false;
    const spot = new THREE.SpotLight(0xfff0dc, 0, 16, 0.48, 0.5, 2);
    spot.map = makeFlashlightCookie();
    spot.castShadow = true;
    spot.userData.shadowRole = 'flashlight';
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0015;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.1;
    spot.shadow.camera.far = 16;
    this.spot = spot;
    this.spotTarget = new THREE.Object3D();
    spot.target = this.spotTarget;
    game.renderer.scene.add(spot, this.spotTarget);
    // faint fill so the beam's spill lights nearby walls
    this.fill = new THREE.PointLight(0xfff0dc, 0, 3.5, 2);
    game.renderer.scene.add(this.fill);
    this.flashYaw = 0;
    this.flashPitch = 0;
    this.flashFlicker = 0;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  setPose(x, z, yaw, pitch = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.flashYaw = yaw;
    this.flashPitch = pitch;
  }

  toggleFlashlight(force) {
    if (!this.hasFlashlight) return;
    const next = force ?? !this.flashOn;
    if (next && this.battery <= 0.001) {
      this.game.audio.sfx.play('click');
      return;
    }
    this.flashOn = next;
    this.game.audio.sfx.play('click');
  }

  update(dt, input, colliders) {
    const s = this.game.settings;
    // ---- look
    const m = input.consumeMouse();
    if (this.canLook) {
      const sens = 0.0022 * s.get('sensitivity');
      this.yaw -= m.x * sens;
      this.pitch -= m.y * sens * (s.get('invertY') ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.lookClamp) {
        const c = this.lookClamp;
        let d = this.yaw - c.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw = c.yaw + clamp(d, -c.range, c.range);
        this.pitch = clamp(this.pitch, -c.pitch, c.pitch);
      }
    }

    // ---- move
    let ix = 0, iz = 0;
    if (this.canMove && !this.hidden) {
      if (input.isDown('forward') || input.down.has('ArrowUp')) iz += 1;
      if (input.isDown('back') || input.down.has('ArrowDown')) iz -= 1;
      if (input.isDown('left') || input.down.has('ArrowLeft')) ix -= 1;
      if (input.isDown('right') || input.down.has('ArrowRight')) ix += 1;
      if (input.wasPressed('crouch')) this.crouching = !this.crouching;
    }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;
    const moving = ix !== 0 || iz !== 0;
    const wantsSprint = moving && iz > 0 && input.isDown('sprint') && !this.exhausted && !this.crouching;
    let speed = this.crouching ? 1.0 : wantsSprint ? 3.9 : 1.85;
    speed *= this.speedMul;
    if (wantsSprint) {
      this.stamina = Math.max(0, this.stamina - dt * 0.17);
      this.staminaDelay = 1.2;
      if (this.stamina <= 0) { this.exhausted = true; this.game.audio.sfx.play('pant'); }
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.13);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const tx = (f.x * iz + r.x * ix) * speed;
    const tz = (f.z * iz + r.z * ix) * speed;
    this.vel.x = damp(this.vel.x, tx, moving ? 10 : 12, dt);
    this.vel.z = damp(this.vel.z, tz, moving ? 10 : 12, dt);
    if (!this.hidden) {
      const before = this.pos.clone();
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      resolveCircle(this.pos, RADIUS, colliders);
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.stepDist += moved;
      const strideLen = wantsSprint ? 0.95 : this.crouching ? 0.55 : 0.72;
      if (this.stepDist > strideLen) {
        this.stepDist = 0;
        this.game.onFootstep?.(wantsSprint ? 'run' : this.crouching ? 'sneak' : 'walk');
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.bobT += hs * dt * (wantsSprint ? 2.2 : 2.6);
      this.bobAmp = damp(this.bobAmp, Math.min(1, hs / 3), 8, dt);
      this.moveSpeed = hs;
      this.sprinting = wantsSprint && hs > 2.5;
    } else {
      this.bobAmp = damp(this.bobAmp, 0, 8, dt);
      this.moveSpeed = 0;
      this.sprinting = false;
    }

    // ---- breath (hold while hiding)
    this.holdingBreath = !!this.hidden && input.isDown('breath') && this.breath > 0;
    if (this.holdingBreath) this.breath = Math.max(0, this.breath - dt / 9);
    else this.breath = Math.min(1, this.breath + dt / 5);

    // ---- camera
    this.eye = damp(this.eye, this.crouching ? CROUCH_EYE : EYE, 10, dt);
    const bobOn = s.get('headBob');
    const bobY = bobOn ? Math.abs(Math.sin(this.bobT * Math.PI)) * 0.045 * this.bobAmp : 0;
    const bobX = bobOn ? Math.sin(this.bobT * Math.PI) * 0.025 * this.bobAmp : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * this.shake;
    const breathe = Math.sin(performance.now() * 0.0011) * 0.006;
    this.roll = damp(this.roll, this.rollTarget, 3, dt);
    const cam = this.camera;
    cam.position.set(
      this.pos.x + r.x * bobX + (Math.random() - 0.5) * sh * 0.06,
      this.pos.y + this.eye + bobY + breathe + (Math.random() - 0.5) * sh * 0.06,
      this.pos.z + r.z * bobX + (Math.random() - 0.5) * sh * 0.06,
    );
    this.euler.set(this.pitch + (Math.random() - 0.5) * sh * 0.02, this.yaw, this.roll + (bobOn ? bobX * 0.4 : 0));
    cam.quaternion.setFromEuler(this.euler);

    this.updateFlashlight(dt);
  }

  updateFlashlight(dt) {
    const cam = this.camera;
    this.flashYaw = dampAngle(this.flashYaw, this.yaw, 14, dt);
    this.flashPitch = damp(this.flashPitch, this.pitch, 14, dt);
    if (this.flashOn) this.battery = Math.max(0, this.battery - dt / (this.game.state.hard ? 200 : 360));
    if (this.flashOn && this.battery <= 0) { this.flashOn = false; this.game.ui?.toast('The flashlight died.'); }
    let k = this.flashOn ? 1 : 0;
    if (this.flashOn && (this.battery < 0.15 || this.flashFlicker > 0)) {
      const n = Math.random();
      if (n < (this.battery < 0.15 ? 0.12 : 0.3)) k *= 0.1;
    }
    this.flashFlicker = Math.max(0, this.flashFlicker - dt);
    const base = 7 * (0.55 + Math.min(1, this.battery * 3) * 0.45);
    this.spot.intensity = base * k;
    this.fill.intensity = 0.12 * k;
    const right = new THREE.Vector3(Math.cos(this.flashYaw), 0, -Math.sin(this.flashYaw));
    const eul = new THREE.Euler(this.flashPitch, this.flashYaw, 0, 'YXZ');
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(eul);
    this.spot.position.copy(cam.position).addScaledVector(right, 0.18).add(new THREE.Vector3(0, -0.2, 0));
    this.spotTarget.position.copy(this.spot.position).addScaledVector(dir, 5);
    this.fill.position.copy(cam.position).addScaledVector(dir, 0.6);
  }

  hide(spot) {
    this.hidden = spot;
    this.pos.copy(spot.inside);
    this.yaw = spot.yaw;
    this.pitch = -0.05;
    this.lookClamp = { yaw: spot.yaw, range: 0.7, pitch: 0.5 };
    this.crouching = false;
  }
  unhide() {
    const s = this.hidden;
    this.hidden = null;
    this.lookClamp = null;
    if (s) this.pos.copy(s.exit);
  }
}
