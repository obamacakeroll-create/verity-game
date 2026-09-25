import * as THREE from 'three';
import { noise1 } from '../../core/util.js';

// Light fixtures + a fixed pool of real lights.
// A level can have hundreds of fixtures; each frame the most relevant ones
// (near the camera, in the current or adjacent zone) are bound to a constant
// set of three.js lights, so shader light counts never change (no recompiles).

const N_POINT = 8;
const N_SPOT = 2;

export class Fixture {
  constructor(o) {
    this.type = o.type || 'bulb';
    this.position = o.position.clone();
    this.color = new THREE.Color(o.color ?? 0xffe2b8);
    this.intensity = o.intensity ?? 6;
    this.range = o.range ?? 8;
    this.zone = o.zone;
    this.emissive = o.emissive || null; // material whose emissiveIntensity follows the light
    this.emissiveBase = o.emissiveBase ?? (this.emissive ? this.emissive.emissiveIntensity : 0);
    this.state = o.state || 'on';
    this.seed = Math.random() * 100;
    this.volScale = o.volScale ?? 1;
    this.dir = o.dir ? o.dir.clone().normalize() : null; // spot direction
    this.angle = o.angle ?? 0.9;
    this.penumbra = o.penumbra ?? 0.6;
    this.shadow = !!o.shadow;
    this.power = 1; // scripted multiplier (zone power, fades)
    this.k = 1; // current flicker multiplier
    this.buzz = o.buzz ?? this.type === 'fluo';
    this.persistent = !!o.persistent;
    this.onChange = null;
  }

  get effective() { return this.state === 'off' ? 0 : this.intensity * this.power * this.k; }

  update(t, dt) {
    let k = 1;
    const s = this.seed;
    switch (this.state) {
      case 'off': k = 0; break;
      case 'flicker': {
        const n = noise1(t * 9 + s);
        k = n > 0.33 ? 1 : n > 0.26 ? 0.25 : 0.02;
        if (noise1(t * 0.7 + s * 3) > 0.72) k *= noise1(t * 40 + s) > 0.5 ? 1 : 0.05;
        break;
      }
      case 'dying': {
        const n = noise1(t * 3 + s);
        k = n > 0.78 ? (noise1(t * 30 + s) > 0.4 ? 0.8 : 0.1) : 0.0;
        break;
      }
      case 'buzz': k = 0.93 + noise1(t * 60 + s) * 0.07; break;
      case 'strobe': k = Math.sin(t * 18 + s) > 0.2 ? 1 : 0; break;
      default: k = this.type === 'fluo' ? 0.97 + noise1(t * 25 + s) * 0.03 : 1;
    }
    this.k = k;
    if (this.emissive) this.emissive.emissiveIntensity = this.emissiveBase * k * this.power * (this.state === 'off' ? 0 : 1);
  }
}

