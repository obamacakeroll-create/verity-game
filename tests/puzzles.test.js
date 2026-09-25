import { describe, it, expect } from 'vitest';
import {
  checkSafe, defaultGrid, gridLoad, flipBreaker, gridSolved, makeRoute, runSorter, routeText,
  makeValves, checkValves, falsityValves, verityLieValves, falsityAnswer, valveText,
} from '../src/ii/story/puzzles.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('safe', () => {
  it('opens only on Vera\'s birthday', () => {
    expect(checkSafe('0312')).toBe(true);
    expect(checkSafe('1203')).toBe(false);
    expect(checkSafe('6666')).toBe(false);
  });
});

describe('distribution board', () => {
  it('starts overloaded if the lift is switched on straight away', () => {
    const g = defaultGrid();
    expect(gridLoad(g)).toBe(95);
    const r = flipBreaker(g, 'elevator');
    expect(r.tripped).toBe(true);
    expect(r.grid.every((b) => !b.on)).toBe(true);
    expect(gridSolved(r.grid)).toBe(false);
  });
  it('is solved by shedding the printer banks first', () => {
    let g = defaultGrid();
    g = flipBreaker(g, 'printA').grid;
    g = flipBreaker(g, 'printB').grid;
    const r = flipBreaker(g, 'elevator');
    expect(r.tripped).toBe(false);
    expect(gridLoad(r.grid)).toBe(90);
    expect(gridSolved(r.grid)).toBe(true);
  });
  it('needs MAIN on', () => {
    let g = flipBreaker(defaultGrid(), 'elevator').grid; // trips: all off
    g = flipBreaker(g, 'elevator').grid;
    expect(gridSolved(g)).toBe(false);
    g = flipBreaker(g, 'main').grid;
    expect(gridSolved(g)).toBe(true);
  });
});

describe('sorter routing', () => {
  it('never generates the all-right default', () => {
    for (let i = 0; i < 50; i++) expect(makeRoute().every((x) => x === 'R')).toBe(false);
    expect(makeRoute(seq([0.9, 0.9, 0.9, 0.1]))).toContain('L');
  });
  it('diverts at the first wrong lever', () => {
    const route = ['L', 'R', 'L'];
    expect(runSorter(['L', 'R', 'L'], route)).toBe(-1);
    expect(runSorter(['R', 'R', 'L'], route)).toBe(0);
    expect(runSorter(['L', 'L', 'L'], route)).toBe(1);
    expect(runSorter(['L', 'R', 'R'], route)).toBe(2);
    expect(routeText(route)).toBe('LEFT · RIGHT · LEFT');
  });
});

describe('valves and F-01', () => {
  it('generates a non-trivial order', () => {
    for (let i = 0; i < 30; i++) {
      const v = makeValves();
      expect([...v].sort()).toEqual([1, 2, 3]);
      expect(v).not.toEqual([1, 2, 3]);
    }
  });
  it('F-01 always gives the reverse; Verity\'s lie is a third, different order', () => {
    for (const truth of [[1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
      const f = falsityValves(truth);
      expect(checkValves(f, truth)).toBe(false);
      expect([...f].reverse()).toEqual(truth);
      const lie = verityLieValves(truth);
      expect(checkValves(lie, truth)).toBe(false);
      expect(checkValves(lie, f)).toBe(false);
    }
  });
  it('answers valve questions with the reversed order', () => {
    const a = falsityAnswer('what order do the valves go in?', { valves: [2, 3, 1] });
    expect(a.topic).toBe('valves');
    expect(a.text).toContain(valveText([1, 3, 2]));
  });
  it('lies about everything else too', () => {
    expect(falsityAnswer('are you lying?').text).toMatch(/never told a lie/);
    expect(falsityAnswer('what is 2+2').text).toMatch(/Five/);
    expect(falsityAnswer('where is vera').text).toMatch(/not in the Core/);
  });
});
