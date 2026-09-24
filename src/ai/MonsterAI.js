import * as THREE from 'three';
import { resolveCircle, lineOfSight } from '../core/physics.js';
import { dampAngle, rand } from '../core/util.js';

// A* over the house waypoint graph.
export function findPath(nav, fromPos, toPos, doors) {
  const nearest = (p) => {
    let best = null, bd = Infinity;
    for (const n of nav.nodes) {
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };
  const a = nearest(fromPos), b = nearest(toPos);
  if (!a || !b) return [];
  const open = new Set([a]);
  const came = new Map();
  const g = new Map([[a, 0]]);
  const f = new Map([[a, Math.hypot(a.x - b.x, a.z - b.z)]]);
  while (open.size) {
    let cur = null, cf = Infinity;
    for (const n of open) if ((f.get(n) ?? Infinity) < cf) { cf = f.get(n); cur = n; }
    if (cur === b) break;
    open.delete(cur);
    for (const nb of cur.links) {
      const cost = (g.get(cur) ?? Infinity) + Math.hypot(nb.x - cur.x, nb.z - cur.z);
      if (cost < (g.get(nb) ?? Infinity)) {
        came.set(nb, cur);
        g.set(nb, cost);
        f.set(nb, cost + Math.hypot(nb.x - b.x, nb.z - b.z));
        open.add(nb);
      }
    }
  }
  const path = [];
  let n = b;
  while (n && n !== a) { path.unshift(n); n = came.get(n); }
  if (n === a) path.unshift(a);
  return path;
}

// Chase brain for Verity's true form.
export class MonsterAI {
  constructor(game, monster) {
    this.game = game;
    this.m = monster;
    this.active = false;
    this.state = 'idle';
    this.heading = 0;
    this.path = [];
    this.lastSeen = new THREE.Vector3();
    this.lostTime = 0;
    this.searchTime = 0;
    this.repath = 0;
    this.speed = 0;
    this.sawHide = false;
    this.growlTimer = 3;
    this.frozen = false;
  }

  start(pos, heading = 0, delay = 0) {
    this.active = true;
    this.m.show(true);
    this.m.position.copy(pos);
    this.heading = heading;
    this.m.root.rotation.y = heading;
    this.state = 'chase';
    this.lostTime = 0;
    this.path = [];
    this.lastSeen.copy(this.game.player.pos);
    this.frozen = false;
    this.delay = delay;
    this.suspicion = 0;
  }
  stop() { this.active = false; this.m.speed = 0; }

  canSee() {
    const p = this.game.player;
    if (p.hidden) return false;
    const a = this.m.position, b = p.pos;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 18) return false;
    return lineOfSight(a.x, a.z, b.x, b.z, this.game.house.colliders, ['wall', 'door']);
  }

  update(dt) {
    if (!this.active || this.frozen) { this.m.speed = 0; return; }
    const g = this.game;
    if (this.delay > 0) {
      // it stands there twitching for a moment before it comes for you
      this.delay -= dt;
      this.m.speed = 0;
      this.m.mode = 'reach';
      const pp = g.player.pos;
      this.heading = Math.atan2(pp.x - this.m.position.x, pp.z - this.m.position.z);
      this.m.root.rotation.y = this.heading;
      return;
    }
    const p = g.player;
    const pos = this.m.position;
    const hard = g.state.hard;
    const baseChase = (g.state.chapter >= 5 ? 3.35 : 3.05) + (hard ? 0.45 : 0);
    const sees = this.canSee();
    const dist = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
    // hearing: sprinting footsteps within 9m reveal you
    const hears = !p.hidden && p.sprinting && dist < 9;
    let target = null;
    let speed = 1.4;

    if (sees || hears) {
      this.state = 'chase';
      this.lastSeen.copy(p.pos);
      this.lostTime = 0;
      this.sawHide = false;
    } else {
      this.lostTime += dt;
      if (this.state === 'chase' && this.lostTime > 0.6) {
        this.state = 'hunt';
        this.path = findPath(g.house.nav, pos, this.lastSeen);
        // if you vanished right in front of it, it knows where you hid
        if (p.hidden && dist < 4.5) this.sawHide = true;
      }
    }

    if (this.state === 'chase') {
      speed = baseChase * (dist < 3 ? 1.08 : 1);
      if (sees) target = p.pos;
      else target = this.lastSeen;
    } else if (this.state === 'hunt') {
      speed = baseChase * 0.8;
      target = this.followPath(pos);
      if (!target) {
        this.state = 'search';
        this.searchTime = 0;
        this.pickSearch();
      }
    } else if (this.state === 'search') {
      speed = 1.3;
      this.searchTime += dt;
      target = this.followPath(pos);
      if (!target) this.pickSearch();
      // checking hiding spots
      if (p.hidden) {
        const spot = p.hidden;
        const ds = Math.hypot(pos.x - spot.inside.x, pos.z - spot.inside.z);
        if (this.sawHide && !this.pathToSpot) {
          this.path = findPath(g.house.nav, pos, spot.exit);
          this.pathToSpot = true;
        }
        if (ds < 2.3) {
          g.onMonsterNearHiding?.(ds);
          if (!p.holdingBreath || this.sawHide) {
            this.suspicion = (this.suspicion || 0) + dt * (p.holdingBreath ? 0.5 : 1.4);
            if (this.suspicion > 1.1) { g.onCaught('found'); return; }
          }
        }
      }
    }

    // move
    if (target) {
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const want = Math.atan2(dx, dz);
        this.heading = dampAngle(this.heading, want, 7, dt);
        this.speed += (speed - this.speed) * Math.min(1, dt * 3);
        const step = Math.min(d, this.speed * dt);
        pos.x += Math.sin(this.heading) * step;
        pos.z += Math.cos(this.heading) * step;
        this.openDoorsNear(pos);
        resolveCircle(pos, 0.3, g.house.colliders.filter((c) => c.tag === 'wall' || c.tag.startsWith('door')));
      } else {
        this.speed *= 0.9;
      }
    } else this.speed *= 0.9;
    this.m.speed = this.speed;
    this.m.root.rotation.y = this.heading;
    this.m.mode = this.speed < 0.3 ? 'idle' : 'walk';
    // head looks at the player when close
    this.m.headLook = dist < 4 && sees ? -0.15 : 0;

    // catch
    if (!p.hidden && dist < 0.95 && g.mode === 'play') g.onCaught('caught');

    // growls
    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = 3 + rand() * 5;
      g.audio.sfx.play(rand() < 0.5 ? 'growl' : 'bones', { position: this.m.headWorld(), volume: 0.8 });
    }
  }

  followPath(pos) {
    while (this.path.length) {
      const n = this.path[0];
      if (Math.hypot(n.x - pos.x, n.z - pos.z) < 0.4) this.path.shift();
      else return new THREE.Vector3(n.x, 0, n.z);
    }
    this.pathToSpot = false;
    return null;
  }

  pickSearch() {
    const nodes = this.game.house.nav.nodes;
    const p = this.game.player.pos;
    // bias toward the player's area — it always drifts closer
    const sorted = nodes.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const pick = sorted[Math.floor(rand() * Math.min(6, sorted.length))];
    this.path = findPath(this.game.house.nav, this.m.position, new THREE.Vector3(pick.x, 0, pick.z));
  }

  openDoorsNear(pos) {
    for (const d of Object.values(this.game.house.doors)) {
      if (d.target > 0 || d.id === 'start' || d.id === 'front' || d.id === 'closet') continue;
      const wp = d.worldPos();
      if (Math.hypot(wp.x - pos.x, wp.z - pos.z) < 1.1) {
        if (d.locked && d.id === 'end') continue;
        d.setOpen(1, this.game, { speed: 4 });
        this.game.audio.sfx.play('slam', { position: wp });
        this.game.player.shake = Math.max(this.game.player.shake, 0.5);
      }
    }
  }
}
