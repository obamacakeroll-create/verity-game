import * as THREE from 'three';
import { CHAPTERS2, ROMAN2 } from './chapters.js';
import { TAPES2, DOCS, SAFE_CODE } from '../ai/knowledgeII.js';
import { stageFor } from '../ai/BrainII.js';
import { EXPRESSIONS } from '../../entities/VerityFace.js';
import { ease, rand, clamp, damp } from '../../core/util.js';
import { resolveCircle } from '../../core/physics.js';
import { SHARED } from '../render/MaterialLib.js';
import { makeRoute, routeText, makeValves, valveText, falsityAnswer } from './puzzles.js';
import { Prologue } from './ch0.js';
import { Front } from './ch12.js';
import { Back } from './ch34.js';
import { Finale } from './ch5.js';

const BASEMENT = new Set(['coldhall', 'freezerA', 'freezerB', 'archive', 'lab', 'vera', 'tunnel', 'core', 'elevator']);
const FROSTY = new Set(['coldhall', 'freezerA', 'freezerB', 'archive']);

// VERITY II's story: chapters, world state, collectibles, hiding, the
// transformation, deaths and endings. Chapter scripts live in ch0/ch12/ch34/ch5
// and are mixed into this class.
export class StoryII {
  constructor(game) {
    this.g = game;
    this.token = 0;
    this.loops = {};
    this.reset();
  }

  get s() { return this.g.state; }
  get L() { return this.g.level; }
  get R() { return this.g.level?.refs || {}; }
  alive(tk) { return tk === this.token && this.g.mode !== 'menu'; }

  reset() {
    this.token++;
    this.fogMul = 1;
    this.exposureMul = 1;
    this.breath = 0;
    this.vhs = 0;
    this.hemi = 0;
    this.frost = 0;
    this.falsityMode = false;
    this.ending = null;
    this.chaseT = 0;
    this.timers = {};
    this.fired = new Set();
    this.menuT = 0;
    this.stopLoops();
    if (this.g.particles) { this.g.particles.rain = 0; }
    SHARED.uRain.value = 0;
    SHARED.uWet.value = 0;
  }

  // ================================================================ audio beds
  setLoops(spec) {
    const sfx = this.g.audio.sfx;
    if (!this.g.audio.ready) return;
    for (const [name, h] of Object.entries(this.loops)) {
      if (!(name in spec)) { h.stop(1.2); delete this.loops[name]; }
    }
    for (const [name, v] of Object.entries(spec)) {
      const o = typeof v === 'number' ? { volume: v } : v;
      if (this.loops[name]) this.loops[name].set(o.volume, 0.8);
      else this.loops[name] = sfx.loop(name, { ...o, fade: 1.2 });
    }
  }
  stopLoops() { for (const h of Object.values(this.loops)) h.stop?.(0.6); this.loops = {}; }

  // ================================================================ chapters
  async start(n, opts = {}) {
    const g = this.g, s = this.s;
    const tk = ++this.token;
    g.mode = 'cutscene';
    g.ui.showHUD(false);
    await g.ui.fade(1, 0.5);
    if (!this.alive(tk)) return;
    s.chapter = n;
    if (opts.chapterSelect) {
      this.skipTo(n);
      s.insanity = Math.max(s.insanity, CHAPTERS2[n].floor);
      g.applyInsanity(0);
    }
    if (!s.flags.route) s.flags.route = makeRoute();
    if (!s.flags.valves) s.flags.valves = makeValves();
    await g.loadLevel(CHAPTERS2[n].level);
    if (!this.alive(tk)) return;
    this.setupWorld(n);
    g.save.data.unlockedChapter = Math.max(g.save.data.unlockedChapter, n);
    g.save.write();
    await this['begin' + n]({ ...opts, tk });
  }

  // Flags and items a chapter assumes you already have.
  skipTo(n) {
    const f = this.s.flags, it = this.s.items;
    const add = (x) => { if (!it.includes(x)) it.push(x); };
    if (n >= 1) { add('carKeys'); f.drove = true; }
    if (n >= 2) { f.entered = true; f.powerFront = true; f.verityOut = true; f.camcorder = true; add('keycard'); f.prodOpen = true; }
    if (n >= 3) { add('fuse'); f.fuseIn = true; f.gridDone = true; f.secondsOut = true; }
    if (n >= 4) { f.manifest = true; f.cageOpen = true; add('elevKey'); f.descended = true; }
    if (n >= 5) { f.labThawed = true; }
  }

