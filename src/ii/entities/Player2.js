import * as THREE from 'three';
import { resolveCircle } from '../../core/physics.js';
import { clamp, damp, dampAngle } from '../../core/util.js';
import { makeFlashlightCookie } from '../../render/ProceduralTextures.js';
import { Camcorder } from './Camcorder.js';

const EYE = 1.64;
const CROUCH_EYE = 1.05;
const RADIUS = 0.28;

export class Player2 {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.layer = 0;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.camcorder = new Camcorder(game, this);

    const spot = new THREE.SpotLight(0xfff3e4, 0, 22, 0.46, 0.55, 2);
    spot.map = makeFlashlightCookie();
    spot.castShadow = true;
    spot.userData.shadowRole = 'hero';
    spot.userData.volScale = 0.1;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.025;
    spot.shadow.radius = 3;
    spot.shadow.camera.near = 0.1;
    spot.shadow.camera.far = 22;
    this.spot = spot;
    this.spotTarget = new THREE.Object3D();
    spot.target = this.spotTarget;
    game.scene.add(spot, this.spotTarget);
    // soft bounce near the lens so walls right in front of you read
    this.fill = new THREE.PointLight(0xfff0dc, 0, 3.2, 2);
    game.scene.add(this.fill);
    this.reset();
  }

  reset() {
    this.vel.set(0, 0, 0);
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
    this.hidden = null;
    this.breath = 1;
    this.holdingBreath = false;
    this.shake = 0;
    this.roll = 0;
    this.rollTarget = 0;
    this.speedMul = 1;
    this.lookClamp = null;
    this.flashOn = false;
    this.battery = 1;
    this.hasFlashlight = false;
    this.flashFlicker = 0;
    this.flashYaw = this.yaw;
    this.flashPitch = this.pitch;
    this.moveSpeed = 0;
    this.sprinting = false;
    this.leanT = 0;
    this.camcorder.reset();
  }

  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get lookDir() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  setPose(x, z, yaw, pitch = 0, y = null, layer = null) {
    this.pos.set(x, y ?? this.game.story?.heightAt?.(x, z, this.layer) ?? 0, z);
    if (layer != null) this.layer = layer;
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.flashYaw = yaw;
    this.flashPitch = pitch;
    this.game.pipeline.cut();
  }

  toggleFlashlight(force) {
    if (!this.hasFlashlight) return;
    const next = force ?? !this.flashOn;
    if (next && this.battery <= 0.001) { this.game.audio.sfx.play('click'); this.game.ui.toast('Your phone is dead.'); return; }
    this.flashOn = next;
    this.game.audio.sfx.play('click', { volume: 0.6 });
  }

  update(dt) {
    const g = this.game, s = g.settings, C = g.controls;
    // ---- look
    const m = g.input.consumeMouse();
    if (this.canLook) {
      const zoom = this.camcorder.zoomK;
      const sens = (0.0022 * s.get('sensitivity')) / zoom;
      this.yaw -= m.x * sens + C.look.x / zoom;
      this.pitch -= (m.y * sens + C.look.y / zoom) * (s.get('invertY') ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.lookClamp) {
        const c = this.lookClamp;
        let d = this.yaw - c.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw = c.yaw + clamp(d, -c.range, c.range);
        this.pitch = clamp(this.pitch, c.pitchMin ?? -c.pitch, c.pitch);
      }
    }
    // ---- move
    let ix = 0, iz = 0;
    if (this.canMove && !this.hidden) {
      ix = C.move.x; iz = C.move.z;
      if (C.wasPressed('crouch')) this.crouching = !this.crouching;
    }
    const moving = Math.abs(ix) + Math.abs(iz) > 0.05;
    const wantsSprint = moving && iz > 0.3 && C.isDown('sprint') && !this.exhausted && !this.crouching && !this.camcorder.up;
    let speed = this.crouching ? 1.05 : wantsSprint ? 4.1 : 1.9;
    if (this.camcorder.up) speed *= 0.8;
    speed *= this.speedMul * (g.state.hard ? 0.97 : 1);
    if (wantsSprint) {
      this.stamina = Math.max(0, this.stamina - dt * 0.15);
      this.staminaDelay = 1.2;
      if (this.stamina <= 0) { this.exhausted = true; g.audio.sfx.play('pant'); }
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.14);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const tx = (f.x * iz + r.x * ix) * speed;
    const tz = (f.z * iz + r.z * ix) * speed;
    this.vel.x = damp(this.vel.x, tx, moving ? 9 : 11, dt);
    this.vel.z = damp(this.vel.z, tz, moving ? 9 : 11, dt);
    if (!this.hidden) {
      const before = this.pos.clone();
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const cols = g.level ? g.level.near(this.pos.x, this.pos.z, this.layer) : [];
      resolveCircle(this.pos, RADIUS, cols);
      const ty = g.story?.heightAt?.(this.pos.x, this.pos.z, this.layer) ?? this.pos.y;
      this.pos.y = damp(this.pos.y, ty, 14, dt);
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.stepDist += moved;
      const stride = wantsSprint ? 0.95 : this.crouching ? 0.55 : 0.74;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        g.onFootstep(wantsSprint ? 'run' : this.crouching ? 'sneak' : 'walk');
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.bobT += hs * dt * (wantsSprint ? 2.2 : 2.6);
      this.bobAmp = damp(this.bobAmp, Math.min(1, hs / 3), 8, dt);
      this.moveSpeed = hs;
      this.sprinting = wantsSprint && hs > 2.6;
    } else {
      this.bobAmp = damp(this.bobAmp, 0, 8, dt);
      this.moveSpeed = 0;
      this.sprinting = false;
    }
    // ---- breath (hold while hiding)
    this.holdingBreath = !!this.hidden && C.isDown('breath') && this.breath > 0;
    if (this.holdingBreath) this.breath = Math.max(0, this.breath - dt / 8.5);
    else this.breath = Math.min(1, this.breath + dt / 5);
    // ---- camera
    this.eye = damp(this.eye, this.crouching || this.hidden?.crouch ? CROUCH_EYE : EYE, 10, dt);
    const bobOn = s.get('headBob');
    const bobY = bobOn ? Math.abs(Math.sin(this.bobT * Math.PI)) * 0.042 * this.bobAmp : 0;
    const bobX = bobOn ? Math.sin(this.bobT * Math.PI) * 0.024 * this.bobAmp : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = s.get('cameraShake') ? this.shake * this.shake : 0;
    const breathe = Math.sin(g.time * 1.1) * 0.006 * (this.holdingBreath ? 0.1 : 1);
    this.roll = damp(this.roll, this.rollTarget, 3, dt);
    const cam = this.camera;
    cam.position.set(
      this.pos.x + r.x * bobX + (Math.random() - 0.5) * sh * 0.06,
      this.pos.y + this.eye + bobY + breathe + (Math.random() - 0.5) * sh * 0.06,
      this.pos.z + r.z * bobX + (Math.random() - 0.5) * sh * 0.06,
    );
    this.euler.set(this.pitch + (Math.random() - 0.5) * sh * 0.02, this.yaw, this.roll + (bobOn ? bobX * 0.4 : 0));
    cam.quaternion.setFromEuler(this.euler);
    this.camcorder.update(dt);
    this.updateFlashlight(dt);
  }

  updateFlashlight(dt, cutscene = false) {
    const cam = this.camera;
    const g = this.game;
    if (cutscene && g.director.controlsCamera) {
      // flashlight follows the cutscene camera directly
      const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
      this.flashYaw = dampAngle(this.flashYaw, e.y, 10, dt);
      this.flashPitch = damp(this.flashPitch, e.x, 10, dt);
    } else {
      this.flashYaw = dampAngle(this.flashYaw, this.yaw, 15, dt);
      this.flashPitch = damp(this.flashPitch, this.pitch, 15, dt);
    }
    if (this.flashOn && !cutscene) this.battery = Math.max(0, this.battery - dt / (g.state.hard ? 260 : 480));
    if (this.flashOn && this.battery <= 0) { this.flashOn = false; g.ui?.toast('Your phone died.'); }
    let k = this.flashOn ? 1 : 0;
    if (this.flashOn && (this.battery < 0.12 || this.flashFlicker > 0)) {
      if (Math.random() < (this.battery < 0.12 ? 0.1 : 0.3)) k *= 0.08;
    }
    this.flashFlicker = Math.max(0, this.flashFlicker - dt);
    const base = 16 * (0.6 + Math.min(1, this.battery * 3) * 0.4);
    this.spot.intensity = base * k;
    this.fill.intensity = 0.1 * k;
    const right = new THREE.Vector3(Math.cos(this.flashYaw), 0, -Math.sin(this.flashYaw));
    const eul = new THREE.Euler(this.flashPitch, this.flashYaw, 0, 'YXZ');
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(eul);
    this.spot.position.copy(cam.position).addScaledVector(right, 0.16).add(new THREE.Vector3(0, -0.22, 0));
    this.spotTarget.position.copy(this.spot.position).addScaledVector(dir, 6);
    this.spotTarget.updateMatrixWorld();
    this.fill.position.copy(cam.position).addScaledVector(dir, 0.6);
  }

  hide(spot) {
    this.hidden = spot;
    this.pos.copy(spot.inside);
    this.yaw = spot.yaw;
    this.pitch = spot.pitch ?? -0.05;
    this.lookClamp = { yaw: spot.yaw, range: spot.range ?? 0.65, pitch: 0.45 };
    this.crouching = !!spot.crouch;
    this.camcorder.lower();
    this.game.pipeline.cut();
  }
  unhide() {
    const s = this.hidden;
    this.hidden = null;
    this.lookClamp = null;
    this.crouching = false;
    if (s) { this.pos.copy(s.exit); if (s.exitYaw != null) this.yaw = s.exitYaw; }
    this.game.pipeline.cut();
  }
}
