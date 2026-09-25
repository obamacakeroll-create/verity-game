import { describe, it, expect } from 'vitest';
import { BrainII, stageFor } from '../src/ii/ai/BrainII.js';

const mk = (o = {}) => new BrainII({ seed: 3, now: () => new Date(2026, 8, 24, 3, 0), ...o });
const ctx = (ins = 10, story = {}, extra = {}) => ({ insanity: ins, objective: 'talk', chapter: 2, flags: {}, story, ...extra });

describe('BrainII', () => {
  it('answers about Vera and flags it', () => {
    const r = mk().respond('Who is Vera?', ctx());
    expect(r.flags.askedVera).toBe(true);
    expect(r.text.length).toBeGreaterThan(5);
  });

  it('only releases at the Core, with her name, when ready', () => {
    const b = mk();
    const early = b.respond('Vera, you can stop now', ctx(20, { atCore: false }));
    expect(early.flags.release).toBeFalsy();
    const unnamed = mk().respond('you can stop now', ctx(20, { atCore: true, releaseReady: true }));
    expect(unnamed.flags.release).toBeFalsy();
    const notReady = mk().respond('Vera, you can stop now', ctx(20, { atCore: true, releaseReady: false }));
    expect(notReady.flags.release).toBeFalsy();
    const ok = mk().respond('Vera, you can stop now', ctx(20, { atCore: true, releaseReady: true }));
    expect(ok.flags.release).toBe(true);
    expect(ok.delta).toBeLessThan(0);
  });

  it('fills hint placeholders from the story', () => {
    const b = mk();
    const r = b.respond('what should I do now?', { ...ctx(5), objective: 'divert', story: { route: 'LEFT · LEFT · RIGHT' } });
    expect(r.text).toContain('LEFT · LEFT · RIGHT');
    const s = mk().respond('what do I do?', { ...ctx(5), objective: 'safe' });
    expect(s.text).toContain('0312');
  });

  it('lies about hints once she is angry', () => {
    let lies = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = mk({ seed }).respond('what should I do?', { ...ctx(90), objective: 'safe' });
      if (!r.text.includes('0312')) { lies++; expect(r.flags.lie).toBe(true); }
    }
    expect(lies).toBeGreaterThan(0);
  });

  it('remembers part one', () => {
    const b = mk({ memories: { played: true, endings: ['sender'], name: 'Sam' } });
    expect(b.greetingLine()).toMatch(/I know you/);
    const r = b.respond('go back in your box', ctx(10));
    expect(r.text).toMatch(/last time/i);
  });

  it('gets angry at rudeness', () => {
    const r = mk().respond('you are a stupid ugly ball', ctx(10));
    expect(r.rude).toBeTruthy();
    expect(r.delta).toBeGreaterThan(0);
  });

  it('snapshots and restores memory', () => {
    const b = mk();
    b.respond('my name is Robin', ctx());
    const snap = b.snapshot();
    const b2 = mk();
    b2.restore(snap);
    expect(b2.memory.name).toBe(snap.name);
    expect(stageFor(50)).toBeGreaterThan(0);
  });
});