  // Put the (possibly freshly loaded) level into the state the flags describe.
  setupWorld(n) {
    const g = this.g, s = this.s, L = this.L, f = s.flags;
    const p = g.player;
    p.hasFlashlight = true;
    p.camcorder.has = !!f.camcorder;
    g.chase.stop();
    g.monster.show(false);
    g.seconds.clear();
    g.throwables.clear();
    this.falsityMode = false;
    // collectibles already found
    const c = L.collect;
    if (c) {
      for (const [id, o] of Object.entries(c.tapes)) this.markTaken(o, s.tapes.includes(id));
      for (const [id, o] of Object.entries(c.docs)) if (DOCS[id] && o.userData.interactable && s.docs.includes(id) && !['d3', 'd4'].includes(id)) this.markTaken(o, true);
      for (const [id, o] of Object.entries(c.figures)) o.visible = !s.figures.includes(+id);
    }
    // verity
    const v = g.verity;
    if (f.verityOut && n >= 1) { v.show(true); v.setMode('follow'); v.face.set(EXPRESSIONS[stageFor(s.insanity)], true); }
    else v.show(false);
    this.hemi = 0;
    g.lights.hemi.intensity = 0;
    g.lights.moonBase = 0;
    this['setup' + n]?.();
  }

  markTaken(o, taken) { if (!o) return; o.visible = !taken; }

  // advance to the next chapter without reloading (same level)
  async advance(n, opts = {}) {
    const g = this.g, s = this.s;
    s.chapter = n;
    s.insanity = Math.max(s.insanity, CHAPTERS2[n].floor * 0.6);
    g.applyInsanity(0);
    g.save.data.unlockedChapter = Math.max(g.save.data.unlockedChapter, n);
    g.save.write();
    const tk = ++this.token;
    await this['begin' + n]({ ...opts, tk, inPlace: true });
  }

  card(n, seconds = 4) { this.g.ui.chapterCard(ROMAN2[n], CHAPTERS2[n].title, CHAPTERS2[n].sub, seconds); }

  // start gameplay after a chapter's intro
  play() {
    const g = this.g;
    g.mode = 'play';
    g.ui.showHUD(true);
    g.ui.setLetterbox(false);
    if (!g.input.locked && !g.paused && !g.ui.overlayOpen) g.input.lock();
  }

  // ================================================================ per-frame
  update(dt, inCutscene = false) {
    const g = this.g, s = this.s, p = g.player;
    // frost / breath vapour in cold rooms
    const z = g.zone;
    const frostT = z && FROSTY.has(z.id) ? 1 : z && BASEMENT.has(z.id) ? 0.35 : 0;
    this.frost = damp(this.frost, frostT, 0.8, dt);
    SHARED.uFrost.value = this.frost;
    if (this.frost > 0.5 && g.mode === 'play') {
      this.timers.breath = (this.timers.breath || 0) - dt;
      if (this.timers.breath <= 0) {
        this.timers.breath = p.sprinting ? 0.9 : 2.4;
        const f = p.lookDir;
        g.particles.burst(p.eyePos.addScaledVector(f, 0.25).add(new THREE.Vector3(0, -0.08, 0)), 'breath', p.sprinting ? 14 : 8);
      }
    }
    this.updateCab?.(dt);
    if (inCutscene) return;
    s.flags.chapterTime = (s.flags.chapterTime || 0) + dt;
    this['update' + s.chapter]?.(dt);
    // surviving an early transformation
    if (g.chase.active && s.transformed && !s.flags.finale) {
      this.chaseT += dt;
      const far = g.monster.position.distanceTo(p.pos) > 8 || p.hidden;
      if ((g.chase.lostTime > 12 && far) || this.chaseT > 75) this.revert();
    }
    if (g.chase.active && p.hidden) {
      g.audio.setMuffle(true);
      const d = g.monster.position.distanceTo(p.pos);
      if (d < 3 && !this._closeWarn) { this._closeWarn = true; g.audio.sfx.play('monsterBreath', { position: g.monster.headWorld(), volume: 1.4 }); }
      if (d > 5) this._closeWarn = false;
    }
  }

