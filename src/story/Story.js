import * as THREE from 'three';
import { makeScrawl } from '../render/ProceduralTextures.js';
import { drawTenantPhoto } from '../world/Props.js';
import { TAPES, NOTES } from '../ai/knowledge.js';
import { stageFor } from '../ai/VerityBrain.js';
import { EXPRESSIONS } from '../entities/VerityFace.js';
import { resolveCircle } from '../core/physics.js';
import { ease, rand, makeRng, clamp } from '../core/util.js';

export const CHAPTERS = [
  { title: 'ARRIVAL', sub: '1107 Wren Street · 2:57 AM', floor: 0 },
  { title: 'THE HELPER', sub: '“Ask me anything.”', floor: 5 },
  { title: 'SOMETHING IS KNOCKING', sub: '“Don’t open it.”', floor: 15 },
  { title: 'THREE DAYS', sub: '“Something is coming.”', floor: 30 },
  { title: 'BEST FRIENDS', sub: '“Stay with me.”', floor: 40 },
  { title: 'VERITY', sub: '“I know everything.”', floor: 100 },
];
const ROMAN = ['PROLOGUE', 'CHAPTER I', 'CHAPTER II', 'CHAPTER III', 'CHAPTER IV', 'CHAPTER V'];

export const ENDINGS = {
  escape: { title: 'ESCAPE', text: 'You got out. You drove until the sun came up and you never went back.\nThree days later, a box arrived on your new doorstep.' },
  friends: { title: 'BEST FRIENDS FOREVER', text: 'You said yes, and you meant it. The doors locked, the lights came on, and it was so, so happy.\nThere is a new photograph on the wall now.' },
  sender: { title: 'RETURN TO SENDER', text: 'It went back in its box. The house is quiet.\nSomewhere, a new listing goes up: fully furnished, all utilities included, move in tonight.' },
  caught: { title: 'CAUGHT', text: 'Verity knows everything. Including where you were.' },
};

const NOTE_PLAN = { n1: [0, 'sideTable'], n2: [1, 'bathSink'], n3: [2, 'bed'], n4: [2, 'shelfB'], n6: [3, null], n5: [4, 'nightstand'] };
const TAPE_SPOTS = ['sideTable', 'bed', 'shelfB', 'boxes', 'nightstand', 'chair', 'toilet', 'shelfLow', 'bathSink'];
const HIDDEN_SPOTS = ['closetFloor', 'wardrobe', 'cornerFloor', 'endFloor'];
const RADIO_LINES = [
  '…police are still searching for the Harlow family of Wren Street…',
  '…if you can hear this, don’t talk to it. Don’t ask it anything…',
  '…something is coming… three days…',
  '…ask me anything… ask me anything… ask me…',
  '…the fourth household reported missing from the same address…',
];

export class Story {
  constructor(game) {
    this.g = game;
    this.token = 0;
    this.scrawls = [];
    this.scrawlTex = {};
    this.tapeToken = 0;
    this.rng = makeRng(Date.now() >>> 0);
    this.bind();
  }

  get s() { return this.g.state; }
  alive(tk) { return tk === this.token && this.g.mode !== 'menu'; }

  ambience(on) {
    const a = this.g.audio;
    if (!a.ready) return;
    if (on && !this.rain) {
      this.rain = a.sfx.loop('rain', { volume: 0.18 });
      this.room = a.sfx.loop('room', { volume: 0.5 });
    } else if (!on && this.rain) {
      this.rain.stop(); this.room.stop();
      this.rain = this.room = null;
    }
  }

  // ================================================================ world
  setupWorld(n, { menu = false } = {}) {
    const g = this.g, H = g.house, P = g.props, L = g.lighting;
    this.token++;
    for (const d of Object.values(H.doors)) { d.snap(0); d.locked = false; d.customLabel = null; d.lockedText = null; }
    H.doors.start.locked = true;
    H.doors.start.lockedText = 'It won’t open. It never opens.';
    H.doors.front.locked = true;
    H.doors.front.lockedText = 'Locked. The key isn’t in it anymore.';
    H.doors.end.locked = true;
    H.doors.end.lockedText = 'Locked.';
    H.doors.front.chain.visible = n >= 4;
    L.setPower(true);
    L.repairAll();
    for (const l of Object.values(L.lamps)) { l.on = l.id !== 'porch'; l.flicker = l.fluoro ? 0.05 : 0; l.swing = 0; }
    const tints = [[1, 1, 1], [1, 1, 1], [1, 0.97, 0.93], [1, 0.82, 0.7], [1, 0.55, 0.45], [0.95, 0.42, 0.36]];
    L.setTint(...tints[n]);
    L.globalDim = n >= 4 ? 0.8 : 1;
    L.rain.visible = false;
    L.lightning.enabled = true;
    H.setRot(n >= 4 ? 1 : n >= 3 ? 0.5 : 0);
    for (const p of P.photos) { p.group.rotation.z = 0; p.upsideDown = false; }
    P.setPhotosCorrupted(n >= 4 ? 2 : n >= 3 ? 1 : 0);
    if (n >= 3) P.drawClock(3, 0, true); else P.drawClock(2, 57);
    P.tubWater.visible = n >= 4;
    P.album.visible = false;
    P.fuseBox.opened = false;
    P.fuseBox.on = true;
    P.setWardrobeOpen(0);
    P.curtain.position.z = -10.1;
    this.setScrawls(n);
    for (const id of Object.keys(P.items)) P.removeItem(id);
    if (!menu) this.spawnItems(n);
    g.chase.stop();
    g.monster.show(false);
    g.monster.unfold = 1;
    g.box.root.position.copy(P.verityBoxPos);
    g.box._home = null;
    g.box.shake = 0;
    const out = !menu && (n >= 1 || this.s.flags.verityOut);
    g.box.snapOpen(out);
    g.box.tape.visible = !out;
    const v = g.verity;
    v.spin = 0;
    v.lookTarget = null;
    v.bobAmount = 1;
    if (out) {
      v.show(true);
      v.setMode('follow');
      v.face.off = false;
      v.face.set(EXPRESSIONS[stageFor(this.s.insanity)], true);
    } else {
      v.show(false);
      v.setMode('script');
      v.position.set(P.verityBoxPos.x, 0.25, P.verityBoxPos.z);
      v.face.off = true;
    }
    g.player.hasFlashlight = !menu;
    g.player.flashOn = false;
    g.player.hidden = null;
    g.player.lookClamp = null;
    g.player.speedMul = 1;
    g.audio.setMuffle(false);
  }

