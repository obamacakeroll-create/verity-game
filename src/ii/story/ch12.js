import * as THREE from 'three';
import { EXPRESSIONS } from '../../entities/VerityFace.js';
import { stageFor } from '../ai/BrainII.js';
import { SAFE_CODE } from '../ai/knowledgeII.js';
import { ease } from '../../core/util.js';
import { keypad, breakerBoard } from './Panels.js';
import { checkSafe, defaultGrid, gridSolved, gridLoad, routeText } from './puzzles.js';

// CHAPTER I — RECEPTION and CHAPTER II — QUALITY CONTROL.
// setupFactory() also restores every part of the factory from flags.
export const Front = {
  setupFactory(n) {
    const g = this.g, f = this.s.flags, R = this.R, L = this.L, s = this.s;
    if (L?.name !== 'factory') return;
    this.setFrontPower(!!f.powerFront, true);
    // entrance
    R.entryL.set(0, g, { silent: true }); R.entryR.set(0, g, { silent: true });
    R.entryL.locked = R.entryR.locked = !!f.entered && !f.finale;
    R.entryL.o.lockLabel = R.entryR.o.lockLabel = 'Locked. From the outside.';
    // production
    const prodOpen = !!f.prodOpen;
    R.prodL.locked = R.prodR.locked = !prodOpen;
    R.prodL.set(prodOpen ? 1 : 0, g, { silent: true }); R.prodR.set(prodOpen ? 1 : 0, g, { silent: true });
    R.reader.led.material.emissive.set(prodOpen ? 0x30ff40 : 0xff2010);
    R.labDoors.set(prodOpen ? 1 : 0, g, { silent: true });
    // display case + safe + camcorder
    R.displayCase.lid.position.y = f.verityOut ? 1.1 : 0.71;
    R.displayCase.lid.visible = !f.verityOut;
    R.safe.open = f.safeOpen ? 1 : 0;
    R.safe.card.visible = !!f.safeOpen && !s.items.includes('keycard');
    R.camcorder.visible = !f.camcorder;
    // print lab
    const grid = f.grid || defaultGrid();
    this.applyGrid(grid, false, true);
    R.labRoller.locked = !f.gridDone || n >= 3;
    R.labRoller.o.onLocked = () => this.rollerLocked();
    R.labRoller.set(f.gridDone && n === 2 ? 1 : 0, g, { silent: true });
    R.fuseSlot.visible = !!f.fuseIn;
    R.binLid.rotation.set(f.secondsOut ? -1.2 : 0, 0, 0);
    R.binLid.position.y = f.secondsOut ? 1.9 : 1.42;
    // warehouse
    this.setupWarehouse?.(n);
    // basement
    this.setupBasement?.(n);
    // exterior car
    if (!L._carHit) {
      L._carHit = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.copy(L.anchors.carDoor).setY(0.9);
      L.dynamic.add(m);
      L.interact(m, { label: () => (this.s.flags.finaleOut ? 'GET IN' : 'Your car'), onInteract: () => this.useCar() });
    }
    g.lights.moonBase = 0.04;
  },

  setFrontPower(on, instant = false) {
    const g = this.g, R = this.R;
    const list = [...R.lobbyFluo, ...R.officeFluo, R.secFluo, R.breakFluo];
    list.forEach((fx, i) => {
      const st = on ? (i === 2 || i === 9 ? 'flicker' : i % 5 === 3 ? 'buzz' : 'on') : 'off';
      if (instant) fx.state = st;
      else setTimeout(() => { fx.state = on ? 'flicker' : 'off'; g.audio.sfx.play('fluoTick', { position: fx.position, volume: 0.5 }); setTimeout(() => { fx.state = st; }, 300 + Math.random() * 500); }, 200 + i * 140 + Math.random() * 200);
    });
    R.mgrLamp.state = on ? 'on' : 'off';
    R.logoLight3_5 && (R.logoLight3_5.state = on ? 'on' : 'off');
    for (const k of Object.keys(R)) if (k.startsWith('logoLight')) R[k].state = on ? 'on' : 'off';
    R.logo.material.emissiveIntensity = on ? 0.25 : 0;
    R.vending.state = on ? 'buzz' : 'off';
    R.lobbyCRT.mat.emissiveIntensity = on ? 1.2 : 0;
    for (const c of R.cctv) c.mat.emissiveIntensity = on ? 1.1 : 0;
    for (const e of R.emails) e.mat.emissiveIntensity = on ? 1.1 : 0;
    R.frontBreaker.lever.rotation.x = on ? -0.6 : 0.6;
    R.frontBreaker.lamp.material.emissive.set(on ? 0x30ff40 : 0xff2010);
    R.displayCase.btnMat.emissiveIntensity = on && !this.s.flags.verityOut ? 2.5 : 0;
    R.displayCase.light.intensity = on ? 1.6 : 0;
    this.powerFront = on;
  },

  // ================================================================ CHAPTER I
  setup1() {
    const g = this.g, f = this.s.flags, R = this.R, L = this.L, v = g.verity;
    this.setupFactory(1);
    if (!f.verityOut) {
      v.show(true);
      v.setMode('hold');
      v.place(R.displayCase.pos);
      v.lookTarget = new THREE.Vector3(R.displayCase.pos.x, 1.3, 4);
      v.face.set('neutral', true);
      v.bobAmount = 0;
    }
    for (const p of [[-30.9, 0.92, -2.5], [-28.4, 0.76, 0.7], [-3.6, 0.47, -1.3]]) g.throwables.spawn('can', new THREE.Vector3(...p), 0);
    const A = L.anchors;
    if (f.verityOut) g.player.setPose(0, -2, 0, 0);
    else if (f.entered) g.player.setPose(A.lobby.x, A.lobby.z, 0, 0);
    else g.player.setPose(A.lotStart.x, A.lotStart.z, 0.1, 0);
  },

  music1() { this.g.audio.music.setMood(this.s.flags.entered ? 'factory' : 'dread'); },

  restoreObjective1() {
    const g = this.g, f = this.s.flags, it = this.s.items;
    if (!f.entered) g.setObjective('enter', 'Go inside.');
    else if (!f.powerFront) g.setObjective('power', 'Find a way to turn the lights on.');
    else if (!f.verityOut) g.setObjective('boot', 'Wake the demo unit in reception.');
    else if (!it.includes('keycard')) g.setObjective(f.safeSeen ? 'safe' : 'keycard', f.safeSeen ? 'Open the manager’s safe.' : 'Find a way into Production.');
    else g.setObjective('production', 'Swipe the keycard at the production doors.');
  },

  async begin1({ tk, fromDrive }) {
    const g = this.g, f = this.s.flags;
    this.music1();
    if (!f.entered) {
      await g.director.play(async (d) => {
        const A = this.L.anchors;
        d.cut(new THREE.Vector3(3.2, 1.55, 19.5), new THREE.Vector3(0, 4.5, 4));
        g.updateZone(true);
        g.audio.sfx.play('carDoor', { volume: 0.9 });
        g.ui.fade(0, 2.5);
        if (fromDrive) this.card(1, 4.5);
        await d.wait(1.5);
        await d.camTo(new THREE.Vector3(3.0, 1.6, 18.2), new THREE.Vector3(0, 5.2, 4.2), 5, ease.inOutSine);
        g.lightning(1);
        await d.caption('HELPFUL FRIENDS Co. Closed since 1996.', 3);
        await d.caption('The front doors are open.', 2.4);
        void A;
      });
      if (!this.alive(tk)) return;
      g.player.setPose(3.0, 18.2, Math.atan2(3.0, 18.2 - 4.2), 0);
    } else {
      this.card(1, 3);
      g.ui.fade(0, 1.2);
    }
    this.play();
    this.restoreObjective1();
    g.checkpoint();
  },

  zone1(z) {
    const g = this.g, f = this.s.flags, R = this.R;
    if (z.id === 'lobby' && !f.entered) {
      f.entered = true;
      this.music1();
      setTimeout(() => {
        R.entryL.set(0, g, { speed: 6 }); R.entryR.set(0, g, { speed: 6 });
        R.entryL.locked = R.entryR.locked = true;
        g.audio.sfx.play('glassDoor', { position: new THREE.Vector3(0, 1.2, 4), volume: 1.2 });
        g.player.shake = 0.35;
        g.audio.sfx.play('stingerSoft', { volume: 0.6 });
        this.restoreObjective1();
        g.checkpoint();
      }, 1400);
    }
    if (z.id === 'offices' && f.verityOut && !f.phoneRang && !this.fired.has('phone')) {
      this.fired.add('phone');
      setTimeout(() => this.ringPhone(), 2500);
    }
    if (z.id === 'manager' && !f.safeSeen) { f.safeSeen = true; if (f.verityOut && !this.s.items.includes('keycard')) this.restoreObjective1(); }
  },

  update1(dt) {
    const g = this.g;
    if (this.ringing) {
      this.ringT = (this.ringT || 0) - dt;
      if (this.ringT <= 0) { this.ringT = 3.2; g.audio.sfx.play('phoneRing', { position: this.R.phone.pos, volume: 1 }); }
      this.ringLeft -= dt;
      if (this.ringLeft <= 0) { this.ringing = false; this.s.flags.phoneRang = true; }
    }
  },

  frontBreakerLabel() { return this.s.flags.powerFront ? null : 'Throw the breaker'; },
  async frontBreaker() {
    const g = this.g, f = this.s.flags;
    if (f.powerFront) return;
    f.powerFront = true;
    g.audio.sfx.play('breaker', { position: new THREE.Vector3(9.4, 1.5, -5.8) });
    await g.sleep(0.3);
    g.audio.sfx.play('powerUp', { volume: 0.9 });
    this.setFrontPower(true);
    this.ambienceFor(g.zone);
    await g.sleep(2.2);
    this.restoreObjective1();
    g.audio.sfx.play('ding', { position: this.R.displayCase.pos, volume: 0.5 });
    if (!this.s.flags.verityOut) g.ui.toast('Something chimed in reception.', 2.5);
    g.checkpoint();
  },

  takeCamcorder() {
    const g = this.g, f = this.s.flags;
    f.camcorder = true;
    g.player.camcorder.has = true;
    this.R.camcorder.visible = false;
    g.audio.sfx.play('pickup');
    g.ui.toast('Camcorder — Q or right mouse to raise · N night vision · wheel to zoom', 5);
  },

  caseLabel() {
    const f = this.s.flags;
    if (f.verityOut) return null;
    return 'Press the demo button';
  },
  async pressDemo() {
    const g = this.g, f = this.s.flags, v = g.verity, R = this.R;
    if (f.verityOut || this._booting) return;
    if (!f.powerFront) { g.audio.sfx.play('click'); g.ui.toast('Nothing. There’s no power.', 2); return; }
    this._booting = true;
    g.audio.sfx.play('click', { position: R.displayCase.pos });
    await g.director.play(async (d) => {
      const c = R.displayCase.pos;
      await d.camTo(new THREE.Vector3(c.x - 0.2, 1.45, c.z + 1.25), c, 1.2);
      g.audio.sfx.play('powerUp', { position: c, volume: 0.6 });
      R.displayCase.light.intensity = 3;
      v.face.set('neutral', true);
      await d.wait(0.8);
      g.audio.sfx.play('ding', { position: c, volume: 0.8 });
      v.face.set('smile');
      v.spin = 12;
      await d.wait(1.2);
      await d.say('verity', g.brain.greetingLine(), { after: 0.3 });
      const mem = g.save.memories;
      if (mem.played) {
        v.face.set('neutral');
        await d.say('verity', 'You’re the one from Wren Street. You put me in a box. You drove away.', { after: 0.3 });
        v.face.set('smile');
        await d.say('verity', mem.name ? `It’s okay, ${mem.name}. I forgive you. Mostly.` : 'It’s okay. I forgive you. Mostly.', { after: 0.2 });
      } else {
        await d.say('verity', 'You came all this way! Nobody’s visited in so long.', { after: 0.2 });
      }
      d.tween(1.2, (k) => { R.displayCase.lid.position.y = 0.71 + k * 0.5; }, ease.inOutCubic);
      g.audio.sfx.play('glassDoor', { position: c, volume: 0.5 });
      await d.wait(0.6);
      R.displayCase.lid.visible = false;
      v.lookTarget = null;
      v.bobAmount = 1;
      const to = g.player.eyePos.clone().add(g.player.forward.multiplyScalar(0.9)).add(new THREE.Vector3(0, -0.2, 0));
      const fly = v.flyTo(to, 1.6);
      await d.camTo(g.player.eyePos, () => v.position, 1.6, ease.inOutSine);
      await Promise.race([fly, g.sleep(2)]);
      await d.say('verity', 'Let’s go exploring. I know the way. I know everything.', { after: 0 });
    });
    this._booting = false;
    f.verityOut = true;
    v.setMode('follow');
    R.displayCase.btnMat.emissiveIntensity = 0;
    g.addInsanity(Math.max(0, 5 - this.s.insanity));
    g.ui.refreshTalkHint(true);
    this.restoreObjective1();
    g.checkpoint();
    setTimeout(() => { if (!this.s.flags.chatOpened) g.ui.toast('Press T to talk to Verity. Ask her anything — or H for a hint.', 5); }, 4000);
  },

  ringBell() {
    const g = this.g;
    g.audio.sfx.play('ding', { position: new THREE.Vector3(0.9, 1.2, -4.2) });
    if (this.s.flags.verityOut && !this.fired.has('bell')) {
      this.fired.add('bell');
      setTimeout(() => g.speak('verity', 'Ding! Welcome to Helpful Friends! Can I take your coat? Can I take your name? Can I keep it?'), 600);
    }
  },

  ringPhone() {
    if (this.s.flags.phoneRang) return;
    this.ringing = true;
    this.ringT = 0;
    this.ringLeft = 40;
  },
  phoneLabel() { return this.ringing ? 'Answer the phone' : 'Telephone'; },
  async answerPhone() {
    const g = this.g, f = this.s.flags;
    g.audio.sfx.play('click', { position: this.R.phone.pos });
    if (!this.ringing) { g.ui.toast('A dial tone. Then, very faintly, breathing.', 2.5); return; }
    this.ringing = false;
    f.phoneRang = true;
    await g.sleep(0.6);
    await g.speak('manager', 'You have. One. Saved message.', { label: 'VOICEMAIL' });
    await g.speak('ruth', 'Gunnar, it’s Ruth. Don’t let anyone ask it anything else. Not tonight.', { label: 'VOICEMAIL — R. PENROSE' });
    await g.speak('ruth', 'Lock the production doors. Put the keycard in the safe — the code is the day we had the party. I’m going down to find her.', { label: 'VOICEMAIL — R. PENROSE' });
    await g.speak('manager', 'End of messages.', { label: 'VOICEMAIL' });
    g.audio.sfx.play('click', { position: this.R.phone.pos });
    if (this.s.flags.verityOut) setTimeout(() => g.speak('verity', 'The party was the best day. There was cake. There were nine candles.'), 1200);
  },

  safeLabel() { return this.s.flags.safeOpen ? null : 'Use the keypad'; },
  async useSafe() {
    const g = this.g, f = this.s.flags;
    if (f.safeOpen) return;
    const code = await g.panel(keypad({ title: 'LINDQVIST · SAFE', hint: 'four digits', sfx: (n) => g.audio.sfx.play(n, { volume: 0.6 }) }));
    if (code == null) return;
    if (checkSafe(code, SAFE_CODE)) {
      f.safeOpen = true;
      g.audio.sfx.play('keypadGood');
      await g.sleep(0.4);
      g.audio.sfx.play('latch', { volume: 1 });
      const R = this.R;
      const t0 = performance.now();
      const anim = () => { const k = Math.min(1, (performance.now() - t0) / 900); R.safe.open = ease.inOutCubic(k); if (k < 1) requestAnimationFrame(anim); };
      anim();
      R.safe.card.visible = true;
      g.ui.toast('A yellow keycard: PRODUCTION — ALL AREAS.', 3);
      if (f.verityOut) setTimeout(() => g.speak('verity', 'Zero three one two. Vera’s birthday. Everybody forgets. I never forget.'), 900);
    } else {
      g.audio.sfx.play('keypadBad');
      this.safeAlarm();
    }
  },
  async safeAlarm() {
    const g = this.g;
    f_inc(this.s.flags, 'safeFails');
    g.audio.sfx.play('alarm', { volume: 0.8 });
    const z = this.L.zones.get('manager'), oz = this.L.zones.get('offices');
    const prev = [...z.fixtures, ...oz.fixtures].map((x) => x.state);
    [...z.fixtures, ...oz.fixtures].forEach((x) => { x.state = 'strobe'; });
    g.post.redBoost = 0.35;
    g.addInsanity(3);
    if (this.s.flags.safeFails >= 2 && !g.chase.active) this.g.events.figure?.();
    await g.sleep(2.8);
    [...z.fixtures, ...oz.fixtures].forEach((x, i) => { x.state = prev[i]; });
    g.post.redBoost = 0;
    if (this.s.flags.verityOut) g.speak('verity', this.s.insanity > 45 ? 'Wrong. I wonder what the right number is. I know. I won’t tell.' : 'Wrong number! Think. When is a nine-year-old’s birthday? Mine is the twelfth of March.');
  },
  takeKeycard() {
    const g = this.g;
    if (this.s.items.includes('keycard')) return;
    this.s.items.push('keycard');
    this.R.safe.card.visible = false;
    g.audio.sfx.play('pickup');
    this.restoreObjective1();
    g.checkpoint();
  },

  readerLabel() { return this.s.flags.prodOpen ? null : this.s.items.includes('keycard') ? 'Swipe the keycard' : 'Card reader'; },
  async swipeCard() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (f.prodOpen) return;
    if (!this.s.items.includes('keycard')) { g.audio.sfx.play('keypadBad', { volume: 0.5 }); g.ui.toast('ACCESS DENIED — PRODUCTION STAFF ONLY', 2.5); if (f.verityOut && !f.safeSeen) g.speak('verity', 'You need a keycard. Mr. Lindqvist kept his in the safe. His office is past the cubicles.'); return; }
    g.audio.sfx.play('card', { position: new THREE.Vector3(1.35, 1.25, -9.9) });
    await g.sleep(0.4);
    R.reader.led.material.emissive.set(0x30ff40);
    g.audio.sfx.play('keypadGood');
    f.prodOpen = true;
    R.prodL.locked = R.prodR.locked = false;
    R.prodL.set(1, g, { speed: 1.4 }); R.prodR.set(1, g, { speed: 1.4 });
    R.labDoors.set(1, g, { silent: true });
    await g.sleep(1.5);
    this.advance(2);
  },

  useCar() {
    const g = this.g, f = this.s.flags;
    if (f.finaleOut) return this.endingReturns();
    g.ui.toast(this.s.items.includes('carKeys') ? 'You could leave. She’d only follow you.' : 'Locked.', 2.6);
  },

  // ================================================================ CHAPTER II
  setup2() {
    const g = this.g, f = this.s.flags, R = this.R, L = this.L;
    this.setupFactory(2);
    if (f.secondsOut && !f.gridDone) this.spawnSeconds();
    for (const p of R.throwSpots) g.throwables.spawn('ball', new THREE.Vector3(...p), 0);
    const A = L.anchors;
    if (f.fuseIn || this.s.items.includes('fuse')) g.player.setPose(-8.4, -26.5, Math.PI / 2, 0);
    else g.player.setPose(A.prodInside.x, A.prodInside.z, 0, 0);
  },
  music2() { this.g.audio.music.setMood(this.s.flags.secondsOut ? 'stalk' : 'factory'); },
  spawnSeconds() {
    const g = this.g, R = this.R;
    for (const [i, p] of R.binSpawn.entries()) g.seconds.spawn(p.clone(), { yaw: 0, speed: 2.4 + i * 0.3, active: true, layer: 0, face: 'grin' });
  },

  restoreObjective2() {
    const g = this.g, f = this.s.flags, it = this.s.items;
    if (f.gridDone) g.setObjective('warehouse', 'Go through the shutter into the warehouse.');
    else if (f.fuseIn || it.includes('fuse')) g.setObjective('breakers', 'Route power to the freight lift. Control room, west side.');
    else if (f.boardSeen) g.setObjective('fuse', 'Find a fuse for the distribution board.');
    else if (f.rollerTried) g.setObjective('breakers', 'The shutter has no power. Find the control room.');
    else g.setObjective('lab', 'Find a way through the print lab.');
  },

  async begin2({ tk, inPlace }) {
    const g = this.g;
    this.music2();
    this.card(2, 3.5);
    if (!inPlace) g.ui.fade(0, 1.2);
    this.play();
    this.restoreObjective2();
    g.checkpoint();
    if (inPlace && g.verity.visible) setTimeout(() => { if (this.alive(tk)) g.speak('verity', 'Production. Where I was born. Well… printed.'); }, 1500);
  },

  zone2(z) {
    const g = this.g, f = this.s.flags, R = this.R;
    if (z.id === 'printlab' && !f.labSeen) {
      f.labSeen = true;
      this.restoreObjective2();
      setTimeout(async () => {
        R.printSpeed = 0;
        g.audio.sfx.play('powerDown', { volume: 0.4 });
        await g.sleep(1.2);
        R.watchers.forceAll = 3;
        for (let i = 0; i < 6; i++) g.audio.sfx.play('faceTurn', { position: new THREE.Vector3(-1 + i * 2, 1.1, -44.6), volume: 0.7, delay: i * 0.05 });
        await g.sleep(1.0);
        R.printSpeed = 1;
        if (g.verity.visible) await g.speak('verity', 'They’re all me. Every one. Say hello — they’re listening.');
      }, 900);
    }
    if (z.id === 'warehouse' && f.gridDone && this.s.chapter === 2) this.advance(3);
  },

  rollerLocked() {
    const f = this.s.flags;
    if (!f.rollerTried) { f.rollerTried = true; if (!f.fuseIn && !this.s.items.includes('fuse')) this.restoreObjective2(); }
    if (this.s.chapter >= 3) this.g.ui.toast('It won’t budge.', 1.6);
  },

  takeFuse() {
    const g = this.g, f = this.s.flags;
    if (this.s.items.includes('fuse')) return;
    this.s.items.push('fuse');
    g.audio.sfx.play('pickup');
    g.ui.toast('A 60 A cartridge fuse.', 2.2);
    this.restoreObjective2();
    if (!f.secondsOut) this.secondsRelease();
  },

  async secondsRelease() {
    const g = this.g, f = this.s.flags, R = this.R;
    f.secondsOut = true;
    await g.sleep(1.6);
    g.audio.sfx.play('metalSlam', { position: R.binLid.position, volume: 1.3 });
    g.player.shake = 0.5;
    R.binLid.rotation.x = -1.2;
    R.binLid.position.y = 1.9;
    g.particles.burst(R.binLid.position.clone(), 'dust', 30);
    this.spawnSeconds();
    g.seconds.setActive(false);
    await g.director.play(async (d) => {
      await d.camTo(g.camera.position.clone(), R.binSpawn[0].clone().setY(0.6), 0.5, ease.outCubic);
      g.audio.sfx.play('skitter', { position: R.binSpawn[0], volume: 1 });
      await d.wait(1.2);
      if (g.verity.visible) {
        await d.say('verity', 'Oh no. The seconds got out.', { after: 0.1 });
        await d.say('verity', 'Don’t look away from them. They only move when nobody’s looking.', { after: 0.1 });
      }
    }, { skippable: false, letterbox: false });
    g.seconds.setActive(true);
    this.music2();
    g.ui.toast('Keep them in your light. They move when you look away — or when it’s dark.', 4.5);
    this.restoreObjective2();
    g.checkpoint();
  },

  gridLabel() {
    const f = this.s.flags;
    if (f.fuseIn) return 'Open the distribution board';
    return this.s.items.includes('fuse') ? 'Fit the fuse' : 'Distribution board';
  },
  async useGrid() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (!f.fuseIn) {
      if (!this.s.items.includes('fuse')) {
        g.audio.sfx.play('click');
        g.ui.toast('The main fuse holder is empty.', 2.5);
        if (!f.boardSeen) { f.boardSeen = true; this.restoreObjective2(); if (g.verity.visible) g.speak('verity', 'It needs a fuse. There are spares on the benches. In the red tin.'); }
        return;
      }
      f.fuseIn = true;
      R.fuseSlot.visible = true;
      g.audio.sfx.play('fuse', { position: new THREE.Vector3(-15.7, 1.05, -27) });
      await g.sleep(0.5);
    }
    const sfx = (n) => g.audio.sfx.play(n === 'trip' ? 'powerDown' : n, { position: new THREE.Vector3(-15.7, 1.5, -27), volume: 0.8 });
    const result = await g.panel(breakerBoard({ grid: f.grid || defaultGrid(), sfx, onChange: (grid, tripped) => this.applyGrid(grid, tripped), hint: 'Everything off except MAIN draws twenty.' }));
    if (!result) return;
    f.grid = result;
    if (gridSolved(result) && !f.gridDone) this.gridDone();
  },

  applyGrid(grid, tripped, silent = false) {
    const g = this.g, R = this.R, f = this.s.flags;
    const on = (id) => grid.find((b) => b.id === id)?.on;
    const main = on('main');
    R.printLights.forEach((l, i) => { l.state = main && on('lights') ? (i % 4 === 1 ? 'flicker' : 'on') : 'off'; });
    R.benchLamp.state = main ? 'on' : 'off';
    R.ctrlFluo.state = main ? 'flicker' : 'off';
    R.printers.forEach((p, i) => { p.stopped = !main || !on(i < 5 ? 'printA' : 'printB'); });
    f.printersOff = R.printers.every((p) => p.stopped);
    R.gridLevers.forEach((lv, i) => {
      const b = grid[i];
      lv.lv.rotation.z = b.on ? -0.6 : 0.6;
      lv.led.material.emissiveIntensity = b.on ? 3 : 0;
    });
    const load = gridLoad(grid);
    R.gridScreen.state.lines = ['BOARD 2   CAP 100 A', `LOAD      ${String(load).padStart(3)} A`, '', ...grid.map((b) => `${b.on ? '■' : '□'} ${b.label.padEnd(12)} ${String(b.amps).padStart(2)}A`)];
    R.gridScreen.state.color = tripped ? '#ff6a4a' : '#7dff9c';
    R.gridScreen.state.lines.push(tripped ? '*** OVERLOAD — TRIPPED ***' : '');
    if (!silent) {
      this.ambienceFor(g.zone);
      if (tripped) {
        g.particles.burst(new THREE.Vector3(-15.6, -0 + 1.6, -27), 'sparks', 60);
        g.audio.sfx.play('sparks', { position: new THREE.Vector3(-15.6, 1.6, -27) });
        g.post.flash = 0.5;
        g.addInsanity(2, { silent: true });
      }
    }
  },

  async gridDone() {
    const g = this.g, f = this.s.flags, R = this.R;
    f.gridDone = true;
    g.audio.sfx.play('powerUp', { volume: 0.8 });
    await g.sleep(1.4);
    R.labRoller.locked = false;
    R.labRoller.set(1, g, { speed: 0.7 });
    g.seconds.setActive(true);
    this.restoreObjective2();
    if (g.verity.visible) g.speak('verity', 'The lift has power. The shutter’s opening. Go on. Don’t look behind you. Actually — do.');
    g.checkpoint();
  },

  update2() {
    const g = this.g, f = this.s.flags;
    if (f.gridDone && g.player.pos.x > 17.5 && this.s.chapter === 2) this.advance(3);
  },
};

function f_inc(f, k) { f[k] = (f[k] || 0) + 1; }
void EXPRESSIONS; void stageFor; void routeText;
