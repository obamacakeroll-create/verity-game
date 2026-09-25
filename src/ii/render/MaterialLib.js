import * as THREE from 'three';
import { RECIPES } from './recipes.js';

// Builds PBR materials from baked texture sets and patches three's standard
// shader with world-space layers:
//   · grime: blotches, streaks and floor-line dirt from a shared data texture
//   · wetness: glossy puddles with animated rain ripples on floors
//   · frost: cold-storage rime, strongest near floor and ceiling
//   · baked vertex AO (attribute `aAO`) applied to indirect light
//   · box-projected (parallax-corrected) reflection probes per zone
//   · "breathing" wall displacement driven by insanity

export const SHARED = {
  uTime: { value: 0 },
  uRain: { value: 0 },
  uWet: { value: 0 },
  uFrost: { value: 0 },
  uBreath: { value: 0 },
  uGrimeTex: { value: null },
  uFrostTex: { value: null },
  uGlobalGrime: { value: 1 },
};

const VERT_PARS = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNorm;
#ifdef USE_VAO
attribute float aAO;
varying float vAO;
#endif
uniform float uTime, uBreath;
`;

const VERT_MAIN = /* glsl */ `
#ifdef USE_VAO
vAO = aAO;
#endif
{
  vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_BREATH
  float br = sin(uTime * 0.9 + wp0.y * 1.7 + wp0.x * 0.6 + wp0.z * 0.5) * 0.5 + 0.5;
  transformed += objectNormal * br * uBreath * 0.035 * smoothstep(0.1, 1.0, wp0.y);
  #endif
}
`;

const VERT_WORLD = /* glsl */ `
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNorm = normalize(mat3(modelMatrix) * objectNormal);
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNorm;
#ifdef USE_VAO
varying float vAO;
#endif
uniform float uTime, uRain, uWet, uFrost, uGrime, uGrimeHeight, uFloorY, uGlobalGrime, uWetMul;
uniform vec3 uGrimeColor;
uniform sampler2D uGrimeTex, uFrostTex;
#ifdef USE_BOXPROJ
uniform vec3 uProbePos, uProbeMin, uProbeMax;
vec3 boxProject(vec3 wp, vec3 dir) {
  vec3 rbmax = (uProbeMax - wp) / dir;
  vec3 rbmin = (uProbeMin - wp) / dir;
  vec3 rb = max(rbmax, rbmin);
  float fa = min(min(rb.x, rb.y), rb.z);
  if (fa <= 0.0 || fa > 200.0) return dir;
  vec3 hit = wp + dir * fa;
  return normalize(hit - uProbePos);
}
#endif
vec2 planarUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.y > 0.6 ? p.xz : (a.x > a.z ? p.zy : p.xy);
}
// cheap analytic rain ripples (world xz) — returns xz normal offset
vec2 ripples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (2.4 + float(k) * 1.3) + float(k) * 7.1;
    vec2 i = floor(q), f = fract(q) - 0.5;
    vec2 h = fract(sin(vec2(dot(i, vec2(127.1, 311.7)), dot(i, vec2(269.5, 183.3)))) * 43758.5453);
    float ph = fract(t * (0.6 + h.x * 0.5) + h.y);
    vec2 o = f - (h - 0.5) * 0.6;
    float d = length(o);
    float ring = sin((d - ph * 0.5) * 60.0) * smoothstep(0.5 * ph + 0.05, 0.5 * ph, d) * (1.0 - ph);
    acc += o / max(d, 1e-3) * ring;
  }
  return acc;
}
float gGrime; float gWet; float gFrost; vec4 gData;
`;

const FRAG_ALBEDO = /* glsl */ `
{
  vec3 n = normalize(vWNorm);
  gData = texture2D(uGrimeTex, planarUV(vWPos, n) / 6.0);
  float isWall = 1.0 - smoothstep(0.5, 0.8, abs(n.y));
  float isFloor = smoothstep(0.6, 0.9, n.y);
  float hgt = vWPos.y - uFloorY;
  float low = 1.0 - smoothstep(0.0, uGrimeHeight * (0.5 + gData.r), hgt);
  gGrime = uGrime * uGlobalGrime * clamp(smoothstep(0.45, 0.9, gData.r) * 0.55 + low * 0.55 * isWall + gData.b * 0.45 * isWall + isFloor * smoothstep(0.5, 0.8, gData.r) * 0.3, 0.0, 1.0);
  diffuseColor.rgb *= mix(vec3(1.0), uGrimeColor, gGrime);
  gWet = uWet * uWetMul * isFloor * smoothstep(0.35, 0.75, gData.g + uRain * 0.15);
  diffuseColor.rgb *= 1.0 - gWet * 0.45;
  gFrost = 0.0;
  #ifdef USE_FROST
  vec4 fr = texture2D(uFrostTex, planarUV(vWPos, n) / 1.2);
  float band = max(1.0 - smoothstep(0.0, 1.2, hgt), smoothstep(2.2, 3.4, hgt));
  gFrost = uFrost * smoothstep(0.35, 0.7, fr.r * 0.5 + band * 0.55 + (fr.g - 0.5) * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.88, 0.93), gFrost * 0.85);
  #endif
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 1.0, gGrime * 0.35);
roughnessFactor = mix(roughnessFactor, 0.035, gWet);
roughnessFactor = mix(roughnessFactor, 0.35, gFrost);
`;

const FRAG_NORMAL = /* glsl */ `
if (gWet > 0.01) {
  normal = normalize(mix(normal, nonPerturbedNormal, gWet * 0.9));
  vec2 rp = ripples(vWPos.xz, uTime) * uRain * gWet;
  normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * 0.35);
}
`;

const FRAG_AO = /* glsl */ `
#ifdef USE_VAO
{
  float vao = clamp(vAO, 0.0, 1.0);
  reflectedLight.indirectDiffuse *= vao;
  reflectedLight.indirectSpecular *= mix(1.0, vao, 0.85);
  reflectedLight.directDiffuse *= mix(1.0, vao, 0.3);
}
#endif
`;

export class MaterialLib {
  constructor(baker) {
    this.baker = baker;
    this.cache = new Map();
    this.sets = new Map();
    SHARED.uGrimeTex.value = this.set('grime').orm;
    SHARED.uFrostTex.value = null;
  }

  set(name) {
    if (!this.sets.has(name)) {
      const r = RECIPES[name];
      if (!r) throw new Error(`unknown recipe ${name}`);
      this.sets.set(name, this.baker.bake(r));
    }
    return this.sets.get(name);
  }

  enableFrost() {
    if (!SHARED.uFrostTex.value) {
      const f = this.set('frost');
      // frost set: we want albedo+coverage; coverage lives in the ORM R (ao) channel
      SHARED.uFrostTex.value = f.orm;
    }
  }

  // opts: color, rough (multiplier), metal, normalScale, grime, grimeHeight, grimeColor, wet, frost,
  //       zone (with probe), emissive, emissiveIntensity, side, physical {clearcoat,...}, breath, transparent, opacity
  get(name, opts = {}) {
    const key = name + '|' + JSON.stringify(opts, (k, v) => (k === 'zone' ? v?.id : v?.isColor ? v.getHexString() : v));
    if (this.cache.has(key)) return this.cache.get(key);
    const s = this.set(name);
    const P = opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new P({
      map: s.map, normalMap: s.normalMap, roughnessMap: s.orm, metalnessMap: s.orm, aoMap: s.orm,
      color: new THREE.Color(opts.color ?? 0xffffff), roughness: opts.rough ?? 1, metalness: opts.metal ?? 1,
      normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1), aoMapIntensity: opts.aoIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      ...(opts.physical || {}),
    });
    if (opts.emissive != null) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    if (opts.emissiveMap) m.emissiveMap = opts.emissiveMap;
    m.name = name;
    patch(m, opts);
    this.cache.set(key, m);
    return m;
  }

  // A plain (untextured) material that still receives the world layers.
  plain(opts = {}) {
    const key = 'plain|' + JSON.stringify(opts, (k, v) => (k === 'zone' ? v?.id : v?.isColor ? v.getHexString() : v));
    if (this.cache.has(key)) return this.cache.get(key);
    const P = opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new P({
      color: new THREE.Color(opts.color ?? 0xffffff), roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0,
      side: opts.side ?? THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      ...(opts.physical || {}),
    });
    if (opts.emissive != null) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    patch(m, opts);
    this.cache.set(key, m);
    return m;
  }
}

export function patch(m, opts = {}) {
  const zone = opts.zone;
  const own = {
    uGrime: { value: opts.grime ?? 0.6 },
    uGrimeHeight: { value: opts.grimeHeight ?? 0.5 },
    uGrimeColor: { value: new THREE.Color(opts.grimeColor ?? 0x5a4a38) },
    uFloorY: { value: opts.floorY ?? zone?.floorY ?? 0 },
    uWetMul: { value: opts.wet ?? 1 },
  };
  if (zone?.probe) {
    own.uProbePos = { value: zone.probe.position };
    own.uProbeMin = { value: zone.probe.min };
    own.uProbeMax = { value: zone.probe.max };
    m.envMap = zone.probe.texture;
    m.envMapIntensity = opts.envIntensity ?? zone.envIntensity ?? 1;
  }
  m.userData.uniforms = own;
  m.userData.zone = zone;
  const defines = [];
  if (opts.vao) defines.push('USE_VAO');
  if (zone?.probe && opts.boxProject !== false) defines.push('USE_BOXPROJ');
  if (opts.frost) defines.push('USE_FROST');
  if (opts.breath) defines.push('USE_BREATH');
  m.userData.defines = defines;
  m.customProgramCacheKey = () => 'v2|' + defines.join(',');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SHARED, m.userData.uniforms);
    for (const d of m.userData.defines) sh.defines[d] = '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_WORLD);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_ALBEDO)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FRAG_AO);
    if (m.userData.defines.includes('USE_BOXPROJ')) {
      sh.fragmentShader = sh.fragmentShader.replace(
        'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
        'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );\n#ifdef USE_BOXPROJ\nreflectVec = boxProject(vWPos, reflectVec);\n#endif',
      );
    }
  };
  m.needsUpdate = true;
  return m;
}

// Assign per-vertex world-scale UVs (planar by dominant normal) so modular
// geometry has constant texel density and continuous seams.
export function worldUV(geometry, matrix, size = 1, rot = 0) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let a, b;
    if (ay > 0.6) { a = v.x; b = -v.z * Math.sign(n.y || 1); }
    else if (ax > az) { a = -v.z * Math.sign(n.x); b = v.y; }
    else { a = v.x * Math.sign(n.z); b = v.y; }
    uv[i * 2] = (a * c - b * s) / size;
    uv[i * 2 + 1] = (a * s + b * c) / size;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