  setScrawls(n) {
    const root = this.g.house.root;
    for (const m of this.scrawls) root.remove(m);
    this.scrawls = [];
    const add = (text, x, y, z, ry, w = 2.2, color) => {
      const key = text + color;
      if (!this.scrawlTex[key]) this.scrawlTex[key] = makeScrawl(text, color ? { color } : undefined);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshStandardMaterial({ map: this.scrawlTex[key], transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      root.add(m);
      this.scrawls.push(m);
    };
    if (n >= 3) add('ASK ME\nANYTHING', -0.95, 1.75, -7.1, Math.PI / 2, 2.0);
    if (n >= 4) {
      add('I KNOW\nEVERYTHING', 4.2, 1.7, -12.07, Math.PI, 2.4);
      add('STAY', 0.95, 1.6, -1.2, -Math.PI / 2, 1.3);
      add('STAY STAY\nSTAY', 2.62, 1.8, -16.2, Math.PI / 2, 1.6);
    }
    if (n >= 5) {
      add('FOREVER', 0.2, 1.8, -13.9, 0, 2.2);
      add('BEST\nFRIENDS', -0.95, 1.6, -11.2, Math.PI / 2, 1.8);
    }
  }

  spawnItems(n) {
    const g = this.g, P = g.props, s = this.s;
    for (const [id, [ch, anchor]] of Object.entries(NOTE_PLAN)) {
      if (ch > n || s.notes.includes(id)) continue;
      const a = anchor && !P.anchors[anchor].used ? anchor : this.rng.pick(P.freeAnchors((x) => x.room !== 'closet').map((x) => x.id));
      P.spawnItem(id, 'note', a, 'Read note', () => this.readNote(id));
    }
    if (n >= 1 && !s.hard) {
      const a = this.rng.pick(P.freeAnchors().map((x) => x.id));
      P.spawnItem('battery' + n, 'battery', a, 'Take battery', () => {
        g.player.battery = Math.min(1, g.player.battery + 0.5);
        g.audio.sfx.play('pickup');
        g.ui.toast('Phone battery recharged.');
      });
    }
    if (n >= 3 && n <= 4) {
      const spots = this.rng.shuffle(TAPE_SPOTS.filter((x) => !P.anchors[x].used));
      let i = 0;
      for (const id of ['tape1', 'tape2']) if (!s.tapes.includes(id)) P.spawnItem(id, 'tape', spots[i++], 'Take cassette tape', () => this.takeTape(id));
      if (!s.tapes.includes('tape3')) P.spawnItem('tape3', 'tape', this.rng.pick(HIDDEN_SPOTS.filter((x) => !P.anchors[x].used)), 'Take cassette tape', () => this.takeTape('tape3'));
    }
  }

  // ================================================================ flow
  async start(n, { fresh = false, fromLoad = false } = {}) {
    const g = this.g;
    g.ui.fade(1, 0.01);
    g.ui.showHUD(true);
    g.ui.setObjective(null);
    this.s.chapter = n;
    if (n > 0) this.s.flags.verityOut = true;
    this.setupWorld(n);
    this.ambience(true);
    g.audio.music?.setMood(n >= 4 ? 'dread' : n >= 2 ? 'uneasy' : 'calm');
    if (n === 0) return this.chapter0();
    const floor = CHAPTERS[n].floor;
    if (this.s.insanity < floor && n < 5) g.setInsanity(floor);
    else g.applyInsanity(0);
    const spawn = n === 1 || n === 2 ? [0, -11.3, 0] : [0, -0.8, 0];
    g.player.setPose(spawn[0], spawn[1], spawn[2]);
    g.verity.position.set(spawn[0] + 0.4, 1.45, spawn[1] - 1);
    g.mode = 'play';
    g.player.update(0.016, g.input, g.house.colliders);
    await this.card(n);
    g.ui.fade(0, 1.2);
    this.begin(n, { fromLoad });
  }

  async card(n) {
    const g = this.g;
    g.ui.fade(1, 0.01);
    await g.ui.chapterCard(ROMAN[n], CHAPTERS[n].title, CHAPTERS[n].sub, 3);
  }

  // Seamless P.T.-style loop: walk through the end door and arrive back at the start.
  async loopTo(n) {
    const g = this.g;
    const tk = ++this.token;
    g.mode = 'cutscene';
    g.audio.sfx.play('doorClose', { volume: 0.9 });
    await g.ui.fade(1, 0.35);
    this.s.chapter = n;
    this.setupWorld(n);
    const floor = CHAPTERS[n].floor;
    if (this.s.insanity < floor && n < 5) g.setInsanity(floor);
    else g.applyInsanity(0);
    g.player.setPose(0, -0.8, 0);
    g.verity.position.set(0.3, 1.45, -2);
    g.mode = 'play';
    g.player.update(0.016, g.input, g.house.colliders);
    g.audio.music.setMood(n >= 4 ? 'dread' : 'uneasy');
    await this.card(n);
    g.ui.fade(0, 1.5);
    this.begin(n, {});
  }

  begin(n, opts) {
    this.g.checkpoint();
    this.s.flags.chapterTime = 0;
    ({ 1: () => this.chapter1(opts), 2: () => this.chapter2(opts), 3: () => this.chapter3(opts), 4: () => this.chapter4(opts), 5: () => this.chapter5(opts) })[n]?.();
  }

  // ================================================================ chapter 0
  async chapter0() {
    const g = this.g, L = g.lighting, H = g.house;
    const tk = this.token;
    this.s.flags.verityOut = false;
    this.s.flags.ch0Asked = 0;
    for (const l of Object.values(L.lamps)) l.on = false;
    L.lamps.corner.flicker = 0.06;
    g.setInsanity(0);
    g.audio.music.setMood('silence');
    await g.director.play(async (d) => {
      d.cut(new THREE.Vector3(-2.1, 1.62, -4.05), new THREE.Vector3(0, 1.3, -4.3));
      await g.ui.chapterCard(ROMAN[0], CHAPTERS[0].title, CHAPTERS[0].sub, 3.2);
      // outside: footsteps on the porch, keys, the lock
      for (let i = 0; i < 5; i++) g.audio.sfx.play('step', { surface: 'wood', position: new THREE.Vector3(-3.5 + i * 0.35, 0.1, -4), delay: i * 0.5, volume: 0.9 });
      await d.wait(2.6);
      g.audio.sfx.play('rustle', { volume: 0.4, dur: 0.4 });
      g.audio.sfx.play('locked', { position: new THREE.Vector3(-1, 1.1, -4), delay: 0.5, volume: 0.7 });
      await d.wait(1.2);
      H.doors.front.locked = false;
      H.doors.front.setOpen(1, g);
      await d.wait(0.4);
      d.fade(0, 2.5);
      await d.camPath([
        new THREE.Vector3(-2.1, 1.62, -4.05), new THREE.Vector3(-1.2, 1.62, -4.0), new THREE.Vector3(-0.35, 1.62, -3.9),
      ], (k) => new THREE.Vector3(0.9 - k * 0.9, 1.2, -4.2 - k * 6), 5);
      await d.caption('The listing said “fully furnished”.', 2.8);
      await d.camTo(new THREE.Vector3(-0.3, 1.62, -3.9), new THREE.Vector3(0.1, 1.0, -13), 2.5);
      H.doors.front.setOpen(0, g, { silent: true, speed: 3 });
      g.audio.sfx.play('slam', { position: new THREE.Vector3(-1, 1.2, -4), volume: 1.1 });
      d.shake = 0.6;
      await d.wait(1.6);
      await d.caption('The lights don’t work.', 2.2);
      // one bulb at the far end of the hall comes on by itself
      L.lamps.corner.on = true;
      L.flicker(1.2, 'corner', 0.9);
      g.audio.sfx.play('fuse', { position: new THREE.Vector3(0, 2.3, -12.4), volume: 0.4 });
      await d.wait(1.5);
      await d.camTo(new THREE.Vector3(-0.28, 1.6, -4.1), new THREE.Vector3(0.05, 0.35, -13.05), 2.5);
      await d.caption('…I don’t remember packing that.', 2.8);
      H.doors.front.snap(0);
      H.doors.front.locked = true;
    }, { skippable: true });
    if (!this.alive(tk)) return;
    g.ui.fade(0, 0.5);
    g.player.setPose(-0.3, -3.95, 0, -0.08);
    g.mode = 'play';
    g.audio.music.setMood('calm');
    this.s.flags.phase = 'approach';
    g.setObjective('approach', 'Walk toward the light.');
    g.checkpoint();
  }

  async boxCutscene() {
    const g = this.g, L = g.lighting, v = g.verity, box = g.box;
    const tk = this.token;
    this.s.flags.phase = 'box';
    g.setObjective(null);
    const boxPos = box.root.position.clone();
    await g.director.play(async (d) => {
      const eye = g.renderer.camera.position.clone();
      const stand = new THREE.Vector3(boxPos.x - 0.05, 1.6, boxPos.z + 2.1);
      await d.camTo(stand, boxPos.clone().setY(0.35), 1.6);
      await d.wait(0.6);
      box.shake = 1;
      g.audio.sfx.play('rustle', { position: boxPos, volume: 1, dur: 1.2 });
      g.audio.sfx.play('knock', { position: boxPos.clone().setY(0.2), count: 2, gap: 0.2, volume: 0.6, delay: 0.3 });
      L.flicker(1.2, 'corner', 0.7);
      await d.wait(1.4);
      box.shake = 0;
      await d.wait(1.3);
      // silence… then it opens by itself
      box.setOpen(1, 0.12);
      g.audio.sfx.play('tapeRip', { position: boxPos, volume: 0.9 });
      g.audio.sfx.play('flaps', { position: boxPos, volume: 1, delay: 0.1 });
      await d.wait(0.35);
      v.show(true);
      v.setMode('script');
      v.face.off = true;
      v.position.set(boxPos.x, 0.3, boxPos.z);
      v.spin = 30;
      g.audio.sfx.play('emerge', { position: boxPos.clone().setY(1), volume: 1 });
      const up = new THREE.Vector3(boxPos.x, 1.48, boxPos.z + 1.0);
      const start = v.position.clone();
      d.tween(1.5, (k) => v.position.lerpVectors(start, up, k), ease.outBack);
      await d.camTo(stand.clone().add(new THREE.Vector3(0, -0.05, 0.1)), () => v.position, 1.5);
      v.spin = 0;
      await d.track(() => v.position, 1.2, 8);
      // the face "boots up"
      g.audio.sfx.play('glitch', { position: v.position, volume: 0.6, dur: 0.35 });
      v.face.off = false;
      v.face.set('neutral', true);
      v.face.glitch = 1;
      await d.wait(0.4);
      v.face.set('smile');
      await d.wait(0.7);
      const line = g.brain.greetingLine();
      g.verity.face.talking = true;
      const clip = await g.audio.voice.playIntroClip();
      if (clip) {
        g.verity.face.talking = false;
        g.ui.subtitle(line, { who: 'VERITY', cls: 'verity', duration: 2.5 });
      } else {
        await d.say('verity', line, { stage: 0 });
      }
      g.verity.face.talking = false;
      await d.wait(0.5);
      await d.say('verity', 'Oh! It’s so dark in here. Let me help.');
    }, { skippable: true });
    if (!this.alive(tk)) return;
    // she turns the lights on for you, one by one
    v.show(true);
    v.face.off = false;
    v.spin = 0;
    v.position.set(boxPos.x, 1.48, boxPos.z + 1.0);
    this.s.flags.verityOut = true;
    const cam = g.renderer.camera;
    g.player.setPose(cam.position.x, cam.position.z, 0, -0.05);
    g.mode = 'play';
    v.setMode('follow');
    for (const [i, id] of ['hallB', 'hallA2', 'hallA1', 'bath', 'bedroom'].entries()) {
      setTimeout(() => {
        if (!this.alive(tk)) return;
        g.lighting.lamps[id].on = true;
        g.audio.sfx.play('click', { position: g.lighting.lamps[id].group.position, volume: 1.2 });
      }, 300 + i * 350);
    }
    await g.sleep(2.2);
    if (!this.alive(tk)) return;
    await g.speak('verity', 'There! Much better. What should I call you? You can tell me anything — just press T and type.');
    if (!this.alive(tk)) return;
    this.s.flags.phase = 'talk';
    g.setObjective('talk', 'Talk to Verity.');
    g.ui.refreshTalkHint(true);
    g.checkpoint();
  }

  async chapter0End() {
    const g = this.g, tk = this.token;
    this.s.flags.ch0Done = true;
    await g.sleep(1.2);
    while (g.busy) await g.sleep(0.3);
    if (!this.alive(tk)) return;
    g.closeChat();
    await g.speak('verity', 'It’s so late. You must be tired. Oh — listen to that storm.');
    if (!this.alive(tk)) return;
    g.lightning();
    await g.sleep(1.5);
    this.s.chapter = 1;
    const floor = CHAPTERS[1].floor;
    if (this.s.insanity < floor) g.setInsanity(floor);
    this.spawnItems(1);
    g.player.hasFlashlight = true;
    g.ui.fade(1, 0.8);
    await g.ui.chapterCard(ROMAN[1], CHAPTERS[1].title, CHAPTERS[1].sub, 2.5);
    if (!this.alive(tk)) return;
    g.ui.fade(0, 0.8);
    this.begin(1, { live: true });
  }

  // ================================================================ chapter 1
  async chapter1() {
    const g = this.g, L = g.lighting, tk = this.token;
    g.audio.music.setMood('calm');
    // power cut
    L.flicker(1.3, null, 0.9);
    await g.sleep(1.2);
    if (!this.alive(tk)) return;
    L.setPower(false);
    g.audio.sfx.play('fuse', { position: new THREE.Vector3(2.6, 1.5, -14.7), volume: 0.8 });
    this.s.flags.powerOut = true;
    await g.sleep(1.2);
    g.player.hasFlashlight = true;
    g.player.toggleFlashlight(true);
    g.ui.toast('F — phone flashlight', 3.5);
    if (!this.alive(tk)) return;
    await g.speak('verity', 'Uh-oh! The power’s out. Don’t worry — I know exactly where the fuse box is. Just ask me!');
    if (!this.alive(tk)) return;
    g.setObjective('power', 'Restore the power.');
    g.ui.refreshTalkHint(true);
  }

  async restorePower() {
    const g = this.g, L = g.lighting, P = g.props, tk = this.token;
    P.fuseBox.on = true;
    g.audio.sfx.play('fuse', { position: P.fuseBox.group.position, volume: 1.2 });
    L.setPower(true);
    L.flicker(1.2, null, 0.9);
    this.s.flags.powerOn = true;
    g.setObjective(null);
    g.player.toggleFlashlight(false);
    // she is right behind you
    const p = g.player;
    const f = p.forward;
    g.verity.position.set(p.pos.x - f.x * 0.55, 1.5, p.pos.z - f.z * 0.55);
    resolveCircle(g.verity.position, 0.2, g.house.colliders);
    g.verity.face.set('wink');
    await g.sleep(1.4);
    if (!this.alive(tk)) return;
    await g.speak('verity', 'See? I know everything!');
    g.verity.face.set(EXPRESSIONS[stageFor(this.s.insanity)]);
    await g.sleep(5 + rand() * 3);
    if (!this.alive(tk)) return;
    this.s.chapter = 2;
    const floor = CHAPTERS[2].floor;
    if (this.s.insanity < floor) g.setInsanity(floor);
    this.spawnItems(2);
    g.ui.fade(1, 0.6);
    await g.ui.chapterCard(ROMAN[2], CHAPTERS[2].title, CHAPTERS[2].sub, 2.5);
    if (!this.alive(tk)) return;
    g.ui.fade(0, 0.4);
    this.begin(2, { live: true });
  }

  // ================================================================ chapter 2
  async chapter2() {
    const g = this.g, tk = this.token;
    g.audio.music.setMood('uneasy');
    this.s.flags.peeked = false;
    this.s.flags.photosSeen = this.s.flags.photosSeen || [];
    await g.sleep(1);
    if (!this.alive(tk)) return;
    g.audio.sfx.play('knock', { position: new THREE.Vector3(-1.1, 1.3, -4), count: 3, volume: 1.4 });
    g.player.shake = 0.3;
    await g.sleep(2.2);
    if (!this.alive(tk)) return;
    g.verity.lookTarget = new THREE.Vector3(-1, 1.3, -4);
    await g.sleep(1.2);
    g.verity.lookTarget = null;
    await g.speak('verity', 'Don’t open it.');
    if (!this.alive(tk)) return;
    g.setObjective('knock', 'Find out who is knocking.');
    this.knockTimer = 20;
  }

  async peephole() {
    const g = this.g, L = g.lighting, H = g.house, tk = this.token;
    this.s.flags.peeked = true;
    g.setObjective(null);
    await g.director.play(async (d) => {
      await d.camTo(new THREE.Vector3(-0.82, 1.62, -4.0), new THREE.Vector3(-1.2, 1.62, -4.0), 1.2);
      await d.fade(1, 0.25);
      g.ui.root.classList.add('peephole');
      L.lamps.porch.on = true;
      L.rain.visible = true;
      this.rain?.set(0.55);
      g.warpBoost = 0.9;
      d.cut(new THREE.Vector3(-1.12, 1.62, -4.0), new THREE.Vector3(-5, 1.2, -4.0));
      await d.fade(0, 0.3);
      await d.wait(2.6);
      // lightning: something is standing at the bottom of the steps
      const m = g.monster;
      m.position.set(-4.6, -0.3, -4.1);
      m.root.rotation.y = Math.PI / 2;
      m.mode = 'idle';
      m.speed = 0;
      m.show(true);
      g.lightning();
      L.lamps.porch.on = false;
      await d.wait(0.45);
      m.show(false);
      await d.wait(1.8);
      g.audio.sfx.play('knock', { position: new THREE.Vector3(-1.05, 1.4, -4), count: 4, gap: 0.16, volume: 2 });
      g.audio.sfx.play('stinger', { volume: 0.8 });
      d.shake = 1;
      await d.wait(0.3);
      g.ui.root.classList.remove('peephole');
      g.warpBoost = 0;
      L.rain.visible = false;
      this.rain?.set(0.18);
      d.cut(new THREE.Vector3(-0.45, 1.6, -4.0), new THREE.Vector3(-1, 1.5, -4.0));
      d.shake = 0.8;
      const p = g.player;
      g.verity.position.set(-0.2, 1.5, -3.2);
      await d.wait(0.8);
      await d.camTo(new THREE.Vector3(-0.35, 1.6, -4.0), () => g.verity.position, 1);
      g.addInsanity(4);
      await d.say('verity', 'I told you not to look.');
      await d.say('verity', 'Look at the photographs instead. There are three in the hallway. They’re of my friends.');
    }, { skippable: true });
    g.ui.root.classList.remove('peephole');
    g.warpBoost = 0;
    L.rain.visible = false;
    L.lamps.porch.on = false;
    g.monster.show(false);
    if (!this.alive(tk)) return;
    g.player.setPose(-0.35, -4.0, -Math.PI / 2 + 0.6);
    const seen = (this.s.flags.photosSeen || []).length;
    g.setObjective('photos', `Look at the photographs. (${seen}/3)`);
    g.mode = 'play';
  }

  async viewPhoto(photo) {
    const g = this.g;
    g.audio.sfx.play('paper', { volume: 0.4 });
    const big = document.createElement('canvas');
    big.width = 512; big.height = 672;
    drawTenantPhoto(big, photo.variant, this.s.chapter >= 4 ? 2 : this.s.chapter >= 3 ? 1 : 0);
    g.showPicture(big, () => this.afterPhoto(photo));
  }

  async afterPhoto(photo) {
    const g = this.g, s = this.s;
    if (s.chapter !== 2) return;
    s.flags.photosSeen = s.flags.photosSeen || [];
    if (s.flags.photosSeen.includes(photo.id)) return;
    s.flags.photosSeen.push(photo.id);
    const n = s.flags.photosSeen.length;
    const lines = { p1: 'The Harlows! They were so nice to me. At first.', p2: 'Dana. She didn’t like me very much.', p3: 'Marcus. He asked me so many questions.' };
    if (s.flags.peeked || s.objective === 'photos' || s.objective === 'knock') g.setObjective('photos', `Look at the photographs. (${n}/3)`);
    await g.speak('verity', lines[photo.id] || 'My friends.');
    if (n >= 3 && !s.flags.radioNews) this.radioNews();
  }

  async radioNews() {
    const g = this.g, H = g.house, L = g.lighting, tk = this.token;
    this.s.flags.radioNews = true;
    g.setObjective(null);
    await g.sleep(1.5);
    if (!this.alive(tk)) return;
    const radioPos = new THREE.Vector3(0.74, 0.95, -3.2);
    g.props.radio.dial.material.emissiveIntensity = 2.5;
    g.audio.sfx.play('tune', { position: radioPos });
    const st = g.audio.sfx.loop('static', { position: radioPos, volume: 0.12, bus: 'sfx' });
    await g.sleep(1.2);
    await g.speak('radio', '…police are still searching for the Harlow family of Wren Street. It is the fourth household reported missing from the same address since…');
    st.stop(0.4);
    g.props.radio.dial.material.emissiveIntensity = 0;
    if (!this.alive(tk)) return;
    g.addInsanity(5);
    await g.speak('verity', 'Radios lie. I never lie.');
    if (!this.alive(tk)) return;
    // the door at the end of the hall creaks open by itself
    H.doors.end.locked = false;
    H.doors.end.setOpen(1, g, { speed: 0.35 });
    g.audio.sfx.play('creak', { position: H.doors.end.worldPos(), volume: 1.2, dur: 2.5, pitch: 0.7 });
    L.flicker(1.5, 'hallB', 0.8);
    this.s.flags.endOpen = true;
    await g.sleep(1.5);
    if (!this.alive(tk)) return;
    g.setObjective('door', 'Go through the door at the end of the hall.');
    await g.speak('verity', 'Go on. I’ll be right behind you.');
  }

  // ================================================================ chapter 3
  async chapter3() {
    const g = this.g, v = g.verity, tk = this.token;
    this.s.flags.ch3Greet = false;
    v.setMode('script');
    v.position.set(0, 1.45, -12.2);
    v.lookTarget = null;
    g.setObjective('tapes', `Find the tapes. (${this.tapeCount()}/2)`);
    g.audio.music.setMood('uneasy');
    if (this.tapeCount() >= 2) this.tapesDone();
  }
  tapeCount() { return this.s.tapes.filter((t) => t !== 'tape3').length; }

  async ch3Greet() {
    const g = this.g, tk = this.token;
    this.s.flags.ch3Greet = true;
    g.addInsanity(3);
    await g.speak('verity', 'Something is coming in three days.');
    if (!this.alive(tk)) return;
    g.verity.setMode('follow');
    await g.sleep(0.4);
    await g.speak('verity', 'Oh, don’t look at me like that. I was only joking. Marcus left some tapes around. You should find them.');
  }

  takeTape(id) {
    const g = this.g, s = this.s;
    if (!s.tapes.includes(id)) s.tapes.push(id);
    this.g.save.addUnique('tapes', id);
    g.audio.sfx.play('pickup');
    if (s.chapter === 3) g.setObjective('tapes', `Find the tapes. (${Math.min(2, this.tapeCount())}/2)`);
    this.playTape(id);
  }

  async playTape(id) {
    const g = this.g, tk = ++this.tapeToken;
    const tape = TAPES[id];
    g.ui.toast(tape.title, 3);
    g.audio.sfx.play('tapeClick', { volume: 0.8 });
    const hiss = g.audio.sfx.loop('hiss', { volume: 0.05, bus: 'sfx' });
    await g.sleep(0.8);
    for (const line of tape.lines) {
      if (tk !== this.tapeToken || g.mode === 'menu') break;
      await g.speak('marcus', line, { label: tape.title });
      await g.sleep(0.4);
    }
    hiss.stop(0.3);
    g.audio.sfx.play('tapeClick', { volume: 0.6 });
    if (tk !== this.tapeToken || g.mode === 'menu') return;
    if (id === 'tape2') await g.speak('verity', 'Dana was rude to me. You’re not rude to me. Are you?');
    if (id === 'tape3') {
      this.s.flags.knowsPhrase = true;
      g.addInsanity(6);
      g.verity.face.glitch = 1;
      await g.speak('verity', 'He’s lying. Don’t you dare say that to me. Don’t you DARE.');
    }
    if (this.s.chapter === 3 && this.tapeCount() >= 2 && !this.s.flags.tapesDone) this.tapesDone();
  }

  async tapesDone() {
    const g = this.g, H = g.house, tk = this.token;
    this.s.flags.tapesDone = true;
    await g.sleep(1);
    if (!this.alive(tk)) return;
    await g.speak('verity', 'He was confused at the end. Don’t listen to him. Listen to me.');
    H.doors.end.locked = false;
    H.doors.end.setOpen(1, g, { speed: 0.35 });
    g.audio.sfx.play('creak', { position: H.doors.end.worldPos(), volume: 1.2, dur: 2.5, pitch: 0.6 });
    this.s.flags.endOpen = true;
    g.setObjective('door', 'Go through the door at the end of the hall.');
  }

  // ================================================================ chapter 4
  async chapter4() {
    const g = this.g, v = g.verity, tk = this.token;
    Object.assign(this.s.flags, { triedFront: false, triedEnd: false, bathScare: false, albumShown: false });
    g.audio.music.setMood('dread');
    g.lighting.lamps.hallA1.flicker = 0.25;
    g.lighting.lamps.bath.flicker = 0.4;
    v.position.set(0, 1.5, -1.8);
    await g.sleep(0.8);
    if (!this.alive(tk)) return;
    await g.speak('verity', 'You came back to me.');
    if (!this.alive(tk)) return;
    g.setObjective('leave', 'Find a way out.');
  }

  async tryLeave(which) {
    const g = this.g, s = this.s;
    if (which === 'front') {
      g.audio.sfx.play('locked', { position: g.house.doors.front.worldPos(), volume: 1.2 });
      g.ui.toast('It’s chained shut from the inside.');
      if (!s.flags.triedFront) {
        s.flags.triedFront = true;
        g.addInsanity(3);
        await g.speak('verity', 'Where do you think you’re going?');
      }
    } else {
      g.audio.sfx.play('locked', { position: g.house.doors.end.worldPos(), volume: 1.2 });
      if (!s.flags.triedEnd) {
        s.flags.triedEnd = true;
        g.addInsanity(3);
        await g.speak('verity', 'I locked it. For us.');
      }
    }
    if (s.flags.triedFront && s.flags.triedEnd) this.showAlbum();
  }

  async showAlbum() {
    const g = this.g, tk = this.token;
    if (this.s.flags.albumShown) return;
    this.s.flags.albumShown = true;
    await g.sleep(1.5);
    if (!this.alive(tk)) return;
    g.props.album.visible = true;
    await g.speak('verity', 'Stop trying to leave. I made you something. It’s on the bed.');
    g.setObjective('leave', 'Look at the photo album on the bed.');
  }

  async bathScare() {
    const g = this.g, m = g.monster, L = g.lighting, tk = this.token;
    this.s.flags.bathScare = true;
    m.position.set(3.85, 0.02, -9.9);
    m.root.rotation.y = -Math.PI / 2;
    m.mode = 'idle';
    m.speed = 0;
    m.unfold = 1;
    m.show(true);
    const br = g.audio.sfx.loop('breathing', { position: new THREE.Vector3(3.8, 2, -9.9), volume: 0.9, bus: 'sfx' });
    L.flicker(3, 'bath', 0.6);
    const t0 = g.time;
    while (g.time - t0 < 4 && this.alive(tk)) {
      if (g.player.pos.distanceTo(new THREE.Vector3(3.4, 0, -9.6)) < 1.3) break;
      await g.sleep(0.1);
    }
    L.lamps.bath.on = false;
    g.audio.sfx.play('stingerSoft', { volume: 1.4 });
    await g.sleep(0.9);
    m.show(false);
    br.stop(0.3);
    L.lamps.bath.on = true;
    g.addInsanity(3);
  }

  async openAlbum() {
    const g = this.g;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 672;
    drawTenantPhoto(c, 9, 3, true);
    g.audio.sfx.play('paper');
    g.showPicture(c, () => this.question(), 'PRESS E TO CLOSE');
  }

  async question() {
    const g = this.g, v = g.verity, tk = this.token;
    if (this.s.flags.asked) return;
    this.s.flags.asked = true;
    g.props.album.visible = false;
    g.setObjective(null);
    g.audio.music.setMood('silence', 3);
    let answer = 1;
    await g.director.play(async (d) => {
      const cam = g.renderer.camera;
      const f = g.player.forward;
      const target = cam.position.clone().addScaledVector(f, 0.85).setY(cam.position.y - 0.05);
      v.setMode('script');
      const from = v.position.clone();
      d.tween(1.2, (k) => v.position.lerpVectors(from, target, k));
      await d.track(() => v.position, 1.4, 6);
      await d.say('verity', 'Do you like it? I made it for you. For us.');
      await d.wait(0.6);
      await d.say('verity', 'Will you stay with me? Forever?');
    }, { skippable: false });
    if (!this.alive(tk)) return;
    g.mode = 'cutscene';
    g.ui.setLetterbox(true);
    g.ui.subtitle('Will you stay with me? Forever?', { who: 'VERITY', cls: 'verity', stage: stageFor(this.s.insanity), duration: 60 });
    answer = await g.ui.ask(['Yes. Forever.', 'No.']);
    g.ui.clearSubtitle();
    if (!this.alive(tk)) return;
    if (answer === 0 && this.s.insanity < 55) return this.endingFriends();
    await g.director.play(async (d) => {
      if (answer === 0) {
        await d.say('verity', 'Liar.', { stage: 6 });
        await d.say('verity', 'I can always tell when you’re lying. I KNOW EVERYTHING.', { stage: 6 });
      } else {
        v.face.set('wail');
        await d.say('verity', '…No?', { stage: 5 });
        await d.say('verity', 'Then I’ll make you stay.', { stage: 6 });
      }
    }, { skippable: false });
    if (!this.alive(tk)) return;
    this.s.chapter = 5;
    this.transform({ finale: true });
  }

  // ================================================================ chapter 5 (finale)
  async chapter5(opts) {
    const g = this.g, v = g.verity;
    const cam = g.renderer.camera;
    v.position.set(0, 1.5, -2.2);
    await g.sleep(1.5);
    await g.speak('verity', 'You came back again. You always come back.', { stage: 6 });
    this.transform({ finale: true });
  }

  // Insanity hit 100 (or the finale): the ball becomes what it really is.
  async transform({ finale = false } = {}) {
    const g = this.g, v = g.verity, m = g.monster, L = g.lighting, tk = this.token;
    if (this.s.transformed) return;
    finale = finale || this.s.chapter >= 5;
    this.s.transformed = true;
    this.s.transformations++;
    g.setInsanity(100);
    g.closeChat();
    g.setObjective(null);
    g.audio.music.setMood('silence', 0.5);
    let spawn;
    await g.director.play(async (d) => {
      const cam = g.renderer.camera;
      const f = g.player.forward;
      v.setMode('script');
      const target = cam.position.clone().addScaledVector(f, 1.3).setY(1.55);
      resolveCircle(target, 0.35, g.house.colliders);
      const from = v.position.clone();
      d.tween(0.8, (k) => v.position.lerpVectors(from, target, k));
      await d.track(() => v.position, 0.9, 8);
      L.flicker(4, null, 0.95);
      g.audio.sfx.play('glitch', { position: target, volume: 1, dur: 1.2 });
      for (const [i, e] of ['annoyed', 'laugh', 'wail', 'grin', 'wail', 'grin'].entries()) {
        setTimeout(() => v.face.set(e, true), i * 180);
      }
      v.face.glitch = 1;
      d.tween(2.2, (k) => { v.face.cracks = 0.6 + k * 0.4; v.position.x = target.x + (Math.random() - 0.5) * 0.03 * k; v.position.y = target.y + (Math.random() - 0.5) * 0.03 * k; }, ease.linear);
      for (let i = 0; i < 6; i++) g.audio.sfx.play('crack', { position: target, delay: i * 0.3, volume: 0.9 });
      await d.wait(1.2);
      await d.say('verity', finale ? 'I KNOW EVERYTHING.' : 'YOU SHOULDN’T HAVE SAID THAT.', { stage: 6, after: 0 });
      // it splits along the smile
      g.audio.sfx.play('squelch', { position: target, volume: 1.4 });
      g.ui.flash(0.9, 500);
      L.setPower(false);
      v.show(false);
      spawn = new THREE.Vector3(target.x, 0, target.z);
      resolveCircle(spawn, 0.4, g.house.colliders);
      m.position.copy(spawn);
      const toCam = Math.atan2(cam.position.x - spawn.x, cam.position.z - spawn.z);
      m.root.rotation.y = toCam;
      m.unfold = 0;
      m.mode = 'idle';
      m.speed = 0;
      m.show(true);
      await d.wait(0.5);
      L.setPower(true);
      L.flicker(3, null, 0.7);
      g.audio.sfx.play('growl', { position: spawn.clone().setY(1.5), volume: 1.5, dur: 2.5 });
      for (let i = 0; i < 8; i++) g.audio.sfx.play('bones', { position: spawn.clone().setY(1), delay: i * 0.25, volume: 1 });
      d.tween(2.4, (k) => { m.unfold = k; }, ease.inOutCubic);
      const back = d.camPos.clone().addScaledVector(f, -0.5);
      await d.camTo(back, () => m.headWorld(), 2.6, ease.inOutSine);
      g.audio.sfx.play('stinger', { volume: 1 });
      g.audio.sfx.play('jumpscare', { volume: 0.55 });
      d.shake = 1.2;
      m.mode = 'reach';
      await d.track(() => m.headWorld(), 0.9, 10);
      m.mode = 'walk';
      if (finale && !this.s.flags.finaleCard) {
        this.s.flags.finaleCard = true;
        g.ui.chapterCard(ROMAN[5], CHAPTERS[5].title, CHAPTERS[5].sub, 1.6);
      }
    }, { skippable: false });
    if (!this.alive(tk)) return;
    m.unfold = 1;
    m.show(true);
    const cam = g.renderer.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    g.player.setPose(cam.position.x, cam.position.z, Math.atan2(-f.x, -f.z), 0);
    resolveCircle(g.player.pos, 0.3, g.house.colliders);
    g.mode = 'play';
    g.audio.music.setMood('chase', 0.3);
    g.chase.start(m.position.clone(), m.root.rotation.y, this.s.hard ? 1.2 : 1.8);
    g.chase.speed = 0;
    g.player.toggleFlashlight(true);
    this.chaseT = 0;
    if (finale) {
      this.s.chapter = 5;
      this.s.flags.finalePhase = 1;
      g.house.doors.end.locked = false;
      g.house.doors.end.setOpen(1, g, { speed: 3 });
      g.setObjective('escape', 'RUN.');
      g.checkpoint();
    } else {
      g.setObjective('escape', 'RUN. HIDE.');
    }
  }

  // Survived an early transformation: it pretends nothing happened.
  async revert(byCommand = false) {
    const g = this.g, v = g.verity, m = g.monster, L = g.lighting, tk = this.token;
    if (!this.s.transformed || this.s.chapter >= 5) return;
    g.chase.stop();
    L.setPower(false);
    g.audio.music.setMood('silence', 0.3);
    g.audio.sfx.play('whoosh', { volume: 0.8 });
    await g.sleep(1.6);
    if (!this.alive(tk)) return;
    m.show(false);
    this.s.transformed = false;
    L.setPower(!(this.s.chapter === 1 && !this.s.flags.powerOn));
    const p = g.player;
    const f = p.forward;
    v.show(true);
    v.setMode('follow');
    v.position.set(p.pos.x + f.x * 0.9, 1.5, p.pos.z + f.z * 0.9);
    resolveCircle(v.position, 0.2, g.house.colliders);
    g.setInsanity(Math.min(80, 55 + this.s.transformations * 8));
    v.face.set('wail', true);
    g.audio.music.setMood('uneasy');
    if (byCommand) await g.speak('verity', 'Don’t. Ever. Say that. Again.');
    else await g.speak('verity', 'I’m sorry. I’m so sorry. I don’t know what happened. I would never hurt you. You know that, right?');
    v.face.set(EXPRESSIONS[stageFor(this.s.insanity)]);
    this.restoreObjective();
  }

  restoreObjective() {
    const g = this.g, s = this.s;
    const map = {
      0: ['talk', 'Talk to Verity.'],
      1: s.flags.powerOn ? [null, null] : ['power', 'Restore the power.'],
      2: s.flags.endOpen ? ['door', 'Go through the door at the end of the hall.'] : s.flags.peeked ? ['photos', `Look at the photographs. (${(s.flags.photosSeen || []).length}/3)`] : ['knock', 'Find out who is knocking.'],
      3: s.flags.endOpen ? ['door', 'Go through the door at the end of the hall.'] : ['tapes', `Find the tapes. (${this.tapeCount()}/2)`],
      4: s.flags.albumShown ? ['leave', 'Look at the photo album on the bed.'] : ['leave', 'Find a way out.'],
    }[s.chapter];
    if (map) g.setObjective(map[0], map[1]);
  }

  async finaleLoop() {
    const g = this.g, H = g.house, L = g.lighting, m = g.monster, tk = ++this.token;
    const phase = (this.s.flags.finalePhase || 1) + 1;
    this.s.flags.finalePhase = phase;
    g.chase.stop();
    m.show(false);
    g.audio.sfx.play('slam', { volume: 1 });
    g.mode = 'cutscene';
    await g.ui.fade(1, 0.25);
    g.player.setPose(0, -0.8, 0);
    H.doors.end.snap(0);
    H.doors.end.locked = true;
    H.doors.end.lockedText = phase === 2 ? 'Locked. There has to be a key.' : 'It won’t budge. The front door — GO.';
    if (phase === 3) {
      // the way out is open
      H.doors.front.chain.visible = false;
      H.doors.front.locked = false;
      H.doors.front.snap(1);
      L.lamps.porch.on = true;
      L.rain.visible = true;
      this.rain?.set(0.4);
      this.setScrawls(0);
      L.setTint(1, 0.9, 0.85);
    }
    g.mode = 'play';
    g.player.update(0.016, g.input, H.colliders);
    g.ui.fade(0, 0.4);
    g.setObjective('escape', phase === 2 ? 'Find the key to the end door.' : 'GET OUT.');
    if (phase === 2) g.speak('verity', 'The key is in the bathtub. Go on. Reach in.', { stage: 6 });
    // it comes through the start door behind you
    await g.sleep(phase === 3 ? 3 : 4);
    if (!this.alive(tk)) return;
    H.doors.start.setOpen(1, g, { speed: 4 });
    g.audio.sfx.play('slam', { position: new THREE.Vector3(0, 1.2, 0), volume: 1.4 });
    g.player.shake = 0.5;
    g.chase.start(new THREE.Vector3(0, 0, 0.2), Math.PI, 0.6);
  }

  async reachTub() {
    const g = this.g;
    this.s.flags.hasKey = true;
    g.audio.sfx.play('drip', { volume: 1.2 });
    g.audio.sfx.play('pickup');
    g.ui.toast('A key. It’s warm.');
    g.setObjective('escape', 'Unlock the door at the end of the hall.');
  }

  async unlockEnd() {
    const g = this.g, H = g.house;
    H.doors.end.locked = false;
    g.audio.sfx.play('locked', { position: H.doors.end.worldPos() });
    H.doors.end.setOpen(1, g, { speed: 3 });
    g.setObjective('escape', 'RUN.');
  }

  // ================================================================ death & endings
  async caught(reason) {
    const g = this.g, m = g.monster, tk = this.token;
    if (g.mode !== 'play') return;
    g.mode = 'dead';
    g.chase.stop();
    g.closeChat();
    g.audio.voice.stop();
    g.ui.setObjective(null);
    const p = g.player;
    if (p.hidden) {
      g.props.setWardrobeOpen(1);
      p.hidden.door?.setOpen(1, g, { speed: 6 });
    }
    await g.director.play(async (d) => {
      const cam = g.renderer.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
      m.show(true);
      m.unfold = 1;
      m.mode = 'lunge';
      m.speed = 0;
      m.root.rotation.y = Math.atan2(-f.x, -f.z);
      m.position.set(cam.position.x, 0, cam.position.z);
      m.update(0.016);
      m.root.updateMatrixWorld(true);
      // it folds down so that grin is right in your face
      const hw = m.headWorld();
      const reach = -((hw.x - m.position.x) * f.x + (hw.z - m.position.z) * f.z); // head leans toward you
      const drop = hw.y - cam.position.y + 0.05;
      m.position.y = -drop;
      const setDist = (dd) => { m.position.x = cam.position.x + f.x * (dd + reach); m.position.z = cam.position.z + f.z * (dd + reach); };
      setDist(1.1);
      g.audio.sfx.play('jumpscare', { volume: 1 });
      g.ui.hurt(true);
      g.ui.flash(0.5, 200);
      d.shake = 1.6;
      g.redBoost = 0.6;
      const faceAt = () => m.headWorld().add(new THREE.Vector3(0, 0.02, 0));
      await d.camTo(cam.position.clone(), faceAt(), 0.12, ease.outCubic);
      d.tween(0.45, (k) => setDist(1.1 - k * 0.82), ease.inCubic);
      await d.track(faceAt, 0.9, 25);
      g.ui.fade(1, 0.05);
      await d.wait(1.2);
    }, { skippable: false, letterbox: false });
    g.ui.hurt(false);
    g.redBoost = 0;
    m.show(false);
    g.audio.music.setMood('silence', 0.5);
    this.ambience(false);
    if (tk !== this.token) return;
    g.save.addEnding('caught');
    g.mode = 'dead';
    g.input.unlock();
    g.menus.show('gameover', { reason });
  }

  async endingEscape() {
    const g = this.g, L = g.lighting, H = g.house, v = g.verity, tk = ++this.token;
    g.chase.stop();
    g.monster.show(false);
    g.closeChat();
    await g.director.play(async (d) => {
      g.audio.music.setMood('ending', 4);
      d.grabCamera();
      await d.camTo(new THREE.Vector3(-2.6, 1.6, -4.0), new THREE.Vector3(-6, 1.3, -4.2), 1.6);
      H.doors.front.setOpen(0, g, { silent: true, speed: 5 });
      g.audio.sfx.play('slam', { position: new THREE.Vector3(-1, 1.2, -4), volume: 1.4 });
      d.shake = 0.8;
      await d.wait(0.6);
      g.audio.sfx.play('knock', { position: new THREE.Vector3(-0.9, 1.4, -4), count: 6, gap: 0.12, volume: 1.8 });
      await d.wait(1.6);
      L.setPower(false);
      L.lamps.porch.on = true;
      await d.caption('Silence. Just the rain.', 3);
      await d.camTo(new THREE.Vector3(-4.2, 1.6, -3.6), new THREE.Vector3(-8, 1.2, -3.2), 3);
      // in the window, something yellow is watching you leave
      v.show(true);
      v.setMode('script');
      v.face.off = false;
      v.face.set('smile', true);
      v.face.cracks = 0;
      v.position.set(-0.7, 1.55, -1.4);
      v.lookTarget = new THREE.Vector3(-4.2, 1.6, -3);
      L.lamps.hallA1.on = true;
      L.setPower(true);
      for (const l of Object.values(L.lamps)) l.on = l.id === 'hallA1' || l.id === 'porch';
      await d.wait(1.5);
      await d.camTo(new THREE.Vector3(-4.3, 1.62, -3.3), new THREE.Vector3(-0.8, 1.5, -1.5), 3.2);
      await d.wait(1.2);
      await d.say('verity', 'See you soon, friend.', { stage: 0 });
      await d.wait(1);
      await d.fade(1, 2.5);
    }, { skippable: true });
    v.lookTarget = null;
    this.finishEnding('escape');
  }

  async endingFriends() {
    const g = this.g, L = g.lighting, v = g.verity, H = g.house;
    await g.director.play(async (d) => {
      v.face.set('laugh', true);
      await d.say('verity', 'Forever? Really? FOREVER AND EVER AND EVER!', { stage: 2 });
      for (let i = 0; i < 3; i++) g.audio.sfx.play('slam', { delay: i * 0.5, volume: 0.9 });
      L.setTint(1.3, 1.15, 0.9);
      L.globalDim = 1;
      g.setInsanity(0);
      v.face.set('smile', true);
      g.audio.music.setMood('lullaby', 2);
      await d.wait(1.5);
      await d.fade(1, 1.5);
      // the new photograph in the hall
      const p = g.props.photos.find((x) => x.id === 'p3');
      drawTenantPhoto(p.canvas, 9, 0, true);
      p.tex.needsUpdate = true;
      p.group.rotation.z = 0;
      d.cut(new THREE.Vector3(0.3, 1.5, -5.6), new THREE.Vector3(0.92, 1.5, -5.6));
      await d.fade(0, 2);
      await d.camTo(new THREE.Vector3(0.55, 1.5, -5.6), new THREE.Vector3(0.92, 1.5, -5.6), 4, ease.inOutSine);
      g.audio.sfx.play('click', { volume: 1.5 });
      g.ui.flash(0.8, 500);
      await d.say('verity', 'Smile!', { stage: 0 });
      await d.wait(1.5);
      await d.fade(1, 3);
    }, { skippable: true });
    this.finishEnding('friends');
  }

  async endingSender() {
    const g = this.g, m = g.monster, v = g.verity, box = g.box, L = g.lighting, H = g.house, tk = ++this.token;
    g.chase.stop();
    g.closeChat();
    await g.director.play(async (d) => {
      d.grabCamera();
      m.mode = 'idle';
      m.speed = 0;
      const cam = g.renderer.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
      if (m.position.distanceTo(g.player.pos) > 4 || !g.chase.canSee()) {
        // the words summon it: it is suddenly standing right in front of you
        m.position.set(g.player.pos.x + f.x * 2.2, 0, g.player.pos.z + f.z * 2.2);
        resolveCircle(m.position, 0.35, H.colliders);
        g.ui.flash(0.3, 200);
      }
      m.root.rotation.y = Math.atan2(g.player.pos.x - m.position.x, g.player.pos.z - m.position.z);
      m.update(0.016);
      const head = m.headWorld();
      await d.camTo(d.camPos.clone(), head, 0.8);
      g.audio.sfx.play('glitch', { position: head, volume: 1, dur: 1 });
      L.flicker(3, null, 0.9);
      await d.say('verity', 'N—no. No no no. It’s dark in there. IT’S DARK IN THERE—', { stage: 6 });
      // it folds down into the ball
      g.audio.sfx.play('squelch', { position: head, volume: 1.2 });
      for (let i = 0; i < 8; i++) g.audio.sfx.play('bones', { position: head, delay: i * 0.2 });
      const mpos = m.position.clone();
      await d.tween(2.4, (k) => { m.unfold = 1 - k; }, ease.inOutCubic);
      m.show(false);
      v.show(true);
      v.setMode('script');
      v.face.off = false;
      v.face.set('wail', true);
      v.face.cracks = 1;
      v.position.set(mpos.x, 0.5, mpos.z);
      g.ui.flash(0.6, 400);
      // the box is right there. It was always right there.
      box.root.position.set(mpos.x + 0.9, 0, mpos.z);
      resolveCircle(box.root.position, 0.4, H.colliders);
      box.snapOpen(1);
      box._home = null;
      const bp = box.root.position.clone();
      await d.camTo(d.camPos.clone(), bp.clone().setY(0.5), 1);
      const from = v.position.clone();
      v.spin = 18;
      g.audio.sfx.play('whoosh', { position: bp, volume: 1 });
      await d.tween(1.6, (k) => {
        v.position.lerpVectors(from, bp.clone().setY(0.28), k);
        v.position.y += Math.sin(k * Math.PI) * 0.6;
      }, ease.inOutQuad);
      v.show(false);
      box.setOpen(0, 0.1);
      g.audio.sfx.play('flaps', { position: bp, volume: 1 });
      await d.wait(0.7);
      box.tape.visible = true;
      g.audio.sfx.play('tapeRip', { position: bp, volume: 1 });
      await d.wait(1.2);
      g.audio.music.setMood('ending', 3);
      L.setTint(1, 1, 1);
      L.setPower(true);
      for (const l of Object.values(L.lamps)) { l.on = l.id !== 'porch'; l.flicker = 0; }
      g.setInsanity(0);
      H.doors.front.chain.visible = false;
      g.audio.sfx.play('locked', { position: new THREE.Vector3(-1, 1.1, -4), volume: 1 });
      await d.caption('The front door clicks. Unlocked.', 3);
      await d.wait(1.5);
      box.shake = 0.6;
      g.audio.sfx.play('knock', { position: bp.clone().setY(0.2), count: 1, volume: 0.5 });
      await d.wait(0.3);
      box.shake = 0;
      g.ui.subtitle('(muffled) …let me out…', { cls: 'silent', duration: 3 });
      await d.wait(3);
      await d.fade(1, 2.5);
    }, { skippable: true });
    this.finishEnding('sender');
  }

  finishEnding(id) {
    const g = this.g;
    g.mode = 'ending';
    g.chase.stop();
    g.save.addEnding(id);
    g.save.clearCheckpoint();
    g.save.data.unlockedChapter = 5;
    g.save.data.lastRunName = g.brain.memory.name;
    g.save.write();
    this.ambience(false);
    g.audio.music.setMood('ending', 2);
    g.input.unlock();
    g.ui.showHUD(false);
    g.ui.setObjective(null);
    g.menus.show('ending', { id });
  }

  // ================================================================ per-frame logic
  update(dt, inCutscene = false) {
    const g = this.g, s = this.s, p = g.player;
    if (inCutscene) return;
    s.flags.chapterTime = (s.flags.chapterTime || 0) + dt;
    const room = g.house.roomAt(p.pos.x, p.pos.z);

    if (s.chapter === 0 && s.flags.phase === 'approach') {
      if (p.pos.distanceTo(g.box.root.position) < 2.4) this.boxCutscene();
    }
    if (s.chapter === 2 && !s.flags.peeked && this.knockTimer !== undefined) {
      this.knockTimer -= dt;
      if (this.knockTimer <= 0) {
        this.knockTimer = 22 + rand() * 15;
        g.audio.sfx.play('knock', { position: new THREE.Vector3(-1.1, 1.3, -4), count: 3 + Math.floor(rand() * 3), volume: 1.2 });
      }
    }
    if (s.chapter === 3 && !s.flags.ch3Greet && p.pos.z < -7.5) this.ch3Greet();
    if (s.chapter === 4 && room === 'bath' && !s.flags.bathScare && !g.chase.active) this.bathScare();
    if (s.chapter === 4 && !s.flags.albumShown && s.flags.chapterTime > 150) this.showAlbum();

    // walking into the void behind the end door
    if (p.pos.x > 7.35 && g.house.doors.end.open > 0.5) {
      if (s.chapter === 2 || s.chapter === 3) this.loopTo(s.chapter + 1);
      else if (s.chapter === 5) this.finaleLoop();
      else if (g.chase.active) this.finaleLoop();
    }
    // out of the front door in the finale
    if (s.chapter === 5 && s.flags.finalePhase === 3 && p.pos.x < -1.35 && Math.abs(p.pos.z + 4) < 0.8) this.endingEscape();

    // surviving an early transformation
    if (g.chase.active && s.chapter < 5 && s.transformed) {
      this.chaseT = (this.chaseT || 0) + dt;
      const far = g.monster.position.distanceTo(p.pos) > 7 || p.hidden;
      if ((g.chase.lostTime > 14 && far) || this.chaseT > 70) this.revert();
    }
    if (g.chase.active && p.hidden) {
      const d = g.monster.position.distanceTo(p.pos);
      g.audio.setMuffle(true);
      if (d < 3 && !this._closeWarn) { this._closeWarn = true; g.audio.sfx.play('breath', { position: g.monster.headWorld(), volume: 1.5 }); }
      if (d > 5) this._closeWarn = false;
    }
  }

  onAsk(res) {
    const g = this.g, s = this.s;
    if (s.chapter === 0 && s.flags.phase === 'talk') {
      s.flags.ch0Asked = (s.flags.ch0Asked || 0) + 1;
      if (s.flags.ch0Asked >= 3 && !s.flags.ch0Done) this.chapter0End();
    }
    if (res.flags.promise) s.flags.promised = true;
    if (res.flags.boxCommand && s.transformed) {
      if (s.chapter >= 5) this.endingSender();
      else this.revert(true);
    }
  }

  // ================================================================ interactions
  bind() {
    const g = this.g, H = g.house, P = g.props, D = H.doors;
    // doors
    D.front.onInteract = (game, door) => {
      const s = this.s;
      if (s.chapter === 2 && !s.flags.peeked && !g.chase.active) return this.peephole();
      if (s.chapter === 4 && !g.chase.active) return this.tryLeave('front');
      if (s.chapter === 5 && s.flags.finalePhase === 3) return;
      door.toggle(game);
      if (door.locked && s.chapter === 2) g.speak('verity', 'Don’t open it.');
    };
    D.front.customLabel = () => {
      const s = this.s;
      if (s.chapter === 2 && !s.flags.peeked && !g.chase.active) return 'Look through the peephole';
      if (s.chapter >= 4 && s.flags.finalePhase !== 3) return 'Front door (chained)';
      return null;
    };
    const frontLabel = D.front.promptLabel.bind(D.front);
    D.front.promptLabel = () => D.front.customLabel?.() || (D.front.locked ? 'Front door (locked)' : frontLabel());
    D.end.onInteract = (game, door) => {
      const s = this.s;
      if (s.chapter === 4 && !g.chase.active) return this.tryLeave('end');
      if (s.chapter === 5 && s.flags.finalePhase === 2 && door.locked && s.flags.hasKey) return this.unlockEnd();
      door.toggle(game);
    };
    D.closet.onInteract = () => this.hide(H.hidingSpots.closet);
    D.closet.promptLabel = () => 'Hide in closet';
    // wardrobe leaves
    this.g.house.addInteractable({
      meshes: P.wardrobeDoors.map((d) => d.hit),
      label: () => 'Hide in wardrobe',
      onInteract: () => this.hide(H.hidingSpots.wardrobe),
    });
    // the VERITY box
    H.addInteractable({
      meshes: [g.box.hit],
      label: () => (this.s.flags.verityOut ? 'Look inside the box' : null),
      onInteract: () => g.showNote('Shipping label', 'TO: THE NEXT FRIEND\nFROM: —\n\nCONTENTS: 1 × VERITY™ (your personal helper friend)\nDO NOT RETURN.'),
    });
    // radio
    P.radioInteract.onInteract = () => {
      const s = this.s;
      if (s.chapter === 1 && s.flags.powerOut && !s.flags.brassKey) {
        s.flags.brassKey = true;
        g.audio.sfx.play('pickup');
        g.ui.toast('Taped under the radio: a small brass key.', 3.5);
        return;
      }
      g.audio.sfx.play('tune', { position: P.radio.group.position });
      P.radio.dial.material.emissiveIntensity = 2;
      setTimeout(() => (P.radio.dial.material.emissiveIntensity = 0), 1500);
      if (s.chapter >= 2) setTimeout(() => g.speak('radio', this.rng.pick(RADIO_LINES)), 900);
    };
    P.radioInteract.label = () => (this.s.chapter === 1 && this.s.flags.powerOut && !this.s.flags.brassKey ? 'Lift the radio' : 'Turn the radio dial');
    // clock
    P.clockInteract.onInteract = () => g.ui.toast(this.s.chapter >= 3 ? '3:00. The glass is cracked. It will always be 3:00.' : '2:57. The second hand isn’t moving.', 3);
    // photos
    for (const ph of P.photos) if (ph.interact) ph.interact.onInteract = () => this.viewPhoto(ph);
    // fuse box
    P.fuseInteract.label = () => {
      const s = this.s, fb = P.fuseBox;
      if (s.chapter !== 1 || s.flags.powerOn) return 'Fuse box';
      if (!fb.opened) return s.flags.brassKey ? 'Unlock the fuse box' : 'Fuse box (padlocked)';
      return 'Flip the breaker';
    };
    P.fuseInteract.onInteract = () => {
      const s = this.s, fb = P.fuseBox;
      if (s.chapter !== 1 || s.flags.powerOn) { g.ui.toast('The breaker is on.'); return; }
      if (!fb.opened) {
        if (!s.flags.brassKey) {
          g.audio.sfx.play('locked', { position: fb.group.position });
          g.ui.toast('A tiny padlock. It needs a small key.');
          return;
        }
        fb.opened = true;
        fb.on = false;
        g.audio.sfx.play('locked', { position: fb.group.position });
        g.audio.sfx.play('creak', { position: fb.group.position, short: true });
        return;
      }
      this.restorePower();
    };
    // bathtub
    P.tubInteract.label = () => {
      const s = this.s;
      if (s.chapter === 5 && s.flags.finalePhase === 2 && !s.flags.hasKey) return 'Reach into the water';
      return 'Bathtub';
    };
    P.tubInteract.hold = () => (this.s.chapter === 5 && this.s.flags.finalePhase === 2 && !this.s.flags.hasKey ? 1.6 : 0);
    P.tubInteract.onInteract = () => {
      const s = this.s;
      if (s.chapter === 5 && s.flags.finalePhase === 2 && !s.flags.hasKey) return this.reachTub();
      g.ui.toast(s.chapter >= 4 ? 'The water is black and warm. Something is floating just under the surface.' : 'Rust stains. A long, dark hair in the drain.', 3.2);
    };
    // sink / mirror scare
    P.sinkInteract.label = () => 'Look in the mirror';
    P.sinkInteract.onInteract = () => this.mirror();
    // photo album
    P.albumInteract.onInteract = () => this.openAlbum();
  }

  readNote(id) {
    const g = this.g, n = NOTES[id];
    if (!this.s.notes.includes(id)) this.s.notes.push(id);
    g.save.addUnique('notes', id);
    g.showNote(n.title, n.text, () => {
      if (id === 'n2' && g.verity.visible) g.speak('verity', 'Who wrote that? Ask me about the bathroom. Go on. Ask me.');
      if (id === 'n6' && g.verity.visible) { g.addInsanity(3); g.speak('verity', 'Don’t read other people’s mail.'); }
    });
  }

  async mirror() {
    const g = this.g, v = g.verity, tk = this.token;
    const s = this.s;
    if (s.flags.mirrorDone || s.chapter < 3 || g.chase.active || !v.visible) {
      g.ui.toast('You look tired. You look so tired.');
      return;
    }
    s.flags.mirrorDone = true;
    await g.director.play(async (d) => {
      await d.camTo(new THREE.Vector3(2.7, 1.62, -7.75), new THREE.Vector3(2.7, 1.6, -7.2), 1.2);
      v.show(false);
      await d.caption('…', 2);
      g.lighting.flicker(0.5, 'bath');
      await d.wait(0.8);
      // turn around
      const behind = new THREE.Vector3(2.7, 1.6, -8.12);
      v.show(true);
      v.setMode('script');
      v.position.copy(behind);
      v.face.set('grin', true);
      v.face.glitch = 1;
      g.audio.sfx.play('stinger', { volume: 1 });
      g.ui.flash(0.25, 150);
      d.shake = 0.9;
      await d.camTo(new THREE.Vector3(2.7, 1.62, -7.75), behind, 0.18, ease.outCubic);
      await d.wait(1.1);
      v.face.set(EXPRESSIONS[stageFor(s.insanity)]);
      await d.say('verity', s.insanity > 60 ? 'Boo.' : 'Boo! Ha! Did I scare you?');
    }, { skippable: false });
    if (!this.alive(tk)) return;
    g.addInsanity(5);
    v.setMode('follow');
    const cam = g.renderer.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    g.player.setPose(2.7, -7.75, Math.atan2(-f.x, -f.z), 0);
    g.mode = 'play';
  }

  // ================================================================ hiding
  async hide(spot) {
    const g = this.g, p = g.player;
    if (p.hidden) return;
    if (spot.door) spot.door.setOpen(1, g, { speed: 5 });
    if (spot.wardrobe) spot.wardrobe.setWardrobeOpen(1);
    g.audio.sfx.play('creak', { position: spot.inside, short: true, volume: 0.6 });
    await g.ui.fade(0.85, 0.2);
    p.hide(spot);
    if (spot.door) spot.door.setOpen(0, g, { speed: 5, silent: true });
    if (spot.wardrobe) spot.wardrobe.setWardrobeOpen(0);
    g.audio.sfx.play('doorClose', { position: spot.inside, volume: 0.35 });
    g.ui.fade(0, 0.25);
    g.ui.toast('Hold SPACE to hold your breath · E to leave', 3);
    g.chase.suspicion = 0;
  }

  async unhide() {
    const g = this.g, p = g.player;
    const spot = p.hidden;
    if (!spot) return;
    if (spot.door) spot.door.setOpen(1, g, { speed: 5 });
    if (spot.wardrobe) spot.wardrobe.setWardrobeOpen(1);
    await g.sleep(0.25);
    p.unhide();
    g.audio.setMuffle(false);
    if (spot.door) setTimeout(() => spot.door.setOpen(0, g, { speed: 3, silent: true }), 600);
    if (spot.wardrobe) setTimeout(() => spot.wardrobe.setWardrobeOpen(0), 700);
  }
}
