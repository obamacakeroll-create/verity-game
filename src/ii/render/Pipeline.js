import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FS_VERT, COMMON, NOISE3, AGX } from './glsl.js';

// VERITY II frame pipeline (all passes hand-written, GLSL3):
//   scene → HDR + depth
//   → SAO (half res, bilateral blur)
//   → volumetric scattering (half res raymarch, flashlight shadow, temporal accumulation)
//   → combine (AO, fog/scatter, motion blur, depth of field)
//   → physically based bloom mip chain + lens dirt, auto exposure
//   → AgX tone map + procedural 3D LUT grade → SMAA → film (grain, CA, lens, VHS / night vision)

const MAX_LIGHTS = 8;

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opts,
  });
}

function mat(fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, ...extra,
  });
}

// ------------------------------------------------------------------ shaders
const AO_FRAG = /* glsl */ `
precision highp float;
${COMMON}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tDepth;
uniform mat4 uInvProj, uProj;
uniform vec2 uRes;
uniform float uRadius, uIntensity, uFrame;
vec3 vp(vec2 uv) { return viewPosFromDepth(uv, texture(tDepth, uv).x, uInvProj); }
void main() {
  float d = texture(tDepth, vUv).x;
  if (d >= 1.0) { fc = vec4(1.0); return; }
  vec3 P = vp(vUv);
  vec2 px = 1.0 / uRes;
  vec3 pr = vp(vUv + vec2(px.x, 0.0)) - P, pl = P - vp(vUv - vec2(px.x, 0.0));
  vec3 pu = vp(vUv + vec2(0.0, px.y)) - P, pd = P - vp(vUv - vec2(0.0, px.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl;
  vec3 dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 N = normalize(cross(dx, dy));
  float projR = uRadius * uProj[1][1] * 0.5 * uRes.y / -P.z;
  projR = min(projR, 90.0);
  float rot = ign(gl_FragCoord.xy, uFrame) * 6.2831;
  const int S = 16;
  float ao = 0.0;
  float R2 = uRadius * uRadius;
  for (int i = 0; i < S; i++) {
    float a = (float(i) + 0.5) / float(S);
    float ang = a * 2.3999632 * float(S) + rot;
    float r = sqrt(a) * projR + 1.0;
    vec2 suv = vUv + vec2(cos(ang), sin(ang)) * r * px;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    vec3 v = vp(suv) - P;
    float vv = dot(v, v);
    float cosT = dot(v, N) * inversesqrt(vv + 1e-6);
    float fall = clamp(1.0 - vv / R2, 0.0, 1.0);
    ao += max(cosT - 0.2, 0.0) * fall;
  }
  ao = clamp(1.0 - ao / float(S) * uIntensity * 2.2, 0.0, 1.0);
  ao = ao * ao;
  fc = vec4(ao, -P.z, 0.0, 1.0);
}`;

