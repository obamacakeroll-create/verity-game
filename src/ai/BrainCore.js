import { normalize, tokens, rudeness, kindness, similarity, APOLOGY } from './lexicon.js';
import { makeRng } from '../core/util.js';

// Verity's offline conversational engine (shared by both games).
// normalize → rudeness → intent match → stage-flavoured answer → insanity delta.
// A "profile" supplies the intents, hint table and line pools for each game.

export const STAGE_THRESHOLDS = [0, 15, 30, 45, 60, 75, 88];
export function stageFor(insanity) {
  let s = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) if (insanity >= STAGE_THRESHOLDS[i]) s = i;
  return s;
}
// tone groups: 0 sweet, 1 odd, 2 dark, 3 hostile
export function toneFor(stage) {
  return stage <= 1 ? 0 : stage <= 3 ? 1 : stage <= 5 ? 2 : 3;
}

export const DELTA = { ask: 3, repeat: 6, pry: 8, rudeMin: 18, rudeMax: 30, kind: -2, apology: -4 };

// ---------------------------------------------------------------- math
const WORD_OPS = [
  [/\bmultiplied by\b|\btimes\b|(?<=\d\s*)x(?=\s*\d)/g, '*'], [/\bdivided by\b|\bover\b/g, '/'], [/\bplus\b|\band\b(?=\s*\d)/g, '+'],
  [/\bminus\b|\bsubtract\b/g, '-'], [/\bto the power of\b|\bpower\b/g, '^'], [/\bsquared\b/g, '^2'], [/\bcubed\b/g, '^3'],
  [/×/g, '*'], [/÷/g, '/'],
];
const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, hundred: 100 };

export function extractMath(text) {
  let s = normalize(text);
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred)\b/g, (w) => String(NUMBER_WORDS[w]));
  s = s.replace(/\bsquare root of\s*(\d+(\.\d+)?)/g, 'sqrt($1)');
  for (const [re, op] of WORD_OPS) s = s.replace(re, op);
  const m = s.match(/(sqrt\()?[-(]*\s*\d[\d\s.+\-*/^()sqrt]*[\d)]/g);
  if (!m) return null;
  const expr = m.sort((a, b) => b.length - a.length)[0].trim();
  if (!/[+\-*/^]|sqrt/.test(expr.replace(/^-/, ''))) return null;
  return expr;
}

