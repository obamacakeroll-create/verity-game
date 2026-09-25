// Tileable procedural noise library for the GPU texture baker.
// Every function takes `per` (integer period in lattice cells) so baked
// textures wrap seamlessly.

export const BAKE_LIB = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
uniform float uSeed;

float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33 + uSeed); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33 + uSeed); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 h32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33 + uSeed); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float h11(float p) { p = fract(p * .1031 + uSeed * 0.013); p *= p + 33.33; p *= p + p; return fract(p); }

// periodic gradient noise, returns ~[-1,1]
float gnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i00 = mod(i, per), i10 = mod(i + vec2(1, 0), per), i01 = mod(i + vec2(0, 1), per), i11 = mod(i + vec2(1, 1), per);
  float a00 = h21(i00) * TAU, a10 = h21(i10) * TAU, a01 = h21(i01) * TAU, a11 = h21(i11) * TAU;
  float n00 = dot(vec2(cos(a00), sin(a00)), f);
  float n10 = dot(vec2(cos(a10), sin(a10)), f - vec2(1, 0));
  float n01 = dot(vec2(cos(a01), sin(a01)), f - vec2(0, 1));
  float n11 = dot(vec2(cos(a11), sin(a11)), f - vec2(1, 1));
  return 1.41 * mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
// periodic value noise [0,1]
float vnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(mod(i, per)), b = h21(mod(i + vec2(1, 0), per)), c = h21(mod(i + vec2(0, 1), per)), d = h21(mod(i + vec2(1, 1), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// fbm on uv in [0,1): base frequency f (integer), returns ~[0,1]
float fbm(vec2 uv, float f, int oct, float gain) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * gnoise(uv * f, vec2(f));
    n += a;
    a *= gain;
    f *= 2.0;
  }
  return s / n * 0.5 + 0.5;
}
float fbm(vec2 uv, float f, int oct) { return fbm(uv, f, oct, 0.5); }
// anisotropic fbm (stretched along x): fx, fy integer frequencies
float fbm2(vec2 uv, vec2 f, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * gnoise(uv * f, f);
    n += a; a *= 0.5; f *= 2.0;
  }
  return s / n * 0.5 + 0.5;
}
float ridged(vec2 uv, float f, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * (1.0 - abs(gnoise(uv * f, vec2(f))));
    n += a; a *= 0.5; f *= 2.0;
  }
  return s / n;
}
// periodic worley: returns (F1, F2, cell id hash)
vec3 worley(vec2 uv, float f) {
  vec2 p = uv * f;
  vec2 i = floor(p), fr = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 c = mod(i + g, vec2(f));
    vec2 o = h22(c);
    vec2 r = g + o - fr;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h21(c + 7.7); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// domain-warped fbm (organic stains)
float warped(vec2 uv, float f, int oct) {
  vec2 q = vec2(fbm(uv, f, 4), fbm(uv + 0.37, f, 4));
  return fbm(fract(uv + (q - 0.5) * 0.35), f, oct);
}
// running-bond bricks / blocks: returns (edge dist in cell units, brick id, local uv)
vec4 bricks(vec2 uv, vec2 count, float mortar) {
  vec2 p = uv * count;
  float row = floor(p.y);
  p.x += mod(row, 2.0) * 0.5;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 d = min(f, 1.0 - f) * vec2(1.0 / count.y * count.x, 1.0); // aspect correct-ish
  float e = min(d.x * (count.y / count.x), d.y);
  float id = h21(mod(cell, count) + 3.1);
  return vec4(smoothstep(0.0, mortar, e), id, f);
}
// square tiles grid: returns (grout mask 0=grout..1=tile, tile id, local uv)
vec4 tiles(vec2 uv, float n, float grout, float bevel) {
  vec2 p = uv * n;
  vec2 cell = floor(p), f = fract(p);
  vec2 d = min(f, 1.0 - f);
  float e = min(d.x, d.y);
  float m = smoothstep(grout, grout + bevel, e);
  return vec4(m, h21(mod(cell, vec2(n)) + 1.3), f);
}
// scratches: thin random line segments, returns intensity
float scratches(vec2 uv, float f, float density, float len) {
  float s = 0.0;
  for (int k = 0; k < 3; k++) {
    vec2 p = uv * f + float(k) * 13.1;
    vec2 i = floor(p), fr = fract(p);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 c = mod(i + g, vec2(f));
      vec3 r = h32(c + float(k) * 5.0);
      if (r.z > density) continue;
      float a = r.x * PI;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 o = g + h22(c + 9.0) - fr;
      float t = clamp(dot(-o, dir), -len, len);
      float d = length(o + dir * t);
      s = max(s, smoothstep(0.018, 0.0, d) * (1.0 - abs(t) / len) * (0.5 + r.y * 0.5));
    }
  }
  return s;
}
// vertical drips / streaks (water damage): periodic in x
float streaks(vec2 uv, float n, float lengthVar) {
  float x = uv.x * n;
  float i = floor(x), f = fract(x);
  float s = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = mod(i + float(k), n);
    vec3 r = h32(vec2(c, 11.0));
    float cx = float(k) + r.x;
    float w = 0.04 + r.y * 0.12;
    float d = abs(f - cx) / w;
    float top = r.z * 0.6;
    float len = 0.2 + h11(c * 3.7) * lengthVar;
    float y = fract(uv.y - top);
    float fade = smoothstep(len, 0.0, y) * smoothstep(0.0, 0.02, y);
    s = max(s, (1.0 - smoothstep(0.3, 1.0, d)) * fade);
  }
  return s;
}
float remap(float v, float a, float b) { return clamp((v - a) / (b - a), 0.0, 1.0); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(0, 2, 1) / 3.0) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
`;
