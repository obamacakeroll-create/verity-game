import * as THREE from 'three';
import { resolveCircle, lineOfSight } from '../../core/physics.js';
import { clamp, dampAngle, rand } from '../../core/util.js';

// The tall one's brain. States:
//   stalk   — scripted patrol along waypoints, reacts to sight and sound
//   investigate — walks to a noise
//   chase   — sees you (or heard you sprint nearby)
//   hunt    — goes to where it last saw you
//   search  — wanders nearby, checks hiding spots
export class MonsterAI2 {
  constructor(game, monster) {
    this.game = game;
    this.m = monster;
    this.active = false;
    this.state = 'idle';
    this.heading = 0;
    this.path = [];
    this.lastSeen = new THREE.Vector3();
    this.noise = null;
    this.lostTime = 0;
    this.searchTime = 0;
    this.speed = 0;
    this.sawHide = false;
    this.growlTimer = 3;
    this.frozen = false;
    this.delay = 0;
    this.suspicion = 0;
    this.patrol = null;
    this.patrolIdx = 0;
    this.layer = 0;
    this.chaseTime = 0;
    this.pathToSpot = false;
    this.repath = 0;
    this.opts = {};
  }

  // mode: 'chase' (full insanity transformation / scripted chase) or 'stalk' (patrol)
  start(pos, heading = 0, { delay = 0, mode = 'chase', patrol = null, layer = 0, speedMul = 1, sightRange = 20 } = {}) {
    this.active = true;
    this.m.show(true);
    this.m.position.copy(pos);
    this.heading = heading;
    this.m.root.rotation.y = heading;
    this.m.resetFeet();
    this.state = mode;
    this.lostTime = 0;
    this.path = [];
    this.lastSeen.copy(this.game.player.pos);
    this.frozen = false;
    this.delay = delay;
    this.suspicion = 0;
    this.patrol = patrol;
    this.patrolIdx = 0;
    this.layer = layer;
    this.chaseTime = 0;
    this.sawHide = false;
    this.opts = { speedMul, sightRange };
    this.m.jawTarget = 0;
  }
  stop() { this.active = false; this.m.speed = 0; this.path = []; this.noise = null; }

  // A noise at pos, audible within radius. Thrown objects are more interesting.
  hear(pos, radius, loud = false) {
    if (!this.active || this.state === 'chase') return;
    const d = Math.hypot(pos.x - this.m.position.x, pos.z - this.m.position.z);
    if (d > radius) return;
    this.noise = pos.clone();
    this.state = 'investigate';
    this.path = this.game.level.nav.find(this.layer, this.m.position.x, this.m.position.z, pos.x, pos.z);
    if (loud) this.game.audio.sfx.play('growl', { position: this.m.headWorld(), volume: 0.8 });
  }

  // Talking or making noise while hidden: it knows where you are.
  reveal() {
    this.sawHide = true;
    this.state = 'search';
    this.path = [];
    this.pathToSpot = false;
  }

  walls() { return this.game.level.walls(this.layer); }

