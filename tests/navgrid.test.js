import { describe, it, expect } from 'vitest';
import { NavGrid } from '../src/ii/world/NavGrid.js';

const wall = (x0, z0, x1, z1, extra = {}) => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1, tag: 'wall', layer: 0, ...extra });

describe('NavGrid', () => {
  const cols = [wall(4, -14, 4.3, 6)]; // a wall with a gap at the north end (z 6..10)
  const nav = new NavGrid(cols, { minX: 0, maxX: 10, minZ: -10, maxZ: 10 });

  it('finds a straight path in open space', () => {
    const p = nav.find(0, 1, -5, 1, 5);
    expect(p.length).toBeGreaterThan(0);
    const last = p[p.length - 1];
    expect(Math.hypot(last.x - 1, last.z - 5)).toBeLessThan(0.6);
  });

  it('routes around a wall through the gap', () => {
    const p = nav.find(0, 2, -5, 7, -5);
    expect(p.length).toBeGreaterThan(1);
    expect(Math.max(...p.map((w) => w.z))).toBeGreaterThan(6);
    // no waypoint inside the wall
    for (const w of p) expect(w.x > 3.9 && w.x < 4.4 && w.z < 6).toBe(false);
  });

  it('keeps layers separate and ignores doors', () => {
    const n2 = new NavGrid([wall(0, 0, 10, 0.3, { layer: -1 }), wall(0, 3, 10, 3.3, { tag: 'door:x' })], { minX: 0, maxX: 10, minZ: -5, maxZ: 5 });
    expect(n2.blocked(0, ...n2.toCell(5, 0.15))).toBe(false);
    expect(n2.blocked(-1, ...n2.toCell(5, 0.15))).toBe(true);
    expect(n2.blocked(0, ...n2.toCell(5, 3.15))).toBe(false);
  });

  it('returns [] when unreachable', () => {
    const box = [wall(4, 4, 6, 4.2), wall(4, 5.8, 6, 6), wall(4, 4, 4.2, 6), wall(5.8, 4, 6, 6)];
    const n3 = new NavGrid(box, { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, { radius: 0.2 });
    expect(n3.find(0, 1, 1, 5, 5)).toEqual([]);
  });

  it('picks random free cells near a point', () => {
    let s = 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      const pt = nav.randomFree(0, rng, { x: 2, z: 0 }, 3);
      expect(pt).toBeTruthy();
      expect(nav.blocked(0, ...nav.toCell(pt.x, pt.z))).toBe(false);
    }
  });
});