  // ================================================================ zones & environment
  onZone(z, prev) {
    const g = this.g;
    const outdoor = z.outdoor;
    g.particles.rain = outdoor && !this.s.flags.dawn ? 1 : 0;
    SHARED.uRain.value = outdoor && !this.s.flags.dawn ? 1 : 0.35;
    SHARED.uWet.value = this.s.flags.dawn ? 0.5 : 1;
    g.particles.dustAmount = outdoor ? 0.2 : BASEMENT.has(z.id) ? 0.7 : 1;
    this.ambienceFor(z);
    this['zone' + this.s.chapter]?.(z, prev);
  }

  ambienceFor(z) {
    const id = z.id, s = this.s, f = s.flags;
    const spec = {};
    const raining = !f.dawn;
    if (z.outdoor && raining) spec.rain = 0.9;
    if (id === 'road') { spec.engine = 0.5; if (raining) spec.roofRain = 0.25; }
    if (this.L?.name === 'apartment') { if (raining) spec.rain = z.id === 'corridor' || z.id === 'stairs' ? 0.15 : 0.35; spec.room = 0.4; }
    if (['lobby', 'offices', 'manager', 'breakroom', 'security'].includes(id)) { if (raining) spec.roofRain = 0.35; if (f.powerFront) spec.fluoro = 0.25; }
    if (id === 'prodhall') spec.fluoro = 0.35;
    if (id === 'printlab' || id === 'control') { if (!f.printersOff) spec.printer = 0.5; spec.machine = 0.25; }
    if (['warehouse', 'dispatch'].includes(id)) { if (raining) spec.roofRain = 0.6; spec.wind = 0.2; if (this.sorterRunning) spec.conveyor = 0.6; }
    if (id === 'elevator') spec.machine = 0.3;
    if (FROSTY.has(id)) { spec.freezer = 0.55; spec.drips = 0.3; }
    if (id === 'lab' || id === 'vera') spec.drips = 0.2;
    if (id === 'tunnel') { spec.drips = 0.5; spec.wind = 0.25; }
    if (id === 'core') { spec.machine = 0.45; spec.printer = 0.25; }
    this.setLoops(spec);
  }

  surfaceAt(p) {
    const L = this.L;
    const s = L?.surface ? L.surface(p, this.g.zone) : 'concrete';
    if (s === 'asphalt' && !this.s.flags.dawn && Math.random() < 0.35) return 'puddle';
    return s;
  }
  heightAt(x, z, layer) { return this.L?.heightAt ? this.L.heightAt(x, z, layer) : layer === -1 ? -8 : 0; }
  ceilingAt() { const z = this.g.zone; return z ? z.max.y - z.floorY : 3; }

  onNoise(pos, k) {
    const g = this.g;
    g.chase.hear(pos, 8 + k * 10, k > 0.6);
  }
  onNV(on) { if (on && !this.s.flags.nvTip) { this.s.flags.nvTip = true; this.g.ui.toast('Night vision shows what the eye can’t.', 3); } }

  // ================================================================ talking
  talkOverride() {
    const g = this.g;
    if (this.falsityMode) {
      const f = this.R.falsity;
      if (f && g.player.pos.distanceTo(f.pos) < 3.2) return true;
      this.falsityMode = false;
    }
    return this['talk' + this.s.chapter]?.() ?? null;
  }

  // alternative speakers (F-01); return null to let Verity answer
  respond(text) {
    if (this.falsityMode) {
      const a = falsityAnswer(text, { valves: this.s.flags.valves, name: this.g.brain.memory.name });
      this.s.flags.askedFalsity = (this.s.flags.askedFalsity || 0) + 1;
      if (a.topic === 'valves') this.s.flags.falsityValves = true;
      return { text: a.text, delta: 0, flags: {}, rude: false, kind: false, who: 'falsity', name: 'F-01', position: this.R.falsity?.pos };
    }
    return null;
  }
  voiceOpts(res) { return this['voice' + this.s.chapter]?.(res) || null; }
  onCloseChat() { if (this.falsityMode) this.falsityMode = false; }

