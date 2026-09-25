import * as THREE from 'three';
import { resolveCircle } from '../../core/physics.js';

// Things you can pick up and throw to make noise somewhere else.
const KINDS = {
  can: { label: 'Pick up the can', sound: 'can', r: 0.035, h: 0.12, color: 0xb03a2e, metal: 0.8 },
  ball: { label: 'Pick up the reject', sound: 'bounce', r: 0.07, color: 0xd9a820, metal: 0 },
  bottle: { label: 'Pick up the bottle', sound: 'glass', r: 0.035, h: 0.26, color: 0x3d6b4a, metal: 0, glass: true },
};

export class Throwables {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'throwables';
    game.scene.add(this.root);
    this.items = [];
    this.meshes = [];
    this.held = null;
    this.flying = [];
    this.handMount = new THREE.Group();
    this.handMount.position.set(0.24, -0.22, -0.42);
    game.camera.add(this.handMount);
  }

  make(kind) {
    const k = KINDS[kind];
    let geo;
    if (kind === 'ball') geo = new THREE.SphereGeometry(k.r, 20, 14, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7);
    else geo = new THREE.CylinderGeometry(k.r * (kind === 'bottle' ? 0.9 : 1), k.r, k.h, 16);
    const mat = this.game.lib.plain({
      color: k.color, rough: k.glass ? 0.08 : 0.35, metal: k.metal, side: THREE.DoubleSide,
      physical: k.glass ? { transmission: 0, clearcoat: 1, clearcoatRoughness: 0.05 } : undefined,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  spawn(kind, pos, layer = 0) {
    const m = this.make(kind);
    m.position.copy(pos);
    m.rotation.set(Math.PI / 2 * (kind !== 'ball' ? 1 : 0), Math.random() * 6, 0);
    this.root.add(m);
    const it = { kind, mesh: m, layer };
    m.userData.interactable = {
      label: () => (this.held ? 'Swap for this' : KINDS[kind].label),
      onInteract: () => this.pick(it),
    };
    this.items.push(it);
    this.meshes.push(m);
    return it;
  }

  pick(it) {
    const g = this.game;
    if (this.held) this.drop();
    this.meshes.splice(this.meshes.indexOf(it.mesh), 1);
    it.mesh.removeFromParent();
    it.mesh.position.set(0, 0, 0);
    it.mesh.rotation.set(0.3, 0.4, 0);
    this.handMount.add(it.mesh);
    this.held = it;
    g.audio.sfx.play('pickup', { volume: 0.6 });
    g.ui.toast(`${g.controls.usingPad ? 'RB' : 'G'} — throw it`, 2.5);
  }

  drop() {
    const it = this.held;
    if (!it) return;
    this.held = null;
    const p = this.game.player;
    it.mesh.removeFromParent();
    it.mesh.position.copy(p.pos).addScaledVector(p.forward, 0.4).setY(p.pos.y + 0.05);
    this.root.add(it.mesh);
    this.meshes.push(it.mesh);
  }

  throwHeld() {
    const it = this.held;
    if (!it) return;
    const g = this.game, cam = g.camera;
    this.held = null;
    const m = it.mesh;
    m.removeFromParent();
    m.position.copy(cam.position).addScaledVector(g.player.lookDir, 0.4);
    this.root.add(m);
    const v = g.player.lookDir.multiplyScalar(9).add(new THREE.Vector3(0, 2.2, 0));
    this.flying.push({ it, v, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0), bounces: 0, layer: g.player.layer });
    g.audio.sfx.play('whoosh', { volume: 0.4 });
  }

  update(dt) {
    const g = this.game;
    this.handMount.visible = !!this.held && g.mode === 'play' && !g.player.camcorder.up;
    if (this.held) this.handMount.position.y = -0.22 + Math.sin(g.time * 2) * 0.004 - g.player.bobAmp * 0.01;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      const m = f.it.mesh;
      f.v.y -= 9.8 * dt;
      const before = m.position.clone();
      m.position.addScaledVector(f.v, dt);
      m.rotation.x += f.spin.x * dt; m.rotation.y += f.spin.y * dt;
      // walls: reflect horizontally
      const p2 = m.position.clone();
      resolveCircle(p2, 0.06, g.level ? g.level.near(p2.x, p2.z, f.layer) : []);
      if (p2.distanceToSquared(m.position) > 1e-6) {
        const n = p2.clone().sub(m.position).setY(0).normalize();
        const vn = f.v.dot(n);
        if (vn < 0) f.v.addScaledVector(n, -1.6 * vn);
        m.position.copy(p2);
        this.impact(f, 0.7);
      }
      const floor = (g.story?.heightAt?.(m.position.x, m.position.z, f.layer) ?? 0) + 0.04;
      if (m.position.y < floor) {
        m.position.y = floor;
        if (Math.abs(f.v.y) > 1.2) this.impact(f, Math.min(1, Math.abs(f.v.y) / 6));
        f.v.y *= -0.35;
        f.v.x *= 0.6; f.v.z *= 0.6;
        f.spin.multiplyScalar(0.5);
        if (f.it.kind === 'bottle' && f.bounces === 0) { this.shatter(f); this.flying.splice(i, 1); continue; }
        f.bounces++;
      }
      const ceil = floor + (g.story?.ceilingAt?.(m.position.x, m.position.z) ?? 3.5);
      if (m.position.y > ceil) { m.position.y = ceil; f.v.y = -Math.abs(f.v.y) * 0.5; }
      if (f.bounces > 3 || (f.v.lengthSq() < 0.3 && m.position.y <= floor + 0.01)) {
        m.position.y = floor;
        m.rotation.set(f.it.kind === 'ball' ? 0 : Math.PI / 2, m.rotation.y, 0);
        this.flying.splice(i, 1);
        this.meshes.push(m);
      }
      void before;
    }
  }

  impact(f, k) {
    const g = this.game;
    const p = f.it.mesh.position;
    if (f.lastImpact && g.time - f.lastImpact < 0.08) return;
    f.lastImpact = g.time;
    g.audio.sfx.play(KINDS[f.it.kind].sound, { position: p.clone(), volume: 0.6 + k * 0.6 });
    g.chase.hear?.(p.clone(), 14 * k + 4, true);
    g.story?.onNoise?.(p.clone(), k);
  }

  shatter(f) {
    const g = this.game;
    const p = f.it.mesh.position.clone();
    f.it.mesh.removeFromParent();
    g.audio.sfx.play('glass', { position: p, volume: 1.2 });
    g.chase.hear?.(p, 20, true);
    g.story?.onNoise?.(p, 1);
    g.particles.burst?.(p, 'glass');
  }

  clear() {
    for (const it of this.items) it.mesh.removeFromParent();
    this.items = [];
    this.meshes = [];
    this.flying = [];
    if (this.held) { this.held.mesh.removeFromParent(); this.held = null; }
  }
}
