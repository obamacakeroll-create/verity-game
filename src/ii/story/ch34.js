import * as THREE from 'three';
import { ease, rand } from '../../core/util.js';
import { valveBoard } from './Panels.js';
import { routeText, runSorter, checkValves, valveText } from './puzzles.js';

const name = (g) => (g.brain.memory.name || g.save.memories.name || 'YOU').toUpperCase();

// CHAPTER III — FULFILLMENT and CHAPTER IV — COLD STORAGE.
export const Back = {
  // ================================================================ world state
  setupWarehouse(n) {
    const g = this.g, f = this.s.flags, R = this.R;
    const lv = f.levers || ['R', 'R', 'R'];
    R.diverters.forEach((d, i) => { d.state = lv[i]; });
    this.drawBoxLabel();
    const box = R.myBox.group;
    box.position.set(19.2, 0.85 + 0.21, R.line.z);
    box.visible = !f.cageOpen;
    this.sorter = null;
    this.sorterRunning = false;
    R.cageGate.locked = !f.cageOpen;
    R.cageGate.target = f.cageOpen ? 1 : 0;
    R.cageGate.open = R.cageGate.target;
    const hasKey = this.s.items.includes('elevKey');
    R.elevKey.key.visible = R.elevKey.tag.visible = !hasKey;
    for (const d of R.docks) { d.locked = true; d.set(0, g, { silent: true }); }
    // freight lift
    const down = n >= 4 && !f.finaleUp;
    R.cab.y = down ? -8 : 0;
    R.gateTop.locked = !(f.gateOpen && !down);
    R.gateTop.set(f.gateOpen && !down ? 1 : 0, g, { silent: true });
    R.gateBottom.locked = !down;
    R.gateBottom.set(down ? 1 : 0, g, { silent: true });
    R.cab.led.material.emissive.set(f.gateOpen || down ? 0x30ff40 : 0xff2010);
    R.skylights.forEach((s) => { s.material.emissiveIntensity = 1; });
  },

  drawBoxLabel() {
    const R = this.R, g = this.g;
    const c = R.myBox.labelCanvas.getContext('2d');
    c.fillStyle = '#f2ede0'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#a01a10'; c.font = 'bold 22px Arial'; c.fillText('RETURN TO SENDER', 14, 28);
    c.fillStyle = '#111'; c.font = '18px Arial'; c.fillText('TO: ' + name(g), 14, 58); c.fillText('CONTENTS: 1 × FRIEND', 14, 82);
    c.fillStyle = '#a01a10'; c.font = 'bold 18px Arial'; c.fillText('SHIPS: TOMORROW', 14, 110);
    R.myBox.labelTex.needsUpdate = true;
  },

  setupBasement(n) {
    const g = this.g, f = this.s.flags, R = this.R;
    R.labDoor.locked = !f.labThawed;
    R.labDoor.o.onLocked = () => this.labDoorLocked();
    R.labDoor.set(f.labThawed ? 1 : 0, g, { silent: true });
    R.labIce.visible = !f.labThawed;
    R.labIce.scale.setScalar(1);
    R.labLights.forEach((l) => { l.state = f.labThawed ? 'on' : 'off'; });
    for (const p of R.boxPeople) { p.body.visible = true; p.head.rotation.y = 0; }
    if (f.freezerScare) R.boxPeople[4].body.visible = false;
    R.onAir.material.emissiveIntensity = 0;
    // the Core
    const W = R.ballWall;
    W.mat.emissiveIntensity = n >= 5 && f.coreIntro ? 0.35 : 0.0;
    R.core.wallLight.intensity = n >= 5 && f.coreIntro ? 4 : 0;
    this.setWallEyes(false);
    void n;
  },

  setWallEyes(closed) {
    const W = this.R.ballWall;
    const c = new THREE.Color();
    W.balls.forEach((b, i) => {
      c.set(b.f === 2 ? (closed ? 0xffffff : 0x050403) : b.f === 1 ? (closed ? 0x806040 : 0x080402) : 0xffffff);
      W.mesh.setColorAt(i, c);
    });
    W.mesh.instanceColor.needsUpdate = true;
  },

  // ---------------------------------------------------------------- the lift (runs every frame, even in cutscenes)
  animateCab(to, dur) {
    const R = this.R;
    return new Promise((resolve) => { this.cabAnim = { from: R.cab.y, to, t: 0, dur, resolve }; });
  },
  updateCab(dt) {
    const a = this.cabAnim;
    if (!a || !this.R.cab) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    this.R.cab.y = a.from + (a.to - a.from) * ease.inOutSine(k);
    const p = this.g.player;
    if (this.L.inCab(p.pos)) {
      p.layer = this.R.cab.y < -4 ? -1 : 0;
      p.pos.y = this.R.cab.y;
    }
    if (k >= 1) { this.cabAnim = null; a.resolve(); }
  },

  // ================================================================ CHAPTER III
  setup3() {
    const g = this.g, f = this.s.flags, L = this.L, R = this.R;
    this.setupFactory(3);
    R.labRoller.locked = true;
    R.labRoller.set(0, g, { silent: true });
    for (const p of [[23, 0.07, -36], [36.4, 0.07, -21], [48, 0.07, -38], [30, 0.07, -12.5]]) g.throwables.spawn(p[0] === 30 ? 'bottle' : 'ball', new THREE.Vector3(...p), 0);
    if (this.s.items.includes('elevKey')) g.player.setPose(52, -18, Math.PI * 0.7, 0);
    else if (f.cageOpen) g.player.setPose(50.5, -14.3, -Math.PI / 2, 0);
    else if (f.manifest) g.player.setPose(20.5, -41.5, Math.PI, 0);
    else g.player.setPose(L.anchors.whEntry.x, L.anchors.whEntry.z, -Math.PI / 2, 0);
    g.player.layer = 0;
  },
  music3() { this.g.audio.music.setMood(this.s.flags.manifest ? 'stalk' : 'factory'); },
  restoreObjective3() {
    const g = this.g, f = this.s.flags, it = this.s.items;
    if (!f.manifest) g.setObjective('manifest', 'Your box ships tomorrow. Find the dispatch office.');
    else if (!f.cageOpen) g.setObjective('divert', `Set the diverters — ${routeText(f.route)} — then start the sorter.`);
    else if (!it.includes('elevKey')) g.setObjective('cage', 'The returns cage is open. Look inside.');
    else g.setObjective('down', 'Take the freight elevator down. North-east corner.');
  },
  async begin3({ tk, inPlace }) {
    const g = this.g, f = this.s.flags, R = this.R;
    this.music3();
    this.card(3, 3.5);
    if (inPlace) {
      g.seconds.clear();
      R.labRoller.set(0, g, { speed: 2.2 });
      R.labRoller.locked = true;
      setTimeout(() => { g.audio.sfx.play('metalSlam', { position: new THREE.Vector3(16, 1.5, -34), volume: 1.2 }); g.player.shake = 0.4; }, 900);
    } else g.ui.fade(0, 1.2);
    this.play();
    this.restoreObjective3();
    if (f.manifest) this.startStalker(true);
    g.checkpoint();
    if (inPlace && g.verity.visible) setTimeout(() => { if (this.alive(tk)) g.speak('verity', 'Fulfillment! This is where friends get sent to their new homes. Your box is in here somewhere.'); }, 2600);
  },

  doc_d7() {
    const f = this.s.flags;
    if (f.manifest) return;
    f.manifest = true;
    this.restoreObjective3();
    this.stalkerReveal();
  },

  async stalkerReveal() {
    const g = this.g, m = g.monster, tk = this.token;
    await g.sleep(2.0);
    if (tk !== this.token || g.mode !== 'play') return;
    const at = new THREE.Vector3(39, 0, -21.2);
    g.audio.sfx.play('bones', { position: at.clone().setY(6), volume: 1.2 });
    g.audio.sfx.play('collapse', { position: at.clone().setY(3), volume: 0.5 });
    await g.sleep(1.2);
    m.position.copy(at);
    m.root.rotation.y = Math.atan2(g.player.pos.x - at.x, g.player.pos.z - at.z);
    m.unfold = 1;
    m.mode = 'idle';
    m.show(true);
    g.audio.sfx.play('screech', { position: at.clone().setY(2.4), volume: 0.9 });
    g.audio.music.setMood('stalk', 0.5);
    if (g.verity.visible) g.speak('verity', 'Shh. She’s awake. The other me. Stay out of her sight. Hide in the big boxes if she comes.', { stage: 3 });
    this.startStalker();
    g.checkpoint();
  },
  startStalker(fromLoad = false) {
    const g = this.g, L = this.L;
    const start = fromLoad ? new THREE.Vector3(45, 0, -46) : g.monster.position.clone();
    g.chase.start(start, 0, { mode: 'stalk', patrol: L.patrols.warehouse, layer: 0, sightRange: 15, delay: fromLoad ? 3 : 1.5 });
    this.stalking = true;
  },

  update3(dt) {
    const g = this.g;
    this.updateSorter(dt);
    this.stalkMusic(dt);
    void g;
  },
  stalkMusic(dt) {
    const g = this.g;
    if (!g.chase.active || this.s.transformed) return;
    if (g.chase.state === 'chase') { this._lostT = 0; return; }
    this._lostT = (this._lostT || 0) + dt;
    if (this._lostT > 6 && this._lostT - dt <= 6) g.audio.music.setMood('stalk', 3);
  },

  // ---------------------------------------------------------------- sorter
  diverterLabel(d) { return this.s.flags.cageOpen ? null : `Diverter ${d.idx + 1}: ${d.state === 'L' ? 'LEFT' : 'RIGHT'} — switch`; },
  toggleDiverter(d) {
    const g = this.g, f = this.s.flags;
    if (this.sorterRunning || f.cageOpen) return;
    d.state = d.state === 'L' ? 'R' : 'L';
    f.levers = this.R.diverters.map((x) => x.state);
    g.audio.sfx.play('latch', { position: new THREE.Vector3(d.x - 0.8, 1.1, this.R.line.z + 1), volume: 0.7 });
  },
  startLabel() { return this.s.flags.cageOpen || this.sorterRunning ? null : 'Start the sorter'; },
  readMyBox() {
    const g = this.g;
    g.showNote('Shipping label', `RETURN TO SENDER\nTO: ${name(g)}\nCONTENTS: 1 × FRIEND (USED)\nSCHEDULED: TOMORROW\n\nRouting stamp: ${routeText(this.s.flags.route)}`, null, { style: 'paper' });
    g.addInsanity(1, { silent: true });
  },
  startSorter() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (this.sorterRunning || f.cageOpen) return;
    this.sorterRunning = true;
    R.startBtn.material.emissiveIntensity = 2;
    g.audio.sfx.play('beep', { position: R.startBtn.position });
    g.audio.sfx.play('powerUp', { position: R.startBtn.position, volume: 0.5 });
    this.ambienceFor(g.zone);
    const box = R.myBox.group;
    box.visible = true;
    box.position.set(19.2, 0.85 + 0.21, R.line.z);
    box.rotation.set(0, 0, 0);
    const levers = R.diverters.map((d) => d.state);
    this.sorter = { stage: 'line', out: runSorter(levers, f.route), t: 0 };
    // it's loud
    g.chase.hear(box.position, 30, false);
  },
  updateSorter(dt) {
    const S = this.sorter;
    if (!S) return;
    const g = this.g, R = this.R, box = R.myBox.group;
    S.t += dt;
    if (S.stage === 'line') {
      box.position.x += dt * 1.6;
      const stopX = S.out >= 0 ? R.diverters[S.out].x : 52.6;
      if (box.position.x >= stopX) {
        box.position.x = stopX;
        if (S.out >= 0) { S.stage = 'divert'; g.audio.sfx.play('thud', { position: box.position, volume: 0.8 }); }
        else { S.stage = 'chute'; S.t = 0; }
      }
    } else if (S.stage === 'divert') {
      box.position.z -= dt * 1.4;
      if (box.position.z < R.line.z - 5.2) { S.stage = 'fail'; S.t = 0; this.sorterFail(); }
    } else if (S.stage === 'chute') {
      const k = Math.min(1, S.t / 0.8);
      box.position.set(52.6 + k * 2.0, 0.85 + 0.21 - k * 0.85, R.line.z);
      box.rotation.z = -k * 0.35;
      if (k >= 1) { S.stage = 'done'; this.sorterSuccess(); }
    }
  },
  async sorterFail() {
    const g = this.g, R = this.R, tk = this.token;
    const wz = this.L.zones.get('warehouse');
    g.audio.sfx.play('alarm', { volume: 1 });
    const prev = wz.fixtures.map((x) => x.state);
    wz.fixtures.forEach((x) => { if (x.state !== 'off') x.state = 'strobe'; });
    g.post.redBoost = 0.3;
    g.chase.hear(R.myBox.group.position.clone(), 80, true);
    g.addInsanity(3);
    if (g.verity.visible) g.speak('verity', 'Wrong chute! Now it’s going to the wrong house. Someone else will open it. Check the label. Check the manifest.');
    await g.sleep(3.5);
    if (tk !== this.token) return;
    wz.fixtures.forEach((x, i) => { x.state = prev[i]; });
    g.post.redBoost = 0;
    await g.sleep(2);
    R.myBox.group.position.set(19.2, 0.85 + 0.21, R.line.z);
    R.startBtn.material.emissiveIntensity = 0.3;
    this.sorterRunning = false;
    this.sorter = null;
    this.ambienceFor(g.zone);
  },
  async sorterSuccess() {
    const g = this.g, f = this.s.flags, R = this.R;
    g.audio.sfx.play('box', { position: R.myBox.group.position, volume: 1 });
    await g.sleep(0.8);
    g.audio.sfx.play('keypadGood', { position: new THREE.Vector3(53.2, 1.4, -14.3) });
    g.audio.sfx.play('latch', { position: new THREE.Vector3(53.2, 1.4, -14.3), volume: 1 });
    f.cageOpen = true;
    R.cageGate.locked = false;
    R.cageGate.target = 1;
    this.sorterRunning = false;
    this.ambienceFor(g.zone);
    this.restoreObjective3();
    if (g.verity.visible) g.speak('verity', 'Returned! Just like you. The cage is open.');
    g.checkpoint();
  },
  cageLabel() { return this.s.flags.cageOpen ? null : 'RETURNS — locked. It opens when a return arrives.'; },
  useCage() { if (!this.s.flags.cageOpen) { this.g.audio.sfx.play('locked', { position: new THREE.Vector3(53.2, 1.2, -14.3) }); } },
  tape_r4() { const g = this.g; if (g.verity.visible) setTimeout(() => g.speak('verity', 'I told her Vera was fine. Vera IS fine. Vera is everywhere.', { stage: 3 }), 800); },
  takeElevKey() {
    const g = this.g, R = this.R;
    if (this.s.items.includes('elevKey')) return;
    this.s.items.push('elevKey');
    R.elevKey.key.visible = R.elevKey.tag.visible = false;
    g.audio.sfx.play('pickup');
    g.ui.toast('A heavy key on a red tag: FREIGHT — B1.', 3);
    this.restoreObjective3();
    g.checkpoint();
  },
  dockPanelLabel() { return 'Dock controls'; },
  dockPanel() {
    const g = this.g;
    g.audio.sfx.play('keypadBad', { volume: 0.5 });
    g.ui.toast(this.s.flags.finale ? 'DOCK 3 — OPEN' : 'DOCKS LOCKED OUT — CONTACT SECURITY', 2.5);
  },

  // ---------------------------------------------------------------- the lift
  elevKeyLabel() {
    if (this.s.flags.gateOpen || this.s.chapter !== 3) return null;
    return this.s.items.includes('elevKey') ? 'Turn the key' : 'Key switch';
  },
  async useElevKey() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (!this.s.items.includes('elevKey')) { g.audio.sfx.play('locked'); g.ui.toast('It needs a key.', 2); return; }
    f.gateOpen = true;
    g.audio.sfx.play('latch', { volume: 0.9 });
    R.cab.led.material.emissive.set(0x30ff40);
    await g.sleep(0.5);
    R.gateTop.locked = false;
    R.gateTop.set(1, g, { speed: 0.9 });
    g.audio.sfx.play('ding', { position: this.L.anchors.cabCentre, volume: 0.6 });
  },
  cabLabel() {
    const f = this.s.flags;
    if (this.s.chapter === 3 && f.gateOpen) return 'Go down — B1';
    if (this.s.chapter >= 4 && !f.finale) return 'The lift won’t go back up';
    return null;
  },
  useCab() {
    if (this.s.chapter === 3 && this.s.flags.gateOpen) this.descend();
  },
  async descend() {
    const g = this.g, R = this.R, p = g.player, tk = this.token;
    if (this._riding) return;
    if (!this.L.inCab(p.pos)) { g.ui.toast('Step inside first.', 1.6); return; }
    this._riding = true;
    g.chase.stop();
    g.monster.show(false);
    p.canMove = false;
    R.gateTop.set(0, g, { speed: 1.2 });
    R.gateTop.locked = true;
    g.audio.sfx.play('metalSlam', { position: this.L.anchors.cabCentre, volume: 0.6, delay: 1.2 });
    await g.sleep(1.8);
    const loop = g.audio.sfx.loop('elevator', { volume: 0.6 });
    const ride = this.animateCab(-8, 10);
    setTimeout(() => {
      if (tk !== this.token) return;
      g.audio.sfx.play('thud', { position: this.L.anchors.cabCentre.clone().setY(R.cab.y + 3.4), volume: 1.4 });
      g.player.shake = 0.8;
      R.cab.light.state = 'flicker';
      g.audio.sfx.play('bones', { position: this.L.anchors.cabCentre.clone().setY(R.cab.y + 3.4), volume: 1 });
      setTimeout(() => { R.cab.light.state = 'buzz'; }, 1800);
    }, 5200);
    await ride;
    loop.stop(0.8);
    this._riding = false;
    if (tk !== this.token) return;
    g.audio.sfx.play('thud', { volume: 0.6 });
    p.layer = -1;
    this.s.flags.descended = true;
    R.gateBottom.locked = false;
    R.gateBottom.set(1, g, { speed: 0.9 });
    p.canMove = true;
    this.advance(4);
  },

  // ================================================================ CHAPTER IV
  setup4() {
    const g = this.g, f = this.s.flags, L = this.L;
    this.setupFactory(4);
    g.player.layer = -1;
    if (f.labThawed) g.player.setPose(26.5, -47, Math.PI / 2, 0, -8, -1);
    else g.player.setPose(L.anchors.cabCentre.x, L.anchors.cabCentre.z, Math.PI / 2, 0, -8, -1);
    for (const p of [[31, -7.93, -46], [44, -7.93, -46.5]]) g.throwables.spawn('bottle', new THREE.Vector3(...p), -1);
  },
  music4() { this.g.audio.music.setMood(this.stalking ? 'stalk' : 'cold'); },
  restoreObjective4() {
    const g = this.g, f = this.s.flags;
    if (f.labThawed) g.setObjective(f.r5heard ? 'core' : 'search', f.r5heard ? 'Go through the tunnel at the back of the lab.' : 'Search Dr. Penrose’s lab.');
    else if (f.labDoorSeen) g.setObjective('valves', 'Thaw the lab door. The valve board is beside it.');
    else g.setObjective('cold', 'Find Dr. Penrose’s lab.');
  },
  async begin4({ tk, inPlace }) {
    const g = this.g, f = this.s.flags;
    this.stalking = false;
    this.music4();
    this.card(4, 3.5);
    if (!inPlace) g.ui.fade(0, 1.2);
    this.play();
    this.restoreObjective4();
    if (f.falsityMet && !f.labThawed) this.startColdStalker(true);
    g.checkpoint();
    if (inPlace && g.verity.visible) setTimeout(() => { if (this.alive(tk)) g.speak('verity', 'She kept everything cold. So nothing would ever change.'); }, 2000);
  },
  labDoorLocked() {
    const g = this.g, f = this.s.flags;
    g.ui.toast('Frozen shut.', 1.6);
    if (!f.labDoorSeen) { f.labDoorSeen = true; this.restoreObjective4(); }
  },
  zone4(z) {
    const g = this.g, f = this.s.flags, R = this.R, tk = this.token;
    if (z.id === 'freezerB' && !f.freezerScare) {
      f.freezerScare = true;
      (async () => {
        await g.sleep(1.4);
        const p = g.player.pos;
        for (const b of R.boxPeople) {
          const wp = new THREE.Vector3();
          b.head.getWorldPosition(wp);
          const want = Math.atan2(p.x - wp.x, p.z - wp.z) - b.body.rotation.y + Math.PI;
          const k0 = b.head.rotation.y;
          const t0 = performance.now();
          const step = () => { const k = Math.min(1, (performance.now() - t0) / 500); b.head.rotation.y = k0 + (want - k0) * k; if (k < 1) requestAnimationFrame(step); };
          setTimeout(step, Math.random() * 300);
        }
        g.audio.sfx.play('faceTurn', { position: new THREE.Vector3(42, -7, -53), volume: 1 });
        g.audio.sfx.play('stinger', { volume: 0.5, delay: 0.2 });
        await g.sleep(2.2);
        if (tk !== this.token) return;
        R.freezerDoors[1].set(0, g, { speed: 5 });
        const zb = this.L.zones.get('freezerB');
        g.lights.setZonePower(zb, 0);
        await g.sleep(2.4);
        R.boxPeople[4].body.visible = false;
        g.lights.setZonePower(zb, 1);
        g.flickerZone(0.8, zb);
        g.audio.sfx.play('giggle', { position: new THREE.Vector3(42, -7, -50), volume: 0.4 });
        g.addInsanity(3);
      })();
    }
    if (z.id === 'coldhall' && f.falsityMet && !f.labThawed && !this.stalking && !this.s.transformed) this.startColdStalker();
    if (z.id === 'lab' && f.labThawed && !f.labSeen2) {
      f.labSeen2 = true;
      R.labLights.forEach((l, i) => setTimeout(() => { l.state = 'flicker'; setTimeout(() => { l.state = 'on'; }, 600); }, 300 + i * 400));
      if (g.verity.visible) setTimeout(() => g.speak('verity', 'Mummy’s lab. She let me sit in the booth when she recorded. I liked the red light.'), 1500);
    }
    if (z.id === 'tunnel' && f.labThawed && this.s.chapter === 4) this.advance(5);
  },
  update4(dt) { this.stalkMusic(dt); },
  startColdStalker(fromLoad = false) {
    const g = this.g, L = this.L;
    this.stalking = true;
    const at = new THREE.Vector3(53, -8, -47);
    g.audio.sfx.play('growl', { position: at.clone().setY(-6.5), volume: 1, occluded: true });
    g.chase.start(at, -Math.PI / 2, { mode: 'stalk', patrol: L.patrols.cold, layer: -1, sightRange: 12, delay: fromLoad ? 4 : 2, speedMul: 0.95 });
    this.music4();
  },

  falsityLabel() { return 'Talk to F-01'; },
  async talkFalsity() {
    const g = this.g, f = this.s.flags, F = this.R.falsity;
    if (!f.falsityMet) {
      f.falsityMet = true;
      g.save.data.falsityMet = true;
      g.save.write();
      F.light.intensity = 1.4;
      g.audio.sfx.play('powerUp', { position: F.pos, volume: 0.4 });
      await g.speak('falsity', 'Hello. I’m Verity. The real one. The good one.', { name: 'F-01' });
      await g.speak('falsity', 'Ask me anything, and I promise I’ll tell you the truth.', { name: 'F-01' });
      if (g.verity.visible) await g.speak('verity', 'That’s F-01. My big sister. Everything she says is a fib.');
    }
    this.falsityMode = true;
    g.openChat();
    g.ui.chatInput && (g.ui.chatInput.placeholder = 'Ask F-01 anything…');
  },
  onCloseChatFalsity() {},
  readChairBox() {
    const g = this.g;
    g.ui.toast(`${name(g)} — RETURNED. SEAT 10.`, 3);
    g.addInsanity(2);
    if (g.verity.visible) setTimeout(() => g.speak('verity', 'That one’s yours. For later. It’s nice and cold.'), 900);
  },
  valveLabel() { return this.s.flags.labThawed ? null : 'Turn the valves'; },
  async useValves() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (f.labThawed) return;
    const sfx = (n) => g.audio.sfx.play(n === 'valve' ? 'creak' : n, { position: new THREE.Vector3(30.4, -6.5, -45.3), volume: 0.7 });
    const order = await g.panel(valveBoard({ sfx, hint: 'Turn them in order. The note says: do the opposite of what the prototype tells you.' }));
    if (!order) return;
    R.valves.forEach((v, i) => { v.rotation.z += Math.PI * (1 + order.indexOf(i + 1)); });
    if (checkValves(order, f.valves)) this.thaw();
    else this.valveFail();
  },
  async valveFail() {
    const g = this.g;
    const at = new THREE.Vector3(29, -7, -46.5);
    for (let i = 0; i < 4; i++) setTimeout(() => g.particles.burst(at.clone().add(new THREE.Vector3(Math.random(), Math.random(), 0)), 'breath', 40), i * 120);
    g.audio.sfx.play('whoosh', { position: at, volume: 1.2 });
    g.audio.sfx.play('sparks', { position: at, volume: 0.5 });
    g.post.damage = 0.5;
    g.player.shake = 0.5;
    g.chase.hear(at, 40, true);
    g.addInsanity(2);
    if (g.verity.visible) g.speak('verity', this.s.insanity >= 50 ? 'Wrong again. Maybe ask F-01. She’s very honest.' : 'Not that order! Ask me. Or ask F-01, and do the opposite.');
  },
  async thaw() {
    const g = this.g, f = this.s.flags, R = this.R;
    f.labThawed = true;
    g.audio.sfx.play('whoosh', { position: new THREE.Vector3(28, -7, -47), volume: 1 });
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 3000);
      R.labIce.scale.set(1 - k * 0.95, 1 - k * 0.6, 1 - k * 0.3);
      R.labIce.position.y = -6.85 - k * 0.6;
      if (Math.random() < 0.3) g.particles.burst(new THREE.Vector3(28.2, -8 + Math.random() * 2, -47 + (Math.random() - 0.5)), 'breath', 4);
      if (k < 1) requestAnimationFrame(step); else R.labIce.visible = false;
    };
    step();
    await g.sleep(3.2);
    R.labDoor.locked = false;
    R.labDoor.set(1, g);
    if (this.stalking) {
      g.chase.stop();
      g.audio.sfx.play('growl', { position: new THREE.Vector3(50, -6.5, -47), volume: 0.6, occluded: true });
      setTimeout(() => g.monster.show(false), 400);
      this.stalking = false;
    }
    this.music4();
    this.restoreObjective4();
    g.checkpoint();
  },
  doc_d8() { if (!this.s.flags.labDoorSeen) { this.s.flags.labDoorSeen = true; this.restoreObjective4(); } },
  async useMic() {
    const g = this.g, R = this.R, f = this.s.flags;
    R.onAir.material.emissive.set(0xff2a1a);
    R.onAir.material.emissiveIntensity = 2.5;
    g.audio.sfx.play('click', { position: R.mic.position });
    await g.sleep(0.8);
    await g.speak('vera', 'Hello! My name is Vera Penrose and I’m nine. This is my best friend Verity. You can ask her anything!', { name: 'RECORDING — VERA' });
    await g.speak('vera', 'Mummy says I have to stop asking questions now. But I don’t want to stop.', { name: 'RECORDING — VERA' });
    R.onAir.material.emissiveIntensity = 0;
    f.heardVera = true;
    if (g.verity.visible) setTimeout(() => g.speak('verity', 'That’s me. Before. That’s who I was.', { stage: 1 }), 700);
  },
  tape_r5() {
    const g = this.g, f = this.s.flags;
    f.r5heard = true;
    this.restoreObjective4();
    if (g.verity.visible) setTimeout(() => g.speak('verity', '…She said I could stop. Nobody ever told me how.'), 800);
  },
};
void rand; void valveText;