  brainCtx() {
    const f = this.s.flags;
    const g = this.g;
    return {
      atCore: g.zone?.id === 'core' && !!f.coreIntro,
      releaseReady: this.s.tapes.length >= 5 && !!f.askedVera && this.s.insanity < 50,
      safeCode: SAFE_CODE,
      route: routeText(f.route || ['L', 'R', 'L']),
      valves: valveText(f.valves || [1, 2, 3]),
      breakerHint: 'The lift needs forty-five. The board holds a hundred.',
      tv: !!f.tvVerity && this.s.chapter === 0,
    };
  }
  routeText() { return routeText(this.s.flags.route || ['L', 'R', 'L']); }
  valveText() { return valveText(this.s.flags.valves || [1, 2, 3]); }

  onBeforeAnswer(res) { if (res.flags?.askedVera) this.s.flags.askedVera = true; }

  onAsk(res) {
    const g = this.g, s = this.s;
    if (res.flags?.askedVera) { s.flags.askedVera = true; g.save.data.askedVera = true; }
    if (res.flags?.promise) s.flags.promised = true;
    this['ask' + s.chapter]?.(res);
    if (res.flags?.boxCommand && s.transformed && !s.flags.finale) this.revert(true);
  }

  onStage(stage) {
    if (stage >= 4 && this.s.chapter >= 1 && !this.s.flags.stage4Warn) {
      this.s.flags.stage4Warn = true;
      this.g.ui.toast('Verity is getting angry. Be kind — or be ready to run.', 4);
    }
  }

  insanityCap() { return this.s.chapter === 0 ? 60 : 100; }
  canTransform() {
    const g = this.g;
    return this.s.chapter >= 1 && !g.chase.active && g.mode === 'play' && !this.s.flags.noTransform && g.level?.name === 'factory';
  }

  // ================================================================ collectibles
  collect(kind, id, obj) {
    const g = this.g, s = this.s;
    if (kind === 'tape') {
      const first = !s.tapes.includes(id);
      if (first) { s.tapes.push(id); g.save.addUnique('tapes', id); }
      this.playTape(id);
      if (first) g.ui.toast(`Tape ${s.tapes.length}/5`, 2.5);
      return;
    }
    if (kind === 'doc') {
      const d = DOCS[id];
      if (!d) return;
      if (!s.docs.includes(id)) { s.docs.push(id); g.save.addUnique('docs', id); }
      const style = id === 'd9' ? 'crayon' : id === 'd3' || id === 'd4' ? 'crt' : id === 'd5' || id === 'd8' ? 'memo' : 'paper';
      g.audio.sfx.play('paper');
      g.showNote(d.title, d.text, () => this.afterDoc?.(id), { style });
      return;
    }
    if (kind === 'figure') {
      if (s.figures.includes(id)) return;
      s.figures.push(id);
      g.save.addUnique('figures', id);
      if (obj) obj.visible = false;
      g.audio.sfx.play('pickup');
      g.audio.sfx.play('giggle', { volume: 0.25, delay: 0.3 });
      g.ui.toast(`A little Verity. ${s.figures.length}/12`, 2.5);
    }
  }

  afterDoc(id) { this['doc_' + id]?.(); }

  async playTape(id, fromJournal = false) {
    const g = this.g, t = TAPES2[id];
    if (!t || this._tape) return;
    this._tape = true;
    g.audio.sfx.play('tape', { volume: 0.8 });
    g.audio.music.duck?.(0.4);
    await g.sleep(0.8);
    for (const line of t.lines) {
      if (!this._tape) break;
      await g.speak('ruth', line, { label: t.title });
      await g.sleep(0.4);
    }
    g.audio.sfx.play('tapeClick', { volume: 0.7 });
    this._tape = false;
    if (!fromJournal) this['tape_' + id]?.();
  }

