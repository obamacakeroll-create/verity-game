import * as THREE from 'three';
import { SHARED } from '../render/MaterialLib.js';

// Night exteriors: a procedural city skyline backdrop, a cloudy sky dome,
// and rain-streaked window glass.

export function cityBackdrop(w = 60, h = 22, seed = 3) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 768;
  const x = c.getContext('2d');
  let s = seed * 9973;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sky = x.createLinearGradient(0, 0, 0, 768);
  sky.addColorStop(0, '#05070b');
  sky.addColorStop(0.55, '#0e1420');
  sky.addColorStop(0.85, '#2a2420');
  sky.addColorStop(1, '#3a2c20');
  x.fillStyle = sky;
  x.fillRect(0, 0, 2048, 768);
  // three layers of buildings, far to near
  for (const [layer, col, minH, maxH, lit] of [[0, '#10141c', 120, 360, 0.08], [1, '#0a0d13', 180, 480, 0.12], [2, '#050608', 240, 560, 0.18]]) {
    let bx = -20;
    while (bx < 2068) {
      const bw = 40 + r() * (90 + layer * 40);
      const bh = minH + r() * (maxH - minH);
      x.fillStyle = col;
      x.fillRect(bx, 768 - bh, bw, bh);
      if (r() < 0.2) x.fillRect(bx + bw * 0.4, 768 - bh - 30, 4, 30); // antenna
      // windows
      for (let wy = 768 - bh + 12; wy < 760; wy += 14) {
        for (let wx = bx + 6; wx < bx + bw - 8; wx += 11) {
          if (r() < lit) {
            const warm = r() < 0.8;
            x.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${110 + r() * 60 | 0},${0.5 + r() * 0.5})` : `rgba(170,210,255,${0.4 + r() * 0.4})`;
            x.fillRect(wx, wy, 6, 8);
          }
        }
      }
      bx += bw + r() * 12;
    }
  }
  // haze / light pollution
  const haze = x.createLinearGradient(0, 400, 0, 768);
  haze.addColorStop(0, 'rgba(60,50,40,0)');
  haze.addColorStop(1, 'rgba(90,70,50,.35)');
  x.fillStyle = haze;
  x.fillRect(0, 0, 2048, 768);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, fog: false, color: 0x8a8a8a });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.userData.noProbe = true;
  return mesh;
}

const GLASS_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GLASS_FRAG = /* glsl */ `
uniform float uTime, uRain, uFlash;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// rolling droplets: each column spawns drops that slide down leaving trails
float drops(vec2 uv, float t, float scale) {
  vec2 p = uv * vec2(scale, scale * 0.35);
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float n = h21(id);
  float speed = 0.2 + n * 0.5;
  float y = fract(-t * speed + n) - 0.5;
  float x = (h21(id + 3.1) - 0.5) * 0.6 + sin(t * 2.0 + n * 20.0) * 0.05;
  vec2 d = (f - vec2(x, y)) * vec2(1.0, 0.35 * 1.0);
  float drop = smoothstep(0.12, 0.04, length(d * vec2(1.0, 2.2)));
  float trail = smoothstep(0.05, 0.0, abs(f.x - x)) * smoothstep(-0.5, y, f.y) * step(y, f.y) * 0.35;
  return drop + trail * n;
}
void main() {
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = pow(1.0 - abs(dot(V, normalize(vN))), 4.0);
  float d = drops(vUv, uTime, 22.0) + drops(vUv + 0.37, uTime * 0.8, 36.0) * 0.6;
  float spec = d * (0.12 + uFlash * 1.5);
  float streak = smoothstep(0.7, 1.0, h21(floor(vUv * vec2(90.0, 3.0)))) * 0.05;
  vec3 col = uTint * (0.02 + fres * 0.2) + vec3(0.7, 0.75, 0.8) * (spec + streak * uRain);
  float a = 0.06 + fres * 0.35 + d * 0.35 * uRain;
  gl_FragColor = vec4(col, a);
}`;

export function windowGlass(w, h) {
  const m = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: SHARED.uTime, uRain: { value: 1 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(0x8fa3b8) } },
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// Sky dome with slow clouds, lit from below by the city.
export function skyDome(r = 120) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: SHARED.uTime, uFlash: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uFlash; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){
        float y = max(vD.y, 0.0);
        vec2 uv = vD.xz / (0.2 + y) * 1.5 + vec2(uTime * 0.01, 0.0);
        float c = fbm(uv);
        vec3 base = mix(vec3(0.05, 0.04, 0.035), vec3(0.006, 0.008, 0.012), smoothstep(0.0, 0.5, y));
        vec3 cloud = mix(vec3(0.02, 0.018, 0.016), vec3(0.09, 0.07, 0.055), 1.0 - smoothstep(0.0, 0.5, y));
        vec3 col = mix(base, cloud, smoothstep(0.35, 0.8, c));
        col += vec3(0.6, 0.65, 0.8) * uFlash * smoothstep(0.4, 0.9, c) * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), m);
  mesh.userData.noProbe = true;
  return mesh;
}
