import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp } from '../../core/util.js';

// Hinged / sliding / rolling doors with colliders, sounds and prompts.
export class Door {
  // o: { id, zone, x, z, y, w, h, t, axis: 'x'|'z' (the wall line), hinge: -1|1, swing: 1|-1, kind: 'wood'|'metal'|'glass'|'freezer'|'fire'|'roller'|'slideGlass',
  //      locked, lockLabel, mat, frameless, onOpen, monster (monster may open) }
  constructor(level, o) {
    this.level = level;
    this.game = level.game;
    this.o = o;
    this.id = o.id;
    this.kind = o.kind || 'wood';
    this.locked = !!o.locked;
    this.open = 0;
    this.target = 0;
    this.speed = o.speed ?? 2.2;
    const w = o.w ?? 0.9, h = o.h ?? 2.05, t = o.t ?? 0.045;
    this.w = w; this.h = h;
    const y = o.y ?? level.zones.get(o.zone)?.floorY ?? 0;
    this.root = new THREE.Group();
    this.root.position.set(o.x, y, o.z);
    if (o.axis === 'z') this.root.rotation.y = Math.PI / 2;
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    const lib = this.game.lib;
    const zone = level.zones.get(o.zone);
    let mat;
    if (this.kind === 'glass' || this.kind === 'slideGlass') mat = lib.plain({ color: 0x9fb3b0, rough: 0.05, metal: 0, transparent: true, opacity: 0.22, zone, physical: { clearcoat: 1 } });
    else if (this.kind === 'metal' || this.kind === 'fire') mat = lib.get('metalPaint', { color: o.color ?? 0x5d6b66, zone, grime: 0.8 });
    else if (this.kind === 'freezer') mat = lib.get('panel', { color: 0xd8dcd8, zone, grime: 0.9 });
    else if (this.kind === 'roller') mat = lib.get('corrugated', { color: 0xb7b9b3, zone, uvRot: Math.PI / 2 });
    else mat = lib.get('wood', { color: o.color ?? 0xb9a58c, zone, grime: 0.5 });
    const hingeX = (o.hinge ?? -1) * (w / 2);
    this.pivot.position.x = this.kind === 'slideGlass' || this.kind === 'roller' ? 0 : hingeX;
    const panelGeo = this.kind === 'roller' ? new THREE.BoxGeometry(w, h, 0.06) : new RoundedBoxGeometry(w - 0.01, h - 0.01, t, 2, 0.008);
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.position.set(this.kind === 'slideGlass' || this.kind === 'roller' ? 0 : -hingeX, h / 2, 0);
    panel.castShadow = this.kind !== 'glass' && this.kind !== 'slideGlass';
    panel.receiveShadow = true;
    this.pivot.add(panel);
    this.panel = panel;
    // details
    const steel = lib.get('brushed', { zone });
    if (this.kind === 'wood' || this.kind === 'metal' || this.kind === 'fire' || this.kind === 'freezer') {
      const hx = -hingeX * 1.82; // near the free edge
      if (this.kind === 'fire') {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w * 0.72, 12), steel);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(panel.position.x, 1.0, t / 2 + 0.06);
        this.pivot.add(bar);
        for (const e of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.06), steel);
          post.position.set(panel.position.x + e * w * 0.36, 1.0, t / 2 + 0.03);
          this.pivot.add(post);
        }
      } else if (this.kind === 'freezer') {
        const bar = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.4, 0.09, 2, 0.02), steel);
        bar.position.set(hx, 1.1, t / 2 + 0.05);
        this.pivot.add(bar);
      } else {
        for (const side of [1, -1]) {
          const g = new THREE.Group();
          const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 20), steel);
          rose.rotation.x = Math.PI / 2;
          const lever = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.02, 0.024, 2, 0.009), steel);
          lever.position.set(Math.sign(hingeX) * 0.05, 0, 0.032);
          lever.castShadow = true;
          g.add(rose, lever);
          g.position.set(hx, 1.0, side * (t / 2 + 0.006));
          if (side < 0) g.rotation.y = Math.PI;
          this.pivot.add(g);
        }
      }
      if (o.window) {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.5), lib.plain({ color: 0x1c2626, rough: 0.05, metal: 0.3, zone }));
        glass.position.set(panel.position.x, 1.45, t / 2 + 0.002);
        this.pivot.add(glass);
      }
      if (o.sign) {
        const sign = makeSignMesh(o.sign, 0.34, 0.1, { bg: '#e8e2d0', fg: '#222' });
        sign.position.set(panel.position.x, 1.6, t / 2 + 0.004);
        this.pivot.add(sign);
      }
    }
    if (this.kind === 'glass' || this.kind === 'slideGlass') {
      const frameMat = lib.get('brushed', { zone, color: 0x8a8d8c });
      const fr = [[w, 0.06, 0, h - 0.03], [w, 0.1, 0, 0.05], [0.05, h, -w / 2 + 0.025, h / 2], [0.05, h, w / 2 - 0.025, h / 2]];
      for (const [fw, fh, fx, fy] of fr) {
        const m = new THREE.Mesh(new RoundedBoxGeometry(fw, fh, 0.06, 2, 0.01), frameMat);
        m.position.set(panel.position.x + fx, fy, 0);
        m.castShadow = true;
        this.pivot.add(m);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 10), steel);
      bar.position.set(panel.position.x + (hingeX ? -Math.sign(hingeX) * (w / 2 - 0.12) : w * 0.35), 1.0, 0.06);
      this.pivot.add(bar);
    }
    level.dynamic.add(this.root);
    // collider across the doorway when closed
    const cx = o.x, cz = o.z;
    const half = w / 2;
    this.col = level.addCollider(o.axis === 'z'
      ? { minX: cx - 0.06, maxX: cx + 0.06, minZ: cz - half, maxZ: cz + half, tag: 'door:' + o.id, layer: zone?.layer ?? 0 }
      : { minX: cx - half, maxX: cx + half, minZ: cz - 0.06, maxZ: cz + 0.06, tag: 'door:' + o.id, layer: zone?.layer ?? 0 });
    level.doors[o.id] = this;
    level.interact(panel, {
      label: () => this.label(),
      onInteract: (g) => this.use(g),
    });
    this.onUpdate = (dt) => this.update(dt);
    level.onUpdate(this.onUpdate);
  }

  label() {
    if (this.o.label) { const l = this.o.label(this); if (l !== undefined) return l; }
    if (this.locked) return this.o.lockLabel || 'Locked';
    if (this.kind === 'roller') return this.target > 0.5 ? null : 'Raise the shutter';
    return this.target > 0.5 ? 'Close' : 'Open';
  }

  use(g) {
    if (this.o.onUse && this.o.onUse(this, g) === false) return;
    if (this.locked) {
      g.audio.sfx.play('locked', { position: this.worldPos() });
      this.o.onLocked?.(this, g);
      return;
    }
    this.set(this.target > 0.5 ? 0 : 1, g);
  }

  set(v, g = this.game, { silent = false, speed } = {}) {
    if (speed) this.speed = speed;
    if (v === this.target) return;
    this.target = v;
    if (!silent) {
      const snd = { wood: v ? 'doorOpen' : 'doorClose', metal: v ? 'metalDoor' : 'metalSlam', fire: v ? 'metalDoor' : 'metalSlam', freezer: 'freezerDoor', glass: 'glassDoor', slideGlass: 'glassDoor', roller: 'rollerDoor' }[this.kind];
      g.audio.sfx.play(snd, { position: this.worldPos(), volume: 0.8 });
    }
    if (v) this.o.onOpen?.(this, g);
  }

  worldPos() { return this.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)); }

  update(dt) {
    this.open = damp(this.open, this.target, this.speed * 2.2, dt);
    if (Math.abs(this.open - this.target) < 0.002) this.open = this.target;
    const k = this.open;
    if (this.kind === 'slideGlass') this.pivot.position.x = (this.o.hinge ?? -1) * -this.w * 0.95 * k;
    else if (this.kind === 'roller') this.pivot.position.y = k * (this.h - 0.25);
    else this.pivot.rotation.y = (this.o.swing ?? 1) * (this.o.hinge ?? -1) * -k * (this.o.maxAngle ?? 1.75);
    this.col.enabled = k < 0.55;
  }
}

// A flat sign (text on a canvas) as a mesh.
export function makeSignMesh(text, w, h, { bg = '#1a6d3a', fg = '#fff', font = 'bold 64px Arial', emissive = 0, px = 512, border = null, sub = null } = {}) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  if (border) { x.strokeStyle = border; x.lineWidth = c.height * 0.06; x.strokeRect(0, 0, c.width, c.height); }
  x.fillStyle = fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const size = parseInt(font.match(/(\d+)px/)?.[1] || 64, 10);
  let fs = Math.min(size, c.height * (sub ? 0.5 : 0.7));
  x.font = font.replace(/\d+px/, `${fs}px`);
  while (x.measureText(text).width > c.width * 0.9 && fs > 8) { fs -= 2; x.font = font.replace(/\d+px/, `${fs}px`); }
  x.fillText(text, c.width / 2, c.height * (sub ? 0.4 : 0.52));
  if (sub) { x.font = `${Math.round(fs * 0.45)}px Arial`; x.fillText(sub, c.width / 2, c.height * 0.78); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0, emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  return mesh;
}
