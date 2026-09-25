import * as THREE from 'three';

// Procedural PBR material recipes (GLSL). `world` is the real-world size in
// metres that one texture repeat covers (used for world-space UVs).
// Albedo is baked near-neutral where the material is tinted per use via
// material.color.

const R = (name, world, glsl, extra = {}) => ({ name, world, glsl, ...extra });

export const RECIPES = {
  // ---------------------------------------------------------------- walls
  paint: R('paint', 2.4, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float peel = fbm(uv, 24.0, 5);
  float roller = fbm2(uv, vec2(40.0, 3.0), 4);
  float large = fbm(uv, 3.0, 5);
  float stain = smoothstep(0.58, 0.82, warped(uv, 3.0, 6));
  float drip = streaks(uv, 14.0, 0.5) * smoothstep(0.45, 0.7, fbm(uv, 4.0, 3));
  float scuff = scratches(uv, 6.0, 0.18, 0.45);
  float speck = smoothstep(0.74, 0.8, fbm(uv, 96.0, 2));
  vec3 base = vec3(0.86, 0.85, 0.82) * (0.93 + large * 0.1 + (roller - 0.5) * 0.05);
  base = mix(base, base * vec3(0.8, 0.72, 0.56), stain * 0.6);
  base = mix(base, base * vec3(0.62, 0.55, 0.45), drip * 0.5);
  base *= 1.0 - scuff * 0.35 - speck * 0.15;
  s.albedo = base;
  s.height = 0.5 + (peel - 0.5) * 0.25 + (roller - 0.5) * 0.12 - scuff * 0.1 + drip * 0.05;
  s.rough = 0.7 + (large - 0.5) * 0.15 - stain * 0.12 - drip * 0.2 + scuff * 0.1;
}`, { normal: 1.2 }),

  peel: R('peel', 2.4, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float w = warped(uv, 3.0, 7);
  float m = smoothstep(0.575, 0.585, w);            // paint gone
  float lip = smoothstep(0.55, 0.575, w) * (1.0 - m); // curled edge
  float plaster = fbm(uv, 16.0, 6);
  float pits = 1.0 - smoothstep(0.02, 0.09, worley(uv, 40.0).x);
  float drip = streaks(uv, 12.0, 0.7);
  float stain = smoothstep(0.5, 0.85, warped(fract(uv + 0.31), 4.0, 5));
  float mold = smoothstep(0.66, 0.74, fbm(uv, 12.0, 5)) * smoothstep(0.5, 0.8, fbm(uv, 3.0, 3));
  vec3 paint = vec3(0.82, 0.8, 0.74) * (0.9 + fbm(uv, 5.0, 4) * 0.15);
  vec3 under = mix(vec3(0.52, 0.49, 0.44), vec3(0.66, 0.62, 0.55), plaster) * (1.0 - pits * 0.25);
  vec3 c = mix(paint, under, m);
  c = mix(c, c * vec3(0.72, 0.62, 0.45), stain * 0.55);
  c = mix(c, c * vec3(0.5, 0.43, 0.33), drip * 0.6);
  c = mix(c, vec3(0.12, 0.13, 0.08), mold * 0.7);
  s.albedo = c;
  s.height = 0.55 + lip * 0.25 - m * 0.18 + (plaster - 0.5) * 0.2 * m - pits * 0.08 * m;
  s.rough = mix(0.62, 0.92, m) - drip * 0.25 + mold * 0.1;
  s.ao = 1.0 - m * 0.15;
}`, { normal: 2.2 }),

  wallpaper: R('wallpaper', 1.0, /* glsl */ `
float motif(vec2 p) {
  // damask-ish medallion built from polar petals
  vec2 q = p - 0.5;
  q.x = abs(q.x);
  float r = length(q * vec2(1.0, 0.8));
  float a = atan(q.y, q.x);
  float petals = 0.22 + 0.08 * cos(a * 6.0) + 0.04 * cos(a * 14.0);
  float m = smoothstep(0.012, 0.0, abs(r - petals)) + smoothstep(0.02, 0.0, abs(r - petals * 0.55));
  m += smoothstep(0.03, 0.0, r - 0.05);
  float vine = smoothstep(0.012, 0.0, abs(q.x - 0.5 + 0.06 * sin(q.y * 12.0)));
  return clamp(m + vine, 0.0, 1.0);
}
void surface(vec2 uv, inout Surf s) {
  vec2 cell = uv * vec2(3.0, 2.0);
  vec2 f = fract(cell);
  f.x = fract(f.x + step(1.0, mod(floor(cell.y), 2.0)) * 0.5);
  float m = motif(f);
  float stripes = smoothstep(0.45, 0.5, abs(fract(uv.x * 12.0) - 0.5)) * 0.4;
  float seam = smoothstep(0.004, 0.0, min(abs(uv.x - 0.5), min(uv.x, 1.0 - uv.x)));
  float lift = smoothstep(0.02, 0.0, min(abs(uv.x - 0.5), min(uv.x, 1.0 - uv.x))) * smoothstep(0.5, 0.7, fbm(uv, 4.0, 3));
  float fade = fbm(uv, 3.0, 5);
  float stain = smoothstep(0.55, 0.85, warped(uv, 2.0, 6));
  float drip = streaks(uv, 8.0, 0.8) * 0.8;
  vec3 ground = vec3(0.47, 0.5, 0.38);
  vec3 ink = vec3(0.3, 0.33, 0.22);
  vec3 c = mix(ground, ink, m * 0.8 + stripes * 0.3);
  c *= 0.85 + fade * 0.25;
  c = mix(c, c * vec3(0.9, 0.78, 0.55), stain * 0.7);
  c = mix(c, c * vec3(0.55, 0.45, 0.32), drip * 0.5);
  c *= 1.0 - seam * 0.4;
  s.albedo = c;
  s.height = 0.5 + m * 0.06 + lift * 0.3 - seam * 0.2 + (fbm(uv, 64.0, 3) - 0.5) * 0.08;
  s.rough = 0.8 - m * 0.12 - drip * 0.2;
}`, { normal: 1.5 }),

  cinder: R('cinder', 1.6, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec4 b = bricks(uv, vec2(4.0, 8.0), 0.06);
  float pits = 1.0 - smoothstep(0.0, 0.06, worley(uv, 72.0).x);
  float pits2 = 1.0 - smoothstep(0.0, 0.04, worley(fract(uv + 0.3), 150.0).x);
  float grain = fbm(uv, 48.0, 4);
  float big = fbm(uv, 3.0, 4);
  float drip = streaks(uv, 10.0, 0.6) * smoothstep(0.4, 0.7, fbm(uv, 3.0, 3));
  float dirt = smoothstep(0.45, 0.85, warped(uv, 2.0, 5));
  vec3 paintc = vec3(0.5, 0.53, 0.48) * (0.78 + b.y * 0.28 + big * 0.16 + (grain - 0.5) * 0.1);
  vec3 mortar = vec3(0.34, 0.33, 0.31);
  vec3 c = mix(mortar, paintc, b.x);
  c *= 1.0 - (pits * 0.35 + pits2 * 0.2) * b.x;
  c = mix(c, c * vec3(0.6, 0.52, 0.42), drip * 0.6 + dirt * 0.3);
  s.albedo = c;
  s.height = 0.25 + b.x * 0.5 + (grain - 0.5) * 0.14 - (pits * 0.14 + pits2 * 0.06) * b.x;
  s.rough = mix(0.95, 0.74, b.x) - drip * 0.2;
  s.ao = mix(0.55, 1.0, b.x);
}`, { normal: 3.0 }),

  brick: R('brick', 2.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec4 b = bricks(uv, vec2(9.0, 30.0), 0.06);
  float n = fbm(uv, 32.0, 5);
  float chip = smoothstep(0.62, 0.7, fbm(uv, 20.0, 4)) * b.x;
  vec3 brickc = mix(vec3(0.34, 0.14, 0.09), vec3(0.5, 0.24, 0.15), b.y) * (0.8 + n * 0.35);
  brickc = mix(brickc, vec3(0.22, 0.2, 0.19), smoothstep(0.85, 0.95, b.y) * 0.8);
  vec3 c = mix(vec3(0.42, 0.4, 0.37), brickc, b.x);
  float soot = streaks(uv, 16.0, 0.9) * 0.6 + smoothstep(0.6, 0.9, fbm(uv, 2.0, 4)) * 0.4;
  c *= 1.0 - soot * 0.45;
  s.albedo = c;
  s.height = 0.3 + b.x * 0.5 + (n - 0.5) * 0.15 - chip * 0.2;
  s.rough = mix(0.95, 0.82, b.x);
  s.ao = mix(0.65, 1.0, b.x);
}`, { normal: 3.0 }),

  panel: R('panel', 2.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  // insulated sandwich panel with shallow ribs and fasteners
  float ribs = smoothstep(0.35, 0.5, abs(fract(uv.x * 10.0) - 0.5));
  float seam = smoothstep(0.006, 0.0, min(uv.x, 1.0 - uv.x));
  vec2 rv = vec2(fract(uv.x * 2.0) - 0.5, fract(uv.y * 4.0) - 0.5);
  float rivet = smoothstep(0.012, 0.006, length(rv * vec2(1.0, 2.0) - vec2(0.47, 0.0)));
  float dirt = smoothstep(0.4, 0.9, fbm(uv, 3.0, 5));
  float drip = streaks(uv, 20.0, 0.9);
  float dent = fbm(uv, 6.0, 4);
  vec3 c = vec3(0.78, 0.8, 0.8) * (0.9 + fbm(uv, 8.0, 3) * 0.1);
  c = mix(c, c * vec3(0.65, 0.6, 0.52), dirt * 0.5 + drip * 0.4);
  s.albedo = c;
  s.height = 0.5 + ribs * 0.12 - seam * 0.3 + rivet * 0.25 + (dent - 0.5) * 0.06;
  s.rough = 0.42 + dirt * 0.3 + drip * 0.2;
  s.metal = 0.6 - dirt * 0.3;
}`, { normal: 1.6 }),

  // ---------------------------------------------------------------- floors
  vct: R('vct', 2.4, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec4 t = tiles(uv, 8.0, 0.006, 0.01);
  vec2 cell = floor(uv * 8.0);
  float checker = mod(cell.x + cell.y, 2.0);
  float chips = smoothstep(0.66, 0.7, fbm(uv, 180.0, 2));
  float chips2 = smoothstep(0.7, 0.74, fbm(fract(uv + 0.5), 140.0, 2));
  vec3 a = vec3(0.72, 0.7, 0.62), b2 = vec3(0.5, 0.52, 0.5);
  vec3 c = mix(a, b2, checker * 0.8) * (0.94 + t.y * 0.08);
  c = mix(c, c * 0.72, chips);
  c = mix(c, c * 1.12, chips2);
  // wax build-up near seams + heel scuffs
  vec2 e = min(t.zw, 1.0 - t.zw);
  float edge = 1.0 - smoothstep(0.0, 0.12, min(e.x, e.y));
  float wax = fbm(uv, 6.0, 5);
  float scuff = scratches(uv, 10.0, 0.35, 0.3);
  float grime = smoothstep(0.35, 0.85, wax) * 0.5 + edge * 0.4;
  c = mix(c, c * vec3(0.62, 0.56, 0.45), grime * 0.6);
  c *= 1.0 - scuff * 0.55;
  c = mix(vec3(0.16, 0.15, 0.13), c, t.x);
  s.albedo = c;
  s.height = 0.5 + t.x * 0.1 - scuff * 0.05 + (fbm(uv, 90.0, 2) - 0.5) * 0.03;
  s.rough = mix(0.9, 0.28 + grime * 0.35 + scuff * 0.2, t.x);
}`, { normal: 1.0 }),

  concrete: R('concrete', 4.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float mott = fbm(uv, 3.0, 6);
  float mott2 = fbm(fract(uv + 0.37), 8.0, 5);
  float fine = fbm(uv, 64.0, 4);
  vec2 wuv = fract(uv + (vec2(fbm(uv, 6.0, 3), fbm(uv + 0.5, 6.0, 3)) - 0.5) * 0.08);
  vec3 w = worley(wuv, 4.0);
  float crackField = w.y - w.x;
  float crackSel = step(0.72, h21(vec2(floor(w.z * 97.0), 3.0)));
  float crack = smoothstep(0.018, 0.0, crackField) * crackSel * smoothstep(0.3, 0.6, fbm(uv, 4.0, 3));
  float hair = smoothstep(0.93, 0.99, ridged(uv, 6.0, 5)) * 0.6;
  vec2 tc = uv * 6.0;
  vec2 ti = floor(tc), tf = fract(tc) - 0.5;
  float swirl = 0.5 + 0.5 * sin(length(tf + (h22(mod(ti, 6.0)) - 0.5) * 0.4) * 40.0);
  float agg = smoothstep(0.1, 0.02, worley(uv, 90.0).x) * 0.6;
  float oil = smoothstep(0.64, 0.8, warped(fract(uv + 0.17), 2.0, 6));
  float stainB = smoothstep(0.55, 0.85, mott2);
  float efflo = smoothstep(0.7, 0.9, warped(fract(uv + 0.61), 3.0, 5));
  float joint = smoothstep(0.004, 0.0, min(abs(fract(uv.x * 2.0 + 0.5) - 0.5), abs(fract(uv.y * 2.0 + 0.5) - 0.5)));
  float scuff = scratches(uv, 8.0, 0.4, 0.5);
  vec3 c = vec3(0.42, 0.41, 0.39) * (0.7 + mott * 0.45 + (fine - 0.5) * 0.1);
  c = mix(c, c * vec3(0.7, 0.68, 0.64), stainB * 0.6);
  c = mix(c, vec3(0.55, 0.54, 0.5), agg * 0.4);
  c = mix(c, vec3(0.62, 0.62, 0.58), efflo * 0.35);
  c = mix(c, vec3(0.07, 0.065, 0.06), oil * 0.8);
  c *= 1.0 - crack * 0.7 - hair * 0.25 - joint * 0.6 - scuff * 0.2;
  s.albedo = c;
  s.height = 0.5 + (fine - 0.5) * 0.08 + swirl * 0.015 - crack * 0.35 - hair * 0.05 - joint * 0.4 + agg * 0.03;
  s.rough = 0.66 + mott * 0.2 - oil * 0.5 - swirl * 0.06 + scuff * 0.1 + efflo * 0.1;
  s.ao = 1.0 - joint * 0.4 - crack * 0.3;
}`, { normal: 1.6 }),

  terrazzo: R('terrazzo', 2.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec3 w1 = worley(uv, 28.0);
  vec3 w2 = worley(fract(uv + 0.31), 60.0);
  float chipA = smoothstep(0.32, 0.26, w1.x) * step(0.35, w1.z);
  float chipB = smoothstep(0.3, 0.22, w2.x) * step(0.45, w2.z);
  vec3 matrix = vec3(0.74, 0.71, 0.65) * (0.95 + fbm(uv, 8.0, 3) * 0.08);
  vec3 ca = mix(vec3(0.25, 0.24, 0.23), vec3(0.62, 0.36, 0.26), step(0.7, w1.z));
  vec3 cb = mix(vec3(0.88, 0.86, 0.8), vec3(0.3, 0.38, 0.35), step(0.8, w2.z));
  vec3 c = mix(matrix, ca, chipA);
  c = mix(c, cb, chipB);
  float strip = smoothstep(0.004, 0.0, min(abs(fract(uv.x * 2.0 + 0.5) - 0.5), abs(fract(uv.y * 2.0 + 0.5) - 0.5)));
  c = mix(c, vec3(0.55, 0.45, 0.3), strip);
  // a few hairline cracks, not a crazing network
  float crack = smoothstep(0.012, 0.0, abs(fbm(uv, 5.0, 4) - 0.5)) * smoothstep(0.55, 0.7, fbm(uv + 3.1, 2.0, 3));
  float grime = smoothstep(0.35, 0.9, fbm(uv, 4.0, 5));
  c = mix(c, c * vec3(0.66, 0.6, 0.5), grime * 0.5);
  c *= 1.0 - crack * 0.5;
  s.albedo = c;
  s.height = 0.5 - crack * 0.3 + (chipA + chipB) * 0.01;
  s.rough = 0.16 + grime * 0.4 + crack * 0.3;
  s.metal = strip * 0.9;
}`, { normal: 1.0 }),

  hardwood: R('hardwood', 2.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float rows = 16.0;
  float row = floor(uv.y * rows);
  float off = h21(vec2(row, 1.0));
  float plankLen = 0.5;
  float px = uv.x + off;
  float pid = floor(px / plankLen);
  float lx = fract(px / plankLen);
  float ly = fract(uv.y * rows);
  float id = h21(vec2(mod(pid, 2.0), row));
  float gap = smoothstep(0.0, 0.04, min(ly, 1.0 - ly)) * smoothstep(0.0, 0.006, min(lx, 1.0 - lx));
  float grain = fbm2(fract(uv + vec2(id, 0.0)), vec2(4.0, 128.0), 5);
  float rings = sin((ly + grain * 0.8 + id * 5.0) * 18.0) * 0.5 + 0.5;
  vec3 wood = mix(vec3(0.33, 0.2, 0.11), vec3(0.52, 0.34, 0.19), id);
  wood *= 0.8 + rings * 0.18 + grain * 0.15;
  float wear = smoothstep(0.45, 0.8, fbm(uv, 3.0, 5));
  float scuff = scratches(uv, 10.0, 0.5, 0.4);
  wood = mix(wood, wood * vec3(1.12, 1.08, 1.0), wear * 0.3);
  wood *= 1.0 - scuff * 0.2;
  s.albedo = mix(vec3(0.05, 0.03, 0.02), wood, gap);
  s.height = 0.5 + gap * 0.15 + (grain - 0.5) * 0.06 - scuff * 0.05;
  s.rough = mix(0.9, 0.32 + wear * 0.35 + scuff * 0.2, gap);
}`, { normal: 1.4 }),

  carpet: R('carpet', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec2 c2 = floor(uv * 2.0);
  vec2 f = fract(uv * 2.0);
  float rot = mod(c2.x + c2.y, 2.0);
  vec2 pf = rot > 0.5 ? f.yx : f;
  float pile = fbm2(fract(uv), rot > 0.5 ? vec2(512.0, 256.0) : vec2(256.0, 512.0), 3);
  float loops = 0.5 + 0.5 * sin(pf.x * 220.0) * sin(pf.y * 220.0);
  float pattern = smoothstep(0.4, 0.6, fbm(uv, 16.0, 3));
  float seam = smoothstep(0.0, 0.01, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float stain = smoothstep(0.62, 0.8, warped(uv, 3.0, 5));
  vec3 c = mix(vec3(0.2, 0.22, 0.26), vec3(0.28, 0.3, 0.33), pattern) * (0.85 + pile * 0.3);
  c = mix(c, c * vec3(0.7, 0.62, 0.5), stain * 0.7);
  c *= 0.85 + seam * 0.15;
  s.albedo = c;
  s.height = 0.5 + (pile - 0.5) * 0.3 + loops * 0.08;
  s.rough = 0.96;
  s.ao = 0.85 + pile * 0.15;
}`, { normal: 1.0 }),

  ceramic: R('ceramic', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec4 t = tiles(uv, 10.0, 0.028, 0.012);
  float tilt = (h21(floor(uv * 10.0) + 4.0) - 0.5);
  float crack = 0.0;
  vec3 w = worley(uv, 4.0);
  crack = smoothstep(0.015, 0.0, w.y - w.x) * step(0.8, w.z);
  float grime = smoothstep(0.3, 0.9, fbm(uv, 6.0, 5));
  vec3 tile = vec3(0.86, 0.87, 0.84) * (0.96 + t.y * 0.05);
  vec3 grout = mix(vec3(0.55, 0.53, 0.48), vec3(0.2, 0.18, 0.14), grime);
  vec3 c = mix(grout, tile * (1.0 - grime * 0.2), t.x);
  c *= 1.0 - crack * 0.5;
  s.albedo = c;
  s.height = 0.5 + t.x * 0.2 + tilt * 0.02 * t.x + (t.z - 0.5) * tilt * 0.03;
  s.rough = mix(0.9, 0.08 + grime * 0.25, t.x) + crack * 0.4;
}`, { normal: 1.3 }),

  asphalt: R('asphalt', 4.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float agg = fbm(uv, 160.0, 3);
  float stones = smoothstep(0.12, 0.05, worley(uv, 120.0).x);
  float big = fbm(uv, 3.0, 5);
  vec3 w = worley(uv, 4.0);
  float crack = smoothstep(0.03, 0.0, w.y - w.x + (fbm(uv, 16.0, 3) - 0.5) * 0.05) * step(0.5, w.z);
  float tar = smoothstep(0.6, 0.64, fbm(fract(uv + 0.5), 3.0, 5));
  vec3 c = vec3(0.12, 0.12, 0.12) * (0.75 + agg * 0.4 + big * 0.3);
  c = mix(c, vec3(0.22, 0.21, 0.2), stones * 0.6);
  c = mix(c, vec3(0.04), tar * 0.8 + crack * 0.8);
  s.albedo = c;
  s.height = 0.5 + (agg - 0.5) * 0.2 + stones * 0.1 - crack * 0.4 - tar * 0.03;
  s.rough = 0.85 - tar * 0.4;
}`, { normal: 2.0 }),

  // ---------------------------------------------------------------- ceilings
  ceilingTile: R('ceilingTile', 2.4, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec4 t = tiles(uv, 4.0, 0.012, 0.02);
  vec2 cell = floor(uv * 4.0);
  float id = t.y;
  float fiss = smoothstep(0.86, 0.94, ridged(fract(uv + id), 24.0, 4));
  float pin = 1.0 - smoothstep(0.02, 0.05, worley(uv, 110.0).x);
  // per-tile water stain rings
  vec2 lc = t.zw - (h22(cell + 2.0) * 0.6 + 0.2);
  float rr = length(lc) + (fbm(uv, 12.0, 4) - 0.5) * 0.15;
  float srad = 0.15 + h21(cell + 8.0) * 0.3;
  float hasStain = step(0.62, h21(cell + 5.0));
  float stain = hasStain * smoothstep(srad, srad - 0.1, rr);
  float ring = hasStain * smoothstep(0.02, 0.0, abs(rr - srad + 0.01));
  float sag = hasStain * smoothstep(srad, 0.0, rr);
  vec3 c = vec3(0.8, 0.79, 0.76) * (0.95 + fbm(uv, 8.0, 3) * 0.08);
  c *= 1.0 - fiss * 0.3 - pin * 0.25;
  c = mix(c, c * vec3(0.78, 0.66, 0.46), stain * 0.6);
  c = mix(c, vec3(0.38, 0.28, 0.16), ring * 0.7);
  c = mix(vec3(0.2), c, t.x);
  s.albedo = c;
  s.height = 0.5 + t.x * 0.12 - fiss * 0.12 - pin * 0.1 - sag * 0.05;
  s.rough = 0.95;
}`, { normal: 1.6 }),

  // ---------------------------------------------------------------- metals
  metalPaint: R('metalPaint', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float chip = smoothstep(0.64, 0.66, warped(uv, 5.0, 6));
  float chipEdge = smoothstep(0.6, 0.64, warped(uv, 5.0, 6)) * (1.0 - chip);
  float rustN = fbm(uv, 24.0, 5);
  float streak = streaks(uv, 18.0, 0.7) * smoothstep(0.4, 0.7, fbm(uv, 3.0, 3));
  float scuff = scratches(uv, 8.0, 0.4, 0.4);
  vec3 paintc = vec3(0.82) * (0.93 + fbm(uv, 4.0, 4) * 0.1);
  vec3 rust = mix(vec3(0.3, 0.12, 0.05), vec3(0.55, 0.28, 0.1), rustN);
  vec3 c = mix(paintc, rust, chip);
  c = mix(c, c * vec3(0.72, 0.5, 0.35), streak * 0.6);
  c = mix(c, vec3(0.5), scuff * 0.4);
  s.albedo = c;
  s.height = 0.5 + chipEdge * 0.1 - chip * 0.1 + (rustN - 0.5) * 0.08 * chip - scuff * 0.04;
  s.rough = mix(0.42, 0.85, chip) + streak * 0.15 + scuff * 0.1;
  s.metal = scuff * 0.7 + chip * 0.25;
}`, { normal: 1.2 }),

  brushed: R('brushed', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float b = fbm2(uv, vec2(2.0, 512.0), 4);
  float smudge = smoothstep(0.5, 0.85, warped(uv, 4.0, 5));
  float scuff = scratches(uv, 6.0, 0.5, 0.5);
  vec3 c = vec3(0.62, 0.62, 0.6) * (0.9 + b * 0.15);
  c = mix(c, c * 0.8, smudge * 0.4);
  s.albedo = c;
  s.height = 0.5 + (b - 0.5) * 0.05 - scuff * 0.04;
  s.rough = 0.28 + (b - 0.5) * 0.12 + smudge * 0.25 + scuff * 0.12;
  s.metal = 1.0;
}`, { normal: 0.6 }),

  rust: R('rust', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float a = fbm(uv, 6.0, 7);
  float b = fbm(fract(uv + 0.4), 24.0, 5);
  float pits = 1.0 - smoothstep(0.02, 0.08, worley(uv, 50.0).x);
  float flake = smoothstep(0.55, 0.6, warped(uv, 8.0, 6));
  vec3 c = mix(vec3(0.24, 0.1, 0.05), vec3(0.58, 0.3, 0.12), b);
  c = mix(c, vec3(0.16, 0.13, 0.12), smoothstep(0.62, 0.8, a) * 0.8);
  c = mix(c, vec3(0.45, 0.43, 0.4), flake * 0.2);
  s.albedo = c * (1.0 - pits * 0.4);
  s.height = 0.5 + (a - 0.5) * 0.25 + flake * 0.1 - pits * 0.2;
  s.rough = 0.8 + b * 0.15;
  s.metal = smoothstep(0.62, 0.8, a) * 0.4;
}`, { normal: 2.5 }),

  corrugated: R('corrugated', 2.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float rib = sin(uv.x * TAU * 16.0) * 0.5 + 0.5;
  float rust = smoothstep(0.55, 0.75, warped(uv, 3.0, 6)) + streaks(uv, 32.0, 0.8) * 0.6;
  float spangle = fbm(uv, 40.0, 3);
  vec3 c = mix(vec3(0.55, 0.57, 0.58) * (0.88 + spangle * 0.2), vec3(0.4, 0.18, 0.07), clamp(rust, 0.0, 1.0));
  s.albedo = c;
  s.height = rib * 0.8 + (spangle - 0.5) * 0.03;
  s.rough = mix(0.4, 0.85, clamp(rust, 0.0, 1.0));
  s.metal = mix(0.85, 0.2, clamp(rust, 0.0, 1.0));
  s.ao = 0.75 + rib * 0.25;
}`, { normal: 3.0, cavity: 0 }),

  // ---------------------------------------------------------------- organics & props
  cardboard: R('cardboard', 0.8, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float fib = fbm2(uv, vec2(64.0, 8.0), 5);
  float fine = fbm(uv, 128.0, 3);
  float blot = fbm(uv, 4.0, 5);
  float flute = sin(uv.y * TAU * 90.0) * 0.5 + 0.5;
  float scuff = scratches(uv, 5.0, 0.5, 0.4);
  float wet = smoothstep(0.62, 0.8, warped(uv, 2.0, 5));
  vec3 c = vec3(0.56, 0.4, 0.24) * (0.86 + fib * 0.14 + blot * 0.1 + (fine - 0.5) * 0.08);
  c = mix(c, c * vec3(0.7, 0.6, 0.5), wet * 0.6);
  c = mix(c, vec3(0.7, 0.58, 0.42), scuff * 0.4);
  s.albedo = c;
  s.height = 0.5 + flute * 0.03 + (fib - 0.5) * 0.05 - scuff * 0.05 + wet * 0.05;
  s.rough = 0.9 - wet * 0.15;
}`, { normal: 1.0 }),

  pla: R('pla', 0.35, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  // FDM print: layer lines along v, slight z-wobble and seam
  float layers = 150.0;
  float wob = (fbm(uv, 8.0, 3) - 0.5) * 0.25;
  float l = fract(uv.y * layers + wob);
  float line = smoothstep(0.0, 0.5, l) * smoothstep(1.0, 0.5, l);
  float seam = smoothstep(0.015, 0.0, abs(uv.x - 0.73)) * (0.5 + 0.5 * sin(uv.y * layers * TAU * 0.5));
  float micro = fbm(uv, 64.0, 3);
  s.albedo = vec3(0.95, 0.72, 0.08) * (0.96 + micro * 0.06);
  s.height = 0.35 + line * 0.5 + seam * 0.15 + (micro - 0.5) * 0.04;
  s.rough = 0.3 + (1.0 - line) * 0.18 + seam * 0.2;
}`, { normal: 1.6, size: 1024 }),

  skin: R('skin', 0.5, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float pores = 1.0 - smoothstep(0.02, 0.07, worley(uv, 120.0).x);
  float wr = ridged(uv, 8.0, 5);
  float wrinkle = smoothstep(0.72, 0.95, fbm2(uv, vec2(6.0, 48.0), 5));
  float vein = smoothstep(0.93, 0.985, ridged(fract(uv + 0.2), 5.0, 5));
  float blot = warped(uv, 3.0, 6);
  float bruise = smoothstep(0.58, 0.78, blot);
  vec3 c = vec3(0.78, 0.62, 0.22) * (0.85 + fbm(uv, 12.0, 4) * 0.2);
  c = mix(c, vec3(0.5, 0.32, 0.2), bruise * 0.55);
  c = mix(c, vec3(0.35, 0.3, 0.38), vein * 0.5);
  c *= 1.0 - pores * 0.12;
  s.albedo = c;
  s.height = 0.5 + (wr - 0.5) * 0.12 - wrinkle * 0.12 - pores * 0.08 + vein * 0.08;
  s.rough = 0.42 + pores * 0.2 + bruise * 0.1 - vein * 0.1;
}`, { normal: 2.0 }),

  rubber: R('rubber', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec2 p = uv * vec2(8.0, 24.0);
  float chev = abs(fract(p.y + abs(fract(p.x) - 0.5) * 0.8) - 0.5);
  float rib = smoothstep(0.18, 0.12, chev);
  float dust = smoothstep(0.4, 0.9, fbm(uv, 6.0, 5));
  vec3 c = vec3(0.07, 0.07, 0.075) * (0.9 + fbm(uv, 64.0, 3) * 0.2);
  c = mix(c, vec3(0.3, 0.28, 0.25), dust * 0.4 * (1.0 - rib));
  s.albedo = c;
  s.height = 0.4 + rib * 0.35;
  s.rough = 0.75 + dust * 0.2 - rib * 0.1;
}`, { normal: 2.0 }),

  fabric: R('fabric', 0.3, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec2 p = uv * 120.0;
  float warp = sin(p.x * PI) * 0.5 + 0.5;
  float weft = sin(p.y * PI) * 0.5 + 0.5;
  float over = step(0.5, fract((floor(p.x) + floor(p.y)) * 0.5));
  float weave = mix(warp, weft, over);
  float fuzz = fbm(uv, 64.0, 4);
  float stain = smoothstep(0.62, 0.85, warped(uv, 2.0, 5));
  vec3 c = vec3(0.7) * (0.8 + weave * 0.25 + (fuzz - 0.5) * 0.1);
  c = mix(c, c * vec3(0.7, 0.6, 0.5), stain * 0.6);
  s.albedo = c;
  s.height = 0.5 + weave * 0.25 + (fuzz - 0.5) * 0.1;
  s.rough = 0.95;
  s.ao = 0.8 + weave * 0.2;
}`, { normal: 1.2 }),

  leather: R('leather', 0.5, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec3 w = worley(uv, 40.0);
  float grain = smoothstep(0.0, 0.4, w.y - w.x);
  float crackle = smoothstep(0.06, 0.0, w.y - w.x) * smoothstep(0.5, 0.8, fbm(uv, 4.0, 4));
  float wear = smoothstep(0.5, 0.85, fbm(uv, 3.0, 5));
  vec3 c = vec3(0.16, 0.1, 0.07) * (0.85 + grain * 0.2);
  c = mix(c, vec3(0.3, 0.22, 0.16), wear * 0.5);
  c = mix(c, vec3(0.4, 0.33, 0.27), crackle * 0.6);
  s.albedo = c;
  s.height = 0.5 + grain * 0.12 - crackle * 0.2;
  s.rough = 0.45 + wear * 0.3 + crackle * 0.2;
}`, { normal: 1.6 }),

  wood: R('wood', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float grain = fbm2(uv, vec2(3.0, 64.0), 6);
  float rings = sin((uv.y * 12.0 + grain * 3.0) * TAU) * 0.5 + 0.5;
  float knots = smoothstep(0.08, 0.0, worley(uv, 3.0).x) ;
  float wear = smoothstep(0.5, 0.85, fbm(uv, 4.0, 5));
  float scuff = scratches(uv, 6.0, 0.5, 0.4);
  vec3 c = mix(vec3(0.3, 0.18, 0.1), vec3(0.48, 0.3, 0.17), rings * 0.6 + grain * 0.4);
  c *= 1.0 - knots * 0.5;
  c = mix(c, c * 1.2, wear * 0.25);
  c *= 1.0 - scuff * 0.25;
  s.albedo = c;
  s.height = 0.5 + (grain - 0.5) * 0.1 + rings * 0.03 - scuff * 0.05;
  s.rough = 0.38 + wear * 0.3 + scuff * 0.2;
}`, { normal: 1.0 }),

  laminate: R('laminate', 1.2, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  // office desk laminate: faux-wood print, very flat, edge chips
  float grain = fbm2(uv, vec2(2.0, 48.0), 5);
  float chips = smoothstep(0.72, 0.76, fbm(uv, 12.0, 4));
  float ring = smoothstep(0.03, 0.0, abs(length(fract(uv * 3.0) - 0.5) - 0.18)) * step(0.7, h21(floor(uv * 3.0)));
  vec3 c = mix(vec3(0.55, 0.45, 0.33), vec3(0.66, 0.55, 0.42), grain);
  c = mix(c, c * 0.7, ring * 0.6);
  c = mix(c, vec3(0.85, 0.82, 0.75), chips * 0.6);
  s.albedo = c;
  s.height = 0.5 - chips * 0.2;
  s.rough = 0.35 + grain * 0.1 + ring * 0.2;
}`, { normal: 0.6 }),

  plastic: R('plastic', 0.5, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float tex = fbm(uv, 96.0, 3);
  float scuff = scratches(uv, 5.0, 0.4, 0.4);
  float dirt = smoothstep(0.5, 0.9, fbm(uv, 3.0, 5));
  vec3 c = vec3(0.8) * (0.95 + tex * 0.06);
  c = mix(c, c * vec3(0.7, 0.66, 0.6), dirt * 0.5);
  s.albedo = c * (1.0 - scuff * 0.2);
  s.height = 0.5 + (tex - 0.5) * 0.12 - scuff * 0.05;
  s.rough = 0.45 + tex * 0.1 + dirt * 0.25 + scuff * 0.15;
}`, { normal: 0.8 }),

  frost: R('frost', 1.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  vec3 w = worley(uv, 36.0);
  float cryst = smoothstep(0.0, 0.3, w.y - w.x);
  float sparkle = step(0.97, h21(floor(uv * 512.0)));
  float n = fbm(uv, 8.0, 5);
  s.albedo = vec3(0.86, 0.9, 0.94) * (0.85 + cryst * 0.15);
  s.height = 0.4 + cryst * 0.3 + (n - 0.5) * 0.3;
  s.rough = 0.55 - sparkle * 0.4 - cryst * 0.1;
  s.ao = n; // frost coverage mask in AO channel of the frost set
}`, { normal: 2.0, cavity: 0 }),

  // shared data texture: R (ao) = dirt blotches, G (rough) = puddles, B (metal) = streaks
  grime: R('grime', 6.0, /* glsl */ `
void surface(vec2 uv, inout Surf s) {
  float dirt = warped(uv, 3.0, 6);
  float puddle = smoothstep(0.58, 0.66, warped(fract(uv + 0.23), 2.0, 6));
  float streak = streaks(uv, 24.0, 0.9);
  s.albedo = vec3(0.5);
  s.height = 0.5 + (fbm(uv, 32.0, 3) - 0.5) * 0.2;
  s.ao = dirt;
  s.rough = puddle;
  s.metal = streak;
}`, { normal: 0.5, cavity: 0 }),
};

// World size for uv generation.
export function recipeWorld(name) { return RECIPES[name]?.world ?? 1; }

export const RECIPE_COLOR = THREE.Color;
