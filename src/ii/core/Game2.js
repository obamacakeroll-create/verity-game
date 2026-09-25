import * as THREE from 'three';
import { Settings2 } from './Settings2.js';
import { Save2 } from './Save2.js';
import { Controls } from './Controls.js';
import { Input, keyLabel } from '../../core/Input.js';
import { lineOfSight } from '../../core/physics.js';
import { clamp, damp, rand } from '../../core/util.js';
import { Renderer2 } from '../render/Renderer2.js';
import { TextureBaker } from '../render/TextureBaker.js';
import { MaterialLib, SHARED } from '../render/MaterialLib.js';
import { grade } from '../render/Grades.js';
import { Lights2 } from '../world/Lights2.js';
import { AudioEngine2 } from '../audio/AudioEngine2.js';
import { UI2 } from '../ui/UI2.js';
import { MenusII } from '../ui/MenusII.js';
import { Player2 } from '../entities/Player2.js';
import { VerityBall2 } from '../entities/VerityBall2.js';
import { Monster } from '../entities/Monster.js';
import { Seconds } from '../entities/Seconds.js';
import { Throwables } from '../entities/Throwables.js';
import { EXPRESSIONS } from '../../entities/VerityFace.js';
import { BrainII, stageFor } from '../ai/BrainII.js';
import { MonsterAI2 } from '../ai/MonsterAI2.js';
import { CutsceneDirector } from '../../story/CutsceneDirector.js';
import { StoryII } from '../story/StoryII.js';
import { ScareEventsII } from '../story/ScareEventsII.js';
import { Particles } from '../world/Particles.js';
import { buildApartment } from '../world/levels/Apartment.js';
import { buildFactory } from '../world/levels/Factory.js';

const LEVELS = { apartment: buildApartment, factory: buildFactory };

export class Game2 {
  constructor() {
    this.settings = new Settings2();
    this.save = new Save2();
    this.renderer = new Renderer2(document.getElementById('canvas-host'), this.settings);
    this.input = new Input(this.renderer.canvas, this.settings);
    this.controls = new Controls(this.input, this.settings);
    this.audio = new AudioEngine2(this.settings);
    this.ui = new UI2(this);
    this.mode = 'boot';
    this.paused = false;
    this.time = 0;
    this.chatting = false;
    this.busy = false;
    this.debug = new URLSearchParams(location.search).has('debug');
    this.state = this.freshState();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.4;
    this.holdTime = 0;
    this.ambientTimer = 60;
    this.heartTimer = 0;
    this.lastStage = 0;
    this.level = null;
    this.zone = null;
    this.visibleZones = new Set();
    this.gradeMix = { from: 'night', to: 'night', k: 1 };
    this.fogCur = { density: 0.03, heightFalloff: 0.2, noise: 0.7, ambient: new THREE.Vector3(0.0005, 0.0006, 0.0007) };
    this.post = { warpBoost: 0, redBoost: 0, glitch: 0, damage: 0, flash: 0, blackout: 0, dof: 0, dofFocus: 2 };
    this.timeScale = 1;
    this.ambLoops = {};
  }

  get camera() { return this.renderer.camera; }
  get scene() { return this.renderer.scene; }
  get pipeline() { return this.renderer.pipeline; }

