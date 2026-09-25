import * as THREE from 'three';

// Particle effects: flashlight-lit dust motes, rain streaks, and bursts
// (sparks, glass, debris, breath vapour).

const DUST_N = 1400, RAIN_N = 2200, BURST_N = 600;

const DUST_VERT = /* glsl */ `
uniform float uTime, uSize;
uniform vec3 uCam, uSpotPos, uSpotDir;
uniform float uSpotCos, uSpotI, uAmbient;
attribute float aSeed;
varying float vLight;
void main() {
  vec3 p = position;
  // drift + wrap into a box around the camera
  p += vec3(sin(uTime * 0.13 + aSeed * 9.0), sin(uTime * 0.07 + aSeed * 13.0) * 0.6 - uTime * 0.01, cos(uTime * 0.11 + aSeed * 7.0)) * 0.35;
  p = uCam + mod(p - uCam + 6.0, 12.0) - 6.0;
  vec3 L = p - uSpotPos;
  float d = length(L);
  float cone = smoothstep(uSpotCos, uSpotCos + 0.04, dot(L / d, uSpotDir));
  vLight = cone * uSpotI / (1.0 + d * d * 0.6) + uAmbient;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.5 + aSeed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */ `
varying float vLight;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vLight, a * min(1.0, vLight));
}`;

const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
attribute float aSeed;
varying float vA;
void main() {
  vec3 p = position;
  float fall = mod(p.y - uTime * (9.0 + aSeed * 3.0), 14.0);
  vec3 q = vec3(p.x, fall - 5.0, p.z);
  q.xz = uCam.xz + mod(q.xz - uCam.xz + 9.0, 18.0) - 9.0;
  q.y += uCam.y;
  // stretch: second vertex of each segment trails upward
  q.y += mod(float(gl_VertexID), 2.0) * 0.35;
  q.x += mod(float(gl_VertexID), 2.0) * 0.03;
  vA = 0.25 + aSeed * 0.3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
}`;
const RAIN_FRAG = /* glsl */ `
uniform float uAlpha;
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4(uColor, vA * uAlpha); }`;

export class Particles {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'particles';
    game.scene.add(this.root);
    this.dustAmount = 1;
    this.rain = 0;
    // ---- dust
    {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(DUST_N * 3), s = new Float32Array(DUST_N);
      for (let i = 0; i < DUST_N; i++) { p[i * 3] = Math.random() * 12; p[i * 3 + 1] = Math.random() * 12; p[i * 3 + 2] = Math.random() * 12; s[i] = Math.random(); }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      this.dustU = {
        uTime: { value: 0 }, uSize: { value: 22 }, uCam: { value: new THREE.Vector3() }, uSpotPos: { value: new THREE.Vector3() },
        uSpotDir: { value: new THREE.Vector3(0, 0, -1) }, uSpotCos: { value: 0.9 }, uSpotI: { value: 0 }, uAmbient: { value: 0.02 },
      };
      const m = new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: this.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.dust = new THREE.Points(g, m);
      this.dust.frustumCulled = false;
      this.root.add(this.dust);
    }
    // ---- rain
    {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(RAIN_N * 6), s = new Float32Array(RAIN_N * 2);
      for (let i = 0; i < RAIN_N; i++) {
        const x = Math.random() * 18, y = Math.random() * 14, z = Math.random() * 18, sd = Math.random();
        p.set([x, y, z, x, y, z], i * 6);
        s[i * 2] = sd; s[i * 2 + 1] = sd;
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0x8fa3b0) } };
      const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: this.rainU, transparent: true, depthWrite: false });
      this.rainMesh = new THREE.LineSegments(g, m);
      this.rainMesh.frustumCulled = false;
      this.root.add(this.rainMesh);
    }
    // ---- bursts
    {
      const g = new THREE.BufferGeometry();
      this.bp = new Float32Array(BURST_N * 3);
      this.bc = new Float32Array(BURST_N * 3);
      g.setAttribute('position', new THREE.BufferAttribute(this.bp, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.bc, 3));
      const m = new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: softDot(), sizeAttenuation: true });
      this.burstPts = new THREE.Points(g, m);
      this.burstPts.frustumCulled = false;
      this.root.add(this.burstPts);
      this.parts = [];
    }
  }

  burst(pos, kind = 'sparks', n = 40) {
    const col = { sparks: [3, 1.8, 0.6], glass: [0.9, 1, 1], dust: [0.35, 0.33, 0.3], breath: [0.5, 0.55, 0.6], plastic: [1.4, 1, 0.2] }[kind] || [1, 1, 1];
    for (let i = 0; i < n && this.parts.length < BURST_N; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 2);
      if (kind === 'breath') v.set((Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.1, (Math.random() - 0.5) * 0.2);
      if (kind === 'dust') v.multiplyScalar(0.4);
      this.parts.push({ p: pos.clone(), v: v.multiplyScalar(kind === 'sparks' ? 3 : 1.5), life: kind === 'breath' ? 1.4 : 0.6 + Math.random() * 0.8, t: 0, c: col, g: kind === 'breath' ? -0.05 : kind === 'dust' ? 0.8 : 9.8 });
    }
  }

  update(dt) {
    const g = this.game;
    const t = g.time;
    const cam = g.camera.position;
    const sp = g.player.spot;
    const u = this.dustU;
    u.uTime.value = t;
    u.uCam.value.copy(cam);
    u.uSpotPos.value.copy(sp.position);
    u.uSpotDir.value.subVectors(g.player.spotTarget.position, sp.position).normalize();
    u.uSpotCos.value = Math.cos(sp.angle);
    u.uSpotI.value = sp.intensity * 0.05 * this.dustAmount;
    u.uAmbient.value = 0.015 * this.dustAmount + (g.player.camcorder.nv ? 0.06 : 0);
    this.dust.visible = this.dustAmount > 0.01;
    this.rainU.uTime.value = t;
    this.rainU.uCam.value.copy(cam);
    this.rainU.uAlpha.value = this.rain;
    this.rainMesh.visible = this.rain > 0.01;
    // bursts
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.t += dt;
      if (q.t > q.life) { this.parts.splice(i, 1); continue; }
      q.v.y -= q.g * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.01 && q.g > 0) { q.p.y = 0.01; q.v.y *= -0.3; q.v.x *= 0.5; q.v.z *= 0.5; }
      const k = 1 - q.t / q.life;
      this.bp[n * 3] = q.p.x; this.bp[n * 3 + 1] = q.p.y; this.bp[n * 3 + 2] = q.p.z;
      this.bc[n * 3] = q.c[0] * k; this.bc[n * 3 + 1] = q.c[1] * k; this.bc[n * 3 + 2] = q.c[2] * k;
      n++;
    }
    const geo = this.burstPts.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
