import * as THREE from 'three';
import { H } from './House.js';
import { makeGlowSprite } from '../render/ProceduralTextures.js';
import { noise1, clamp, rand } from '../core/util.js';

// Practical lights, flicker, power cuts, lightning, dust and rain.
export class Lighting {
  constructor(scene, house) {
    this.scene = scene;
    this.house = house;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.lamps = {};
    this.power = true;
    this.time = 0;
    this.tint = new THREE.Color(1, 1, 1);
    this.globalDim = 1;

    this.hemi = new THREE.HemisphereLight(0x3a4050, 0x1a120a, 0.12);
    this.root.add(this.hemi);

    this.bulbGeo = new THREE.SphereGeometry(0.045, 16, 12);
    this.glowTex = makeGlowSprite(128);
    this.addLamp('hallA1', 0, -2.8, { color: 0xffb46a, intensity: 6.5, shadow: true, cord: 0.45 });
    this.addLamp('hallA2', 0, -8.2, { color: 0xffae60, intensity: 5, cord: 0.45 });
    this.addLamp('corner', 0.05, -12.35, { color: 0xffa855, intensity: 7.5, cord: 0.42, shadow: true, bare: true });
    this.addLamp('hallB', 4.4, -13, { color: 0xffb060, intensity: 5, cord: 0.45 });
    this.addLamp('bath', 2.6, -9, { color: 0xd8f0d0, intensity: 4.5, cord: 0.15, fluoro: true });
    this.addLamp('bedroom', 4.5, -16, { color: 0xffb870, intensity: 5, cord: 0.4 });
    this.addLamp('porch', -1.35, -3.2, { color: 0xffd9a0, intensity: 5, cord: 0.0, y: 2.35, wall: true });
    this.lamps.porch.on = false;

    // cold light from the windows
    this.windowLights = [];
    for (const [x, y, z] of [[-1.6, 1.6, -1.4], [4.2, 1.6, -18.6]]) {
      const l = new THREE.PointLight(0x6d86b8, 0.25, 7, 2);
      l.position.set(x, y, z);
      this.root.add(l);
      this.windowLights.push({ light: l, base: 0.25 });
    }
    this.lightning = { t: 0, flashes: [], next: 18 + Math.random() * 20, enabled: true };
    this.buildDust();
    this.buildRain();
  }

