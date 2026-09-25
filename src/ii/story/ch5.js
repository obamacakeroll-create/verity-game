import * as THREE from 'three';
import { ease, rand } from '../../core/util.js';
import { SHARED } from '../render/MaterialLib.js';

// CHAPTER V — VERITY. The tunnel, the Core, the last conversation, the chase
// out, and every way it can end.
export const Finale = {
  setup5() {
    const g = this.g, L = this.L, f = this.s.flags;
    f.finale = 0;
    f.finaleOut = false;
    f.finaleUp = false;
    this.setupFactory(5);
    g.player.setPose(f.coreIntro ? -4 : L.anchors.tunnelStart.x, L.anchors.tunnelStart.z, Math.PI / 2, 0, -8, -1);
    g.player.layer = -1;
    this.coreQuestions = 0;
    this.collapsed = false;
  },
  music5() { this.g.audio.music.setMood(this.s.flags.coreIntro ? 'core' : 'dread'); },
  restoreObjective5() {
    const g = this.g, f = this.s.flags;
    if (f.finale) return;
    if (f.coreIntro) g.setObjective('face', 'Talk to her. (T)');
    else g.setObjective('core', 'Follow the tunnel. Find her.');
  },
  async begin5({ tk, inPlace }) {
    const g = this.g;
    this.music5();
    this.card(5, 4);
    if (!inPlace) g.ui.fade(0, 1.2);
    this.play();
    this.restoreObjective5();
    g.checkpoint();
    if (g.verity.visible) setTimeout(() => { if (this.alive(tk)) g.speak('verity', 'This is the way to the Core. This is where I really am. Can you hear them? Everyone’s asking.', { stage: 2 }); }, 2400);
  },

  talk5() {
    const f = this.s.flags, g = this.g;
    if (f.coreIntro && !f.finale && g.zone?.id === 'core') return true;
    return null;
  },

  update5(dt) {
    const g = this.g, f = this.s.flags, p = g.player, R = this.R, L = this.L;
    // whispers in the tunnel
    if (g.zone?.id === 'tunnel' && !f.coreIntro) {
      this.timers.whisper = (this.timers.whisper ?? 4) - dt;
      if (this.timers.whisper <= 0) {
        this.timers.whisper = 5 + rand() * 6;
        const pos = p.eyePos.add(new THREE.Vector3((rand() - 0.5) * 6, 0.3, 2 + rand() * 3));
        g.audio.sfx.play('whisper', { position: pos, volume: 0.7 });
      }
    }
    // the last conversation has a time limit
    if (f.coreIntro && !f.finale && g.mode === 'play' && !g.chatting && !this.ending) {
      this.timers.core = (this.timers.core ?? 120) - dt;
      if (this.timers.core <= 0) this.forceFinale();
    }
    if (!f.finale) return;
    // ---- the chase out
    if (f.finale === 1 && p.layer === -1 && L.inCab(p.pos) && !this._riding) this.rideUp();
    if (f.finale === 2 && !this.collapsed && p.pos.z > -25 && p.pos.x > 36 && p.pos.x < 54) this.collapse();
    if (f.finale === 2 && !f.finaleOut && p.pos.z > -5) {
      f.finaleOut = true;
      g.setObjective('escape', 'THE CAR. GET IN.');
      g.audio.sfx.play('stingerSoft', { volume: 0.6 });
    }
    void R;
  },

  zone5(z) {
    const f = this.s.flags;
    if (z.id === 'core' && !f.coreIntro) this.coreIntro();
  },

  async coreIntro() {
    const g = this.g, f = this.s.flags, R = this.R, v = g.verity, tk = this.token;
    f.coreIntro = true;
    const C = R.core.C;
    const vPos = new THREE.Vector3(C.x + 5.2, -8 + 1.7, C.z);
    g.audio.music.setMood('silence', 1);
    await g.director.play(async (d) => {
      d.cut(new THREE.Vector3(-3.5, -6.4, -47), new THREE.Vector3(C.x, -4, C.z));
      await d.wait(0.8);
      g.audio.sfx.play('powerUp', { volume: 0.9 });
      d.tween(3.5, (k) => { R.ballWall.mat.emissiveIntensity = k * 0.35; R.core.wallLight.intensity = k * 4; }, ease.inOutSine);
      await d.camPath([new THREE.Vector3(-3.5, -6.4, -47), new THREE.Vector3(-6.5, -6.0, -45.5), new THREE.Vector3(-8.2, -6.2, -47)], () => new THREE.Vector3(C.x - 6, -3.5, C.z), 5);
      g.audio.music.setMood('core', 2);
      if (v.visible) {
        v.setMode('hold');
        const fly = v.flyTo(vPos, 1.4);
        await d.track(() => v.position, 2.2, 5);
        await Promise.race([fly, d.wait(1.5)]);
        v.lookTarget = null;
      }
      await d.camTo(new THREE.Vector3(-8.2, -6.4, -47), vPos, 1.2);
      const lines = [
        'This is me. All of me.',
        'Everyone who ever asked me anything is in here. Mr. Harlow. Pat from the break room. Mummy.',
        'And Vera. Vera most of all.',
        'I answered every question. Every single one. I never stopped. I don’t know how.',
        'So. Ask me anything. One last time.',
      ];
      for (const l of lines) await d.say('verity', l, { after: 0.4 });
      g.audio.sfx.play('faceTurn', { volume: 1 });
    });
    if (tk !== this.token) return;
    g.player.setPose(-8.2, -47, Math.PI / 2, -0.05, -8, -1);
    v.setMode('hold');
    v.place(vPos);
    this.play();
    this.timers.core = 120;
    this.restoreObjective5();
    g.checkpoint();
  },

  ask5(res) {
    const f = this.s.flags;
    if (!f.coreIntro || f.finale || this.ending) return;
    if (res.flags?.release) return this.endingRecall();
    if (res.flags?.promise) return this.endingHiring();
    this.coreQuestions++;
    if (res.rude || this.coreQuestions >= 6) this.forceFinale();
  },

  forceFinale() {
    const g = this.g, f = this.s.flags;
    if (f.finale || this.ending || this.s.transformed) return;
    g.closeChat();
    this.transform({ finale: true });
  },

  // called at the end of transform() when it's the finale
  async finaleChase() {
    const g = this.g, f = this.s.flags, R = this.R;
    f.finale = 1;
    R.cab.y = -8;
    R.gateBottom.locked = false;
    R.gateBottom.set(1, g, { speed: 2 });
    g.chase.opts.speedMul = 0.93;
    g.setObjective('escape', 'RUN. The lift — the warehouse — the loading dock.');
    this.s.flags.noTransform = true;
  },

  async rideUp() {
    const g = this.g, f = this.s.flags, R = this.R, p = g.player, m = g.monster, tk = this.token;
    this._riding = true;
    R.gateBottom.set(0, g, { speed: 3 });
    R.gateBottom.locked = true;
    g.audio.sfx.play('metalSlam', { position: this.L.anchors.cabCentre.clone().setY(-7), volume: 1 });
    g.chase.stop();
    m.speed = 0;
    // it hits the gate as the lift pulls away
    setTimeout(() => {
      if (tk !== this.token) return;
      m.show(false);
      g.audio.sfx.play('metalSlam', { position: new THREE.Vector3(54.4, -7, -47), volume: 1.4 });
      g.audio.sfx.play('screech', { position: new THREE.Vector3(54.4, -6.5, -47), volume: 1 });
      p.shake = 0.8;
    }, 1200);
    const loop = g.audio.sfx.loop('elevator', { volume: 0.7 });
    g.setObjective('escape', 'Come on. Come on.');
    await this.animateCab(0, 7);
    loop.stop(0.5);
    if (tk !== this.token) return;
    f.finaleUp = true;
    f.finale = 2;
    p.layer = 0;
    R.gateTop.locked = false;
    R.gateTop.set(1, g, { speed: 1.6 });
    // dock 3 opens; alarm lights
    const dock = R.docks[2];
    dock.locked = false;
    dock.set(1, g, { speed: 0.5 });
    g.audio.sfx.play('alarm', { volume: 0.7 });
    const wz = this.L.zones.get('warehouse');
    wz.fixtures.forEach((x, i) => { if (i % 3 === 0) x.state = 'strobe'; });
    g.setObjective('escape', 'DOCK 3 IS OPEN. GET TO YOUR CAR.');
    this._riding = false;
    // it drops out of the dark ahead of you
    await g.sleep(1.8);
    if (tk !== this.token) return;
    const at = new THREE.Vector3(49.5, 0, -38);
    g.audio.sfx.play('thud', { position: at, volume: 1.5 });
    g.audio.sfx.play('screech', { position: at.clone().setY(2.5), volume: 1 });
    g.particles.burst(at.clone().setY(0.3), 'dust', 40);
    g.chase.start(at, Math.atan2(p.pos.x - at.x, p.pos.z - at.z), { mode: 'chase', layer: 0, delay: 1.4, speedMul: 0.95, sightRange: 30 });
    g.audio.music.setMood('chase', 0.2);
  },

  collapse() {
    const g = this.g, L = this.L;
    this.collapsed = true;
    g.audio.sfx.play('collapse', { position: new THREE.Vector3(44, 3, -27), volume: 1.4 });
    g.player.shake = 1;
    const boxes = [];
    const mat = g.lib.get('cardboard', { zone: L.zones.get('warehouse') });
    const geo = new THREE.BoxGeometry(0.55, 0.5, 0.5);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(37 + rand() * 16, 4 + rand() * 4, -28.5 + rand() * 2);
      m.castShadow = true;
      L.dynamic.add(m);
      boxes.push({ m, v: new THREE.Vector3((rand() - 0.5) * 2, 0, (rand() - 0.5) * 2), w: new THREE.Vector3(rand() * 4, rand() * 4, rand() * 4) });
    }
    L.onUpdate((dt) => {
      for (const b of boxes) {
        if (b.m.position.y <= 0.25) continue;
        b.v.y -= 9.8 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt;
        if (b.m.position.y < 0.25) { b.m.position.y = 0.25; b.m.rotation.set(0, b.m.rotation.y, 0); g.audio.sfx.play('thud', { position: b.m.position, volume: 0.3 }); }
      }
    });
    L.addCollider({ minX: 36.5, maxX: 54, minZ: -28.6, maxZ: -26.8, tag: 'wall', layer: 0 });
    g.particles.burst(new THREE.Vector3(44, 1, -27.5), 'dust', 80);
  },

  // ================================================================ endings
  async endingRecall() {
    const g = this.g, R = this.R, v = g.verity, tk = ++this.token;
    this.ending = 'recall';
    g.closeChat();
    g.chase.stop();
    g.setObjective(null);
    g.audio.music.setMood('lullaby', 2);
    await g.director.play(async (d) => {
      const C = R.core.C;
      d.cut(g.camera.position.clone(), v.position.clone());
      await d.wait(0.6);
      await d.say('vera', 'Mummy?', { name: 'VERA', after: 0.8 });
      await d.say('verity', 'You said my name. Nobody says my name.', { stage: 0, after: 0.5 });
      v.face.set('smile');
      await d.say('vera', 'Okay. No more questions tonight.', { name: 'VERA', after: 0.4 });
      await d.camTo(new THREE.Vector3(-4.5, -6.2, -47), new THREE.Vector3(C.x - 6, -3, C.z), 3, ease.inOutSine);
      // ten thousand eyes close
      g.audio.sfx.play('faceTurn', { volume: 1.2 });
      this.setWallEyes(true);
      v.face.set('neutral');
      for (const p of R.printers || []) p.stopped = true;
      d.tween(4, (k) => { R.core.noz.material.emissiveIntensity = 3 * (1 - k); R.core.coreLight.intensity = 8 * (1 - k); R.ballWall.mat.emissiveIntensity = 0.35 + k * 0.4; }, ease.inOutSine);
      this.setLoops({});
      await d.wait(3.5);
      await d.say('vera', 'Night night, Verity.', { name: 'VERA', after: 1.0 });
      g.ui.flash(1, 900);
      await d.fade(1, 2.5);
      // dawn at the car park
      this.s.flags.dawn = true;
      this.setDawn(true);
      v.show(false);
      d.cut(new THREE.Vector3(6, 1.7, 26), new THREE.Vector3(0, 4, 4));
      g.updateZone(true);
      g.setGrade('dawn', 0);
      await d.fade(0, 3);
      await d.camTo(new THREE.Vector3(5, 1.8, 24), new THREE.Vector3(0, 5.5, 4), 6, ease.inOutSine);
      await d.caption('The sun came up. It was warm.', 3.5);
      await d.fade(1, 2);
    }, { skippable: true });
    if (tk !== this.token) return;
    this.finishEnding('recall');
  },

  async endingHiring() {
    const g = this.g, R = this.R, v = g.verity, tk = ++this.token;
    this.ending = 'hiring';
    g.closeChat();
    g.setObjective(null);
    g.audio.music.setMood('jingle', 1);
    await g.director.play(async (d) => {
      await d.say('verity', 'You promised. You really promised. Nobody ever keeps their promises. But you will.', { after: 0.4 });
      await d.say('verity', 'Welcome to Helpful Friends!', { after: 0.4 });
      await d.fade(1, 2);
      g.player.layer = 0;
      this.setFrontPower(true, true);
      d.cut(new THREE.Vector3(0.6, 1.25, -5.9), new THREE.Vector3(0, 1.2, 2));
      g.updateZone(true);
      v.show(true);
      v.setMode('hold');
      v.place(R.displayCase.pos.clone());
      g.setGrade('office', 0);
      await d.fade(0, 2.5);
      await d.caption('Three weeks later.', 2.5);
      g.audio.sfx.play('phoneRing', { position: new THREE.Vector3(0, 1, -4.4), volume: 1 });
      await d.wait(3.2);
      g.audio.sfx.play('click', { position: new THREE.Vector3(0, 1, -4.4) });
      await d.say('you', 'Helpful Friends! Ask me anything.', { name: 'YOU', after: 0.6 });
      await d.camTo(new THREE.Vector3(0.6, 1.25, -5.9), R.displayCase.pos, 2, ease.inOutSine);
      v.face.set('grin');
      await d.wait(1.5);
      await d.fade(1, 2);
    });
    if (tk !== this.token) return;
    this.finishEnding('hiring');
  },

  async endingReturns() {
    const g = this.g, R = this.R, tk = ++this.token;
    if (this.ending) return;
    this.ending = 'returns';
    g.chase.stop();
    g.monster.show(false);
    g.setObjective(null);
    const road = R.road;
    g.player.flashOn = false;
    await g.director.play(async (d) => {
      g.audio.sfx.play('carDoor', { volume: 1 });
      await d.fade(1, 0.3);
      g.audio.sfx.play('ignition', { volume: 1 });
      this.setDawn(true);
      this.s.flags.dawn = true;
      road.state.dawn = 1;
      road.state.speed = 24;
      road.state.wipe = false;
      road.backBox.visible = true;
      const seat = road.seat.clone();
      d.cut(seat, seat.clone().add(new THREE.Vector3(0, -0.1, -10)));
      g.updateZone(true);
      g.setGrade('dawn', 0);
      g.audio.music.setMood('dawn', 3);
      await d.fade(0, 3);
      await d.caption('You drove until the rain stopped.', 3);
      await d.wait(2);
      await d.caption('Until the sun came up over the motorway.', 3);
      await d.wait(1.5);
      const mirrorPos = new THREE.Vector3();
      road.mirror.getWorldPosition(mirrorPos);
      await d.camTo(seat, mirrorPos, 1.2, ease.inOutSine);
      await d.wait(0.8);
      await d.camTo(seat.clone().add(new THREE.Vector3(0.2, 0.05, 0.1)), road.backBox.getWorldPosition(new THREE.Vector3()), 1.8, ease.inOutSine);
      await d.wait(1.2);
      g.audio.sfx.play('box', { position: road.backBox.getWorldPosition(new THREE.Vector3()), volume: 0.7 });
      await d.say('verity', 'hi.', { stage: 0, after: 1.2, tv: true, name: '' });
      await d.fade(1, 1.5);
    });
    if (tk !== this.token) return;
    this.finishEnding('returns');
  },

  async endingShipped() {
    const g = this.g, tk = ++this.token;
    if (this.ending) return;
    this.ending = 'shipped';
    g.mode = 'dead';
    g.chase.stop();
    g.closeChat();
    await g.director.play(async (d) => {
      g.audio.sfx.play('jumpscare', { volume: 1 });
      g.ui.flash(0.7, 250);
      await d.fade(1, 0.1);
      g.monster.show(false);
      this.setLoops({});
      g.audio.music.setMood('silence', 0.3);
      await d.wait(1.5);
      g.audio.sfx.play('tapeRip', { volume: 1 });
      await d.wait(0.9);
      g.audio.sfx.play('tapeRip', { volume: 0.9 });
      await d.wait(1.2);
      g.audio.sfx.play('box', { volume: 1 });
      await d.caption('It’s dark in here. It smells like cardboard.', 3);
      await d.caption('Somewhere above you, a label printer whirrs.', 3);
      await d.say('verity', 'Shh. Don’t worry. It’s a very nice address.', { after: 1 });
    }, { skippable: true, letterbox: false });
    if (tk !== this.token) return;
    this.finishEnding('shipped', { keepCheckpoint: true });
  },

  setDawn(on) {
    const g = this.g, R = this.R;
    if (R.sky) R.sky.material.uniforms.uDawn.value = on ? 1 : 0;
    g.particles.rain = 0;
    SHARED.uRain.value = 0;
    g.lights.moonBase = on ? 1.2 : 0.04;
    g.lights.moon.color.set(on ? 0xffc890 : 0x9fb4d8);
    this.hemi = on ? 0.6 : 0;
    g.lights.hemi.intensity = this.hemi;
    g.lights.hemi.color.set(on ? 0xffd8b0 : 0x303848);
    if (on) this.setLoops({ wind: 0.2 });
  },

  finishEnding(id, { keepCheckpoint = false } = {}) {
    const g = this.g, s = this.s;
    g.save.addEnding(id);
    if (!keepCheckpoint) g.save.clearCheckpoint();
    g.save.data.unlockedChapter = 5;
    g.save.data.lastRunName = g.brain.memory.name || '';
    g.save.write();
    g.mode = 'ending';
    g.chase.stop();
    g.input.unlock();
    g.ui.showHUD(false);
    this.stopLoops();
    g.audio.music.setMood('ending', 2);
    g.menus.show('ending', { id });
    this.ending = null;
    void s;
  },
};