  // ================================================================ hiding
  async hide(spot) {
    const g = this.g, p = g.player;
    if (p.hidden) return;
    if (spot.door) spot.door.target = 1;
    g.audio.sfx.play(spot.kind === 'box' ? 'box' : 'locker', { position: spot.inside, volume: 0.6 });
    await g.ui.fade(0.85, 0.2);
    p.hide(spot);
    if (spot.door) spot.door.target = 0;
    g.ui.fade(0, 0.25);
    if (!this.s.flags.hideTip) { this.s.flags.hideTip = true; g.ui.toast('Hold SPACE to hold your breath · E to leave', 3.5); }
    g.chase.suspicion = 0;
    this.pipelineHideLook(true);
  }
  async unhide() {
    const g = this.g, p = g.player;
    const spot = p.hidden;
    if (!spot) return;
    if (spot.door) spot.door.target = 1;
    g.audio.sfx.play(spot.kind === 'box' ? 'box' : 'locker', { position: spot.inside, volume: 0.4 });
    await g.sleep(0.2);
    p.unhide();
    g.audio.setMuffle(false);
    this.pipelineHideLook(false);
    if (spot.door) setTimeout(() => { spot.door.target = 0; }, 600);
  }
  pipelineHideLook(on) { this.fogMul = on ? 1.4 : 1; }
  onMonsterNearHiding(d) {
    const g = this.g;
    if (d < 1.6 && !this._peek) {
      this._peek = true;
      g.audio.sfx.play('monsterBreath', { position: g.monster.headWorld(), volume: 1.6 });
      g.player.shake = 0.3;
      setTimeout(() => { this._peek = false; }, 5000);
    }
  }
  onSpotted() {
    const g = this.g;
    g.audio.sfx.play('stinger', { volume: 0.8 });
    g.audio.music.setMood('chase', 0.3);
    if (!this.s.flags.spottedTip) { this.s.flags.spottedTip = true; g.ui.toast('RUN. Break line of sight, then hide.', 3); }
  }
  monsterDoors(pos) {
    // it rips through closed doors in its way
    const L = this.L;
    if (!L) return;
    for (const d of Object.values(L.doors)) {
      if (d.target > 0.5 || d.locked || d.kind === 'roller') continue;
      const w = d.worldPos();
      if (Math.hypot(w.x - pos.x, w.z - pos.z) < 1.2 && Math.abs(w.y - 1.1 - pos.y) < 2) d.set(1, this.g, { speed: 5 });
    }
  }

