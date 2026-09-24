import { describe, it, expect } from 'vitest';
import { VerityBrain, stageFor, extractMath, evalMath, DELTA } from '../src/ai/VerityBrain.js';
import { rudeness, kindness, similarity } from '../src/ai/lexicon.js';

const brain = (opts = {}) => new VerityBrain({ seed: 1, now: () => new Date(2026, 8, 24, 15, 4), userAgent: 'Windows', ...opts });

describe('stages', () => {
  it('maps insanity to face stages', () => {
    expect(stageFor(0)).toBe(0);
    expect(stageFor(14)).toBe(0);
    expect(stageFor(15)).toBe(1);
    expect(stageFor(59)).toBe(3);
    expect(stageFor(88)).toBe(6);
    expect(stageFor(100)).toBe(6);
  });
});

describe('rudeness', () => {
  it('detects insults, profanity, threats and shouting', () => {
    expect(rudeness('you are stupid').score).toBeGreaterThan(0);
    expect(rudeness('st00pid ball').score).toBeGreaterThan(0);
    expect(rudeness('shut up').score).toBeGreaterThan(0);
    expect(rudeness('I will smash you').score).toBeGreaterThan(1);
    expect(rudeness('YOU ARE SO DUMB').score).toBeGreaterThan(rudeness('you are so dumb').score);
  });
  it('does not flag innocent questions', () => {
    for (const t of ['hello', 'what is the capital of France?', 'are you evil?', 'is the light broken', 'where is the fuse box', "you're not stupid", 'will I die?', 'what is 2+2', 'scrap metal', 'what the class is']) {
      expect(rudeness(t).score, t).toBe(0);
    }
  });
  it('recognises kindness', () => {
    expect(kindness('thank you verity')).toBeGreaterThan(0);
    expect(kindness('you are so nice')).toBeGreaterThan(0);
  });
  it('similarity catches repeats', () => {
    expect(similarity('where is the fuse box', 'where is the fuse box?')).toBeGreaterThan(0.9);
    expect(similarity('where is the fuse box', 'tell me a joke')).toBeLessThan(0.2);
  });
});

describe('math', () => {
  it('parses and evaluates safely', () => {
    expect(evalMath(extractMath('what is 2+2'))).toBe(4);
    expect(evalMath(extractMath('what is 12 times 3'))).toBe(36);
    expect(evalMath(extractMath('whats (3+4)*2 - 1'))).toBe(13);
    expect(evalMath(extractMath('square root of 81'))).toBe(9);
    expect(evalMath(extractMath('two plus two'))).toBe(4);
    expect(evalMath(extractMath('3x4'))).toBe(12);
    expect(() => evalMath('5/0')).toThrow();
    expect(extractMath('I have 2 questions')).toBeNull();
  });
});

describe('VerityBrain.respond', () => {
  it('answers questions with a small insanity increase', () => {
    const b = brain();
    const r = b.respond('what is 2+2', { insanity: 0, objective: 'talk' });
    expect(r.text).toMatch(/four/i);
    expect(r.delta).toBe(DELTA.ask);
    expect(r.rude).toBe(false);
  });
  it('rude questions raise insanity a lot', () => {
    const b = brain();
    const r = b.respond('shut up you stupid ball', { insanity: 0 });
    expect(r.rude).toBe(true);
    expect(r.delta).toBeGreaterThanOrEqual(DELTA.rudeMin);
    expect(r.delta).toBeLessThanOrEqual(DELTA.rudeMax);
  });
  it('remembers repeated questions', () => {
    const b = brain();
    b.respond('tell me a joke', { insanity: 0 });
    const r = b.respond('tell me a joke', { insanity: 0 });
    expect(r.delta).toBe(DELTA.repeat);
  });
  it('prying questions cost more', () => {
    const b = brain();
    const r = b.respond('what are you really?', { insanity: 0 });
    expect(r.delta).toBe(DELTA.pry);
  });
  it('kindness can lower insanity', () => {
    const b = brain();
    const r = b.respond('thank you, you are so nice', { insanity: 20 });
    expect(r.delta).toBeLessThanOrEqual(0);
  });
  it('knows capitals, time, and its name', () => {
    const b = brain();
    expect(b.respond('what is the capital of japan?', { insanity: 0 }).text).toMatch(/Tokyo/);
    expect(b.respond('what time is it', { insanity: 0 }).text).toMatch(/3:04 PM/);
    expect(b.respond('who are you', { insanity: 0 }).text).toMatch(/Verity/);
  });
  it('remembers your name', () => {
    const b = brain();
    b.respond('my name is sam', { insanity: 0 });
    expect(b.respond("what's my name?", { insanity: 0 }).text).toMatch(/Sam/);
  });
  it('gives objective hints and can lie when unstable', () => {
    const b = brain();
    expect(b.respond('where is the fuse box?', { insanity: 0, objective: 'power' }).text).toMatch(/bedroom/i);
    let lied = false;
    for (let i = 0; i < 20; i++) {
      const r = b.respond(`what do i do now ${i}`, { insanity: 80, objective: 'power' });
      if (r.flags.lie) lied = true;
    }
    expect(lied).toBe(true);
  });
  it('recognises the box command and promises', () => {
    const b = brain();
    expect(b.respond('go back in your box', { insanity: 100, transformed: true }).flags.boxCommand).toBe(true);
    expect(b.respond('I promise I will stay forever', { insanity: 10 }).flags.promise).toBe(true);
  });
  it('always produces text', () => {
    const b = brain();
    for (const t of ['', '???', 'asdkjh', 'why is the sky blue', 'Falsity', 'knock knock', 'bye']) {
      for (const ins of [0, 40, 70, 95]) expect(b.respond(t, { insanity: ins }).text.length).toBeGreaterThan(0);
    }
  });
});
