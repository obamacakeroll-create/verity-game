import * as THREE from 'three';
import { ease as E, clamp } from '../core/util.js';

// Runs async cutscene scripts on game time. Everything awaits through the
// director so that holding Space fast-forwards a scene to its end state.
export class CutsceneDirector {
  constructor(game) {
    this.game = game;
    this.running = false;
    this.skipping = false;
    this.skippable = true;
    this.waits = [];
    this.tweens = [];
    this.time = 0;
    this.skipHold = 0;
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
    this.controlsCamera = false;
    this.shake = 0;
    this._m = new THREE.Matrix4();
  }

  get camera() { return this.game.renderer.camera; }

  async play(script, { letterbox = true, skippable = true, hud = false } = {}) {
    if (this.running) this.skipAll();
    this.running = true;
    this.skipping = false;
    this.skippable = skippable;
    this.skipHold = 0;
    const g = this.game;
    g.mode = 'cutscene';
    g.ui.setPrompt(null);
    if (!hud) g.ui.fadeHUD(true);
    if (letterbox) g.ui.setLetterbox(true);
    this.grabCamera();
    try {
      await script(this);
    } catch (e) {
      console.error('cutscene error', e);
    }
    this.running = false;
    this.skipping = false;
    this.controlsCamera = false;
    g.ui.showSkip(false);
    g.ui.setLetterbox(false);
    g.ui.fadeHUD(false);
    if (g.mode === 'cutscene') g.mode = 'play';
  }

  grabCamera() {
    this.camPos.copy(this.camera.position);
    this.camQuat.copy(this.camera.quaternion);
    this.controlsCamera = true;
  }

  skipAll() {
    this.skipping = true;
    this.game.audio.voice?.stop();
    for (const w of this.waits) w.resolve();
    this.waits = [];
    for (const t of this.tweens) { t.fn(1); t.resolve(); }
    this.tweens = [];
  }

  update(dt) {
    this.time += dt;
    if (!this.running) return;
    const input = this.game.input;
    if (this.skippable && !this.skipping) {
      if (input.down.has('Space')) this.skipHold += dt;
      else this.skipHold = Math.max(0, this.skipHold - dt * 2);
      this.game.ui.showSkip(true, clamp(this.skipHold / 1.0));
      if (this.skipHold >= 1) this.skipAll();
    }
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      w.left -= dt;
      if (w.left <= 0) { this.waits.splice(i, 1); w.resolve(); }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      t.t += dt;
      const k = clamp(t.t / t.dur);
      t.fn(t.ease(k));
      if (k >= 1) { this.tweens.splice(i, 1); t.resolve(); }
    }
    if (this.controlsCamera) {
      this.shake = Math.max(0, this.shake - dt * 1.2);
      const s = this.shake * this.shake * 0.05;
      this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.camera.quaternion.copy(this.camQuat);
    }
  }

  wait(s) {
    if (this.skipping || s <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ left: s, resolve }));
  }

  tween(dur, fn, ease = E.inOutCubic) {
    if (this.skipping || dur <= 0) { fn(1); return Promise.resolve(); }
    return new Promise((resolve) => this.tweens.push({ t: 0, dur, fn, ease, resolve }));
  }

  lookQuat(from, to) {
    this._m.lookAt(from, to, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(this._m);
  }

  // Place the camera instantly.
  cut(pos, look) {
    this.camPos.copy(pos);
    this.camQuat.copy(this.lookQuat(pos, look));
    this.controlsCamera = true;
  }

  // Move camera to pos while turning to look at `look` (Vector3 or function returning one).
  camTo(pos, look, dur, ease = E.inOutCubic) {
    const p0 = this.camPos.clone();
    const q0 = this.camQuat.clone();
    const p1 = pos.clone();
    return this.tween(dur, (k) => {
      this.camPos.lerpVectors(p0, p1, k);
      const target = typeof look === 'function' ? look() : look;
      const q1 = this.lookQuat(this.camPos, target);
      this.camQuat.slerpQuaternions(q0, q1, k);
    }, ease);
  }

  // Smooth path through points (CatmullRom), looking at a target (or along the path).
  camPath(points, look, dur, ease = E.inOutSine) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal');
    const q0 = this.camQuat.clone();
    return this.tween(dur, (k) => {
      curve.getPoint(k, this.camPos);
      const target = typeof look === 'function' ? look(k) : look || curve.getPoint(Math.min(1, k + 0.05));
      const q1 = this.lookQuat(this.camPos, target);
      const blend = Math.min(1, k * 4);
      this.camQuat.slerpQuaternions(q0, q1, blend);
    }, ease);
  }

  // Keep the camera trained on a (moving) target for dur seconds.
  track(look, dur, lambda = 5) {
    return this.tween(dur, () => {
      const target = typeof look === 'function' ? look() : look;
      const q1 = this.lookQuat(this.camPos, target);
      this.camQuat.slerp(q1, 1 - Math.exp(-lambda / 60));
    }, E.linear);
  }

  // Spoken line with subtitles. who: 'verity' | 'marcus' | 'radio' | '' (thought)
  async say(who, text, opts = {}) {
    const g = this.game;
    if (this.skipping) return;
    await g.speak(who, text, opts);
    if (!this.skipping && opts.after !== 0) await this.wait(opts.after ?? 0.35);
  }

  // Silent caption (the player's thoughts / descriptions).
  async caption(text, dur = 3) {
    if (this.skipping) return;
    this.game.ui.subtitle(text, { cls: 'silent', duration: dur });
    await this.wait(dur);
  }

  fade(to, s = 1) {
    if (this.skipping) { this.game.ui.fade(to, 0.01); return Promise.resolve(); }
    this.game.ui.fade(to, s);
    return this.wait(s);
  }

  // Hand the camera back to the player at their current pose.
  release() { this.controlsCamera = false; }
}
