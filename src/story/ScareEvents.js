import * as THREE from 'three';
import { rand, lerp, clamp } from '../core/util.js';

// Ambient scares that fire between story beats. Frequency and nastiness
// scale with the chapter and Verity's insanity, and the pool is randomised
// so each run plays differently.
export class ScareEvents {
  constructor(game) {
    this.game = game;
    this.next = 30;
    this.cooldowns = {};
    this.enabled = true;
    this.figureTimer = 0;
    this.events = [
      { id: 'flicker', ch: [0, 5], ins: 0, w: 3, cd: 20, run: (g) => { g.lighting.flicker(0.6 + rand() * 1.2); g.audio.sfx.play('glitch', { volume: 0.25, position: this.nearestLamp() }); } },
      { id: 'creakAbove', ch: [1, 5], ins: 0, w: 2, cd: 40, run: (g) => { const p = g.player.eyePos.add(new THREE.Vector3(rand() * 4 - 2, 1.4, rand() * 4 - 2)); for (let i = 0; i < 4; i++) g.audio.sfx.play('step', { position: p, delay: i * 0.55, surface: 'wood', intensity: 1.4 }); } },
      { id: 'knockDistant', ch: [1, 4], ins: 10, w: 1.5, cd: 60, run: (g) => g.audio.sfx.play('knock', { position: new THREE.Vector3(-1.2, 1.3, -4), count: 2 + Math.floor(rand() * 3), volume: 0.7 }) },
      { id: 'whisper', ch: [2, 5], ins: 25, w: 2, cd: 45, run: (g) => this.whisper() },
      { id: 'radio', ch: [2, 5], ins: 20, w: 1.5, cd: 70, run: (g) => { g.audio.sfx.play('tune', { position: new THREE.Vector3(0.74, 0.95, -3.2), volume: 0.8 }); g.props.radio.dial.material.emissiveIntensity = 2; setTimeout(() => (g.props.radio.dial.material.emissiveIntensity = 0), 1400); } },
      { id: 'slam', ch: [2, 5], ins: 30, w: 1.2, cd: 80, run: (g) => this.slamDoor() },
      { id: 'laugh', ch: [3, 5], ins: 40, w: 1, cd: 90, run: (g) => g.audio.sfx.play('laugh', { position: this.behindPlayer(5), volume: 0.35, count: 6, pitch: 260 }) },
      { id: 'swing', ch: [1, 5], ins: 15, w: 1.5, cd: 50, run: (g) => { const l = this.nearestLampId(); g.lighting.swingLamp(l, 0.25); g.audio.sfx.play('creak', { position: g.lighting.lamps[l].group.position, volume: 0.4, short: true }); } },
      { id: 'figure', ch: [2, 5], ins: 35, w: 2.2, cd: 55, run: (g) => this.figure() },
      { id: 'thunder', ch: [0, 5], ins: 0, w: 1.5, cd: 45, run: (g) => g.lightning() },
      { id: 'drip', ch: [0, 5], ins: 0, w: 1, cd: 30, run: (g) => { for (let i = 0; i < 5; i++) g.audio.sfx.play('drip', { position: new THREE.Vector3(3.8, 0.6, -10), delay: i * (0.4 + rand() * 0.5) }); } },
      { id: 'chime', ch: [1, 5], ins: 10, w: 1, cd: 120, run: (g) => g.audio.sfx.play('chime', { position: new THREE.Vector3(0.9, 1.85, -3), count: 3 }) },
      { id: 'vanish', ch: [2, 4], ins: 45, w: 1.4, cd: 70, run: (g) => g.verityVanish() },
      { id: 'musicbox', ch: [1, 5], ins: 20, w: 1, cd: 100, run: (g) => this.musicBox() },
      { id: 'breathEar', ch: [3, 5], ins: 55, w: 1, cd: 80, run: (g) => g.audio.sfx.play('breath', { position: this.behindPlayer(0.4), volume: 1.4, dur: 2.2 }) },
      { id: 'name', ch: [2, 5], ins: 40, w: 1, cd: 120, run: (g) => { if (g.brain.memory.name) this.whisper(g.brain.memory.name); } },
    ];
  }

  reset() { this.next = 25 + rand() * 20; this.cooldowns = {}; }

