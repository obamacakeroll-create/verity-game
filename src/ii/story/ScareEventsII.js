import * as THREE from 'three';
import { rand, lerp, clamp } from '../../core/util.js';
import { lineOfSight } from '../../core/physics.js';

// Ambient scares between story beats. The pool depends on the chapter, the
// zone and Verity's mood, with cooldowns so no two runs play the same.
export class ScareEventsII {
  constructor(game) {
    this.game = game;
    this.reset();
    const behind = (d = 3) => this.behind(d);
    this.events = [
      { id: 'flicker', ch: [0, 5], ins: 0, w: 3, cd: 18, run: (g) => { g.flickerZone(0.5 + rand()); g.audio.sfx.play('fluoTick', { volume: 0.4, position: this.nearestFixture() }); } },
      { id: 'thunder', ch: [0, 3], ins: 0, w: 1.4, cd: 40, ok: (g) => !this.basement(g), run: (g) => g.lightning(0.4 + rand() * 0.6) },
      { id: 'drip', ch: [1, 5], ins: 0, w: 1, cd: 30, run: (g) => { const p = behind(2 + rand() * 3); for (let i = 0; i < 5; i++) g.audio.sfx.play('drip', { position: p, delay: i * (0.4 + rand() * 0.5) }); } },
      { id: 'steps', ch: [1, 5], ins: 10, w: 1.6, cd: 45, run: (g) => { const p = behind(6); const surf = g.story.surfaceAt(p); for (let i = 0; i < 4; i++) g.audio.sfx.play('step', { position: p.clone().addScaledVector(g.player.forward, -i * 0.6), delay: i * 0.55, surface: surf, intensity: 1.2, occluded: true }); } },
      { id: 'giggle', ch: [1, 5], ins: 20, w: 1.2, cd: 70, run: (g) => g.audio.sfx.play('giggle', { position: behind(4), volume: 0.35 }) },
      { id: 'whisper', ch: [2, 5], ins: 25, w: 1.4, cd: 60, run: (g) => g.audio.sfx.play('whisper', { position: behind(0.8), volume: 0.8 }) },
      { id: 'skitter', ch: [2, 4], ins: 15, w: 1.3, cd: 55, run: (g) => g.audio.sfx.play('skitter', { position: behind(5), volume: 0.6, occluded: true }) },
      { id: 'boxFall', ch: [3, 3], ins: 0, w: 2, cd: 35, ok: (g) => g.zone?.id === 'warehouse', run: (g) => this.boxFall() },
      { id: 'phone', ch: [1, 1], ins: 0, w: 1, cd: 120, ok: (g) => g.zone?.id === 'offices' && g.state.flags.phoneRang, run: (g) => g.audio.sfx.play('phoneRing', { position: g.level.refs.phone.pos, volume: 0.5 }) },
      { id: 'faces', ch: [2, 2], ins: 0, w: 1.5, cd: 40, ok: (g) => g.zone?.id === 'printlab', run: (g) => { g.level.refs.watchers.forceAll = 2; g.audio.sfx.play('faceTurn', { position: new THREE.Vector3(4, 1.1, -44.6), volume: 0.8 }); } },
      { id: 'freezer', ch: [4, 4], ins: 0, w: 1.4, cd: 50, ok: (g) => g.zone?.id === 'coldhall', run: (g) => { const d = g.level.refs.freezerDoors[Math.floor(rand() * 3)]; d.set(d.target > 0.5 ? 0 : 0.35, g, { speed: 4 }); } },
      { id: 'breath', ch: [3, 5], ins: 50, w: 1, cd: 80, run: (g) => g.audio.sfx.play('monsterBreath', { position: behind(0.5), volume: 0.7 }) },
      { id: 'figure', ch: [1, 5], ins: 30, w: 1.8, cd: 70, run: () => this.figure() },
      { id: 'name', ch: [2, 5], ins: 40, w: 0.8, cd: 150, ok: (g) => !!g.brain.memory.name, run: (g) => g.speak('verity', g.brain.memory.name + '…', { stage: 5 }) },
    ];
  }

