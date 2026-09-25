import * as THREE from 'three';
import { VerityFace } from '../../entities/VerityFace.js';
import { lineOfSight } from '../../core/physics.js';
import { clamp, damp } from '../../core/util.js';
import { patch } from '../render/MaterialLib.js';

// "Seconds": factory rejects. Half-printed Verity shells on long printed
// filament legs. They only move while nobody is looking at them.

const LEGS = 6;
const MAX = 8;
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Seconds {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'seconds';
    game.scene.add(this.root);
    this.list = [];
    this.active = false;
    const set = game.lib.set('pla');
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xd9a820, map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, roughness: 1, metalness: 0,
      clearcoat: 0.3, clearcoatRoughness: 0.5, side: THREE.DoubleSide, emissive: 0x2a1a00, emissiveIntensity: 0.4,
    });
    patch(this.mat, { grime: 0.5 });
    this.legMat = new THREE.MeshStandardMaterial({ color: 0xc89a24, roughness: 0.55, emissive: 0x201400, emissiveIntensity: 0.3 });
    // shell: the lower 60% of a sphere, ragged top edge
    const g = new THREE.SphereGeometry(0.17, 40, 24, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.62);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.05) p.setY(i, y - Math.abs(Math.sin(Math.atan2(p.getX(i), p.getZ(i)) * 7)) * 0.03);
    }
    g.computeVertexNormals();
    this.shellGeo = g;
    this.segGeo = new THREE.CylinderGeometry(0.006, 0.009, 1, 5, 1);
    this.segGeo.translate(0, 0.5, 0);
    this.segs = new THREE.InstancedMesh(this.segGeo, this.legMat, MAX * LEGS * 2);
    this.segs.castShadow = true;
    this.segs.count = 0;
    this.segs.frustumCulled = false;
    this.root.add(this.segs);
    this.faces = [];
  }

  spawn(pos, o = {}) {
    if (this.list.length >= MAX) return null;
    const grp = new THREE.Group();
    const shell = new THREE.Mesh(this.shellGeo, this.mat);
    shell.castShadow = true;
    grp.add(shell);
    // printed face on the front of the shell, eyes rolled upward
    const face = new VerityFace(256);
    face.set(o.face || 'grin', true);
    const fg = new THREE.SphereGeometry(0.1705, 24, 16, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.45, Math.PI * 0.4);
    const fp = fg.attributes.position, fu = fg.attributes.uv;
    for (let i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i) / 0.34 + 0.5, (fp.getY(i) + 0.03) / 0.34 + 0.62);
    const fm = new THREE.MeshStandardMaterial({ map: face.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.4 });
    const fmesh = new THREE.Mesh(fg, fm);
    grp.add(fmesh);
    // loose filament strings dangling from the rim
    const strands = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3(Math.cos(a) * (0.15 - k * 0.004), 0.06 - k * 0.04, Math.sin(a) * (0.15 - k * 0.004)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0015, 3), this.legMat);
      grp.add(tube);
      strands.push(tube);
    }
    grp.position.copy(pos);
    this.root.add(grp);
    const s = {
      grp, shell, face, fmesh, pos: grp.position, home: pos.clone(), yaw: o.yaw ?? 0, speed: o.speed ?? 2.6, active: o.active ?? true,
      zone: o.zone || null, path: [], repath: 0, seen: false, seenT: 0, unseenT: 0, legs: [], height: 0.34, moved: 0, skitterT: 0,
      hitCooldown: 0, layer: o.layer ?? 0, turnT: 0, lookYaw: o.yaw ?? 0,
    };
    for (let i = 0; i < LEGS; i++) {
      const a = (i / LEGS) * Math.PI * 2 + 0.3;
      s.legs.push({ a, foot: new THREE.Vector3(pos.x + Math.cos(a) * 0.42, pos.y, pos.z + Math.sin(a) * 0.42), from: new THREE.Vector3(), to: new THREE.Vector3(), k: 1, group: i % 2 });
    }
    this.list.push(s);
    this.active = true;
    return s;
  }

  clear() {
    for (const s of this.list) { s.grp.removeFromParent(); s.face.texture.dispose(); }
    this.list = [];
    this.segs.count = 0;
    this.active = false;
  }
  stopAll() { for (const s of this.list) { s.active = false; s.path = []; } }
  setActive(v, zone = null) { for (const s of this.list) if (!zone || s.zone === zone) s.active = v; }

  // 0..1 closeness of the nearest active one (for heartbeat / music)
  nearest(p) {
    let best = 0;
    for (const s of this.list) {
      if (!s.active) continue;
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      best = Math.max(best, clamp(1 - d / 9));
    }
    return best;
  }

  observed(s) {
    const g = this.game, cam = g.camera;
    _v.copy(s.pos).setY(s.pos.y + 0.3).project(cam);
    if (_v.z > 1 || Math.abs(_v.x) > 1.08 || Math.abs(_v.y) > 1.1) return false;
    const d = cam.position.distanceTo(s.pos);
    const p = g.player;
    if (!lineOfSight(cam.position.x, cam.position.z, s.pos.x, s.pos.z, g.level.walls(s.layer), ['wall'])) return false;
    // needs light to be seen: flashlight cone, a lit zone, or night vision
    const nv = p.camcorder.up && p.camcorder.nv;
    const inBeam = p.spot.intensity > 0.5 && (() => {
      const dir = _p.subVectors(p.spotTarget.position, p.spot.position).normalize();
      const to = _v.subVectors(s.pos, p.spot.position).normalize();
      return dir.dot(to) > Math.cos(p.spot.angle * 1.05) && d < 20;
    })();
    const zoneLit = g.zone && g.zone.fixtures.some((f) => f.effective > 1 && f.position.distanceTo(s.pos) < f.range);
    return nv || inBeam || zoneLit || d < 2.2;
  }

  // closed doors stop them (the nav grid ignores doors so the monster can path through)
  doorBlocks(x, z, layer) {
    const L = this.game.level, r = 0.3;
    for (const c of L.near(x, z, layer)) {
      if (!c.tag?.startsWith('door:')) continue;
      const d = L.doors[c.tag.slice(5)];
      if (!d || d.open > 0.5) continue;
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }

  update(dt, frozen = false) {
    if (!this.list.length) return;
    const g = this.game;
    const P = g.player.pos;
    let n = 0;
    for (const s of this.list) {
      s.face.update(dt);
      s.hitCooldown = Math.max(0, s.hitCooldown - dt);
      const seen = this.observed(s);
      if (seen !== s.seen) {
        s.seen = seen;
        if (seen && s.moved > 0.5 && s.active) {
          // caught mid-step: it snaps still with a click
          g.audio.sfx.play('click3', { position: s.pos, volume: 0.7 });
          s.moved = 0;
        }
      }
      if (seen) { s.seenT += dt; s.unseenT = 0; } else { s.unseenT += dt; s.seenT = 0; }
      let moving = false;
      if (s.active && !frozen && !seen && g.mode === 'play' && !g.player.hidden) {
        // path toward the player
        s.repath -= dt;
        if (s.repath <= 0 || !s.path.length) {
          s.repath = 0.6;
          s.path = g.level.nav.find(s.layer, s.pos.x, s.pos.z, P.x, P.z);
        }
        const wp = s.path[0];
        if (wp) {
          const dx = wp.x - s.pos.x, dz = wp.z - s.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.2) s.path.shift();
          else {
            const step = Math.min(d, s.speed * (g.state.hard ? 1.25 : 1) * dt);
            const nx = s.pos.x + (dx / d) * step, nz = s.pos.z + (dz / d) * step;
            if (this.doorBlocks(nx, nz, s.layer)) { s.repath = 0.8; s.path = []; }
            else {
              s.pos.x = nx;
              s.pos.z = nz;
              s.yaw = Math.atan2(dx, dz);
              s.moved += step;
              moving = true;
            }
          }
        }
        s.skitterT -= dt;
        if (moving && s.skitterT <= 0) {
          s.skitterT = 0.35 + Math.random() * 0.4;
          const occluded = !lineOfSight(P.x, P.z, s.pos.x, s.pos.z, g.level.walls(s.layer), ['wall']);
          g.audio.sfx.play('skitter', { position: s.pos, volume: 0.9, occluded });
        }
      } else if (s.active && seen && s.seenT > 2.5 && s.turnT <= 0) {
        // stare long enough and its face turns to follow you
        s.turnT = 3 + Math.random() * 3;
        g.audio.sfx.play('faceTurn', { position: s.pos, volume: 0.6 });
      }
      s.turnT -= dt;
      // face the player slowly when idle, instantly while unseen
      const want = Math.atan2(P.x - s.pos.x, P.z - s.pos.z);
      if (!seen) s.lookYaw = want;
      else if (s.turnT > 2.5) s.lookYaw = lerpAngle(s.lookYaw, want, 1 - Math.exp(-0.6 * dt));
      s.grp.rotation.y = s.lookYaw;
      // body bob while moving; settle when still
      const fy = g.story?.heightAt?.(s.pos.x, s.pos.z, s.layer) ?? 0;
      s.height = damp(s.height, moving ? 0.38 + Math.sin(g.time * 22) * 0.02 : 0.3, 10, dt);
      s.grp.position.y = fy + s.height;
      s.shell.rotation.z = moving ? Math.sin(g.time * 17) * 0.08 : 0;
      // legs: feet stay planted; step when they fall too far behind
      const ang = s.grp.rotation.y;
      for (const L of s.legs) {
        const a = L.a + ang;
        const home = _p.set(s.pos.x + Math.sin(a) * 0.42, fy, s.pos.z + Math.cos(a) * 0.42);
        if (L.k >= 1 && L.foot.distanceTo(home) > 0.22) {
          L.from.copy(L.foot);
          L.to.copy(home).addScaledVector(new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)), moving ? 0.12 : 0);
          L.k = 0;
        }
        if (L.k < 1) {
          L.k = Math.min(1, L.k + dt * 9);
          L.foot.lerpVectors(L.from, L.to, L.k);
          L.foot.y = fy + Math.sin(L.k * Math.PI) * 0.12;
        }
        // hip on the shell rim, knee pushed up and out
        const hip = new THREE.Vector3(Math.sin(a) * 0.14, 0.02, Math.cos(a) * 0.14).add(s.grp.position);
        const mid = hip.clone().lerp(L.foot, 0.5);
        const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        mid.addScaledVector(out, 0.12).y += 0.24;
        n = this.setSeg(n, hip, mid);
        n = this.setSeg(n, mid, L.foot);
      }
      // contact
      const dP = Math.hypot(P.x - s.pos.x, P.z - s.pos.z);
      if (s.active && !frozen && dP < 0.65 && s.hitCooldown <= 0 && g.mode === 'play' && !g.player.hidden) {
        s.hitCooldown = 4;
        g.story.secondsHit?.(s);
      }
    }
    this.segs.count = n;
    this.segs.instanceMatrix.needsUpdate = true;
  }

  setSeg(n, a, b) {
    const d = _v.subVectors(b, a);
    const len = d.length();
    _q.setFromUnitVectors(UP, d.normalize());
    _s.set(1, len, 1);
    _m.compose(a, _q, _s);
    this.segs.setMatrixAt(n, _m);
    return n + 1;
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
