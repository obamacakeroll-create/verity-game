import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BAKE_LIB } from './bakeGLSL.js';

// GPU texture baker. A material "recipe" is a GLSL `surface(uv, s)` function
// that fills albedo / height / roughness / metalness / AO. The baker renders it
// to float targets, derives a tangent-space normal map from the height field
// (Sobel), and writes three mipmapped, anisotropic, seamlessly tiling maps:
//   map (sRGB albedo) · normalMap · orm (R = AO, G = roughness, B = metalness)

const VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const SURF_STRUCT = /* glsl */ `
struct Surf { vec3 albedo; float height; float rough; float metal; float ao; };
`;

const PASS2 = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oORM;
uniform sampler2D t0, t1;
uniform vec2 uTexel;
uniform float uStrength, uCavity;
float H(vec2 o) { return texture(t0, fract(vUv + o * uTexel)).a; }
void main() {
  vec4 a = texture(t0, vUv);
  vec4 m = texture(t1, vUv);
  float tl = H(vec2(-1, 1)), t = H(vec2(0, 1)), tr = H(vec2(1, 1));
  float l = H(vec2(-1, 0)), c = a.a, r = H(vec2(1, 0));
  float bl = H(vec2(-1, -1)), b = H(vec2(0, -1)), br = H(vec2(1, -1));
  float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  vec3 n = normalize(vec3(-dx * uStrength, -dy * uStrength, 1.0));
  // cavity: darken AO in local height minima (crevices)
  float avg = (tl + t + tr + l + r + bl + b + br) / 8.0;
  float cav = clamp(1.0 - (avg - c) * uCavity, 0.0, 1.0);
  oAlbedo = vec4(clamp(a.rgb, 0.0, 1.0), 1.0);
  oNormal = vec4(n * 0.5 + 0.5, 1.0);
  oORM = vec4(clamp(m.r * cav, 0.0, 1.0), clamp(m.g, 0.02, 1.0), clamp(m.b, 0.0, 1.0), 1.0);
}
`;

export class TextureBaker {
  constructor(renderer, { scale = 1 } = {}) {
    this.renderer = renderer;
    this.scale = scale; // quality multiplier on recipe sizes
    this.quad = new FullScreenQuad();
    this.aniso = renderer.capabilities.getMaxAnisotropy();
    this.cache = new Map();
    this.pass2 = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: PASS2,
      uniforms: { t0: { value: null }, t1: { value: null }, uTexel: { value: new THREE.Vector2() }, uStrength: { value: 1 }, uCavity: { value: 4 } },
      depthTest: false, depthWrite: false,
    });
  }

  // recipe: { name, glsl, size = 1024, normal = 2, cavity = 4, seed = 0, uniforms = {} }
  bake(recipe) {
    if (this.cache.has(recipe.name)) return this.cache.get(recipe.name);
    const r = this.renderer;
    const size = Math.max(64, Math.min(4096, Math.round((recipe.size || 1024) * this.scale)));
    const inter = new THREE.WebGLRenderTarget(size, size, {
      count: 2, type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    const uniforms = { uSeed: { value: recipe.seed || 0 }, uTexel: { value: new THREE.Vector2(1 / size, 1 / size) } };
    for (const [k, v] of Object.entries(recipe.uniforms || {})) uniforms[k] = { value: v };
    const decl = Object.entries(recipe.uniforms || {}).map(([k, v]) => `uniform ${glslType(v)} ${k};`).join('\n');
    const frag = `precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform vec2 uTexel;
${decl}
${BAKE_LIB}
${SURF_STRUCT}
${recipe.glsl}
void main() {
  Surf s = Surf(vec3(0.5), 0.5, 0.6, 0.0, 1.0);
  surface(vUv, s);
  o0 = vec4(s.albedo, s.height);
  o1 = vec4(s.ao, s.rough, s.metal, 1.0);
}`;
    const m1 = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.quad.material = m1;
    r.setRenderTarget(inter);
    this.quad.render(r);

    const out = new THREE.WebGLRenderTarget(size, size, {
      count: 3, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: this.aniso,
    });
    out.textures[0].colorSpace = THREE.SRGBColorSpace;
    const u = this.pass2.uniforms;
    u.t0.value = inter.textures[0];
    u.t1.value = inter.textures[1];
    u.uTexel.value.set(1 / size, 1 / size);
    // keep bump strength resolution-independent
    u.uStrength.value = (recipe.normal ?? 2) * (size / 1024);
    u.uCavity.value = recipe.cavity ?? 4;
    this.quad.material = this.pass2;
    r.setRenderTarget(out);
    this.quad.render(r);
    r.setRenderTarget(null);
    inter.dispose();
    m1.dispose();
    const set = { map: out.textures[0], normalMap: out.textures[1], orm: out.textures[2], size, rt: out, name: recipe.name };
    for (const t of [set.map, set.normalMap, set.orm]) t.name = recipe.name;
    this.cache.set(recipe.name, set);
    return set;
  }

  dispose() {
    for (const s of this.cache.values()) s.rt.dispose();
    this.cache.clear();
  }
}

function glslType(v) {
  if (typeof v === 'number') return 'float';
  if (v.isColor || v.isVector3) return 'vec3';
  if (v.isVector2) return 'vec2';
  if (v.isVector4) return 'vec4';
  return 'float';
}