const AO_BLUR = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fc;
uniform sampler2D tAO;
uniform vec2 uDir;
void main() {
  vec4 c = texture(tAO, vUv);
  float z = c.y;
  float sum = c.x, w = 1.0;
  for (int i = -4; i <= 4; i++) {
    if (i == 0) continue;
    vec4 s = texture(tAO, vUv + uDir * float(i));
    float wt = exp(-float(i * i) / 12.0) * max(0.0, 1.0 - abs(s.y - z) / (0.08 * z + 0.05));
    sum += s.x * wt; w += wt;
  }
  fc = vec4(sum / w, z, 0.0, 1.0);
}`;

const VOL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DShadow;
${COMMON}
${NOISE3}
in vec2 vUv;
out vec4 fc;
#define MAXL ${MAX_LIGHTS}
uniform sampler2D tDepth;
uniform sampler2D tHistory;
uniform mat4 uInvProj, uCamWorld, uPrevViewProj;
uniform vec3 uCamPos;
uniform float uFrame, uTime, uSteps, uMaxDist, uHistoryValid;
uniform float uDensity, uHeightFalloff, uBaseY, uNoiseAmt, uNoiseScale;
uniform vec3 uWind, uAmbient;
uniform vec3 uSpotPos, uSpotDir, uSpotCol;
uniform vec2 uSpotCos;
uniform float uSpotRange, uSpotShadowOn;
uniform sampler2DShadow tSpotShadow;
uniform mat4 uSpotShadowMat;
uniform int uCount;
uniform vec4 uLPos[MAXL];
uniform vec3 uLCol[MAXL];
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float attn(float d, float range) { float r = d / range; float w = clamp(1.0 - r * r * r * r, 0.0, 1.0); return w * w / (d * d + 0.25); }
void main() {
  float d = texture(tDepth, vUv).x;
  vec3 vpos = viewPosFromDepth(vUv, d, uInvProj);
  vec3 wpos = (uCamWorld * vec4(vpos, 1.0)).xyz;
  vec3 rd = wpos - uCamPos;
  float sceneDist = length(rd);
  rd /= sceneDist;
  float dist = min(sceneDist, uMaxDist);
  float stepLen = dist / uSteps;
  float jitter = ign(gl_FragCoord.xy, uFrame);
  float T = 1.0;
  vec3 L = vec3(0.0);
  float phaseSpotBase = 0.0;
  for (float i = 0.0; i < 64.0; i++) {
    if (i >= uSteps) break;
    float t = (i + jitter) * stepLen;
    vec3 p = uCamPos + rd * t;
    float h = exp(-max(p.y - uBaseY, 0.0) * uHeightFalloff);
    float n = vnoise3(p * uNoiseScale + uWind * uTime) * 0.65 + vnoise3(p * uNoiseScale * 2.7 - uWind * uTime * 1.3) * 0.35;
    float dens = uDensity * h * mix(1.0, n * 1.8, uNoiseAmt);
    if (dens < 1e-5) continue;
    vec3 inS = uAmbient;
    // flashlight / hero spot
    vec3 toS = uSpotPos - p;
    float ds = length(toS);
    vec3 ls = toS / ds;
    float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-ls, uSpotDir));
    if (cone > 0.0 && ds < uSpotRange) {
      float sh = 1.0;
      if (uSpotShadowOn > 0.5) {
        vec4 sc = uSpotShadowMat * vec4(p, 1.0);
        sc.xyz /= sc.w;
        if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) sh = texture(tSpotShadow, vec3(sc.xy, sc.z - 0.0008));
      }
      inS += uSpotCol * cone * sh * attn(ds, uSpotRange) * hg(dot(rd, -ls), 0.55);
    }
    for (int k = 0; k < MAXL; k++) {
      if (k >= uCount) break;
      vec3 tl = uLPos[k].xyz - p;
      float dl = length(tl);
      if (dl > uLPos[k].w) continue;
      inS += uLCol[k] * attn(dl, uLPos[k].w) * hg(dot(rd, -tl / dl), 0.25);
    }
    float ext = dens * stepLen;
    L += T * inS * ext;
    T *= exp(-ext);
    if (T < 0.02) break;
  }
  vec4 cur = vec4(L, T);
  // temporal reprojection against the surface point
  vec4 prev = uPrevViewProj * vec4(wpos, 1.0);
  vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
  if (uHistoryValid > 0.5 && puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
    vec4 hist = texture(tHistory, puv);
    float w = 0.88 * (1.0 - clamp(abs(hist.a - cur.a) * 3.0, 0.0, 0.7));
    cur = mix(cur, hist, w);
  }
  fc = cur;
}`;

const COMBINE_FRAG = /* glsl */ `
precision highp float;
${COMMON}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tColor, tDepth, tAO, tVol;
uniform float uAO, uVol, uMotion, uDofAmount, uDofFocus, uDofRange, uNear, uFar;
uniform mat4 uInvProj, uCamWorld, uPrevViewProj;
uniform vec2 uRes;
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 sampleColor(vec2 uv) { return texture(tColor, uv).rgb; }
void main() {
  float d = texture(tDepth, vUv).x;
  float vz = -viewZFromDepth(d, uNear, uFar);
  vec3 col = sampleColor(vUv);
  // motion blur (camera only, from depth reprojection)
  if (uMotion > 0.0 && d < 1.0) {
    vec3 vpos = viewPosFromDepth(vUv, d, uInvProj);
    vec3 wpos = (uCamWorld * vec4(vpos, 1.0)).xyz;
    vec4 prev = uPrevViewProj * vec4(wpos, 1.0);
    vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
    vec2 vel = (vUv - puv) * uMotion;
    float vl = length(vel);
    vel *= min(1.0, 0.04 / max(vl, 1e-5));
    if (length(vel * uRes) > 1.5) {
      vec3 acc = col;
      for (int i = 1; i < 7; i++) acc += sampleColor(vUv - vel * (float(i) / 6.0 - 0.5));
      col = acc / 7.0;
    }
  }
  // depth of field (golden-angle gather)
  if (uDofAmount > 0.0) {
    float coc = clamp(abs(vz - uDofFocus) / uDofRange, 0.0, 1.0) * uDofAmount;
    if (coc > 0.02) {
      vec3 acc = vec3(0.0); float wsum = 0.0;
      float rad = coc * 14.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i) + 0.5;
        float r = sqrt(fi / 24.0) * rad;
        float a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r / uRes;
        float sd = texture(tDepth, vUv + o).x;
        float sz = -viewZFromDepth(sd, uNear, uFar);
        float scoc = clamp(abs(sz - uDofFocus) / uDofRange, 0.0, 1.0) * uDofAmount;
        float w = sz < vz ? max(scoc, 0.05) : 1.0; // background can't bleed onto sharp foreground
        acc += sampleColor(vUv + o) * w; wsum += w;
      }
      col = mix(col, acc / wsum, smoothstep(0.02, 0.2, coc));
    }
  }
  float ao = texture(tAO, vUv).x;
  col *= mix(1.0, ao, uAO);
  // analytic fog for distance (cheap, matches the volumetric look on low)
  if (d < 1.0) col = mix(col, uFogColor, 1.0 - exp(-uFogDensity * vz));
  vec4 v = texture(tVol, vUv);
  col = mix(col, col * v.a + v.rgb, uVol);
  fc = vec4(max(col, 0.0), 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
precision highp float;
${COMMON}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
vec3 s(vec2 o) { return texture(tSrc, vUv + o * uTexel).rgb; }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 o;
  if (uKaris > 0.5) {
    o = karis(j, k, l, m) * 0.5 + karis(a, b, d, e) * 0.125 + karis(b, c, e, f) * 0.125 + karis(d, e, g, h) * 0.125 + karis(e, f, h, i) * 0.125;
  } else {
    o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  fc = vec4(min(o, vec3(6e4)), 1.0);
}`;

