import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// ------------------------------------------------------------ reflection probes
// A probe captures a zone as an HDR cube map, prefilters it (PMREM) and feeds
// it to that zone's materials, which parallax-correct it against the probe box.
// This doubles as cheap image-based "GI": lit lamps bleed soft light onto walls.
export class ReflectionProbe {
  constructor(renderer, { position, min, max, size = 128 }) {
    this.renderer = renderer;
    this.position = position.clone();
    this.min = min.clone();
    this.max = max.clone();
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cam = new THREE.CubeCamera(0.05, 60, this.cubeRT);
    this.cam.position.copy(this.position);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmremRT = null;
    this.texture = null;
    // placeholder until first capture so materials compile with an env map
    this.pmremRT = this.pmrem.fromScene(new THREE.Scene(), 0, 0.05, 1);
    this.texture = this.pmremRT.texture;
  }

  capture(scene, hide = []) {
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const bg = scene.background;
    scene.background = new THREE.Color(0x000000);
    this.cam.position.copy(this.position);
    this.cam.update(this.renderer, scene);
    scene.background = bg;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    this.pmrem.fromCubemap(this.cubeRT.texture, this.pmremRT);
    this.texture = this.pmremRT.texture;
  }

  dispose() {
    this.cubeRT.dispose();
    this.pmremRT?.dispose();
    this.pmrem.dispose();
  }
}

// ------------------------------------------------------------ baked vertex AO
// Ray-traced per-vertex ambient occlusion against the zone's static geometry.
const DIRS = (() => {
  const out = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    // cosine-weighted hemisphere, Fibonacci spiral
    const u = (i + 0.5) / n;
    const r = Math.sqrt(u);
    const phi = i * 2.399963;
    out.push(new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)));
  }
  return out;
})();

export async function bakeVertexAO(targets, occluders, { radius = 0.9, strength = 1.0, budget = 12, onProgress } = {}) {
  // occluders: array of BufferGeometry in world space (merged into one BVH)
  if (!occluders.length || !targets.length) return;
  const merged = mergeForBVH(occluders);
  const bvh = new MeshBVH(merged, { targetLeafSize: 12 });
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), p = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d = new THREE.Vector3();
  let total = 0, done = 0;
  for (const g of targets) total += g.attributes.position.count;
  let start = performance.now();
  for (const g of targets) {
    const pos = g.attributes.position, nor = g.attributes.normal;
    const ao = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(nor, i).normalize();
      p.fromBufferAttribute(pos, i).addScaledVector(n, 0.012);
      // tangent frame
      t1.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
      t2.crossVectors(n, t1);
      let occ = 0;
      for (const dir of DIRS) {
        d.set(0, 0, 0).addScaledVector(t1, dir.x).addScaledVector(t2, dir.y).addScaledVector(n, dir.z);
        ray.set(p, d);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, radius);
        if (hit) occ += 1 - hit.distance / radius;
      }
      ao[i] = Math.max(0.12, 1 - (occ / DIRS.length) * 1.6 * strength);
      done++;
      if (performance.now() - start > budget) {
        onProgress?.(done / total);
        await new Promise((r) => setTimeout(r, 0));
        start = performance.now();
      }
    }
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  }
  merged.dispose();
  onProgress?.(1);
}

export function setFlatAO(geometry, v = 1) {
  const ao = new Float32Array(geometry.attributes.position.count).fill(v);
  geometry.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}

function mergeForBVH(list) {
  let count = 0;
  for (const g of list) count += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(count * 3);
  let o = 0;
  const v = new THREE.Vector3();
  for (const g of list) {
    const pa = g.attributes.position;
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) { v.fromBufferAttribute(pa, idx[i]); pos[o++] = v.x; pos[o++] = v.y; pos[o++] = v.z; }
    } else {
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); pos[o++] = v.x; pos[o++] = v.y; pos[o++] = v.z; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geo;
}