export function evalMath(expr) {
  let i = 0;
  const src = expr.replace(/\s+/g, '');
  const peek = () => src[i];
  const num = () => {
    if (src.startsWith('sqrt(', i)) {
      i += 5;
      const v = add();
      if (peek() === ')') i++;
      return Math.sqrt(v);
    }
    if (peek() === '(') { i++; const v = add(); if (peek() === ')') i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    const st = i;
    while (i < src.length && /[\d.]/.test(src[i])) i++;
    if (st === i) throw new Error('bad');
    return parseFloat(src.slice(st, i));
  };
  const pow = () => { let b = num(); while (peek() === '^') { i++; b = Math.pow(b, num()); } return b; };
  const mul = () => {
    let v = pow();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = pow();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function add() {
    let v = mul();
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = mul(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  const v = add();
  if (i < src.length) throw new Error('trailing');
  if (!isFinite(v)) throw new Error('inf');
  return Math.round(v * 1e6) / 1e6;
}

// ---------------------------------------------------------------- helpers
export function fmtTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------- intent registry
// Each: id, re (array of regex), handler: [sweet, odd, dark, hostile] or fn(c, match) → string | {text, flags, delta}
export function intentRegistry() {
  const list = [];
  const intent = (id, re, handler, opts = {}) => list.push({ id, re: Array.isArray(re) ? re : [re], handler, ...opts });
  return { list, intent };
}

// ---------------------------------------------------------------- engine
export class BrainCore {
  // profile: { intents, hints, lines: { rude, repeat, fallbackQ, fallbackS, kind, apology, ambient, empty, divZero },
  //            mathSpecial(compactExpr, tone) → string|null, ambientExtra(brain, tone) → string[] }
  constructor({ seed = Date.now(), now = () => new Date(), ngPlus = false, lastRun = null, userAgent } = {}, profile) {
    this.profile = profile;
    this.rng = makeRng(seed >>> 0);
    this.now = now;
    this.ngPlus = ngPlus;
    this.lastRun = lastRun;
    this.userAgent = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    this.memory = { name: '', history: [], rudeCount: 0, kindCount: 0, lastInsult: '', recent: [], apologised: 0, questions: 0, topics: {} };
  }

  device() {
    const ua = this.userAgent;
    if (/iphone|ipad/i.test(ua)) return 'phone. An iPhone. I can see your fingers';
    if (/android/i.test(ua)) return 'phone';
    if (/mac os/i.test(ua)) return 'Mac';
    if (/windows/i.test(ua)) return 'Windows computer';
    if (/linux/i.test(ua)) return 'Linux computer';
    return 'computer';
  }

  pick(lines) {
    if (!Array.isArray(lines)) return lines;
    const fresh = lines.filter((l) => !this.memory.recent.includes(l));
    const choice = this.rng.pick(fresh.length ? fresh : lines);
    this.memory.recent.push(choice);
    if (this.memory.recent.length > 14) this.memory.recent.shift();
    return choice;
  }

  hintFor(objective, stage) {
    const hints = this.profile.hints;
    const h = hints[objective] || hints.talk;
    // she lies when she's angry
    if (stage >= 5 && this.rng() < 0.55) return { text: h.lie, flags: { lie: true, hint: objective } };
    let text = h.truth;
    if (stage >= 3) text = text.replace(/You\'re welcome!|I\'ll be right behind you\./g, '').trim() + ' Now stop asking.';
    return { text, flags: { hint: objective } };
  }

  // ctx: { insanity, objective, transformed, hard, ... }
  respond(input, ctx = {}) {
    const P = this.profile, L = P.lines;
    const raw = String(input || '').trim();
    const ins = ctx.insanity || 0;
    const stage = stageFor(ins);
    const tone = toneFor(stage);
    const norm = normalize(raw).replace(/[?.!]+$/g, '').trim();
    const mem = this.memory;
    const out = { text: '', delta: DELTA.ask, rude: false, kind: false, intent: 'fallback', flags: {} };
    mem.questions++;

    if (!norm || norm.replace(/[^a-z0-9]/g, '').length === 0) {
      out.text = this.pick(L.empty[tone]);
      out.delta = 1;
      out.intent = 'empty';
      return this.finish(out, raw, ctx);
    }

    // repetition
    const repeated = mem.history.slice(-8).some((h) => similarity(h, raw) > 0.72);

    // rudeness first — it colours everything
    const rude = rudeness(raw);
    if (rude.score > 0) {
      mem.rudeCount++;
      out.rude = true;
      out.intent = 'rude';
      out.delta = Math.round(Math.min(DELTA.rudeMax, DELTA.rudeMin + (rude.score - 1) * 6));
      const word = rude.words[0] || '';
      let line = this.pick(L.rude[Math.min(3, Math.max(tone, mem.rudeCount >= 3 ? 1 : 0))]);
      if (mem.lastInsult && mem.rudeCount >= 2 && this.rng() < 0.5) {
        line = tone >= 3 ? `FIRST "${mem.lastInsult.toUpperCase()}". NOW THIS.` : `First you said "${mem.lastInsult}". Now this. I remember everything.`;
      }
      mem.lastInsult = word;
      out.text = line;
      return this.finish(out, raw, ctx);
    }

    // apology
    if (APOLOGY.test(norm) && mem.rudeCount > mem.apologised) {
      mem.apologised++;
      out.intent = 'apology';
      out.kind = true;
      out.delta = DELTA.apology;
      out.text = this.pick(L.apology[tone]);
      return this.finish(out, raw, ctx);
    }

    // math
    const expr = extractMath(norm);
    if (expr) {
      out.intent = 'math';
      try {
        const v = evalMath(expr);
        const shown = expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\s+/g, ' ').trim();
        const special = P.mathSpecial?.(expr.replace(/\s/g, ''), tone, v);
        out.text = special || [`${shown} = ${v}. Too easy! Ask me something harder!`, `${v}. Obviously.`, `${v}. You don't need maths where you're going.`, `${v}. COUNT THE DAYS YOU HAVE LEFT.`][tone];
      } catch (e) {
        out.text = e.message === 'div0' ? L.divZero[tone] : this.pick(L.fallbackQ[tone]);
      }
      if (repeated) out.delta = DELTA.repeat;
      return this.finish(out, raw, ctx);
    }

    // intents
    const kindScore = kindness(raw);
    for (const it of P.intents) {
      let m = null;
      for (const re of it.re) { m = norm.match(re); if (m) break; }
      if (!m) continue;
      const c = { ctx, norm, raw, tone, stage, brain: this, rng: this.rng, hint: (o) => this.hintFor(o, stage) };
      let res = typeof it.handler === 'function' ? it.handler(c, m) : it.handler;
      if (res == null) continue;
      if (Array.isArray(res) && res.length === 4 && res.every((x) => typeof x === 'string')) res = res[tone];
      if (typeof res === 'string') res = { text: res };
      if (Array.isArray(res.text) && res.text.length === 4) res.text = res.text[tone];
      if (Array.isArray(res.text)) res.text = this.pick(res.text);
      out.intent = it.id;
      out.text = res.text;
      Object.assign(out.flags, res.flags || {});
      mem.topics[it.id] = (mem.topics[it.id] || 0) + 1;
      out.delta = res.delta ?? (it.pry ? DELTA.pry : DELTA.ask);
      if ((it.kindLike || kindScore > 0) && !it.pry) { out.kind = kindScore > 0; out.delta = Math.min(out.delta, kindScore > 0 ? 1 : out.delta); }
      if (repeated && out.delta < DELTA.repeat && res.delta == null) {
        out.delta = DELTA.repeat;
        if (stage >= 2 && this.rng() < 0.5) out.text = this.pick(L.repeat[tone]) + ' ' + out.text;
      }
      return this.finish(out, raw, ctx);
    }

    // pure kindness
    if (kindScore > 0) {
      mem.kindCount++;
      out.intent = 'kind';
      out.kind = true;
      out.delta = DELTA.kind;
      out.text = this.pick(L.kind[tone]);
      return this.finish(out, raw, ctx);
    }

    // fallback
    const isQ = /\?$/.test(raw) || /^(what|why|how|who|where|when|which|can|could|do|does|did|is|are|am|will|would|should|have|has)\b/.test(norm);
    out.text = this.pick((isQ ? L.fallbackQ : L.fallbackS)[tone]);
    out.delta = repeated ? DELTA.repeat : isQ ? DELTA.ask : 2;
    if (repeated && stage >= 1) out.text = this.pick(L.repeat[tone]);
    return this.finish(out, raw, ctx);
  }

  finish(out, raw, ctx) {
    const mem = this.memory;
    mem.history.push(raw);
    if (mem.history.length > 40) mem.history.shift();
    if (ctx.hard && out.delta > 0) out.delta = Math.round(out.delta * 1.25);
    const n = mem.name || 'friend';
    out.text = String(out.text || '…').replace(/\{name\}/g, n);
    return out;
  }

  ambient(insanity) {
    const tone = toneFor(stageFor(insanity));
    let pool = this.profile.lines.ambient[tone];
    if (this.memory.lastInsult && tone >= 1 && this.rng() < 0.3) {
      return tone >= 3 ? `"${this.memory.lastInsult.toUpperCase()}." I HAVEN'T FORGOTTEN.` : `You called me "${this.memory.lastInsult}". I haven't forgotten.`;
    }
    const extra = this.profile.ambientExtra?.(this, tone);
    if (extra?.length) pool = pool.concat(extra);
    return this.pick(pool);
  }
}