  reset() { this.next = 30 + rand() * 20; this.cooldowns = {}; this.figureTimer = 0; }
  basement(g) { return g.player.layer === -1; }

  behind(d = 3) {
    const p = this.game.player;
    return p.eyePos.addScaledVector(p.forward, -d).add(new THREE.Vector3((rand() - 0.5) * 2, 0, (rand() - 0.5) * 2));
  }
  nearestFixture() {
    const z = this.game.zone;
    return z?.fixtures[0]?.position || this.game.player.eyePos;
  }

  boxFall() {
    const g = this.game;
    const p = g.player.pos;
    const pos = new THREE.Vector3(p.x + (rand() - 0.5) * 10, 4, p.z + (rand() - 0.5) * 10);
    g.audio.sfx.play('thud', { position: pos.clone().setY(0.3), volume: 1.2, delay: 0.5 });
    g.audio.sfx.play('creak', { position: pos, volume: 0.5 });
    g.particles.burst(pos.setY(0.2), 'dust', 20);
    g.chase.hear?.(pos, 15, false);
  }

  // the tall one, standing at the far end of wherever you are
  figure() {
    const g = this.game, m = g.monster;
    if (g.chase.active || m.visible || !g.level?.nav) return;
    const p = g.player;
    const f = p.lookDir.setY(0).normalize();
    for (let tries = 0; tries < 8; tries++) {
      const d = 9 + rand() * 7;
      const a = (rand() - 0.5) * 0.6;
      const dir = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const x = p.pos.x + dir.x * d, z = p.pos.z + dir.z * d;
      const walls = g.level.walls(p.layer);
      if (!lineOfSight(p.pos.x, p.pos.z, x, z, walls, ['wall'])) continue;
      if (g.level.nav.blocked(p.layer, ...g.level.nav.toCell(x, z))) continue;
      m.position.set(x, p.pos.y, z);
      m.root.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
      m.unfold = 1;
      m.mode = 'idle';
      m.speed = 0;
      m.lookAt = p.eyePos;
      m.show(true);
      this.figureTimer = 4.5;
      this.figureSeen = false;
      return;
    }
  }

  update(dt) {
    const g = this.game;
    if (g.mode !== 'play' || g.chatting) return;
    if (this.figureTimer > 0) {
      this.figureTimer -= dt;
      const m = g.monster;
      const cam = g.camera;
      const to = m.position.clone().setY(m.position.y + 1.6).sub(cam.position).normalize();
      const look = cam.getWorldDirection(new THREE.Vector3());
      if (look.dot(to) > 0.95 && !this.figureSeen) { this.figureSeen = true; this.figureTimer = Math.min(this.figureTimer, 0.35); g.audio.sfx.play('stingerSoft', { volume: 0.5 }); }
      if (this.figureTimer <= 0 && !g.chase.active) {
        m.show(false);
        m.lookAt = null;
        g.flickerZone(0.3);
      }
    }
    if (g.chase.active) return;
    this.next -= dt;
    if (this.next > 0) return;
    const s = g.state;
    const danger = clamp((s.chapter / 5 + s.insanity / 100) / 2);
    this.next = lerp(55, 18, danger) * (0.7 + rand() * 0.6);
    const pool = this.events.filter((e) => s.chapter >= e.ch[0] && s.chapter <= e.ch[1] && s.insanity >= e.ins && (this.cooldowns[e.id] || 0) < g.time && (!e.ok || e.ok(g)));
    if (!pool.length) return;
    let r = rand() * pool.reduce((a, e) => a + e.w, 0);
    for (const e of pool) {
      r -= e.w;
      if (r <= 0) {
        this.cooldowns[e.id] = g.time + e.cd;
        e.run(g);
        return;
      }
    }
  }
}
