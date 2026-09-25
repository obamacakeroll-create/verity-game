import * as THREE from 'three';
import { Settings } from './Settings.js';
import { Save } from './Save.js';
import { Input, keyLabel } from './Input.js';
import { Renderer } from '../render/Renderer.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { UI } from '../ui/UI.js';
import { Menus } from '../ui/Menus.js';
import { House } from '../world/House.js';
import { Props } from '../world/Props.js';
import { Lighting } from '../world/Lighting.js';
import { Player } from '../entities/Player.js';
import { VerityBall } from '../entities/VerityBall.js';
import { VerityMonster } from '../entities/VerityMonster.js';
import { CardboardBox } from '../entities/CardboardBox.js';
import { EXPRESSIONS } from '../entities/VerityFace.js';
import { VerityBrain, stageFor } from '../ai/VerityBrain.js';
import { MonsterAI } from '../ai/MonsterAI.js';
import { CutsceneDirector } from '../story/CutsceneDirector.js';
import { ScareEvents } from '../story/ScareEvents.js';
import { Story } from '../story/Story.js';
import { lineOfSight } from './physics.js';
import { clamp, damp, rand } from './util.js';

export class Game {
  constructor() {
    this.settings = new Settings();
    this.save = new Save();
    this.renderer = new Renderer(document.getElementById('canvas-host'), this.settings);
    this.input = new Input(this.renderer.canvas, this.settings);
    this.audio = new AudioEngine(this.settings, { introClip: '../audio/verity_intro.mp3' });
    this.ui = new UI(this);
    this.mode = 'boot';
    this.paused = false;
    this.time = 0;
    this.chatting = false;
    this.busy = false;
    this.state = this.freshState();
    this.debug = new URLSearchParams(location.search).has('debug');
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.3;
    this.holdTime = 0;
    this.ambientTimer = 60;
    this.heartTimer = 0;
    this.lastStage = 0;
  }