  // Heavy construction (texture baking etc.) with progress for the loader.
  async build(progress = () => {}) {
    const R = this.renderer;
    this.baker = new TextureBaker(R.renderer, { scale: R.quality.texScale });
    this.lib = new MaterialLib(this.baker);
    progress(0.05, 'painting surfaces');
    // warm up the texture sets used everywhere, one per frame so the loader animates
    const sets = ['paint', 'peel', 'wallpaper', 'cinder', 'brick', 'panel', 'vct', 'concrete', 'terrazzo', 'hardwood', 'carpet', 'ceramic', 'asphalt',
      'ceilingTile', 'metalPaint', 'brushed', 'rust', 'corrugated', 'cardboard', 'pla', 'skin', 'rubber', 'fabric', 'leather', 'wood', 'laminate', 'plastic', 'frost'];
    for (let i = 0; i < sets.length; i++) {
      this.lib.set(sets[i]);
      progress(0.05 + (i / sets.length) * 0.45, 'painting surfaces');
      await nextFrame();
    }
    this.lib.enableFrost();
    this.lights = new Lights2(this.scene, this.settings);
    this.lights.setShadowBudget(R.quality.localShadows);
    this.particles = new Particles(this);
    this.player = new Player2(this);
    this.verity = new VerityBall2(this);
    this.monster = new Monster(this);
    this.chase = new MonsterAI2(this, this.monster);
    this.seconds = new Seconds(this);
    this.throwables = new Throwables(this);
    this.director = new CutsceneDirector(this);
    this.events = new ScareEventsII(this);
    this.brain = this.makeBrain();
    this.story = new StoryII(this);
    this.menus = new MenusII(this);
    R.pipeline.hero = this.player.spot;
    R.applyShadows();
    progress(0.55, 'building');

    this.input.on('unlock', () => {
      if ((this.mode === 'play' || this.mode === 'cutscene') && !this.paused && !this.ui.overlayOpen && !this.chatting) this.pause();
    });
    this.input.on('keydown', (e) => this.onKey(e));
    this.renderer.canvas.addEventListener('click', () => {
      if ((this.mode === 'play' || this.mode === 'cutscene') && !this.paused && !this.ui.overlayOpen) this.input.lock();
    });
    window.addEventListener('wheel', (e) => { if (this.mode === 'play') this.player.camcorder.zoomBy(-Math.sign(e.deltaY)); }, { passive: true });
    window.addEventListener('mousedown', (e) => { if (e.button === 2 && this.mode === 'play') this.player.camcorder.toggle(); });
    window.addEventListener('contextmenu', (e) => { if (this.mode === 'play' || this.mode === 'cutscene') e.preventDefault(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'cutscene') && !this.paused) this.pause();
    });
    this.clock = new THREE.Timer();
    R.renderer.setAnimationLoop(() => this.frame());
  }

  makeBrain(opts = {}) {
    return new BrainII({ ngPlus: this.save.ngPlus || opts.ngPlus, memories: this.save.memories });
  }

  freshState(opts = {}) {
    return {
      chapter: 0, insanity: 0, tapes: [], docs: [], figures: [], items: [], flags: {}, objective: 'talk',
      hard: !!opts.hard, ngPlus: !!opts.ngPlus, transformations: 0, questions: 0, rude: 0, kind: 0,
      started: performance.now(), battery: 1, camBattery: 1, transformed: false, deaths: 0,
    };
  }

  // ------------------------------------------------------------------ levels
  async loadLevel(name, progress = () => {}) {
    if (this.level?.name === name) return this.level;
    this.ui.loading(true, 'loading');
    this.loadingLevel = true;
    if (this.level) {
      this.level.dispose();
      this.lights.clear();
      this.throwables.clear();
      this.seconds.clear();
      this.level = null;
    }
    const level = LEVELS[name](this);
    this.scene.add(level.root);
    await level.finalize({
      ao: this.renderer.quality.texScale >= 0.5 && !this.settings.get('fastLoad'),
      aoAsync: name === 'factory',
      probeSize: this.renderer.quality.texScale >= 1 ? 128 : 64,
      onProgress: (p, label) => { progress(p, label); this.ui.loading(true, label, p); },
    });
    this.level = level;
    level.onReady?.();
    this.loadingLevel = false;
    this.captureProbes();
    this.zone = null;
    this.ui.loading(false);
    return level;
  }

  // Re-render every zone's reflection probe with its fixtures lit.
  captureProbes(zones = null) {
    const hide = [this.verity.root, this.monster.root, this.player.spot, this.particles.root, this.seconds.root, this.throwables.root];
    const heroI = this.player.spot.intensity;
    this.player.spot.intensity = 0;
    for (const z of zones || this.level.zones.values()) {
      this.lights.bindAround(z.probeAt, z);
      // show only this zone and its neighbours during capture
      for (const o of this.level.zones.values()) o.group.visible = o === z || z.neighbors.has(o.id);
      z.probe.capture(this.scene, hide);
    }
    this.player.spot.intensity = heroI;
    this.updateZone(true);
  }

  updateZone(force = false) {
    const L = this.level;
    if (!L) return;
    const p = this.mode === 'play' || !this.director.controlsCamera ? this.player.pos.clone().setY(this.player.pos.y + 1) : this.camera.position;
    const z = L.zoneAt(p, this.player.layer) || L.zoneAt(p) || this.zone || [...L.zones.values()][0];
    if (z !== this.zone || force) {
      const prev = this.zone;
      this.zone = z;
      // two hops of neighbours (or everything on small levels) so rooms seen through doorways never pop out
      if (L.noCull) this.visibleZones = new Set(L.zones.values());
      else {
        this.visibleZones = new Set([z]);
        for (const id of z.neighbors) { const n = L.zones.get(id); if (n) this.visibleZones.add(n); }
        for (const n of [...this.visibleZones]) for (const id of n.neighbors) { const m = L.zones.get(id); if (m && m.id !== 'road') this.visibleZones.add(m); }
      }
      for (const o of L.zones.values()) o.group.visible = this.visibleZones.has(o);
      if (prev && prev.grade !== z.grade) this.setGrade(z.grade, 1.6);
      else if (!prev) this.setGrade(z.grade, 0);
      if (this.audio.ready) this.audio.setReverb(z.reverb);
      this.story?.onZone?.(z, prev);
    }
  }

  setGrade(name, seconds = 1.5) {
    const cur = this.gradeMix;
    const from = cur.k >= 1 ? cur.to : cur.k > 0.5 ? cur.to : cur.from;
    this.gradeMix = { from, to: name, k: seconds <= 0 ? 1 : 0, speed: seconds <= 0 ? 1 : 1 / seconds };
    this.pipeline.setLUTs(grade(from), grade(name), this.gradeMix.k);
  }

  // ------------------------------------------------------------------ loop
  frame() {
    this.clock.update();
    const raw = Math.min(0.05, this.clock.getDelta());
    const dt = raw * (this.timeScale || 1);
    this.controls.poll(raw);
    if (this.menus?.current && (this.paused || this.mode !== 'play')) this.menus.padNav(this.controls);
    else if (this.chatting && this.mode !== 'play') this.pollPad();
    if (this.mode === 'cutscene' && !this.paused && this.controls.padButton(9)) this.pause();
    if (!this.paused) this.update(dt);
    if (this.loadingLevel) { this.controls.endFrame(); return; } // the bake gets the whole frame
    this.renderer.updateDynamic(raw);
    this.renderer.render(this.paused ? 0 : dt);
    this.controls.endFrame();
  }

  update(dt) {
    this.time += dt;
    SHARED.uTime.value = this.time;
    const ins = this.state.insanity;
    this.director.update(dt);

    if (this.mode === 'play') {
      if (!this.ui.overlayOpen) this.player.update(dt);
      else this.input.consumeMouse();
      this.updateInteraction(dt);
      this.story.update(dt);
      this.events.update(dt);
      if (!this.ui.overlayOpen) this.chase.update(dt); // no deaths while a puzzle panel or note is open
      // they can't creep up while a panel, note or chat covers the screen
      this.seconds.update(dt, this.ui.overlayOpen || this.chatting);
      this.updateAmbientTalk(dt);
    } else if (this.mode === 'menu') {
      this.input.consumeMouse();
      this.story.menuUpdate(dt);
    } else {
      this.input.consumeMouse();
      if (this.mode === 'cutscene') { this.story.update(dt, true); this.seconds.update(dt, true); }
    }
    if (this.mode !== 'play') this.player.updateFlashlight(dt, true);

    this.verity.update(dt);
    this.monster.update(dt);
    this.throwables.update(dt);
    this.particles.update(dt);
    this.level?.update(dt, this.time);
    this.updateZone();
    const cam = this.camera;
    this.lights.update(dt, this.time, cam.position, this.zone, this.visibleZones);
    this.pipeline.volLights = this.lights.volLights;
    if (this.audio.ready) {
      this.audio.updateListener(cam);
      this.audio.music.setIntensity(this.mode === 'menu' ? 0.08 : ins / 100);
    }
    this.updateHeartbeat(dt);
    this.updatePost(dt);
    this.ui.update(dt);
  }

  updatePost(dt) {
    const P = this.pipeline.p, s = this.settings;
    const ins = this.mode === 'menu' ? 6 : this.state.insanity;
    const near = this.threatNear();
    this.monsterNear = near;
    // grade crossfade
    const gm = this.gradeMix;
    if (gm.k < 1) {
      gm.k = Math.min(1, gm.k + dt * gm.speed);
      P.lutMix = gm.k;
      if (gm.k >= 1) { this.pipeline.setLUTs(grade(gm.to), grade(gm.to), 0); }
    }
    // fog per zone (smoothed)
    const z = this.zone;
    if (z) {
      const f = this.fogCur;
      f.density = damp(f.density, z.fog.density * (this.story.fogMul ?? 1), 1.5, dt);
      f.heightFalloff = damp(f.heightFalloff, z.fog.heightFalloff, 1.5, dt);
      f.noise = damp(f.noise, z.fog.noise, 1.5, dt);
      f.ambient.lerp(new THREE.Vector3(...z.fog.ambient), 1 - Math.exp(-1.5 * dt));
      P.density = f.density;
      P.heightFalloff = f.heightFalloff;
      P.noiseAmt = f.noise;
      P.ambientScatter.copy(f.ambient);
      P.baseY = z.floorY;
      P.exposure = damp(P.exposure, z.exposure * (this.story.exposureMul ?? 1), 2, dt);
    }
    P.grain = s.get('grain') ? 0.045 + ins * 0.0006 + near * 0.05 : 0.01;
    P.chromatic = s.get('chromatic') ? 0.0009 + ins * 0.000018 + near * 0.004 : 0;
    P.insanity = clamp((ins - 20) / 80) * 0.7;
    P.warp = damp(P.warp, clamp((ins - 55) / 45) * 0.45 + near * 0.55 + this.post.warpBoost, 3, dt);
    const chase = this.chase.active;
    P.red = damp(P.red, (chase ? 0.2 + near * 0.35 : clamp((ins - 70) / 30) * 0.25) + this.post.redBoost, 2, dt);
    P.vignette = 1.1 + ins * 0.0035 + near * 0.3 + (this.player.hidden ? 0.45 : 0) + (this.player.camcorder.up ? 0.2 : 0);
    P.brightness = s.get('brightness');
    P.scanline = damp(P.scanline, this.post.glitch, 6, dt);
    this.post.glitch = Math.max(0, this.post.glitch - dt * 1.5);
    P.pulse = Math.max(0, P.pulse - dt * 3);
    P.damage = damp(P.damage, this.post.damage, 3, dt);
    this.post.damage = Math.max(0, this.post.damage - dt * 0.35);
    P.flash = Math.max(0, this.post.flash);
    this.post.flash = Math.max(0, this.post.flash - dt * 4);
    P.blackout = this.post.blackout;
    const cc = this.player.camcorder;
    P.vhs = damp(P.vhs, cc.up ? 1 : this.story.vhs ?? 0, 10, dt);
    P.nv = damp(P.nv, cc.up && cc.nv ? 1 : 0, 12, dt);
    P.dofAmount = damp(P.dofAmount, this.post.dof, 4, dt);
    P.dofFocus = damp(P.dofFocus, this.post.dofFocus, 6, dt);
    P.motion = s.get('motionBlur') ? 0.45 : 0;
    SHARED.uBreath.value = damp(SHARED.uBreath.value, clamp((ins - 60) / 40) + (this.story.breath ?? 0), 0.5, dt);
    if (this.audio.ready && this.audio.music.setThreat) this.audio.music.setThreat(near);
  }

  threatNear() {
    const p = this.player.pos;
    let near = 0;
    if (this.monster.visible) near = Math.max(near, clamp(1 - this.monster.position.distanceTo(p) / 11));
    near = Math.max(near, this.seconds.nearest(p));
    return near;
  }

  updateHeartbeat(dt) {
    if (!this.audio.ready || this.mode !== 'play') return;
    const near = this.monsterNear || 0;
    const ins = this.state.insanity;
    const rate = near > 0.15 ? 0.95 - near * 0.5 : ins > 70 ? 1.1 : 0;
    if (!rate) return;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = rate;
      this.audio.sfx.play('heartbeat', { volume: 0.45 + near * 0.8 });
      this.pipeline.p.pulse = 0.35 + near * 0.8;
    }
  }

  updateAmbientTalk(dt) {
    if (!this.canTalk() || this.chase.active || this.verity.mode !== 'follow') return;
    if (this.audio.voice?.speaking || this.director.running) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 50 + rand() * 50 - this.state.insanity * 0.2;
      this.speak('verity', this.brain.ambient(this.state.insanity, this.ctx()));
    }
  }

  // ------------------------------------------------------------------ input
  onKey(e) {
    if (this.mode === 'boot' || this.paused) return;
    if (this.mode !== 'play') return;
    const k = this.settings.get('keys');
    if (this.ui.overlayOpen) {
      if (e.code === 'Escape' || (this.ui.docOpen && (e.code === k.interact || e.code === 'Enter'))) this.closeOverlay();
      return;
    }
    if (e.code === 'KeyP') { this.pause(); return; }
    if (this.chatting) return;
    if (e.code === k.talk || e.code === 'Enter') {
      if (this.canTalk()) { e.preventDefault(); this.openChat(); }
      else if (e.code === k.talk) this.ui.toast(this.state.flags.verityOut ? 'Verity isn’t here.' : 'There’s nobody to talk to.', 1.8);
    }
    if (e.code === k.flashlight) this.player.toggleFlashlight();
    if (e.code === k.camcorder) this.player.camcorder.toggle();
    if (e.code === k.nightvision) this.player.camcorder.toggleNV();
    if (e.code === k.throw) this.throwables.throwHeld();
    if (e.code === k.journal) this.ui.openJournal();
    if (e.code === k.hint) this.askHint();
    if (this.player.hidden && e.code === k.interact) this.story.unhide();
  }

  pollPad() {
    const c = this.controls;
    if (this.mode !== 'play' || this.paused) {
      if (c.padButton(9) && (this.mode === 'play' || this.mode === 'cutscene')) this.paused ? this.resume() : this.pause();
      return;
    }
    if (c.padButton(9)) { this.pause(); return; }
    if (this.ui.overlayOpen) { if (c.padButton(1) || c.padButton(0)) this.closeOverlay(); return; }
    if (this.chatting) { this.ui.padChat(c); if (c.padButton(1)) this.closeChat(); return; }
    if (c.padButton(3) && this.canTalk()) this.openChat();
    if (c.padButton(2)) this.player.toggleFlashlight();
    if (c.padButton(4)) this.player.camcorder.toggle();
    if (c.padButton(12)) this.player.camcorder.toggleNV();
    if (c.padButton(5)) this.throwables.throwHeld();
    if (c.padButton(8)) this.ui.openJournal();
    if (c.padButton(13)) this.askHint();
    if (this.player.hidden && c.padButton(0)) this.story.unhide();
  }

  canTalk() {
    const o = this.story.talkOverride?.();
    if (o != null) return o;
    if (!this.state.flags.verityOut) return false;
    if (this.chase.active) return true; // it hears you wherever you are
    return this.verity.visible && !this.player.hidden && this.verity.mode === 'follow';
  }

  askHint() {
    if (!this.canTalk()) { this.ui.toast(this.ui.objectiveText || 'Look around.', 3); return; }
    this.openChat();
    this.askVerity('What should I do now?');
  }

  updateInteraction(dt) {
    this.pollPad();
    if (this.chatting || this.player.hidden || this.ui.overlayOpen || !this.level) { this.ui.setPrompt(null); return; }
    const cam = this.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const list = this.level.interactables.filter((m) => m.visible !== false && isShown(m));
    const hits = this.raycaster.intersectObjects(list.concat(this.throwables.meshes), false);
    let it = null, hitPoint = null;
    for (const h of hits) {
      const obj = h.object.userData.interactable;
      if (!obj) continue;
      if (obj.enabled && !obj.enabled(this)) continue;
      const cols = this.level.near(cam.position.x, cam.position.z, this.player.layer);
      const hx = h.point.x - (h.point.x - cam.position.x) * 0.12, hz = h.point.z - (h.point.z - cam.position.z) * 0.12;
      if (!lineOfSight(cam.position.x, cam.position.z, hx, hz, cols, ['wall'])) continue;
      it = obj; hitPoint = h.point;
      break;
    }
    const label = it ? (typeof it.label === 'function' ? it.label(this) : it.label) : null;
    this.ui.setGlint(it && label ? hitPoint : null);
    if (!it || !label) { this.ui.setPrompt(null); this.holdTime = 0; return; }
    const key = this.controls.usingPad ? 'A' : keyLabel(this.settings.get('keys').interact);
    const hold = typeof it.hold === 'function' ? it.hold(this) : it.hold;
    if (hold) {
      if (this.controls.isDown('interact')) {
        this.holdTime += dt;
        if (this.holdTime >= hold) { this.holdTime = 0; it.onInteract?.(this, hitPoint); }
      } else this.holdTime = 0;
      this.ui.setPrompt(label, key, this.holdTime / hold || 0.001);
    } else {
      this.ui.setPrompt(label, key);
      if (this.controls.wasPressed('interact')) it.onInteract?.(this, hitPoint);
    }
  }

  closeOverlay() {
    const cb = this._overlayClose;
    this._overlayClose = null;
    this.ui.closeOverlay();
    this.audio.sfx.play('paper', { volume: 0.5 });
    cb?.();
  }
  showNote(title, text, onClose, opts) {
    this.ui.showNote(title, text, opts);
    this.audio.sfx.play('paper');
    this._overlayClose = onClose;
  }
  showPicture(canvas, onClose, caption) {
    this.ui.showCanvas(canvas, caption);
    this._overlayClose = onClose;
  }
  // Modal DOM panels (keypads, breaker boards…) — resolves with the panel's result
  panel(build) {
    return new Promise((resolve) => {
      this.input.unlock();
      this._overlayClose = () => resolve(null);
      this.ui.openPanel(build, (v) => { this._overlayClose = null; this.ui.closeOverlay(); resolve(v); });
    });
  }

  // ------------------------------------------------------------------ Verity
  openChat() {
    if (this.chatting) return;
    this.chatting = true;
    this.input.enabled = false;
    this.input.down.clear();
    this.player.canMove = false;
    this.ui.openChat(this.controls.usingPad);
    this.ui.clearSubtitle();
    this.ui.refreshTalkHint(false);
    this.state.flags.chatOpened = true;
  }
  closeChat() {
    if (!this.chatting) return;
    this.chatting = false;
    this.story.onCloseChat?.();
    if (this.ui.chatInput) this.ui.chatInput.placeholder = 'Ask Verity anything…';
    this.input.enabled = true;
    this.player.canMove = true;
    this.ui.closeChat();
    this.renderer.canvas.focus?.();
  }

  ctx() {
    const s = this.state;
    return {
      insanity: s.insanity, objective: s.objective, transformed: s.transformed, hard: s.hard, chapter: s.chapter,
      flags: s.flags, tapes: s.tapes.length, zone: this.zone?.id, chase: this.chase.active, story: this.story.brainCtx?.() || {},
    };
  }

  async askVerity(text) {
    if (this.busy) return;
    this.busy = true;
    this.ui.setChatBusy(true);
    this.ui.addYou(text);
    this.state.questions++;
    const res = this.story.respond?.(text) || this.brain.respond(text, this.ctx());
    if (res.rude) this.state.rude++;
    if (res.kind) this.state.kind++;
    // talking while hiding gives you away
    if (this.player.hidden && this.chase.active && !res.flags.release) {
      this.chase.reveal();
      res.text = 'I can hear you. ' + res.text;
    }
    this.story.onBeforeAnswer?.(res);
    const stage = stageFor(this.state.insanity);
    this.verity.face.talking = false;
    await this.sleep(0.35 + stage * 0.12 + (res.rude ? 0.5 : 0));
    if (res.rude) {
      this.flickerZone(0.6);
      this.audio.sfx.play('glitch', { position: this.verity.position, volume: 0.6 });
      this.post.glitch = 0.8;
    }
    this.addInsanity(res.delta);
    const st = stageFor(this.state.insanity);
    const reveal = this.ui.addVerity(res.name ? `${res.name}: ${res.text}` : res.text, res.who === 'falsity' ? 5 : st);
    const pos = this.chase.active && !res.flags.release ? this.monster.headWorld() : null;
    const vo = (!res.who && this.story.voiceOpts?.(res)) || {};
    await this.speak(vo.who || res.who || 'verity', res.text, { onWord: reveal, noSub: true, position: vo.position || res.position || pos, tv: vo.tv });
    this.busy = false;
    this.ui.setChatBusy(false);
    this.story.onAsk(res);
    if (this.state.insanity >= 100 && !this.state.transformed && this.mode === 'play' && this.story.canTransform()) {
      this.closeChat();
      this.story.transform();
    }
  }

  // who: verity | ruth | vera | falsity | radio | tv | manager | '' (thought)
  speak(who, text, opts = {}) {
    if (!this.audio.ready) return this.sleep(Math.max(1.2, text.length / 15));
    const stage = stageFor(this.state.insanity);
    const names = { verity: 'VERITY', ruth: opts.label || 'TAPE — DR. RUTH PENROSE', vera: 'VERA', falsity: 'F-01', radio: 'RADIO', tv: 'TV', manager: opts.label || 'VOICEMAIL', intercom: 'INTERCOM', you: 'YOU' };
    let reveal = opts.onWord;
    if (!opts.noSub && who === 'verity' && this.chatting) {
      reveal = this.ui.addVerity(text, stage);
      opts = { ...opts, noSub: true };
    }
    if (!opts.noSub) {
      const r = this.ui.subtitle(text, { who: opts.name ?? names[who] ?? '', cls: who, stage });
      const inner = reveal;
      reveal = (n, w) => { r(n); inner?.(n, w); };
    }
    const face = who === 'verity' && !opts.tv;
    if (face) { this.verity.face.talking = true; this.audio.duck(0.45); }
    const voiceWho = who === 'intercom' || who === 'tv' ? (opts.asVerity ? 'verity' : who) : who === 'you' ? 'manager' : who;
    const p = this.audio.voice.speak(text, { who: voiceWho, stage: opts.stage ?? stage, onWord: reveal });
    return p.then(() => {
      if (face) { this.verity.face.talking = false; this.audio.unduck(); }
      if (!opts.noSub) this.ui.clearSubtitle(0.9);
    });
  }

  sleep(s) { return new Promise((r) => setTimeout(r, s * 1000)); }

  addInsanity(d, { silent = false } = {}) {
    const before = this.state.insanity;
    const cap = this.story.insanityCap?.() ?? 100;
    this.state.insanity = clamp(before + d, 0, Math.max(cap, before));
    this.applyInsanity(silent ? 0 : this.state.insanity - before);
  }
  setInsanity(v) { this.state.insanity = clamp(v, 0, 100); this.applyInsanity(0); }
  applyInsanity(delta) {
    const ins = this.state.insanity;
    const stage = stageFor(ins);
    this.ui.setInsanity(ins, delta);
    const expr = EXPRESSIONS[stage];
    this.verity.face.set(expr);
    this.verity.face.cracks = clamp((ins - 70) / 30) * 0.8;
    this.ui.setFace(expr);
    this.save.addUnique('facesSeen', stage);
    if (stage > this.lastStage && this.mode !== 'menu') {
      this.audio.sfx.play('glitch', { position: this.verity.position, volume: 0.5, dur: 0.3 });
      this.flickerZone(0.4 + stage * 0.15);
      this.story.onStage?.(stage);
    }
    this.lastStage = stage;
  }

  setObjective(key, text) {
    this.state.objective = key;
    this.ui.setObjective(text);
    if (text) this.audio.sfx.play('stingerSoft', { volume: 0.22 });
  }

  // flicker every fixture in the current zone for a moment
  flickerZone(seconds = 0.6, zone = this.zone) {
    if (!zone) return;
    const prev = zone.fixtures.map((f) => f.state);
    zone.fixtures.forEach((f) => { if (f.state !== 'off') f.state = 'flicker'; });
    setTimeout(() => zone.fixtures.forEach((f, i) => { if (f.state === 'flicker') f.state = prev[i]; }), seconds * 1000);
  }

  lightning(strength = 1) {
    if (this.settings.get('reduceFlashing')) strength *= 0.3;
    this.lights.flash(strength);
    setTimeout(() => this.audio.sfx.play('thunder', { volume: 0.5 + strength * 0.5 }), 300 + Math.random() * 1200);
  }

  onFootstep(kind) {
    const surface = this.story.surfaceAt?.(this.player.pos) || 'concrete';
    const k = kind === 'run' ? 1.4 : kind === 'sneak' ? 0.35 : 0.9;
    this.audio.sfx.play('step', { surface, intensity: k, volume: 0.75 });
    this.chase.hear?.(this.player.pos, kind === 'run' ? 11 : kind === 'sneak' ? 1.5 : 5);
  }

  onCaught(reason) { this.story.caught(reason); }

  // ------------------------------------------------------------------ flow
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.input.unlock();
    this.audio.voice?.synth?.pause?.();
    this.audio.suspend();
    this.menus.show('pause');
  }
  resume() {
    this.paused = false;
    this.menus.hide();
    this.audio.resume();
    this.audio.voice?.synth?.resume?.();
    this.clock.update();
    if (this.mode === 'play' || this.mode === 'cutscene') {
      this.input.lock();
      setTimeout(() => { if (!this.input.locked && this.mode === 'play' && !this.paused && !this.controls.usingPad) this.ui.toast('Click to look around', 3); }, 600);
    }
  }

  checkpoint(extra = {}) {
    const s = this.state;
    this.save.setCheckpoint({
      chapter: s.chapter, insanity: s.insanity, tapes: s.tapes, docs: s.docs, figures: s.figures, items: s.items,
      flags: { ...s.flags }, hard: s.hard, ngPlus: s.ngPlus, transformations: s.transformations, questions: s.questions,
      rude: s.rude, kind: s.kind, battery: this.player.battery, camBattery: this.player.camcorder.battery, deaths: s.deaths,
      memory: this.brain.snapshot(), spot: extra.spot || this.story.spotName || null,
    });
    this.ui.saving();
  }

  resetRun(opts = {}) {
    if (this.director.running) this.director.skipAll();
    this.audio.voice?.stop();
    this.chase.stop();
    this.seconds.stopAll();
    this.monster.show(false);
    this.closeChat();
    this.ui.clearChat();
    this.ui.closeOverlay();
    this.state = this.freshState(opts);
    this.brain = this.makeBrain(opts);
    this.player.reset();
    this.lastStage = 0;
    this.post = { warpBoost: 0, redBoost: 0, glitch: 0, damage: 0, flash: 0, blackout: 0, dof: 0, dofFocus: 2 };
    this.ambientTimer = 60;
    this.events.reset();
    this.applyInsanity(0);
    this.audio.setMuffle(false);
    this.story.reset();
  }

  async newGame(opts = {}) {
    this.menus.hide();
    this.resetRun(opts);
    this.save.data.runs++;
    this.save.write();
    await this.story.start(0, { fresh: true });
  }

  async continueGame() {
    const cp = this.save.data.checkpoint;
    if (!cp) return this.newGame();
    this.menus.hide();
    this.resetRun({ hard: cp.hard, ngPlus: cp.ngPlus });
    Object.assign(this.state, {
      chapter: cp.chapter, insanity: cp.insanity, tapes: [...cp.tapes], docs: [...(cp.docs || [])], figures: [...(cp.figures || [])],
      items: [...(cp.items || [])], flags: { ...cp.flags }, transformations: cp.transformations || 0, questions: cp.questions || 0,
      rude: cp.rude || 0, kind: cp.kind || 0, deaths: cp.deaths || 0,
    });
    if (cp.memory) this.brain.restore(cp.memory);
    this.player.battery = cp.battery ?? 1;
    this.player.camcorder.battery = cp.camBattery ?? 1;
    this.applyInsanity(0);
    await this.story.start(cp.chapter, { fromLoad: true, spot: cp.spot });
  }

  async startChapter(n, opts = {}) {
    this.menus.hide();
    this.resetRun(opts);
    this.state.chapter = n;
    await this.story.start(n, { fromLoad: true, chapterSelect: true });
  }

  async quitToMenu() {
    this.paused = false;
    this.audio.resume();
    this.resetRun({});
    await this.ui.fade(1, 0.6);
    await this.enterMenu();
  }

  async enterMenu() {
    this.mode = 'menu';
    this.input.unlock();
    this.ui.showHUD(false);
    this.ui.setLetterbox(false);
    this.ui.setObjective(null);
    this.ui.clearSubtitle();
    this.ui.refreshTalkHint(false);
    await this.story.setupMenu();
    if (this.audio.ready) this.audio.music.setMood('menu');
    this.menus.show('title');
    this.ui.fade(0, 2);
  }
}

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
function isShown(o) {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
}