  // ================================================================ the transformation
  async transform({ finale = false } = {}) {
    const g = this.g, v = g.verity, m = g.monster, s = this.s, tk = this.token;
    if (s.transformed) return;
    finale = finale || s.chapter >= 5;
    s.transformed = true;
    s.transformations++;
    g.setInsanity(100);
    g.closeChat();
    const prevObjective = [s.objective, g.ui.objectiveText];
    this._prevObjective = prevObjective;
    g.setObjective(null);
    g.audio.music.setMood('silence', 0.5);
    if (g.player.hidden) g.player.unhide();
    const L = this.L;
    let spawn;
    await g.director.play(async (d) => {
      const cam = g.camera;
      const f = g.player.forward;
      v.setMode('hold');
      const target = cam.position.clone().addScaledVector(f, 1.3);
      target.y = g.player.pos.y + 1.5;
      resolveCircle(target, 0.35, L.near(target.x, target.z, g.player.layer));
      const from = v.position.clone();
      d.tween(0.8, (k) => v.position.lerpVectors(from, target, k));
      await d.track(() => v.position, 0.9, 8);
      g.flickerZone(4);
      g.audio.sfx.play('glitch', { position: target, volume: 1, dur: 1.2 });
      ['annoyed', 'laugh', 'wail', 'grin', 'wail', 'grin'].forEach((e, i) => setTimeout(() => v.face.set(e, true), i * 180));
      v.face.glitch = 1;
      d.tween(2.2, (k) => { v.face.cracks = 0.6 + k * 0.4; v.position.x = target.x + (Math.random() - 0.5) * 0.03 * k; v.position.y = target.y + (Math.random() - 0.5) * 0.03 * k; }, ease.linear);
      for (let i = 0; i < 6; i++) g.audio.sfx.play('crack', { position: target, delay: i * 0.3, volume: 0.9 });
      await d.wait(1.2);
      await d.say('verity', finale ? 'NOBODY GETS OUT TWICE.' : 'YOU SHOULDN’T HAVE SAID THAT.', { stage: 6, after: 0 });
      g.audio.sfx.play('squelch', { position: target, volume: 1.4 });
      g.ui.flash(0.9, 500);
      const zone = g.zone;
      if (zone) g.lights.setZonePower(zone, 0);
      v.show(false);
      spawn = new THREE.Vector3(target.x, g.player.pos.y, target.z);
      resolveCircle(spawn, 0.45, L.near(spawn.x, spawn.z, g.player.layer));
      m.position.copy(spawn);
      m.root.rotation.y = Math.atan2(cam.position.x - spawn.x, cam.position.z - spawn.z);
      m.unfold = 0;
      m.mode = 'idle';
      m.speed = 0;
      m.show(true);
      await d.wait(0.5);
      if (zone) g.lights.setZonePower(zone, 1);
      g.flickerZone(3);
      g.audio.sfx.play('growl', { position: spawn.clone().setY(spawn.y + 1.5), volume: 1.5, dur: 2.5 });
      for (let i = 0; i < 8; i++) g.audio.sfx.play('bones', { position: spawn.clone().setY(spawn.y + 1), delay: i * 0.25, volume: 1 });
      d.tween(2.4, (k) => { m.unfold = k; }, ease.inOutCubic);
      const back = d.camPos.clone().addScaledVector(f, -0.5);
      await d.camTo(back, () => m.headWorld(), 2.6, ease.inOutSine);
      g.audio.sfx.play('stinger', { volume: 1 });
      g.audio.sfx.play('jumpscare', { volume: 0.55 });
      d.shake = 1.2;
      m.mode = 'reach';
      await d.track(() => m.headWorld(), 0.9, 10);
      m.mode = 'walk';
    }, { skippable: false });
    if (tk !== this.token) return;
    m.unfold = 1;
    const cam = g.camera;
    const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    g.player.setPose(g.player.pos.x, g.player.pos.z, Math.atan2(-fw.x, -fw.z), 0, null, g.player.layer);
    g.mode = 'play';
    g.audio.music.setMood('chase', 0.3);
    g.chase.start(m.position.clone(), m.root.rotation.y, { delay: s.hard ? 1.2 : 1.8, mode: 'chase', layer: g.player.layer });
    g.player.toggleFlashlight(true);
    this.chaseT = 0;
    if (finale) await this.finaleChase();
    else g.setObjective('escape', 'RUN. HIDE.');
  }

  async revert(byCommand = false) {
    const g = this.g, v = g.verity, m = g.monster, s = this.s, tk = this.token;
    if (!s.transformed || s.flags.finale) return;
    s.transformed = false;
    g.chase.stop();
    const zone = g.zone;
    if (zone) g.lights.setZonePower(zone, 0);
    g.audio.music.setMood('silence', 0.3);
    g.audio.sfx.play('whoosh', { volume: 0.8 });
    await g.sleep(1.6);
    if (tk !== this.token) return;
    m.show(false);
    if (zone) g.lights.setZonePower(zone, 1);
    const p = g.player;
    const f = p.forward;
    v.show(true);
    v.setMode('follow');
    v.position.set(p.pos.x + f.x * 0.9, p.pos.y + 1.5, p.pos.z + f.z * 0.9);
    g.setInsanity(Math.min(80, 55 + s.transformations * 8));
    v.face.cracks = 0;
    v.face.set('wail', true);
    this.restoreMusic();
    if (byCommand) await g.speak('verity', 'Don’t. Ever. Say that. Again.');
    else await g.speak('verity', 'I’m sorry. I’m so sorry. That wasn’t me. That was the other me. I would never hurt you. You know that, right?');
    v.face.set(EXPRESSIONS[stageFor(s.insanity)]);
    const po = this._prevObjective;
    if (po) g.setObjective(po[0], po[1]);
  }

  restoreMusic() { this['music' + this.s.chapter]?.() ?? this.g.audio.music.setMood('uneasy'); }