const UP_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fc;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius, uWeight;
void main() {
  vec2 r = uTexel * uRadius;
  vec3 o = texture(tSrc, vUv).rgb * 4.0;
  o += (texture(tSrc, vUv + vec2(-r.x, 0)).rgb + texture(tSrc, vUv + vec2(r.x, 0)).rgb + texture(tSrc, vUv + vec2(0, r.y)).rgb + texture(tSrc, vUv + vec2(0, -r.y)).rgb) * 2.0;
  o += texture(tSrc, vUv + vec2(-r.x, r.y)).rgb + texture(tSrc, vUv + vec2(r.x, r.y)).rgb + texture(tSrc, vUv + vec2(-r.x, -r.y)).rgb + texture(tSrc, vUv + vec2(r.x, -r.y)).rgb;
  fc = vec4(o / 16.0 * uWeight, 1.0);
}`;

const EXPOSURE_FRAG = /* glsl */ `
precision highp float;
${COMMON}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tSrc, tPrev;
uniform float uDt, uKey, uMin, uMax, uSpeedUp, uSpeedDown, uReset;
void main() {
  float acc = 0.0, wsum = 0.0;
  for (int y = 0; y < 6; y++) for (int x = 0; x < 6; x++) {
    vec2 uv = (vec2(x, y) + 0.5) / 6.0;
    float w = 1.0 - length(uv - 0.5) * 0.9; // centre weighted
    acc += log(max(luma(texture(tSrc, uv).rgb), 1e-4)) * w; wsum += w;
  }
  float avg = exp(acc / wsum);
  float target = clamp(uKey / max(avg, 1e-4), uMin, uMax);
  float prev = texture(tPrev, vec2(0.5)).r;
  if (uReset > 0.5 || prev <= 0.0) prev = target;
  float rate = target > prev ? uSpeedUp : uSpeedDown;
  float e = prev + (target - prev) * (1.0 - exp(-uDt * rate));
  fc = vec4(e, avg, 0.0, 1.0);
}`;

const TONE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
${COMMON}
${AGX}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tColor, tBloom, tBloomWide, tDirt, tExposure;
uniform sampler3D tLutA, tLutB;
uniform float uLutMix, uLutSize, uBloom, uDirt, uExposure, uAutoExposure, uNV, uNVGain, uBrightness, uTime;
vec3 lut(sampler3D t, vec3 c) {
  vec3 uvw = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
  return texture(t, uvw).rgb;
}
void main() {
  vec3 hdr = texture(tColor, vUv).rgb;
  vec3 bloom = texture(tBloom, vUv).rgb / 7.0;
  vec3 wide = texture(tBloomWide, vUv).rgb;
  vec3 col = mix(hdr, bloom, uBloom);
  col += wide * texture(tDirt, vUv).rgb * uDirt;
  float e = uExposure * mix(1.0, texture(tExposure, vec2(0.5)).r, uAutoExposure) * uBrightness;
  col *= e;
  // night vision: image intensifier (amplify, phosphor green)
  if (uNV > 0.0) {
    float l = luma(col) * uNVGain + 0.004;
    vec3 nv = vec3(0.30, 1.0, 0.42) * l;
    col = mix(col, nv, uNV);
  }
  col = agx(col);
  col = clamp(col, 0.0, 1.0);
  // grade in sRGB-ish space for LUT precision
  vec3 g = linearToSRGB(col);
  g = mix(lut(tLutA, g), lut(tLutB, g), uLutMix);
  fc = vec4(g, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
${COMMON}
in vec2 vUv;
out vec4 fc;
uniform sampler2D tColor;
uniform vec2 uRes;
uniform float uTime, uGrain, uVignette, uChromatic, uLens, uInsanity, uWarp, uPulse, uRed, uFlash, uScanline, uBlackout, uVHS, uNV, uDamage, uFade;
vec3 tap(vec2 uv) { return texture(tColor, uv).rgb; }
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  // lens distortion (subtle barrel) + insanity breathing
  uv = 0.5 + c * (1.0 + uLens * r2 + uWarp * sin(uTime * 1.3) * 0.03 + uPulse * 0.02 * r2);
  uv.x += sin(uv.y * 30.0 + uTime * 4.0) * 0.0022 * uWarp;
  uv.y += cos(uv.x * 24.0 + uTime * 3.1) * 0.0016 * uWarp;
  // tear glitch
  float row = floor(uv.y * 48.0);
  float tear = step(0.986 - uScanline * 0.09, hash12(vec2(row, floor(uTime * 14.0))));
  uv.x += tear * (hash12(vec2(uTime, row)) - 0.5) * 0.07 * uScanline;
  // VHS: wobble + chroma offset
  if (uVHS > 0.0) {
    uv.x += (hash12(vec2(floor(uv.y * 240.0), floor(uTime * 30.0))) - 0.5) * 0.0015 * uVHS;
    uv.x += sin(uv.y * 3.0 + uTime * 2.0) * 0.0008 * uVHS;
  }
  float ca = uChromatic * (0.4 + r2 * 4.0) + uWarp * 0.003 + uVHS * 0.0025;
  vec2 dir = normalize(c + 1e-5) * ca;
  vec3 col;
  col.r = tap(uv + dir).r;
  col.g = tap(uv).g;
  col.b = tap(uv - dir).b;
  // insanity desaturation + sickly red
  float l = luma(col);
  col = mix(col, vec3(l), uInsanity * 0.4);
  col = mix(col, col * vec3(1.18, 0.7, 0.62), uRed);
  col = mix(col, vec3(l * 1.3, l * 0.2, l * 0.15), uDamage * 0.6);
  // vignette (optical + artistic)
  float vig = smoothstep(0.9, 0.2, sqrt(r2) * uVignette * (1.0 + uPulse * 0.3));
  col *= mix(0.18, 1.0, vig);
  // film grain (luma-weighted, per-channel for VHS/NV)
  float gs = uGrain * (1.0 + uNV * 2.5 + uVHS);
  vec3 g = vec3(hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0),
                hash12(gl_FragCoord.xy * 1.37 + fract(uTime * 5.71) * 173.0),
                hash12(gl_FragCoord.xy * 0.71 + fract(uTime * 3.37) * 97.0)) - 0.5;
  g = mix(vec3(g.x), g, 0.35 + uVHS * 0.5);
  col += g * gs * (0.35 + sqrt(max(l, 0.0)) * 0.9);
  // scanlines
  col *= 1.0 - (uScanline * 0.12 + uVHS * 0.08 + uNV * 0.06) * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.6 + uTime * 30.0));
  if (uVHS > 0.0) {
    float band = smoothstep(0.0, 0.02, abs(fract(vUv.y * 0.6 - uTime * 0.07) - 0.5));
    col *= mix(1.0, 0.9 + band * 0.1, uVHS);
  }
  col = mix(col, vec3(1.0), uFlash);
  col *= (1.0 - uBlackout) * (1.0 - uFade);
  // dither to kill banding in the dark
  col += (hash12(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  fc = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ pipeline
export class Pipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.frame = 0;
    this.time = 0;
    this.scale = 1;
    this.q = { ao: true, volumetric: true, volSteps: 28, volScale: 0.5, bloom: true, smaa: true, motionBlur: true, dof: true };
    this.quad = new FullScreenQuad();
    this.prevViewProj = new THREE.Matrix4();
    this.viewProj = new THREE.Matrix4();
    this.historyValid = false;
    this.exposureReset = true;
    this.hero = null; // SpotLight used for volumetric shadows (the flashlight)
    this.volLights = []; // [{position, color(Vector3 already * intensity), range}]
    // a real (1×1) depth texture so the shadow sampler is never bound to a colour texture
    const dt = new THREE.DepthTexture(1, 1);
    dt.compareFunction = THREE.LessEqualCompare;
    this._dummyShadow = new THREE.WebGLRenderTarget(1, 1, { depthTexture: dt, depthBuffer: true });
    renderer.setRenderTarget(this._dummyShadow);
    renderer.clear();
    renderer.setRenderTarget(null);

    // ---- artistic controls (Game / story drive these)
    this.p = {
      exposure: 1, autoExposure: 0.85, brightness: 1, bloom: 0.045, dirt: 0.35, ao: 0.75, aoRadius: 0.55, aoIntensity: 1.1,
      volume: 1, density: 0.035, heightFalloff: 0.18, baseY: 0, noiseAmt: 0.75, noiseScale: 0.35, wind: new THREE.Vector3(0.05, 0.01, 0.03),
      ambientScatter: new THREE.Vector3(0.0006, 0.0007, 0.0008), fogColor: new THREE.Color(0x000000), fogDensity: 0.0,
      dofAmount: 0, dofFocus: 2, dofRange: 3, motion: 0.5,
      grain: 0.055, vignette: 1.15, chromatic: 0.0012, lens: 0.06, insanity: 0, warp: 0, pulse: 0, red: 0, flash: 0, scanline: 0,
      blackout: 0, vhs: 0, nv: 0, nvGain: 18, damage: 0, fade: 0, lutMix: 0,
      key: 0.085, expMin: 0.55, expMax: 2.0,
    };

    this.dirtTex = makeDirtTexture();
    this.lutA = null;
    this.lutB = null;
    this.buildMaterials();
    this.smaa = new SMAAPass();
    this.setSize(renderer.domElement.width || 1280, renderer.domElement.height || 720);
  }

  setLUTs(a, b, mix = 0) {
    this.lutA = a;
    this.lutB = b || a;
    this.p.lutMix = mix;
    this.mTone.uniforms.tLutA.value = this.lutA;
    this.mTone.uniforms.tLutB.value = this.lutB;
    this.mTone.uniforms.uLutSize.value = a.image.width;
  }

  buildMaterials() {
    this.mAO = mat(AO_FRAG, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.5 }, uIntensity: { value: 1 }, uFrame: { value: 0 } });
    this.mAOBlur = mat(AO_BLUR, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
    const lpos = [], lcol = [];
    for (let i = 0; i < MAX_LIGHTS; i++) { lpos.push(new THREE.Vector4()); lcol.push(new THREE.Vector3()); }
    this.mVol = mat(VOL_FRAG, {
      tDepth: { value: null }, tHistory: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uFrame: { value: 0 }, uTime: { value: 0 },
      uSteps: { value: 28 }, uMaxDist: { value: 30 }, uHistoryValid: { value: 0 }, uDensity: { value: 0.03 }, uHeightFalloff: { value: 0.2 },
      uBaseY: { value: 0 }, uNoiseAmt: { value: 0.7 }, uNoiseScale: { value: 0.35 }, uWind: { value: new THREE.Vector3() }, uAmbient: { value: new THREE.Vector3() },
      uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(0, 0, -1) }, uSpotCol: { value: new THREE.Vector3() },
      uSpotCos: { value: new THREE.Vector2(0.9, 0.95) }, uSpotRange: { value: 16 }, uSpotShadowOn: { value: 0 }, tSpotShadow: { value: this._dummyShadow.depthTexture },
      uSpotShadowMat: { value: new THREE.Matrix4() }, uCount: { value: 0 }, uLPos: { value: lpos }, uLCol: { value: lcol },
    });
    this.mCombine = mat(COMBINE_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, tAO: { value: null }, tVol: { value: null }, uAO: { value: 0 }, uVol: { value: 0 },
      uMotion: { value: 0 }, uDofAmount: { value: 0 }, uDofFocus: { value: 2 }, uDofRange: { value: 3 }, uNear: { value: 0.05 }, uFar: { value: 100 },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2() }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 },
    });
    this.mDown = mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } });
    this.mUp = mat(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.mCopyUp = mat(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } });
    this.mExposure = mat(EXPOSURE_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uDt: { value: 0.016 }, uKey: { value: 0.16 }, uMin: { value: 0.5 }, uMax: { value: 3 }, uSpeedUp: { value: 1.2 }, uSpeedDown: { value: 2.5 }, uReset: { value: 1 } });
    this.mTone = mat(TONE_FRAG, {
      tColor: { value: null }, tBloom: { value: null }, tBloomWide: { value: null }, tDirt: { value: this.dirtTex }, tExposure: { value: null },
      tLutA: { value: null }, tLutB: { value: null }, uLutMix: { value: 0 }, uLutSize: { value: 32 }, uBloom: { value: 0.05 }, uDirt: { value: 0.3 },
      uExposure: { value: 1 }, uAutoExposure: { value: 1 }, uNV: { value: 0 }, uNVGain: { value: 16 }, uBrightness: { value: 1 }, uTime: { value: 0 },
    });
    this.mFinal = mat(FINAL_FRAG, {
      tColor: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGrain: { value: 0 }, uVignette: { value: 1 },
      uChromatic: { value: 0 }, uLens: { value: 0 }, uInsanity: { value: 0 }, uWarp: { value: 0 }, uPulse: { value: 0 }, uRed: { value: 0 },
      uFlash: { value: 0 }, uScanline: { value: 0 }, uBlackout: { value: 0 }, uVHS: { value: 0 }, uNV: { value: 0 }, uDamage: { value: 0 }, uFade: { value: 0 },
    });
    const one = new THREE.Data3DTexture(identityLUT(2), 2, 2, 2);
    one.format = THREE.RGBAFormat; one.type = THREE.UnsignedByteType; one.minFilter = one.magFilter = THREE.LinearFilter; one.needsUpdate = true;
    this.setLUTs(one, one, 0);
  }

  setQuality(q) {
    Object.assign(this.q, q);
    this.setSize(this.fullW, this.fullH, true);
  }

  // internal resolution scale (dynamic resolution)
  setScale(s) {
    if (Math.abs(s - this.scale) < 0.01) return;
    this.scale = s;
    this.setSize(this.fullW, this.fullH, true);
  }

  setSize(w, h, force = false) {
    if (!force && w === this.fullW && h === this.fullH) return;
    this.fullW = w; this.fullH = h;
    const W = Math.max(2, Math.round(w * this.scale)), H = Math.max(2, Math.round(h * this.scale));
    this.W = W; this.H = H;
    for (const t of this.targets || []) t.dispose();
    this.targets = [];
    const add = (t) => { this.targets.push(t); return t; };
    const depth = new THREE.DepthTexture(W, H, THREE.FloatType);
    this.sceneRT = add(rt(W, H, { depthBuffer: true, depthTexture: depth, samples: 0 }));
    const hw = Math.max(2, Math.round(W * 0.5)), hh = Math.max(2, Math.round(H * 0.5));
    this.aoA = add(rt(hw, hh));
    this.aoB = add(rt(hw, hh));
    const vs = this.q.volScale || 0.5;
    const vw = Math.max(2, Math.round(W * vs)), vh = Math.max(2, Math.round(H * vs));
    this.volA = add(rt(vw, vh));
    this.volB = add(rt(vw, vh));
    this.combRT = add(rt(W, H));
    this.mips = [];
    let mw = W, mh = H;
    for (let i = 0; i < 7; i++) {
      mw = Math.max(1, Math.floor(mw / 2)); mh = Math.max(1, Math.floor(mh / 2));
      this.mips.push(add(rt(mw, mh)));
    }
    this.bloomWide = add(rt(this.mips[2].width, this.mips[2].height));
    this.expA = add(rt(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.expB = add(rt(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.ldrA = add(rt(W, H, { type: THREE.UnsignedByteType }));
    this.ldrB = add(rt(W, H, { type: THREE.UnsignedByteType }));
    this.smaa.setSize(W, H);
    this.historyValid = false;
    this.exposureReset = true;
    // clear volumetric targets so an unused pass reads "no fog"
    const r = this.renderer;
    const old = r.getClearColor(new THREE.Color()), oldA = r.getClearAlpha();
    r.setClearColor(0x000000, 1);
    for (const t of [this.volA, this.volB]) { r.setRenderTarget(t); r.clear(); }
    r.setClearColor(0xffffff, 1);
    for (const t of [this.aoA, this.aoB]) { r.setRenderTarget(t); r.clear(); }
    r.setClearColor(old, oldA);
    r.setRenderTarget(null);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  render(dt) {
    const r = this.renderer, cam = this.camera, P = this.p, q = this.q;
    this.frame++;
    this.time += dt;
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (!this.historyValid) this.prevViewProj.copy(this.viewProj);

    // 1. scene
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, cam);
    const depth = this.sceneRT.depthTexture;

    // 2. ambient occlusion
    const aoOn = q.ao && P.ao > 0;
    if (aoOn) {
      const u = this.mAO.uniforms;
      u.tDepth.value = depth;
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uProj.value.copy(cam.projectionMatrix);
      u.uRes.value.set(this.aoA.width, this.aoA.height);
      u.uRadius.value = P.aoRadius;
      u.uIntensity.value = P.aoIntensity;
      u.uFrame.value = this.frame;
      this.pass(this.mAO, this.aoA);
      const b = this.mAOBlur.uniforms;
      b.tAO.value = this.aoA.texture; b.uDir.value.set(1 / this.aoA.width, 0);
      this.pass(this.mAOBlur, this.aoB);
      b.tAO.value = this.aoB.texture; b.uDir.value.set(0, 1 / this.aoA.height);
      this.pass(this.mAOBlur, this.aoA);
    }

    // 3. volumetrics
    const volOn = q.volumetric && P.volume > 0 && P.density > 0;
    let volTex = this.volA.texture;
    if (volOn) {
      const u = this.mVol.uniforms;
      const read = this.frame % 2 ? this.volA : this.volB;
      const write = this.frame % 2 ? this.volB : this.volA;
      u.tDepth.value = depth;
      u.tHistory.value = read.texture;
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
      u.uPrevViewProj.value.copy(this.prevViewProj);
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.uFrame.value = this.frame;
      u.uTime.value = this.time;
      u.uSteps.value = q.volSteps;
      u.uHistoryValid.value = this.historyValid ? 1 : 0;
      u.uDensity.value = P.density;
      u.uHeightFalloff.value = P.heightFalloff;
      u.uBaseY.value = P.baseY;
      u.uNoiseAmt.value = P.noiseAmt;
      u.uNoiseScale.value = P.noiseScale;
      u.uWind.value.copy(P.wind);
      u.uAmbient.value.copy(P.ambientScatter);
      const s = this.hero;
      if (s && s.visible && s.intensity > 0) {
        s.updateMatrixWorld();
        s.target.updateMatrixWorld();
        u.uSpotPos.value.setFromMatrixPosition(s.matrixWorld);
        const tp = new THREE.Vector3().setFromMatrixPosition(s.target.matrixWorld);
        u.uSpotDir.value.subVectors(tp, u.uSpotPos.value).normalize();
        const k = s.intensity * (s.userData.volScale ?? 1);
        u.uSpotCol.value.set(s.color.r * k, s.color.g * k, s.color.b * k);
        u.uSpotCos.value.set(Math.cos(s.angle), Math.cos(s.angle * (1 - s.penumbra)));
        u.uSpotRange.value = s.distance || 20;
        const map = s.shadow?.map?.depthTexture;
        u.uSpotShadowOn.value = s.castShadow && map ? 1 : 0;
        if (map) { u.tSpotShadow.value = map; u.uSpotShadowMat.value.copy(s.shadow.matrix); }
      } else {
        u.uSpotCol.value.set(0, 0, 0);
        u.uSpotShadowOn.value = 0;
      }
      if (!u.tSpotShadow.value || u.tSpotShadow.value === this._dummyShadow.depthTexture) u.uSpotShadowOn.value = 0;
      const n = Math.min(MAX_LIGHTS, this.volLights.length);
      u.uCount.value = n;
      for (let i = 0; i < n; i++) {
        const l = this.volLights[i];
        u.uLPos.value[i].set(l.position.x, l.position.y, l.position.z, l.range);
        u.uLCol.value[i].copy(l.color);
      }
      this.pass(this.mVol, write);
      volTex = write.texture;
    }

    // 4. combine
    {
      const u = this.mCombine.uniforms;
      u.tColor.value = this.sceneRT.texture;
      u.tDepth.value = depth;
      u.tAO.value = this.aoA.texture;
      u.tVol.value = volTex;
      u.uAO.value = aoOn ? P.ao : 0;
      u.uVol.value = volOn ? P.volume : 0;
      u.uMotion.value = q.motionBlur ? P.motion : 0;
      u.uDofAmount.value = q.dof ? P.dofAmount : 0;
      u.uDofFocus.value = P.dofFocus;
      u.uDofRange.value = P.dofRange;
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
      u.uPrevViewProj.value.copy(this.prevViewProj);
      u.uRes.value.set(this.W, this.H);
      u.uFogColor.value.copy(P.fogColor);
      u.uFogDensity.value = P.fogDensity;
      this.pass(this.mCombine, this.combRT);
    }

    // 5. bloom chain
    const m = this.mips;
    let src = this.combRT;
    for (let i = 0; i < m.length; i++) {
      const u = this.mDown.uniforms;
      u.tSrc.value = src.texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      u.uKaris.value = i === 0 ? 1 : 0;
      this.pass(this.mDown, m[i]);
      src = m[i];
    }
    // exposure from the tiny mip
    {
      const u = this.mExposure.uniforms;
      const read = this.frame % 2 ? this.expA : this.expB;
      const write = this.frame % 2 ? this.expB : this.expA;
      u.tSrc.value = m[m.length - 2].texture;
      u.tPrev.value = read.texture;
      u.uDt.value = Math.min(0.1, dt);
      u.uKey.value = P.key; u.uMin.value = P.expMin; u.uMax.value = P.expMax;
      u.uReset.value = this.exposureReset ? 1 : 0;
      this.exposureReset = false;
      this.pass(this.mExposure, write);
      this.mTone.uniforms.tExposure.value = write.texture;
    }
    for (let i = m.length - 1; i > 0; i--) {
      const u = this.mUp.uniforms;
      u.tSrc.value = m[i].texture;
      u.uTexel.value.set(1 / m[i].width, 1 / m[i].height);
      u.uRadius.value = 1;
      u.uWeight.value = 1;
      this.renderer.autoClear = false;
      this.pass(this.mUp, m[i - 1]);
      this.renderer.autoClear = true;
      if (i === 3) {
        const c = this.mCopyUp.uniforms;
        c.tSrc.value = m[2].texture; c.uTexel.value.set(1 / m[2].width, 1 / m[2].height); c.uWeight.value = 1 / 5;
        this.pass(this.mCopyUp, this.bloomWide);
      }
    }

    // 6. tone map + grade
    {
      const u = this.mTone.uniforms;
      u.tColor.value = this.combRT.texture;
      u.tBloom.value = m[0].texture;
      u.tBloomWide.value = this.bloomWide.texture;
      u.uBloom.value = q.bloom ? P.bloom : 0;
      u.uDirt.value = q.bloom ? P.dirt : 0;
      u.uExposure.value = P.exposure;
      u.uAutoExposure.value = P.autoExposure;
      u.uNV.value = P.nv;
      u.uNVGain.value = P.nvGain;
      u.uBrightness.value = P.brightness;
      u.uLutMix.value = P.lutMix;
      u.uTime.value = this.time;
      this.pass(this.mTone, this.ldrA);
    }

    // 7. anti-aliasing
    let final = this.ldrA;
    if (q.smaa) {
      this.smaa.renderToScreen = false;
      this.smaa.render(r, this.ldrB, this.ldrA);
      final = this.ldrB;
    }

    // 8. film / output
    {
      const u = this.mFinal.uniforms;
      u.tColor.value = final.texture;
      u.uRes.value.set(this.fullW, this.fullH);
      u.uTime.value = this.time;
      u.uGrain.value = P.grain; u.uVignette.value = P.vignette; u.uChromatic.value = P.chromatic; u.uLens.value = P.lens;
      u.uInsanity.value = P.insanity; u.uWarp.value = P.warp; u.uPulse.value = P.pulse; u.uRed.value = P.red; u.uFlash.value = P.flash;
      u.uScanline.value = P.scanline; u.uBlackout.value = P.blackout; u.uVHS.value = P.vhs; u.uNV.value = P.nv; u.uDamage.value = P.damage;
      u.uFade.value = P.fade;
      this.pass(this.mFinal, null);
    }

    this.prevViewProj.copy(this.viewProj);
    this.historyValid = true;
  }

  // Call on camera cuts so temporal effects don't smear across them.
  cut() { this.historyValid = false; }
  resetExposure() { this.exposureReset = true; }

  dispose() {
    for (const t of this.targets || []) t.dispose();
    this.smaa.dispose();
  }
}

// ------------------------------------------------------------------ helpers
function identityLUT(n) {
  const d = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    d[i++] = (r / (n - 1)) * 255; d[i++] = (g / (n - 1)) * 255; d[i++] = (b / (n - 1)) * 255; d[i++] = 255;
  }
  return d;
}

// Procedural lens dirt: smudges, fingerprints and dust specks.
function makeDirtTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  let s = 1234;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = r() * c.width, y = r() * c.height, rad = 20 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.04 + r() * 0.08;
    gr.addColorStop(0, `rgba(255,245,230,${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 260; i++) {
    const x = r() * c.width, y = r() * c.height, rad = 0.6 + r() * r() * 5;
    g.fillStyle = `rgba(255,250,240,${0.08 + r() * 0.3})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // a thumb smear
  g.strokeStyle = 'rgba(255,240,220,0.05)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    const cx = 380, cy = 200;
    g.arc(cx + r() * 4, cy + r() * 4, 10 + i * 1.6, Math.PI * 0.9, Math.PI * 1.9);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
