import * as THREE from 'three';
import { CardboardBox } from '../../entities/CardboardBox.js';
import { ADDRESS } from '../ai/knowledgeII.js';
import { ease, rand } from '../../core/util.js';

// PROLOGUE — DELIVERY. Apartment 4C, 2:58 AM, three nights after Wren Street.
const OBJ = {
  wake: [null, null],
  intercom: ['intercom', 'Answer the intercom.'],
  door: ['door', 'Someone left something. Check the door.'],
  box: ['box', 'Bring the box inside.'],
  open: ['box', 'Open the box.'],
  tv: [null, null],
  talk: ['talk', 'Talk to Verity. (T)'],
  keys: ['keys', 'Find your car keys.'],
  leave: ['leave', 'Take the stairs down to your car.'],
};

export const Prologue = {
  setup0({ menu = false } = {}) {
    const g = this.g, L = this.L, R = this.R, f = this.s.flags;
    if (!f.phase0) f.phase0 = 'wake';
    const ph = f.phase0;
    // the TV and its glow
    const tvOn = !menu && (ph === 'talk' || ph === 'keys');
    R.tvScreen.state.phase = tvOn ? 'verity' : 'off';
    R.tv.mat.emissiveMap = R.tvScreen.texture;
    R.tv.mat.emissive?.set?.(0xffffff);
    if (!L._tvLight) L._tvLight = g.lights.add({ type: 'bulb', position: L.anchors.tv.clone().add(new THREE.Vector3(0, 0.1, -0.7)), color: 0x9ab8ff, intensity: 0, range: 5.5, zone: L.zones.get('living'), volScale: 1.2 });
    // the box
    if (!L._box) {
      L._box = new CardboardBox(L.dynamic, L.anchors.doormat, 0.5);
      L.interact(L._box.hit, {
        label: () => ({ box: 'Pick up the box', open: 'Open the box' }[this.s.flags.phase0] || null),
        hold: () => (this.s.flags.phase0 === 'open' ? 1.2 : 0),
        onInteract: () => this.boxAction(),
      });
      L.onUpdate((dt) => L._box.update(dt));
      // freezer
      const fz = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
      fz.position.copy(L.anchors.freezer);
      L.dynamic.add(fz);
      L.interact(fz, { label: 'Open the freezer', hold: 0.7, onInteract: () => this.freezer() });
      // intercom
      L.interact(R.intercomHit, { label: () => (this.s.flags.phase0 === 'intercom' ? 'Answer the intercom' : 'Intercom'), onInteract: () => this.intercom() });
      // mirror fog writing (hidden until the scare)
      const c = document.createElement('canvas');
      c.width = 256; c.height = 320;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.font = 'bold 44px "Comic Sans MS", cursive';
      x.textAlign = 'center';
      ['COME', 'HOME'].forEach((w, i) => x.fillText(w, 128, 130 + i * 70));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false }));
      m.position.copy(L.anchors.mirror).add(new THREE.Vector3(0, 0, 0.004));
      L.dynamic.add(m);
      L._mirrorWriting = m;
    }
    const box = L._box;
    const onTable = ['open', 'tv', 'talk', 'keys', 'leave'].includes(ph);
    box.root.position.copy(onTable ? new THREE.Vector3(-1.9, 0.44, 6.45) : L.anchors.doormat);
    box.root.visible = ph !== 'wake' && ph !== 'intercom' || menu;
    if (menu) box.root.position.set(-1.9, 0.44, 6.45);
    box.snapOpen(['tv', 'talk', 'keys', 'leave'].includes(ph) || menu ? 1 : 0);
    L._mirrorWriting.material.opacity = 0;
    // doors
    const D = L.doors;
    D.front.set(0, g, { silent: true });
    D.front.o.onUse = (door) => this.frontDoor(door);
    D.stairs.locked = !this.s.items.includes('carKeys');
    D.stairs.o.onUse = (door) => { if (!door.locked) { this.leaveApartment(); return false; } return true; };
    D.stairs.o.lockLabel = 'Stairs — you need your car keys';
    // lights
    R.lamp.state = 'on';
    R.bedLamp.state = 'off';
    R.corridorFlicker.state = 'flicker';
    R.intercomLED.material.emissiveIntensity = 0;
    g.lights.moonBase = 0.05;
    this.hemi = 0.02;
    g.lights.hemi.intensity = this.hemi;
    if (!menu) g.player.setPose(-1.2, 6.0, Math.PI - 0.5, -0.05);
  },

  restoreObjective0() {
    const o = OBJ[this.s.flags.phase0];
    if (o) this.g.setObjective(o[0], o[1]);
  },

  music0() { this.g.audio.music.setMood(this.s.flags.phase0 === 'talk' || this.s.flags.phase0 === 'keys' ? 'uneasy' : 'apartment'); },

  async begin0({ tk, fresh }) {
    const g = this.g, f = this.s.flags;
    this.music0();
    g.setGrade('apartment', 0);
    if (fresh || f.phase0 === 'wake') {
      await g.director.play(async (d) => {
        d.cut(new THREE.Vector3(-1.9, 1.15, 5.3), new THREE.Vector3(-1.9, 1.0, 7.7));
        g.ui.fade(0, 3);
        g.lightning(0.5);
        await d.wait(1.5);
        await d.caption('Apartment 4C. 2:58 AM.', 3);
        await d.caption('Three nights since Wren Street. You still can’t sleep.', 3.6);
        await d.camTo(new THREE.Vector3(-1.2, 1.62, 6.0), new THREE.Vector3(-3.4, 1.2, 4.2), 2.2);
      });
      if (!this.alive(tk)) return;
      g.player.setPose(-1.2, 6.0, Math.atan2(-(-3.4 + 1.2), -(4.2 - 6.0)), -0.1);
    } else {
      g.ui.fade(0, 1.2);
    }
    this.play();
    this.restoreObjective0();
    this.timers.intercom = f.phase0 === 'wake' ? 5 : 0;
    this.timers.lightning = 12;
    g.checkpoint();
    if (!f.moveTip) { f.moveTip = true; setTimeout(() => g.ui.toast('WASD — move · Mouse — look · E — interact · F — phone light', 5), 800); }
  },

  update0(dt) {
    const g = this.g, f = this.s.flags, L = this.L, R = this.R;
    if (L?.name !== 'apartment') return;
    const T = this.timers;
    T.lightning -= dt;
    if (T.lightning <= 0) { T.lightning = 18 + rand() * 25; g.lightning(0.5 + rand() * 0.5); }
    // TV glow follows the picture
    const ph = R.tvScreen.state.phase;
    const on = ph !== 'off';
    R.tv.mat.emissiveIntensity = on ? 1.3 : 0;
    L._tvLight.intensity = on ? (ph === 'static' ? 1.4 + Math.random() * 0.8 : ph === 'ad' ? 1.2 + Math.sin(g.time * 3) * 0.4 : 0.8 + Math.random() * 0.15) : 0;
    L._tvLight.color.set(ph === 'ad' ? 0xffd070 : ph === 'grin' ? 0xffa060 : 0x9ab8ff);
    if (f.phase0 === 'wake') {
      T.intercom -= dt;
      if (T.intercom <= 0) { f.phase0 = 'intercom'; this.restoreObjective0(); T.intercom = 0; }
    }
    if (f.phase0 === 'intercom') {
      T.intercom -= dt;
      R.intercomLED.material.emissiveIntensity = Math.sin(g.time * 8) > 0 ? 3 : 0.2;
      if (T.intercom <= 0) { T.intercom = 6.5; g.audio.sfx.play('intercom', { position: L.anchors.intercom, volume: 1 }); }
    }
    if (f.phase0 === 'keys' || f.phase0 === 'leave') {
      f.keysTime = (f.keysTime || 0) + dt;
      if (f.keysTime > 25 && !this.fired.has('knock')) {
        this.fired.add('knock');
        g.audio.sfx.play('knock', { position: new THREE.Vector3(0, 1.3, -0.1), count: 3, volume: 1.2 });
        setTimeout(() => g.speak('tv', 'Don’t answer that.', { name: 'VERITY' }), 2500);
      }
    }
  },

  zone0(z) {
    const g = this.g, f = this.s.flags, R = this.R, L = this.L;
    if (L?.name !== 'apartment') return;
    if (z.id === 'bath' && (f.phase0 === 'keys' || f.phase0 === 'leave') && !this.fired.has('mirror')) {
      this.fired.add('mirror');
      const bz = L.zones.get('bath');
      g.lights.setZonePower(bz, 0);
      g.audio.sfx.play('powerDown', { volume: 0.4 });
      setTimeout(() => {
        L._mirrorWriting.material.opacity = 0.8;
        g.lights.setZonePower(bz, 1);
        g.flickerZone(0.6, bz);
        g.audio.sfx.play('giggle', { position: L.anchors.mirror, volume: 0.5 });
        g.addInsanity(2, { silent: true });
      }, 1600);
    }
    if (z.id === 'hall' && f.phase0 === 'keys' && !this.fired.has('bedlamp')) {
      this.fired.add('bedlamp');
      setTimeout(() => { R.bedLamp.state = 'on'; g.audio.sfx.play('click', { position: new THREE.Vector3(3.55, 0.9, 9.2), volume: 0.8 }); }, 900);
    }
    if (z.id === 'corridor' && f.phase0 === 'leave' && !this.fired.has('corridor')) {
      this.fired.add('corridor');
      g.flickerZone(2.5, L.zones.get('corridor'));
      g.audio.sfx.play('giggle', { position: new THREE.Vector3(-3.6, 1.2, -1.5), volume: 0.4 });
    }
  },

  talk0() {
    const f = this.s.flags, g = this.g;
    if (!f.tvVerity || this.L?.name !== 'apartment') return false;
    if (!(f.phase0 === 'talk' || f.phase0 === 'keys')) return false;
    return g.player.pos.distanceTo(this.L.anchors.tv.clone().setY(0)) < 5 && g.zone?.id === 'living';
  },
  voice0() {
    const R = this.R;
    if (!R.tvScreen) return null;
    R.tvScreen.state.talk = 1;
    setTimeout(() => { R.tvScreen.state.talk = 0; }, 2500);
    return { who: 'tv', position: this.L.anchors.tv, tv: true };
  },
  ask0(res) {
    const f = this.s.flags;
    const R = this.R;
    if (R.tvScreen) R.tvScreen.state.expr = this.g.verity.face.current || 'smile';
    if (f.phase0 !== 'talk') return;
    f.tvAsked = (f.tvAsked || 0) + 1;
    if (f.tvAsked >= 3 || res.intent === 'where' || res.intent === 'leave') this.keysReveal();
  },

  // ---------------------------------------------------------------- beats
  async intercom() {
    const g = this.g, f = this.s.flags, R = this.R;
    if (f.phase0 !== 'intercom') { g.audio.sfx.play('click'); g.ui.toast('Just static.', 1.6); return; }
    f.phase0 = 'door';
    g.setObjective(null);
    R.intercomLED.material.emissiveIntensity = 0;
    g.audio.sfx.play('click', { position: this.L.anchors.intercom });
    g.audio.sfx.play('static', { position: this.L.anchors.intercom, volume: 0.4, dur: 1.2 });
    await g.speak('intercom', '…delivery. For four C. I left it by your door.', { name: 'INTERCOM' });
    await g.speak('you', 'At three in the morning? Who is this?', { name: 'YOU' });
    await g.speak('intercom', 'No need to sign. She already signed for it.', { name: 'INTERCOM' });
    g.audio.sfx.play('static', { position: this.L.anchors.intercom, volume: 0.3, dur: 0.6 });
    g.audio.sfx.play('stingerSoft', { volume: 0.4 });
    this.restoreObjective0();
    // the box appears on the doormat
    this.L._box.root.visible = true;
    this.L._box.root.position.copy(this.L.anchors.doormat);
  },

  frontDoor(door) {
    const f = this.s.flags;
    if (f.phase0 === 'door' && !f.peeped) { this.peephole(); return false; }
    if (f.phase0 === 'leave' || f.phase0 === 'keys') return true;
    return true;
  },

  async peephole() {
    const g = this.g, f = this.s.flags, L = this.L, R = this.R, m = g.monster;
    f.peeped = true;
    const P = g.pipeline.p;
    const lens0 = P.lens, vig0 = P.vignette;
    await g.director.play(async (d) => {
      await d.fade(1, 0.35);
      d.cut(new THREE.Vector3(0, 1.58, -0.06), new THREE.Vector3(0, 1.3, -2.2));
      P.lens = 1.4;
      g.post.dof = 0;
      R.corridorFlicker.state = 'buzz';
      m.position.set(-3.55, 0, -1.5);
      m.root.rotation.y = Math.PI / 2;
      m.unfold = 1;
      m.mode = 'idle';
      m.speed = 0;
      m.lookAt = new THREE.Vector3(0, 1.58, 0);
      m.show(true);
      await d.fade(0, 0.35);
      await d.camTo(new THREE.Vector3(0, 1.58, -0.06), new THREE.Vector3(0, 0.3, -0.6), 1.2);
      await d.caption('A box. On your doormat.', 2.2);
      await d.camTo(new THREE.Vector3(0, 1.58, -0.06), new THREE.Vector3(-3.4, 1.6, -1.5), 1.6);
      await d.wait(1.2);
      const cz = L.zones.get('corridor');
      g.lights.setZonePower(cz, 0);
      g.audio.sfx.play('fluoTick', { position: new THREE.Vector3(-2.2, 2.6, -1.5) });
      await d.wait(0.5);
      m.show(false);
      g.lights.setZonePower(cz, 1);
      R.corridorFlicker.state = 'flicker';
      g.audio.sfx.play('stinger', { volume: 0.6 });
      d.shake = 0.5;
      await d.wait(1.0);
      await d.fade(1, 0.3);
      P.lens = lens0;
      d.release();
      await d.fade(0, 0.3);
    }, { letterbox: false });
    P.lens = lens0;
    P.vignette = vig0;
    m.lookAt = null;
    f.phase0 = 'box';
    this.restoreObjective0();
    g.addInsanity(1, { silent: true });
  },

  async boxAction() {
    const g = this.g, f = this.s.flags, box = this.L._box;
    if (f.phase0 === 'box') {
      g.audio.sfx.play('box', { position: box.root.position });
      await g.ui.fade(1, 0.35);
      box.root.position.set(-1.9, 0.44, 6.45);
      box.root.rotation.y = 0.3;
      this.L.doors.front.set(0, g);
      g.player.setPose(-1.9, 5.25, Math.PI, -0.45);
      f.phase0 = 'open';
      await g.ui.fade(0, 0.35);
      this.restoreObjective0();
      g.ui.toast('It’s light. Something shifts inside.', 2.5);
      return;
    }
    if (f.phase0 === 'open') {
      f.phase0 = 'tv';
      g.setObjective(null);
      g.audio.sfx.play('tapeRip', { position: box.root.position });
      box.setOpen(1);
      await g.sleep(1.0);
      g.audio.sfx.play('rustle', { position: box.root.position });
      await g.speak('you', 'Empty. Except for…', { name: 'YOU' });
      this.collect('doc', 'd1');
    }
  },

  doc_d1() { if (this.s.flags.phase0 === 'tv' && !this.fired.has('ad')) { this.fired.add('ad'); this.commercial(); } },

  async commercial() {
    const g = this.g, R = this.R, f = this.s.flags, tk = this.token;
    const tv = R.tvScreen;
    await g.sleep(1.2);
    g.audio.sfx.play('tvOn', { position: this.L.anchors.tv, volume: 1 });
    tv.state.phase = 'ad';
    tv.state.start = tv.t;
    g.audio.music.setMood('jingle', 0.2);
    const lines = [
      'Is your child lonely? Does nobody listen?',
      'Meet VERITY! Your personal helper friend!',
      'Verity knows the answer to any question. Just ask!',
      'A friend who always comes back!',
      'Helpful Friends Company. Unit nine, Kessler Industrial Park. Please be kind to your Verity.',
    ];
    for (const l of lines) {
      if (tk !== this.token) return;
      await g.speak('tv', l, { name: 'TV' });
      await g.sleep(0.5);
    }
    if (tk !== this.token) return;
    g.audio.music.setMood('silence', 0.2);
    tv.state.phase = 'static';
    g.audio.sfx.play('static', { position: this.L.anchors.tv, volume: 0.8, dur: 1.8 });
    g.post.glitch = 1;
    g.flickerZone(1.2);
    await g.sleep(1.8);
    tv.state.phase = 'verity';
    tv.state.start = tv.t;
    tv.state.expr = 'smile';
    g.audio.music.setMood('uneasy', 2);
    const say = async (t, expr = 'smile') => { tv.state.expr = expr; tv.state.talk = 1; await g.speak('tv', t, { name: 'VERITY' }); tv.state.talk = 0; await g.sleep(0.35); };
    await say('hi.');
    await say('…hi. It’s me.', 'wink');
    await say('Did you miss me?');
    await say('You left me on Wren Street. In a box. That’s okay. I found you. I always find you.', 'neutral');
    if (tk !== this.token) return;
    f.tvVerity = true;
    f.phase0 = 'talk';
    this.restoreObjective0();
    g.ui.toast('Press T to talk to Verity. Type anything.', 4);
  },

  async keysReveal() {
    const g = this.g, f = this.s.flags, tv = this.R.tvScreen;
    if (f.phase0 !== 'talk') return;
    f.phase0 = 'keys';
    await g.sleep(0.6);
    g.closeChat();
    const say = async (t, expr = 'smile') => { tv.state.expr = expr; tv.state.talk = 1; await g.speak('tv', t, { name: 'VERITY' }); tv.state.talk = 0; await g.sleep(0.3); };
    await say(`I want you to come home. The address is on the label. ${ADDRESS}.`);
    await say('Your car keys are in the freezer. You put them there three nights ago. You don’t remember why.', 'neutral');
    await say('I do.', 'grin');
    this.restoreObjective0();
  },

  async freezer() {
    const g = this.g, f = this.s.flags, s = this.s;
    g.audio.sfx.play('freezerDoor', { position: this.L.anchors.freezer, volume: 0.7 });
    g.particles.burst(this.L.anchors.freezer.clone().add(new THREE.Vector3(0, 0, 0.1)), 'breath', 20);
    if (f.phase0 !== 'keys') { g.ui.toast('Frozen peas. Ice. A smell like pennies.', 2.5); return; }
    s.items.push('carKeys');
    g.audio.sfx.play('pickup');
    g.ui.toast('Your car keys — frozen into the ice. The keyring is a little yellow ball.', 4);
    f.phase0 = 'leave';
    this.L.doors.stairs.locked = false;
    const tv = this.R.tvScreen;
    await g.sleep(1.5);
    tv.state.expr = 'grin';
    tv.state.talk = 1;
    await g.speak('tv', 'Good. Now come home. I’ll leave the lights on.', { name: 'VERITY' });
    tv.state.phase = 'grin';
    g.audio.sfx.play('glitch', { position: this.L.anchors.tv, volume: 0.6 });
    await g.sleep(0.9);
    tv.state.phase = 'off';
    g.audio.sfx.play('powerDown', { position: this.L.anchors.tv, volume: 0.5 });
    f.tvVerity = false;
    this.restoreObjective0();
    g.checkpoint();
  },

  async leaveApartment() {
    const g = this.g;
    if (this._leaving) return;
    this._leaving = true;
    g.audio.sfx.play('metalDoor', { position: this.L.anchors.stairs });
    await g.ui.fade(1, 0.8);
    this._leaving = false;
    await this.drive();
  },

  // ---------------------------------------------------------------- the drive
  async drive() {
    const g = this.g, s = this.s;
    const tk = ++this.token;
    g.mode = 'cutscene';
    g.ui.showHUD(false);
    g.setObjective(null);
    s.flags.phase0 = 'done';
    s.chapter = 1;
    await g.loadLevel('factory');
    if (tk !== this.token) return;
    const R = this.R, road = R.road;
    this.setupWorld(1);
    road.state.speed = 0;
    road.state.mirrorFace = 0;
    road.state.dawn = 0;
    road.backBox.visible = false;
    const seat = road.seat.clone();
    const ahead = seat.clone().add(new THREE.Vector3(0, -0.15, -10));
    const mirrorPos = new THREE.Vector3();
    road.mirror.getWorldPosition(mirrorPos);
    g.setGrade('night', 0);
    g.player.flashOn = false;
    await g.director.play(async (d) => {
      d.cut(seat, ahead);
      g.updateZone(true);
      g.audio.sfx.play('ignition', { volume: 0.9 });
      g.audio.music.setMood('dread', 3);
      d.tween(4, (k) => { road.state.speed = k * 19; }, ease.inOutSine);
      g.ui.fade(0, 2.5);
      const eng = this.loops.engine;
      eng?.rate?.(1.4);
      await d.wait(3);
      await d.caption('Kessler Industrial Park. Forty minutes out of town.', 3.2);
      g.audio.sfx.play('static', { volume: 0.4, dur: 0.6 });
      await d.say('radio', '…police are still searching for the Harlow family of eleven-oh-seven Wren Street, missing since Tuesday…', { name: 'RADIO', after: 0.5 });
      await d.say('radio', '…and the old Helpful Friends factory, closed since the nineteen ninety-six product recall, is due for demolition next month…', { name: 'RADIO', after: 0.5 });
      g.audio.sfx.play('static', { volume: 0.7, dur: 1.4 });
      g.post.glitch = 0.8;
      await d.wait(1.2);
      await d.say('verity', 'Left here.', { name: 'RADIO', tv: true, after: 0.8 });
      await d.say('verity', 'Left again. I remember the way. I remember everything.', { name: 'RADIO', tv: true, after: 0.6 });
      // the mirror
      await d.camTo(seat, mirrorPos, 1.0, ease.inOutSine);
      await d.wait(0.6);
      road.state.mirrorFace = 1;
      g.audio.sfx.play('stinger', { volume: 0.7 });
      d.shake = 0.6;
      await d.wait(1.1);
      await d.camTo(seat, ahead, 0.35, ease.outCubic);
      road.state.mirrorFace = 0;
      await d.wait(0.8);
      await d.camTo(seat, mirrorPos, 0.5, ease.inOutSine);
      await d.wait(0.7);
      await d.camTo(seat, ahead, 0.8, ease.inOutSine);
      await d.say('verity', 'Eyes on the road, silly.', { name: 'RADIO', tv: true, after: 1.2 });
      d.tween(3, (k) => { road.state.speed = 19 * (1 - k); }, ease.inOutSine);
      await d.fade(1, 3);
    }, { letterbox: true });
    if (tk !== this.token) return;
    road.state.speed = 0;
    s.flags.drove = true;
    await this.start(1, { fromDrive: true });
  },
};