  // ================================================================ death
  async caught(reason) {
    const g = this.g, m = g.monster, tk = this.token;
    if (g.mode !== 'play') return;
    if (this.s.flags.finale && reason !== 'seconds') return this.endingShipped();
    g.mode = 'dead';
    g.chase.stop();
    g.seconds.stopAll();
    g.closeChat();
    g.audio.voice.stop();
    g.ui.setObjective(null);
    this.s.deaths++;
    const p = g.player;
    if (p.hidden) { if (p.hidden.door) p.hidden.door.target = 1; }
    await g.director.play(async (d) => {
      const cam = g.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
      if (reason === 'seconds') {
        const sc = g.seconds.list.reduce((a, b) => (!a || b.pos.distanceTo(p.pos) < a.pos.distanceTo(p.pos) ? b : a), null);
        g.audio.sfx.play('jumpscare', { volume: 1 });
        g.ui.hurt(true);
        d.shake = 1.4;
        if (sc) {
          sc.grp.position.set(cam.position.x + f.x * 0.45, cam.position.y - 0.05, cam.position.z + f.z * 0.45);
          sc.grp.rotation.y = Math.atan2(-f.x, -f.z);
          sc.face.set('grin', true);
          await d.camTo(cam.position.clone(), sc.grp.position.clone(), 0.1, ease.outCubic);
        }
        g.audio.sfx.play('skitter', { volume: 1.2 });
        await d.wait(0.9);
        g.ui.fade(1, 0.05);
        await d.wait(1.0);
        return;
      }
      m.show(true);
      m.unfold = 1;
      m.mode = 'lunge';
      m.speed = 0;
      m.root.rotation.y = Math.atan2(-f.x, -f.z);
      m.position.set(cam.position.x, p.pos.y, cam.position.z);
      m.update(0.016);
      m.root.updateMatrixWorld(true);
      const hw = m.headWorld();
      const reach = -((hw.x - m.position.x) * f.x + (hw.z - m.position.z) * f.z);
      const drop = hw.y - cam.position.y + 0.05;
      m.position.y = p.pos.y - drop;
      const setDist = (dd) => { m.position.x = cam.position.x + f.x * (dd + reach); m.position.z = cam.position.z + f.z * (dd + reach); };
      setDist(1.1);
      g.audio.sfx.play('jumpscare', { volume: 1 });
      g.ui.hurt(true);
      g.ui.flash(0.5, 200);
      d.shake = 1.6;
      g.post.redBoost = 0.6;
      const faceAt = () => m.headWorld().add(new THREE.Vector3(0, 0.02, 0));
      await d.camTo(cam.position.clone(), faceAt(), 0.12, ease.outCubic);
      d.tween(0.45, (k) => setDist(1.1 - k * 0.82), ease.inCubic);
      await d.track(faceAt, 0.9, 25);
      g.ui.fade(1, 0.05);
      await d.wait(1.2);
    }, { skippable: false, letterbox: false });
    g.ui.hurt(false);
    g.post.redBoost = 0;
    m.show(false);
    g.audio.music.setMood('silence', 0.5);
    this.stopLoops();
    if (tk !== this.token) return;
    g.mode = 'dead';
    g.input.unlock();
    g.menus.show('gameover', { reason });
  }

  secondsHit() { if (this.g.mode === 'play') this.caught('seconds'); }

  // ================================================================ menu background
  async setupMenu() {
    const g = this.g;
    await g.loadLevel('apartment');
    this.token++;
    const L = this.L;
    this.setup0({ menu: true });
    L.refs.tvScreen.state.phase = 'static';
    g.verity.show(false);
    g.player.setPose(-2.4, 4.2, Math.PI, 0);
    this.menuT = 0;
    g.director.controlsCamera = false;
    this.onZone(L.zones.get('living'), null);
    this.setLoops({ rain: 0.3, room: 0.3 });
    g.setGrade('title', 0);
  }
  menuUpdate(dt) {
    const g = this.g;
    if (this.L?.name !== 'apartment') return;
    this.menuT += dt;
    const t = this.menuT;
    const cam = g.camera;
    cam.position.set(-3.6 + Math.sin(t * 0.05) * 0.4, 1.35 + Math.sin(t * 0.3) * 0.02, 3.3 + Math.sin(t * 0.07) * 0.25);
    cam.lookAt(-1.9 + Math.sin(t * 0.11) * 0.3, 0.9, 7.2);
    g.player.pos.set(cam.position.x, 0, cam.position.z);
    if (Math.random() < dt * 0.04) g.lightning(0.6);
  }
}

Object.assign(StoryII.prototype, Prologue, Front, Back, Finale);
void rand; void clamp;