  canSee() {
    const p = this.game.player;
    if (p.hidden || p.layer !== this.layer) return false;
    const a = this.m.position, b = p.pos;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    const range = this.opts.sightRange * (p.crouching ? 0.55 : 1) * (p.flashOn ? 1.15 : 0.8);
    if (d > range) return false;
    // field of view (wide), except when very close
    if (d > 2.5) {
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      let diff = ang - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.35 && this.state !== 'chase') return false;
    }
    return lineOfSight(a.x, a.z, b.x, b.z, this.walls(), ['wall', 'door']);
  }

  update(dt) {
    if (!this.active || this.frozen) { if (this.m.visible) this.m.speed *= 0.9; return; }
    const g = this.game;
    const p = g.player;
    const pos = this.m.position;
    if (this.delay > 0) {
      // it stands there twitching before it comes for you
      this.delay -= dt;
      this.m.speed = 0;
      this.m.mode = 'reach';
      this.m.reachAt = p.eyePos;
      this.m.lookAt = p.eyePos;
      this.heading = dampAngle(this.heading, Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z), 4, dt);
      this.m.root.rotation.y = this.heading;
      return;
    }
    const hard = g.state.hard;
    const baseChase = (3.25 + (g.state.chapter >= 5 ? 0.25 : 0) + (hard ? 0.4 : 0)) * this.opts.speedMul;
    const sees = this.canSee();
    const dist = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
    const hears = !p.hidden && p.sprinting && dist < 10 && p.layer === this.layer;
    let target = null;
    let speed = 1.3;
    if (sees || hears) {
      if (this.state !== 'chase') {
        g.story?.onSpotted?.();
        g.audio.sfx.play('screech', { position: this.m.headWorld(), volume: 0.9 });
      }
      this.state = 'chase';
      this.lastSeen.copy(p.pos);
      this.lostTime = 0;
      this.sawHide = false;
    } else if (this.state === 'chase') {
      this.lostTime += dt;
      if (this.lostTime > 0.7) {
        this.state = 'hunt';
        this.path = g.level.nav.find(this.layer, pos.x, pos.z, this.lastSeen.x, this.lastSeen.z);
        if (p.hidden && dist < 5) this.sawHide = true; // you vanished right in front of it
      }
    }
    if (this.state === 'chase') {
      this.chaseTime += dt;
      speed = baseChase * (dist < 3 ? 1.06 : 1);
      // steer by path when there's no straight line
      this.repath -= dt;
      if (sees) { target = p.pos; this.path = []; }
      else {
        if (this.repath <= 0 || !this.path.length) { this.repath = 0.4; this.path = g.level.nav.find(this.layer, pos.x, pos.z, this.lastSeen.x, this.lastSeen.z); }
        target = this.followPath(pos) || this.lastSeen;
      }
    } else if (this.state === 'hunt') {
      speed = baseChase * 0.8;
      target = this.followPath(pos);
      if (!target) { this.state = 'search'; this.searchTime = 0; this.pickSearch(); }
    } else if (this.state === 'investigate') {
      speed = 1.9;
      target = this.followPath(pos);
      if (!target) { this.state = this.patrol ? 'stalk' : 'search'; this.noise = null; this.pickSearch(); }
    } else if (this.state === 'stalk') {
      speed = 1.25 * this.opts.speedMul;
      target = this.followPath(pos);
      if (!target && this.patrol?.length) {
        const wp = this.patrol[this.patrolIdx++ % this.patrol.length];
        this.path = g.level.nav.find(this.layer, pos.x, pos.z, wp.x, wp.z);
      }
    } else if (this.state === 'search') {
      speed = 1.35;
      this.searchTime += dt;
      target = this.followPath(pos);
      if (!target) {
        if (this.patrol && this.searchTime > 12) { this.state = 'stalk'; this.path = []; }
        else this.pickSearch();
      }
    }
    // checking hiding spots
    if (p.hidden && (this.state === 'search' || this.state === 'hunt')) {
      const spot = p.hidden;
      const ds = Math.hypot(pos.x - spot.inside.x, pos.z - spot.inside.z);
      if (this.sawHide && !this.pathToSpot) {
        this.path = g.level.nav.find(this.layer, pos.x, pos.z, spot.exit.x, spot.exit.z);
        this.pathToSpot = true;
      }
      if (ds < 2.4) {
        g.story?.onMonsterNearHiding?.(ds);
        if (!p.holdingBreath || this.sawHide) {
          this.suspicion += dt * (p.holdingBreath ? 0.45 : 1.3);
          if (this.suspicion > 1.1) { g.onCaught('found'); return; }
        }
      }
    }
    // move
    if (target) {
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const want = Math.atan2(dx, dz);
        this.heading = dampAngle(this.heading, want, 6, dt);
        this.speed += (speed - this.speed) * Math.min(1, dt * 2.5);
        const step = Math.min(d, this.speed * dt);
        pos.x += Math.sin(this.heading) * step;
        pos.z += Math.cos(this.heading) * step;
        g.story?.monsterDoors?.(pos);
        resolveCircle(pos, 0.3, g.level.near(pos.x, pos.z, this.layer).filter((c) => c.tag === 'wall' || c.tag.startsWith('door') || c.tag === 'prop'));
      } else this.speed *= 0.9;
    } else this.speed *= 0.9;
    pos.y = g.story?.heightAt?.(pos.x, pos.z, this.layer) ?? pos.y;
    this.m.speed = this.speed;
    this.m.moveDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.m.root.rotation.y = this.heading;
    this.m.mode = this.speed < 0.25 ? 'idle' : this.speed > 2.4 ? 'run' : 'walk';
    this.m.lookAt = sees || dist < 6 ? p.eyePos : null;
    this.m.reachAt = null;
    if (this.state === 'chase' && dist < 3.2 && sees) { this.m.mode = 'reach'; this.m.reachAt = p.eyePos; }
    this.m.jawTarget = this.state === 'chase' ? 0.35 + (dist < 3 ? 0.5 : 0) : 0.05;
    // catch
    if (!p.hidden && dist < 0.95 && g.mode === 'play' && p.layer === this.layer) { g.onCaught('caught'); return; }
    // growls and breathing
    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = 2.5 + rand() * 4;
      const occluded = !lineOfSight(p.pos.x, p.pos.z, pos.x, pos.z, this.walls(), ['wall']);
      g.audio.sfx.play(rand() < 0.4 ? 'monsterBreath' : rand() < 0.5 ? 'growl' : 'bones', { position: this.m.headWorld(), volume: 0.9, occluded });
    }
  }

  followPath(pos) {
    while (this.path.length) {
      const n = this.path[0];
      if (Math.hypot(n.x - pos.x, n.z - pos.z) < 0.35) this.path.shift();
      else return new THREE.Vector3(n.x, 0, n.z);
    }
    this.pathToSpot = false;
    return null;
  }

  pickSearch() {
    const g = this.game;
    const p = g.player.pos;
    // biased toward the player — it always drifts closer
    const pt = g.level.nav.randomFree(this.layer, rand, { x: p.x, z: p.z }, clamp(9 - this.searchTime * 0.2, 3, 9));
    if (pt) this.path = g.level.nav.find(this.layer, this.m.position.x, this.m.position.z, pt.x, pt.z);
  }
}
