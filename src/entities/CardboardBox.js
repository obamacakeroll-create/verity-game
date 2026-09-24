import * as THREE from 'three';
import { makeCardboard } from '../render/ProceduralTextures.js';

// The box that says VERITY. Four hinged flaps that can open by themselves.
export class CardboardBox {
  constructor(parent, pos, size = 0.5) {
    this.size = size;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.rotation.y = 0.18;
    parent.add(this.root);
    const s = size, h = size * 0.9;
    this.h = h;
    const label = new THREE.MeshStandardMaterial({ ...makeCardboard('VERITY', 512, { verity: true }), roughness: 0.95 });
    const plain = new THREE.MeshStandardMaterial({ ...makeCardboard('', 256), roughness: 0.95, side: THREE.DoubleSide });
    const inner = new THREE.MeshStandardMaterial({ color: 0x3a2812, roughness: 1, side: THREE.DoubleSide });
    this.labelMat = label;
    const wall = (w, hh, x, z, ry, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
      m.position.set(x, hh / 2, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      this.root.add(m);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.99, hh * 0.99), inner);
      back.position.copy(m.position);
      back.rotation.y = ry + Math.PI;
      back.position.x -= Math.sin(ry) * 0.004;
      back.position.z -= Math.cos(ry) * 0.004;
      this.root.add(back);
      return m;
    };
    wall(s, h, 0, s / 2, 0, label); // front (+z) with the name
    wall(s, h, 0, -s / 2, Math.PI, label);
    wall(s, h, s / 2, 0, Math.PI / 2, plain);
    wall(s, h, -s / 2, 0, -Math.PI / 2, plain);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(s, s), inner);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;
    this.root.add(bottom);

    // flaps: pivots on each top edge
    this.flaps = [];
    const flap = (px, pz, axis, sign, w, d) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, h, pz);
      this.root.add(pivot);
      const geo = new THREE.BoxGeometry(axis === 'x' ? w : d, 0.006, axis === 'x' ? d : w);
      const m = new THREE.Mesh(geo, plain);
      if (axis === 'x') m.position.z = -sign * d / 2; else m.position.x = -sign * d / 2;
      m.castShadow = true;
      pivot.add(m);
      this.flaps.push({ pivot, axis, sign, open: 0, target: 0, delay: 0, wobble: 0 });
    };
    flap(0, s / 2, 'x', 1, s, s / 2);
    flap(0, -s / 2, 'x', -1, s, s / 2);
    flap(s / 2, 0, 'z', 1, s, s / 2 - 0.004);
    flap(-s / 2, 0, 'z', -1, s, s / 2 - 0.004);
    // side flaps sit under the long ones
    this.flaps[2].pivot.position.y -= 0.004;
    this.flaps[3].pivot.position.y -= 0.004;

    // packing tape strip (can be torn)
    this.tape = new THREE.Mesh(new THREE.PlaneGeometry(0.08, s + 0.1), new THREE.MeshStandardMaterial({ color: 0xc9b27a, roughness: 0.3, transparent: true, opacity: 0.85 }));
    this.tape.rotation.x = -Math.PI / 2;
    this.tape.position.y = h + 0.006;
    this.root.add(this.tape);

    this.shake = 0;
    this.t = 0;
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    this.hit.position.y = h / 2;
    this.root.add(this.hit);
  }

  setOpen(v, stagger = 0.15) {
    this.flaps.forEach((f, i) => {
      f.target = v;
      f.delay = v ? i * stagger : (3 - i) * stagger;
    });
    if (v) this.tape.visible = false;
  }

  snapOpen(v) {
    this.flaps.forEach((f) => { f.target = f.open = v; f.delay = 0; });
    this.tape.visible = !v;
    this.applyFlaps();
  }

  applyFlaps() {
    for (const f of this.flaps) {
      const a = f.open * 2.1 + Math.sin(this.t * 30) * f.wobble;
      if (f.axis === 'x') f.pivot.rotation.x = f.sign * a;
      else f.pivot.rotation.z = -f.sign * a;
    }
  }

  update(dt) {
    this.t += dt;
    for (const f of this.flaps) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      const d = f.target - f.open;
      f.open += d * Math.min(1, dt * (f.target > 0 ? 7 : 5));
      f.wobble = this.shake * 0.08;
    }
    this.applyFlaps();
    if (this.shake > 0) {
      this.root.position.x += (Math.random() - 0.5) * this.shake * 0.01;
      this.root.position.z += (Math.random() - 0.5) * this.shake * 0.01;
      this.root.rotation.z = (Math.random() - 0.5) * this.shake * 0.03;
      if (!this._home) this._home = this.root.position.clone();
    } else if (this._home) {
      this.root.position.copy(this._home);
      this.root.rotation.z = 0;
      this._home = null;
    }
  }
}
