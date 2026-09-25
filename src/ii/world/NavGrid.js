// Grid navigation built automatically from the level's colliders.
// A* on an 8-connected grid (no corner cutting) + line-of-sight smoothing.
// Separate layers for separate floors (basement etc.).

export class NavGrid {
  constructor(colliders, bounds, { cell = 0.4, radius = 0.34, layers = null } = {}) {
    this.cell = cell;
    this.radius = radius;
    this.minX = Math.floor(bounds.minX - 1);
    this.minZ = Math.floor(bounds.minZ - 1);
    this.w = Math.ceil((bounds.maxX + 1 - this.minX) / cell);
    this.h = Math.ceil((bounds.maxZ + 1 - this.minZ) / cell);
    this.layers = new Map();
    const ls = layers || [...new Set(colliders.map((c) => c.layer ?? 0).concat([0]))];
    for (const l of ls) this.layers.set(l, this.buildLayer(colliders.filter((c) => (c.layer ?? 0) === l && !c.nonav && !c.tag?.startsWith('door'))));
  }

  buildLayer(cols) {
    const g = new Uint8Array(this.w * this.h); // 0 free, 1 blocked
    const r = this.radius;
    for (const c of cols) {
      const x0 = Math.max(0, Math.floor((c.minX - r - this.minX) / this.cell));
      const x1 = Math.min(this.w - 1, Math.floor((c.maxX + r - this.minX) / this.cell));
      const z0 = Math.max(0, Math.floor((c.minZ - r - this.minZ) / this.cell));
      const z1 = Math.min(this.h - 1, Math.floor((c.maxZ + r - this.minZ) / this.cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        // centre test for accuracy
        const cx = this.minX + (x + 0.5) * this.cell, cz = this.minZ + (z + 0.5) * this.cell;
        if (cx > c.minX - r && cx < c.maxX + r && cz > c.minZ - r && cz < c.maxZ + r) g[z * this.w + x] = 1;
      }
    }
    return g;
  }

  // mark walkable region explicitly (e.g. only inside the level footprint)
  toCell(x, z) { return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)]; }
  toWorld(cx, cz) { return [this.minX + (cx + 0.5) * this.cell, this.minZ + (cz + 0.5) * this.cell]; }

  blocked(layer, cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    const g = this.layers.get(layer);
    return !g || g[cz * this.w + cx] === 1;
  }

  nearestFree(layer, cx, cz, maxR = 6) {
    if (!this.blocked(layer, cx, cz)) return [cx, cz];
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!this.blocked(layer, cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
    return null;
  }

  // Returns [{x, z}] world waypoints (excluding start), or [] if unreachable.
  find(layer, sx, sz, tx, tz, { maxIter = 30000 } = {}) {
    const s0 = this.toCell(sx, sz), t0 = this.toCell(tx, tz);
    const s = this.nearestFree(layer, s0[0], s0[1]);
    const t = this.nearestFree(layer, t0[0], t0[1]);
    if (!s || !t) return [];
    const W = this.w;
    const start = s[1] * W + s[0], goal = t[1] * W + t[0];
    if (start === goal) return [{ x: tx, z: tz }];
    const N = W * this.h;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    gScore[start] = 0;
    const hfn = (i) => {
      const x = i % W, z = (i / W) | 0;
      const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    heap.push(start, hfn(start));
    let iter = 0;
    while (heap.size && iter++ < maxIter) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (this.blocked(layer, nx, nz)) continue;
        if (dx && dz && (this.blocked(layer, cx + dx, cz) || this.blocked(layer, cx, cz + dz))) continue;
        const ni = nz * W + nx;
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dx && dz ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
    if (came[goal] === -1) return [];
    const cells = [];
    for (let c = goal; c !== start && c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // string-pull
    const pts = cells.map((c) => this.toWorld(c % W, (c / W) | 0));
    const out = [];
    let anchor = [sx, sz];
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(layer, anchor[0], anchor[1], pts[j][0], pts[j][1])) j--;
      out.push({ x: pts[j][0], z: pts[j][1] });
      anchor = pts[j];
      i = j + 1;
    }
    if (out.length) { out[out.length - 1] = { x: tx, z: tz }; }
    return out;
  }

  // grid line-of-sight (walkable straight line)
  clear(layer, ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const c = this.toCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (this.blocked(layer, c[0], c[1])) return false;
    }
    return true;
  }

  randomFree(layer, rng = Math.random, near = null, radius = 8) {
    for (let k = 0; k < 200; k++) {
      let x, z;
      if (near) { x = near.x + (rng() * 2 - 1) * radius; z = near.z + (rng() * 2 - 1) * radius; }
      else { x = this.minX + rng() * this.w * this.cell; z = this.minZ + rng() * this.h * this.cell; }
      const c = this.toCell(x, z);
      if (!this.blocked(layer, c[0], c[1])) return { x, z };
    }
    return null;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p;
    K.push(k); P.push(p);
    let i = K.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (P[pa] <= P[i]) break;
      [K[pa], K[i]] = [K[i], K[pa]]; [P[pa], P[i]] = [P[i], P[pa]];
      i = pa;
    }
  }
  pop() {
    const K = this.k, P = this.p;
    const top = K[0];
    const lk = K.pop(), lp = P.pop();
    if (K.length) {
      K[0] = lk; P[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < K.length && P[l] < P[m]) m = l;
        if (r < K.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [P[m], P[i]] = [P[i], P[m]];
        i = m;
      }
    }
    return top;
  }
}
