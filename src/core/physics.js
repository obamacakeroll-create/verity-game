// 2D (XZ) collision helpers: circles against axis-aligned boxes.

export function resolveCircle(pos, radius, colliders, ignoreTag = null) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of colliders) {
      if (!c.enabled) continue;
      if (ignoreTag && c.tag === ignoreTag) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // centre inside the box: push out along the smallest axis
          const l = pos.x - c.minX, r = c.maxX - pos.x, b = pos.z - c.minZ, f = c.maxZ - pos.z;
          const m = Math.min(l, r, b, f);
          if (m === l) pos.x = c.minX - radius;
          else if (m === r) pos.x = c.maxX + radius;
          else if (m === b) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos;
}

// Segment vs AABB (slab test) in XZ.
function segHitsBox(ax, az, bx, bz, c, pad = 0) {
  const minX = c.minX - pad, maxX = c.maxX + pad, minZ = c.minZ - pad, maxZ = c.maxZ + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dz, az - minZ) && clip(dz, maxZ - az) && t0 <= t1;
}

export function lineOfSight(ax, az, bx, bz, colliders, tags = ['wall']) {
  for (const c of colliders) {
    if (!c.enabled) continue;
    if (!tags.some((t) => c.tag === t || c.tag.startsWith(t))) continue;
    if (segHitsBox(ax, az, bx, bz, c)) return false;
  }
  return true;
}