  // Heavy construction split out so a loading screen can show first.
  build() {
    const scene = this.renderer.scene;
    this.house = new House(scene);
    this.props = new Props(this.house);
    this.lighting = new Lighting(scene, this.house);
    this.player = new Player(this);
    this.verity = new VerityBall(scene);
    this.box = new CardboardBox(this.house.root, this.props.verityBoxPos, 0.5);
    this.monster = new VerityMonster(scene);
    this.monster.onStep = (run) => this.audio.sfx.play('monsterStep', { position: this.monster.position.clone().setY(0.2), run, volume: 1.2 });
    this.chase = new MonsterAI(this, this.monster);
    this.director = new CutsceneDirector(this);
    this.events = new ScareEvents(this);
    this.brain = new VerityBrain({ ngPlus: this.save.ngPlus });
    this.story = new Story(this);
    this.menus = new Menus(this);
    this.house.batchStatic();
    this.renderer.applyShadows();

    this.input.on('unlock', () => {
      if ((this.mode === 'play' || this.mode === 'cutscene') && !this.paused && !this.ui.docOpen) this.pause();
    });
    this.input.on('keydown', (e) => this.onKey(e));
    this.renderer.canvas.addEventListener('click', () => {
      if (this.mode === 'play' && !this.paused) this.input.lock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'cutscene') && !this.paused) this.pause();
    });
    this.clock = new THREE.Timer();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  freshState(opts = {}) {
    return {
      chapter: 0, insanity: 0, tapes: [], notes: [], flags: {}, objective: 'talk',
      hard: !!opts.hard, ngPlus: !!opts.ngPlus, transformations: 0, questions: 0, rude: 0,
      started: performance.now(), battery: 1, transformed: false,
    };
  }

  // ------------------------------------------------------------------ loop
  frame() {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta()) * (this.timeScale || 1);
    if (!this.paused) this.update(dt);
    else this.renderer.post.u.uTime.value += dt;
    this.renderer.render(this.paused ? 0 : dt);
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    const ins = this.state.insanity;
    this.director.update(dt);

    if (this.mode === 'play') {
      if (!this.ui.docOpen) this.player.update(dt, this.input, this.house.colliders);
      else this.input.consumeMouse();
      this.updateInteraction(dt);
      this.story.update(dt);
      this.events.update(dt);
      this.chase.update(dt);
      this.updateAmbientTalk(dt);
    } else if (this.mode === 'menu') {
      this.menuCamera(dt);
      // every so often, something in the box moves
      this.menuShake = (this.menuShake ?? 12) - dt;
      if (this.menuShake <= 0) {
        this.menuShake = 14 + rand() * 12;
        this.box.shake = 0.6;
        this.audio.sfx?.play('rustle', { position: this.box.root.position, volume: 0.6, dur: 0.5 });
        this.lighting.flicker(0.4, 'corner', 0.6);
        setTimeout(() => (this.box.shake = 0), 500);
      }
    } else {
      this.input.consumeMouse();
      if (this.mode === 'cutscene') this.story.update(dt, true);
    }
    if (this.mode !== 'play') this.player.updateFlashlight(dt);

    this.verity.update(dt, {
      camera: this.renderer.camera, colliders: this.house.colliders, insanity: ins,
      chatting: this.chatting, glowScale: this.lighting.power ? 1 : 1.6,
    });
    this.monster.update(dt);
    this.box.update(dt);
    this.house.update(dt);
    this.props.update(dt, this.time);
    this.lighting.update(dt, this.mode === 'menu' ? 0 : ins / 100, this.settings.get('reduceFlashing'));
    if (this.mode === 'play' && this.lighting.tickLightning(dt)) this.lightning();
    if (this.audio.ready) {
      this.audio.updateListener(this.renderer.camera);
      this.audio.music.setIntensity(this.mode === 'menu' ? 0.05 : ins / 100);
    }
    this.updateHeartbeat(dt);
    this.updatePost(dt);
    this.ui.setMeters(this.player);
  }

  menuCamera(dt) {
    const t = this.time;
    const cam = this.renderer.camera;
    cam.position.set(0.3 + Math.sin(t * 0.07) * 0.12, 1.42 + Math.sin(t * 0.11) * 0.03, -9.2 - Math.sin(t * 0.05) * 0.4);
    cam.lookAt(0.05 + Math.sin(t * 0.09) * 0.05, 0.5, -13.05);
  }

  updatePost(dt) {
    const u = this.renderer.post.u;
    const s = this.settings;
    const ins = this.mode === 'menu' ? 8 : this.state.insanity;
    const near = this.chase.active ? clamp(1 - this.monster.position.distanceTo(this.player.pos) / 10) : 0;
    this.monsterNear = near;
    u.uGrain.value = s.get('grain') ? 0.055 + ins * 0.0007 + near * 0.05 : 0;
    u.uChromatic.value = s.get('chromatic') ? 0.0008 + ins * 0.00002 + near * 0.004 : 0;
    u.uInsanity.value = clamp((ins - 20) / 80) * 0.7;
    const targetWarp = clamp((ins - 55) / 45) * 0.5 + near * 0.6 + (this.warpBoost || 0);
    u.uWarp.value = damp(u.uWarp.value, targetWarp, 3, dt);
    u.uRed.value = damp(u.uRed.value, (this.chase.active ? 0.25 + near * 0.35 : clamp((ins - 70) / 30) * 0.3) + (this.redBoost || 0), 2, dt);
    u.uVignette.value = 1.05 + ins * 0.004 + near * 0.3 + (this.player.hidden ? 0.5 : 0);
    u.uBrightness.value = s.get('brightness');
    u.uScanline.value = damp(u.uScanline.value, this.glitchLevel || 0, 6, dt);
    this.glitchLevel = Math.max(0, (this.glitchLevel || 0) - dt * 1.5);
    u.uPulse.value = Math.max(0, u.uPulse.value - dt * 3);
  }

  updateHeartbeat(dt) {
    if (!this.audio.ready || this.mode !== 'play') return;
    const near = this.monsterNear || 0;
    const ins = this.state.insanity;
    const rate = this.chase.active ? 0.9 - near * 0.5 : ins > 70 ? 1.1 : 0;
    if (!rate) return;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = rate;
      this.audio.sfx.play('heartbeat', { volume: 0.5 + near * 0.8 });
      this.renderer.post.u.uPulse.value = 0.4 + near * 0.8;
    }
  }

  updateAmbientTalk(dt) {
    if (!this.verity.visible || this.verity.mode !== 'follow' || this.chatting || this.chase.active || this.state.chapter < 1) return;
    if (this.audio.voice?.speaking) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 45 + rand() * 50 - this.state.insanity * 0.2;
      this.speak('verity', this.brain.ambient(this.state.insanity));
    }
  }

  // ------------------------------------------------------------------ input
  onKey(e) {
    if (this.mode === 'boot') return;
    if (this.paused) {
      if (e.code === 'Escape' || e.code === 'KeyP') { /* menus handle resume clicks */ }
      return;
    }
    if (this.mode !== 'play') return;
    const k = this.settings.get('keys');
    if (this.ui.docOpen) {
      if (e.code === k.interact || e.code === 'Escape' || e.code === 'Enter') { this.closeDoc(); }
      return;
    }
    if (e.code === 'KeyP') { this.pause(); return; }
    if (this.chatting) return;
    if (e.code === k.talk || e.code === 'Enter') {
      if (this.canTalk()) { e.preventDefault(); this.openChat(); }
    }
    if (e.code === k.flashlight) this.player.toggleFlashlight();
    if (this.player.hidden && e.code === k.interact) this.story.unhide();
  }

  canTalk() {
    if (!this.state.flags.verityOut) return false;
    // during a chase you can still talk to it — it hears you wherever you are
    if (this.chase.active) return true;
    return this.verity.visible && !this.player.hidden && this.verity.mode === 'follow';
  }

  updateInteraction(dt) {
    if (this.chatting || this.player.hidden || this.ui.docOpen) { this.ui.setPrompt(null); return; }
    const cam = this.renderer.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const hits = this.raycaster.intersectObjects(this.house.interactMeshes.concat(this.extraInteract || []), false);
    let it = null;
    for (const h of hits) {
      const obj = h.object.userData.interactable;
      if (!obj) continue;
      if (!lineOfSight(cam.position.x, cam.position.z, h.point.x - (h.point.x - cam.position.x) * 0.15, h.point.z - (h.point.z - cam.position.z) * 0.15, this.house.colliders, ['wall'])) continue;
      it = obj;
      break;
    }
    const label = it ? (typeof it.label === 'function' ? it.label(this) : it.label) : null;
    if (!it || !label) { this.ui.setPrompt(null); this.holdTime = 0; return; }
    const key = keyLabel(this.settings.get('keys').interact);
    const hold = typeof it.hold === 'function' ? it.hold(this) : it.hold;
    if (hold) {
      if (this.input.isDown('interact')) {
        this.holdTime += dt;
        if (this.holdTime >= hold) { this.holdTime = 0; it.onInteract?.(this); }
      } else this.holdTime = 0;
      this.ui.setPrompt(label, key, this.holdTime / hold || 0.001);
    } else {
      this.ui.setPrompt(label, key);
      if (this.input.wasPressed('interact')) it.onInteract?.(this);
    }
  }

  closeDoc() {
    this.ui.hideDoc();
    this.audio.sfx.play('paper', { volume: 0.6 });
    const cb = this._docClose;
    this._docClose = null;
    cb?.();
  }
  showNote(title, text, onClose) {
    this.ui.showNote(title, text);
    this.audio.sfx.play('paper');
    this._docClose = onClose;
  }
  showPicture(canvas, onClose, caption) {
    this.ui.showCanvas(canvas, caption);
    this._docClose = onClose;
  }

  // ------------------------------------------------------------------ Verity
  openChat() {
    if (this.chatting) return;
    this.chatting = true;
    this.input.enabled = false;
    this.input.down.clear();
    this.player.canMove = false;
    this.ui.openChat();
    this.ui.clearSubtitle();
    this.ui.refreshTalkHint(false);
    this.state.flags.chatOpened = true;
  }
  closeChat() {
    if (!this.chatting) return;
    this.chatting = false;
    this.input.enabled = true;
    this.player.canMove = true;
    this.ui.closeChat();
    this.renderer.canvas.focus?.();
  }

  async askVerity(text) {
    if (this.busy) return;
    this.busy = true;
    this.ui.setChatBusy(true);
    this.ui.addYou(text);
    this.state.questions++;
    const res = this.brain.respond(text, {
      insanity: this.state.insanity, objective: this.state.objective, transformed: this.state.transformed, hard: this.state.hard,
    });
    if (res.rude) this.state.rude++;
    // talking while hiding gives you away
    if (this.player.hidden && this.chase.active && !res.flags.boxCommand) {
      this.chase.sawHide = true;
      this.chase.state = 'search';
      this.chase.path = [];
      res.text = 'I can hear you. ' + res.text;
    }
    if (res.flags.falsity && !this.save.data.falsity) { this.save.data.falsity = true; this.save.write(); }
    // "thinking" beat — longer and glitchier as she deteriorates
    const stage = stageFor(this.state.insanity);
    this.verity.face.talking = false;
    await this.sleep(0.35 + stage * 0.12 + (res.rude ? 0.5 : 0));
    if (res.rude) {
      this.lighting.flicker(0.6);
      this.audio.sfx.play('glitch', { position: this.verity.position, volume: 0.6 });
      this.glitchLevel = 0.8;
    }
    this.addInsanity(res.delta);
    const st = stageFor(this.state.insanity);
    const reveal = this.ui.addVerity(res.text, st);
    if (this.chase.active && !res.flags.boxCommand) {
      // she answers from wherever she is — through the monster
      await this.speak('verity', res.text, { onWord: reveal, noSub: true, position: this.monster.headWorld() });
    } else {
      await this.speak('verity', res.text, { onWord: reveal, noSub: true });
    }
    this.busy = false;
    this.ui.setChatBusy(false);
    this.story.onAsk(res);
    if (this.state.insanity >= 100 && !this.state.transformed && this.mode === 'play') {
      this.closeChat();
      this.story.transform();
    }
  }

  // who: verity | marcus | radio. Returns when the line is finished.
  speak(who, text, opts = {}) {
    if (!this.audio.ready) return this.sleep(Math.max(1.2, text.length / 15));
    const stage = stageFor(this.state.insanity);
    const names = { verity: 'VERITY', marcus: opts.label || 'TAPE — MARCUS HARLOW', radio: 'RADIO' };
    let reveal = opts.onWord;
    // while the chat is open, Verity's unprompted lines land in the chat log instead
    if (!opts.noSub && who === 'verity' && this.chatting) {
      reveal = this.ui.addVerity(text, stage);
      opts = { ...opts, noSub: true };
    }
    if (!opts.noSub) {
      const r = this.ui.subtitle(text, { who: names[who] || '', cls: who, stage });
      const inner = reveal;
      reveal = (n, w) => { r(n); inner?.(n, w); };
    }
    if (who === 'verity') { this.verity.face.talking = true; this.audio.duck(0.45); }
    const p = this.audio.voice.speak(text, { who, stage: opts.stage ?? stage, onWord: reveal });
    return p.then(() => {
      if (who === 'verity') { this.verity.face.talking = false; this.audio.unduck(); }
      if (!opts.noSub) this.ui.clearSubtitle(0.9);
    });
  }

  sleep(s) { return new Promise((r) => setTimeout(r, s * 1000)); }

  addInsanity(d, { silent = false } = {}) {
    const before = this.state.insanity;
    const cap = this.state.chapter >= 5 || this.state.allowFull ? 100 : 100;
    this.state.insanity = clamp(before + d, 0, cap);
    this.applyInsanity(silent ? 0 : this.state.insanity - before);
  }
  setInsanity(v) {
    this.state.insanity = clamp(v, 0, 100);
    this.applyInsanity(0);
  }
  applyInsanity(delta) {
    const ins = this.state.insanity;
    const stage = stageFor(ins);
    this.ui.setInsanity(ins, delta);
    const expr = EXPRESSIONS[stage];
    this.verity.face.set(expr);
    this.verity.face.cracks = clamp((ins - 70) / 30) * 0.8;
    this.ui.setFace(expr);
    if (!this.save.data.facesSeen.includes(stage)) this.save.addUnique('facesSeen', stage);
    if (stage > this.lastStage && this.mode !== 'menu') {
      this.audio.sfx.play('glitch', { position: this.verity.position, volume: 0.5, dur: 0.3 });
      this.lighting.flicker(0.4 + stage * 0.15);
      if (stage >= 4) this.audio.music.setMood(stage >= 5 ? 'dread' : 'uneasy');
    }
    this.lastStage = stage;
    this.house.setRot(Math.max(this.state.chapter >= 4 ? 1 : this.state.chapter >= 3 ? 0.5 : 0, ins >= 80 ? 1 : ins >= 55 ? 0.5 : 0));
  }

  setObjective(key, text) {
    this.state.objective = key;
    this.ui.setObjective(text);
    if (text) this.audio.sfx.play('stingerSoft', { volume: 0.25 });
  }

  lightning() {
    this.lighting.strike(() => this.audio.sfx.play('thunder', { volume: 0.9 }));
    this.ui.flash(0.08, 400);
  }

  // Verity vanishes; when you turn around she is right behind you.
  verityVanish() {
    if (!this.verity.visible || this.chatting) return;
    this.verity.show(false);
    this.audio.sfx.play('whoosh', { volume: 0.3 });
    setTimeout(() => {
      if (this.mode !== 'play') { this.verity.show(true); return; }
      const p = this.player;
      const f = p.forward;
      this.verity.position.set(p.pos.x - f.x * 0.7, 1.45, p.pos.z - f.z * 0.7);
      this.verity.show(true);
      this.audio.sfx.play('breath', { position: this.verity.position, volume: 1.3, dur: 1.2 });
    }, 3500 + rand() * 3000);
  }

  onFootstep(kind) {
    const p = this.player.pos;
    const room = this.house.roomAt(p.x, p.z);
    let surface = room === 'bath' ? 'tile' : 'wood';
    if ((room === 'hallA' && Math.abs(p.x) < 0.45 && p.z < -1 && p.z > -11.6) || (room === 'hallB' && Math.abs(p.z + 13) < 0.45)) surface = 'carpet';
    this.audio.sfx.play('step', { surface, intensity: kind === 'run' ? 1.4 : kind === 'sneak' ? 0.4 : 0.9, volume: 0.7 });
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
      setTimeout(() => { if (!this.input.locked && this.mode === 'play' && !this.paused) this.ui.toast('Click to look around', 3); }, 600);
    }
  }

  checkpoint() {
    const s = this.state;
    this.save.setCheckpoint({
      chapter: s.chapter, insanity: s.insanity, tapes: s.tapes, notes: s.notes, flags: { ...s.flags, verityOut: true },
      hard: s.hard, ngPlus: s.ngPlus, transformations: s.transformations, questions: s.questions, rude: s.rude,
      battery: this.player.battery, name: this.brain.memory.name, rudeCount: this.brain.memory.rudeCount, lastInsult: this.brain.memory.lastInsult,
    });
    this.ui.saving();
  }

  resetRun(opts) {
    this.director.running && this.director.skipAll();
    this.audio.voice?.stop();
    this.chase.stop();
    this.monster.show(false);
    this.closeChat();
    this.ui.clearChat();
    this.ui.hideDoc();
    this.state = this.freshState(opts);
    this.brain = new VerityBrain({ ngPlus: this.save.ngPlus || opts.ngPlus });
    this.player.battery = 1;
    this.player.hidden = null;
    this.player.lookClamp = null;
    this.player.crouching = false;
    this.lastStage = 0;
    this.warpBoost = 0;
    this.redBoost = 0;
    this.ambientTimer = 60;
    this.events.reset();
    this.applyInsanity(0);
    this.audio.setMuffle(false);
  }

  async newGame(opts = {}) {
    this.menus.hide();
    this.resetRun(opts);
    this.save.data.runs++;
    this.save.write();
    this.input.lock();
    await this.story.start(0, { fresh: true });
  }

  async continueGame() {
    const cp = this.save.data.checkpoint;
    if (!cp) return this.newGame();
    this.menus.hide();
    this.resetRun({ hard: cp.hard, ngPlus: cp.ngPlus });
    Object.assign(this.state, {
      chapter: cp.chapter, insanity: cp.insanity, tapes: [...cp.tapes], notes: [...cp.notes], flags: { ...cp.flags },
      transformations: cp.transformations || 0, questions: cp.questions || 0, rude: cp.rude || 0,
    });
    this.brain.memory.name = cp.name || '';
    this.brain.memory.rudeCount = cp.rudeCount || 0;
    this.brain.memory.lastInsult = cp.lastInsult || '';
    this.player.battery = cp.battery ?? 1;
    this.applyInsanity(0);
    this.input.lock();
    await this.story.start(cp.chapter, { fromLoad: true });
  }

  async startChapter(n, opts = {}) {
    this.menus.hide();
    this.resetRun(opts);
    this.state.chapter = n;
    this.state.flags.verityOut = n > 0;
    this.input.lock();
    await this.story.start(n, { fromLoad: true });
  }

  async quitToMenu() {
    this.paused = false;
    this.audio.resume();
    this.resetRun({});
    await this.ui.fade(1, 0.6);
    this.enterMenu();
  }

  enterMenu() {
    this.mode = 'menu';
    this.input.unlock();
    this.story.setupWorld(0, { menu: true });
    this.ui.showHUD(false);
    this.ui.setLetterbox(false);
    this.ui.setObjective(null);
    this.ui.clearSubtitle();
    this.ui.refreshTalkHint(false);
    this.lighting.setPower(true);
    for (const l of Object.values(this.lighting.lamps)) l.on = l.id === 'corner';
    this.lighting.lamps.corner.flicker = 0.08;
    this.player.flashOn = false;
    if (this.audio.ready) {
      this.audio.music.setMood('menu');
      this.story.ambience(true);
    }
    this.menus.show('title');
    this.ui.fade(0, 2);
  }
}