  addLamp(id, x, z, o) {
    const y = o.y ?? H - (o.cord ?? 0.4) - 0.06;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.root.add(g);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: new THREE.Color(o.color), emissiveIntensity: 3 });
    const bulb = new THREE.Mesh(this.bulbGeo, bulbMat);
    g.add(bulb);
    if (!o.wall) {
      const cordLen = H - y;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, cordLen), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      cord.position.y = cordLen / 2 + 0.05;
      g.add(cord);
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x2a2520, metalness: 0.6, roughness: 0.4 }));
      socket.position.y = 0.06;
      g.add(socket);
      if (!o.bare && !o.fluoro) {
        const shade = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
          new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: new THREE.Color(o.color), emissiveIntensity: 0.25 }),
        );
        shade.position.y = 0.1;
        shade.scale.y = 0.9;
        g.add(shade);
        g.userData.shade = shade;
      }
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x9a9585 }));
      rose.position.y = cordLen + 0.04;
      g.add(rose);
    }
    if (o.fluoro) bulb.scale.set(1, 0.4, 8);
    const light = new THREE.PointLight(o.color, o.intensity, 12, 2);
    light.position.y = -0.04;
    if (o.shadow) {
      light.userData.shadowRole = 'point';
      light.shadow.bias = -0.002;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = 3;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 12;
    }
    g.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: o.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    glow.scale.setScalar(0.55);
    g.add(glow);
    this.lamps[id] = {
      id, group: g, light, bulb, bulbMat, glow, base: o.intensity, color: new THREE.Color(o.color),
      on: true, broken: false, flicker: o.fluoro ? 0.05 : 0, flickerUntil: 0, level: 1, swing: 0, fluoro: !!o.fluoro,
    };
  }

  setPower(on) { this.power = on; }
  setLamp(id, on) { if (this.lamps[id]) this.lamps[id].on = on; }
  breakLamp(id) { const l = this.lamps[id]; if (l) { l.broken = true; } }
  repairAll() { for (const l of Object.values(this.lamps)) { l.broken = false; } }

  // Short burst of flicker on all (or one) lamps.
  flicker(duration = 1.5, id = null, amount = 0.8) {
    const until = this.time + duration;
    for (const l of Object.values(this.lamps)) {
      if (id && l.id !== id) continue;
      l.flickerUntil = Math.max(l.flickerUntil, until);
      l.burst = amount;
    }
  }
  swingLamp(id, amount = 0.25) { if (this.lamps[id]) this.lamps[id].swing = amount; }

  strike(onThunder) {
    const t = this.time;
    this.lightning.flashes = [
      [t, t + 0.07], [t + 0.14, t + 0.2], [t + 0.32, t + 0.5],
    ];
    setTimeout(() => onThunder?.(), 500 + Math.random() * 900);
  }

  buildDust() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    this.dustSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const inB = i % 3 === 0;
      pos[i * 3] = inB ? 1 + Math.random() * 6 : -0.95 + Math.random() * 1.9;
      pos[i * 3 + 1] = Math.random() * H;
      pos[i * 3 + 2] = inB ? -12 - Math.random() * 2 : -Math.random() * 14;
      this.dustSeed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustBase = pos.slice();
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      map: this.glowTex, size: 0.018, color: 0xffe2b0, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  buildRain() {
    const n = 1400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = -14 + Math.random() * 12.9, y = Math.random() * 8, z = -14 + Math.random() * 16;
      pos.set([x, y, z, x + 0.01, y - 0.35, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8090a8, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.root.add(this.rain);
  }

  update(dt, insanity = 0, reduceFlashing = false) {
    this.time += dt;
    const t = this.time;
    // lightning
    let flash = 0;
    for (const [a, b] of this.lightning.flashes) if (t >= a && t <= b) flash = 1;
    if (reduceFlashing) flash *= 0.3;
    this.flashLevel = flash;
    for (const w of this.windowLights) w.light.intensity = w.base + flash * 18;
    this.hemi.intensity = (0.1 + flash * 0.25) * this.globalDim;

    for (const l of Object.values(this.lamps)) {
      let target = l.on && !l.broken && (this.power || l.id === 'porch') ? 1 : 0;
      if (target > 0) {
        let f = l.flicker + insanity * 0.08;
        if (t < l.flickerUntil) f = Math.max(f, l.burst || 0.8);
        if (f > 0) {
          const n = noise1(t * (l.fluoro ? 40 : 18) + l.base * 13);
          if (n < f * 0.7) target *= n < f * 0.35 ? 0.02 : 0.35;
        }
        if (l.fluoro) target *= 0.92 + Math.sin(t * 120) * 0.04;
      }
      l.level += (target - l.level) * Math.min(1, dt * (target > l.level ? 30 : 18));
      const k = l.level * this.globalDim;
      l.light.intensity = l.base * k;
      l.light.color.copy(l.color).multiply(this.tint);
      l.bulbMat.emissiveIntensity = 0.05 + k * 3.2;
      l.bulbMat.emissive.copy(l.color).multiply(this.tint);
      l.glow.material.opacity = 0.35 * k;
      l.glow.material.color.copy(l.color).multiply(this.tint);
      if (l.group.userData.shade) l.group.userData.shade.material.emissiveIntensity = 0.25 * k;
      if (l.swing > 0.001) {
        l.group.rotation.z = Math.sin(t * 2.4) * l.swing;
        l.group.rotation.x = Math.cos(t * 1.7) * l.swing * 0.5;
        l.swing *= Math.exp(-dt * 0.25);
      }
    }
    // dust drift
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = this.dustSeed[i];
      p.setXYZ(i,
        this.dustBase[i * 3] + Math.sin(t * 0.13 + s) * 0.25,
        ((this.dustBase[i * 3 + 1] + t * 0.02 * (0.5 + (s % 1))) % H),
        this.dustBase[i * 3 + 2] + Math.cos(t * 0.11 + s * 1.3) * 0.25);
    }
    p.needsUpdate = true;
    if (this.rain.visible) {
      const r = this.rain.geometry.attributes.position;
      for (let i = 0; i < r.count; i += 2) {
        let y = r.getY(i) - dt * 9;
        if (y < 0) y += 8;
        r.setY(i, y);
        r.setY(i + 1, y - 0.35);
      }
      r.needsUpdate = true;
    }
  }

  // automatic lightning timing (returns true when a strike should start)
  tickLightning(dt) {
    if (!this.lightning.enabled) return false;
    this.lightning.next -= dt;
    if (this.lightning.next <= 0) {
      this.lightning.next = 25 + rand() * 40;
      return true;
    }
    return false;
  }

  setTint(r, g, b) { this.tint.setRGB(r, g, b); }
  clampAll() { this.globalDim = clamp(this.globalDim, 0, 1); }
}