  update(dt) {
    const g = this.game;
    if (!this.enabled || g.mode !== 'play' || g.chase.active || g.chatting) return;
    if (this.figureTimer > 0) {
      this.figureTimer -= dt;
      const m = g.monster;
      const look = g.renderer.camera.getWorldDirection(new THREE.Vector3());
      const to = m.position.clone().setY(1.5).sub(g.renderer.camera.position).normalize();
      if (look.dot(to) > 0.93 && this.figureTimer < 0.5) this.figureTimer = Math.min(this.figureTimer, 0.08);
      if (this.figureTimer <= 0) {
        m.show(false);
        g.lighting.flicker(0.25);
      }
    }
    this.next -= dt;
    if (this.next > 0) return;
    const danger = clamp((g.state.chapter / 5 + g.state.insanity / 100) / 2);
    this.next = lerp(50, 16, danger) * (0.7 + rand() * 0.6);
    const ch = g.state.chapter, ins = g.state.insanity;
    const pool = this.events.filter((e) => ch >= e.ch[0] && ch <= e.ch[1] && ins >= e.ins && (this.cooldowns[e.id] || 0) < g.time);
    if (!pool.length) return;
    let r = rand() * pool.reduce((s, e) => s + e.w, 0);
    for (const e of pool) {
      r -= e.w;
      if (r <= 0) {
        this.cooldowns[e.id] = g.time + e.cd;
        e.run(g);
        break;
      }
    }
  }

  behindPlayer(d = 1) {
    const p = this.game.player;
    const f = p.forward;
    return p.eyePos.addScaledVector(f, -d);
  }

  nearestLampId() {
    const p = this.game.player.pos;
    let best = 'hallA1', bd = Infinity;
    for (const [id, l] of Object.entries(this.game.lighting.lamps)) {
      const d = l.group.position.distanceTo(p);
      if (d < bd && id !== 'porch') { bd = d; best = id; }
    }
    return best;
  }
  nearestLamp() { return this.game.lighting.lamps[this.nearestLampId()].group.position; }

  whisper(name) {
    const g = this.game;
    const pos = this.behindPlayer(0.6);
    g.audio.sfx.play('whisper', { position: pos, volume: 1.2, syllables: 6 + Math.floor(rand() * 6) });
    if (name) g.ui.subtitle(`(whispering) …${name}…`, { cls: 'silent', duration: 2.4 });
  }

  slamDoor() {
    const g = this.game;
    const open = Object.values(g.house.doors).filter((d) => d.target > 0 && ['bath', 'bedroom', 'closet'].includes(d.id));
    if (open.length) {
      const d = open[Math.floor(rand() * open.length)];
      d.setOpen(0, g, { silent: true, speed: 6 });
      g.audio.sfx.play('slam', { position: d.worldPos(), volume: 1.2 });
      g.player.shake = 0.4;
    } else {
      g.audio.sfx.play('slam', { position: new THREE.Vector3(3, 1.2, -16), volume: 0.8 });
    }
  }

  musicBox() {
    const g = this.game;
    const pos = g.box.root.position.clone().setY(0.4);
    const notes = [76, 72, 74, 71, 72, 69];
    notes.forEach((m, i) => g.audio.sfx.play('musicNote', { position: pos, delay: i * 0.7, f: 440 * Math.pow(2, (m - 69) / 12), detune: -g.state.insanity * 0.8 }));
  }

  // A tall figure at the far end of wherever you're looking.
  figure() {
    const g = this.game;
    const p = g.player.pos, f = g.player.forward;
    const room = g.house.roomAt(p.x, p.z);
    let spot = null;
    if (room === 'hallA' && f.z < -0.75 && p.z > -9) spot = new THREE.Vector3(0.05, 0, -13.1);
    else if (room === 'hallA' && f.z > 0.75 && p.z < -5) spot = new THREE.Vector3(0.1, 0, -0.55);
    else if ((room === 'hallB' || room === 'corner') && f.x > 0.75 && p.x < 4) spot = new THREE.Vector3(6.55, 0, -13);
    else if (room === 'hallB' && f.x < -0.75 && p.x > 3) spot = new THREE.Vector3(-0.4, 0, -13.4);
    if (!spot) { this.cooldowns.figure = 0; this.next = 4; return; }
    const m = g.monster;
    m.position.copy(spot);
    m.root.rotation.y = Math.atan2(p.x - spot.x, p.z - spot.z);
    m.mode = 'idle';
    m.speed = 0;
    m.unfold = 1;
    m.show(true);
    this.figureTimer = 1.6;
    g.lighting.flicker(1.2, null, 0.9);
    g.audio.sfx.play('stingerSoft', { volume: 1.2 });
  }
}