export class Lights2 {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.fixtures = [];
    this.points = [];
    this.spots = [];
    this.group = new THREE.Group();
    this.group.name = 'light-pool';
    scene.add(this.group);
    for (let i = 0; i < N_POINT; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false;
      l.userData.slot = { fixture: null, fade: 0 };
      this.group.add(l);
      this.points.push(l);
    }
    for (let i = 0; i < N_SPOT; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 12, 0.8, 0.6, 2);
      l.castShadow = true;
      l.userData.shadowRole = 'local';
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0008;
      l.shadow.normalBias = 0.03;
      l.shadow.radius = 3;
      l.userData.slot = { fixture: null, fade: 0 };
      this.group.add(l, l.target);
      this.spots.push(l);
    }
    // faint sky / moon fill for exteriors, lightning flashes
    this.moon = new THREE.DirectionalLight(0x9fb4d8, 0);
    this.moon.position.set(-20, 30, 10);
    this.moon.castShadow = false;
    scene.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight(0x303848, 0x0a0806, 0.0);
    scene.add(this.hemi);
    this.maxShadowSpots = 1;
    this.lightning = 0;
    this.moonBase = 0;
    this.volLights = [];
  }

  add(o) {
    const f = new Fixture(o);
    this.fixtures.push(f);
    if (f.zone) f.zone.fixtures.push(f);
    return f;
  }

  clear() {
    this.fixtures = this.fixtures.filter((f) => f.persistent);
    for (const l of [...this.points, ...this.spots]) { l.intensity = 0; l.userData.slot.fixture = null; }
  }

  setShadowBudget(n) {
    this.maxShadowSpots = n;
    this.spots.forEach((s, i) => { s.castShadow = i < n; });
  }

  // Bind fixtures for probe capture around a point (static, no flicker).
  bindAround(pos, zone) {
    const list = this.fixtures.filter((f) => f.state !== 'off' && f.zone === zone && f.power > 0)
      .sort((a, b) => a.position.distanceToSquared(pos) - b.position.distanceToSquared(pos));
    const pts = list.filter((f) => !f.dir);
    const sps = list.filter((f) => f.dir);
    this.points.forEach((l, i) => this.apply(l, pts[i], 1, false));
    this.spots.forEach((l, i) => this.apply(l, sps[i], 1, false));
  }

  apply(l, f, fade = 1, flicker = true) {
    l.userData.slot.fixture = f || null;
    if (!f) { l.intensity = 0; return; }
    l.position.copy(f.position);
    l.color.copy(f.color);
    l.distance = f.range;
    l.intensity = (flicker ? f.effective : f.intensity * f.power * (f.state === 'off' ? 0 : 1)) * fade;
    if (l.isSpotLight) {
      l.angle = f.angle;
      l.penumbra = f.penumbra;
      l.target.position.copy(f.position).addScaledVector(f.dir, 4);
      l.target.updateMatrixWorld();
    }
  }

  update(dt, t, camPos, zone, visibleZones) {
    for (const f of this.fixtures) f.update(t, dt);
    // score candidates
    const score = (f) => {
      if (f.state === 'off' || f.power <= 0) return -1;
      const inZone = f.zone === zone ? 2.5 : visibleZones?.has(f.zone) ? 1 : 0.15;
      const d2 = f.position.distanceToSquared(camPos);
      if (d2 > (f.range + 18) ** 2) return -1;
      return (f.intensity * f.power * inZone) / (d2 + 4);
    };
    const pts = [], sps = [];
    for (const f of this.fixtures) {
      const s = score(f);
      if (s <= 0) continue;
      (f.dir ? sps : pts).push([s, f]);
    }
    pts.sort((a, b) => b[0] - a[0]);
    sps.sort((a, b) => b[0] - a[0]);
    this.assign(this.points, pts.slice(0, N_POINT + 3), dt);
    this.assign(this.spots, sps.slice(0, N_SPOT + 1), dt);
    // lightning + moon
    this.lightning = Math.max(0, this.lightning - dt * 3.2);
    const flash = this.lightning > 0 ? (Math.sin(this.lightning * 40) > 0 ? this.lightning : this.lightning * 0.3) : 0;
    this.moon.intensity = this.moonBase + flash * 6;
    // volumetric light list
    this.volLights.length = 0;
    for (const l of this.points) {
      if (l.intensity <= 0.01) continue;
      const f = l.userData.slot.fixture;
      const k = l.intensity * (f?.volScale ?? 1) * 0.06;
      this.volLights.push({ position: l.position, color: new THREE.Vector3(l.color.r * k, l.color.g * k, l.color.b * k), range: l.distance });
    }
    for (const l of this.spots) {
      if (l.intensity <= 0.01) continue;
      const f = l.userData.slot.fixture;
      const k = l.intensity * (f?.volScale ?? 1) * 0.05;
      this.volLights.push({ position: l.position, color: new THREE.Vector3(l.color.r * k, l.color.g * k, l.color.b * k), range: l.distance * 0.8 });
    }
  }

  assign(pool, cands, dt) {
    const wanted = new Set(cands.slice(0, pool.length).map((c) => c[1]));
    // keep existing bindings that are still wanted
    const free = [];
    for (const l of pool) {
      const f = l.userData.slot.fixture;
      if (f && wanted.has(f)) wanted.delete(f);
      else free.push(l);
    }
    for (const l of free) {
      const next = wanted.values().next().value;
      if (next) { wanted.delete(next); l.userData.slot.fixture = next; l.userData.slot.fade = 0; }
      else { l.userData.slot.fixture = null; }
    }
    for (const l of pool) {
      const s = l.userData.slot;
      s.fade = Math.min(1, s.fade + dt * 6);
      this.apply(l, s.fixture, s.fade);
    }
  }

  flash(strength = 1) { this.lightning = Math.max(this.lightning, strength); }

  // zone-wide power / scripted changes
  setZonePower(zone, power) { for (const f of zone.fixtures) f.power = power; }
  setZoneState(zone, state) { for (const f of zone.fixtures) f.state = state; }
}
