// Word lists and text normalisation for Verity's brain.

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

export function normalize(text, leet = false) {
  let s = String(text || '').toLowerCase();
  s = s.replace(/[’`]/g, "'");
  // de-leet only inside words that are mostly letters ("st0p1d", "b!tch")
  if (leet) {
    s = s.replace(/[\w@$!]+/g, (w) => {
      const letters = w.replace(/[^a-z]/g, '').length;
      return letters >= 2 && letters >= w.length / 2 ? w.replace(/[013457@$!]/g, (c) => LEET[c] || c) : w;
    });
  }
  s = s.replace(/(.)\1{2,}/g, '$1$1'); // "stuuuupid" -> "stuupid"
  return s.replace(/\s+/g, ' ').trim();
}

export function tokens(text, leet = false) {
  return normalize(text, leet).replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// Collapse doubled letters too, for fuzzy matching of stretched words.
const squash = (w) => w.replace(/(.)\1+/g, '$1');

export const INSULTS = [
  'stupid', 'dumb', 'idiot', 'idiotic', 'moron', 'ugly', 'creepy', 'weird', 'freak', 'freaky', 'useless', 'annoying',
  'loser', 'trash', 'garbage', 'worthless', 'pathetic', 'lame', 'gross', 'disgusting', 'fake', 'liar', 'lying',
  'retard', 'retarded', 'dork', 'nerd', 'clown', 'fat', 'noob', 'pointless', 'broken', 'evil', 'demon', 'monster',
  'psycho', 'crazy', 'insane', 'dummy', 'imbecile', 'buffoon', 'toy', 'cringe', 'mid', 'bozo', 'simp', 'rat',
  'stoopid', 'weirdo', 'jerk', 'scum', 'filth', 'dimwit', 'halfwit', 'brainless', 'clueless',
];
export const PROFANITY = [
  'fuck', 'fucking', 'fucker', 'fck', 'fk', 'fuk', 'shit', 'shitty', 'bitch', 'bastard', 'ass', 'asshole', 'damn',
  'crap', 'dick', 'prick', 'cunt', 'wtf', 'stfu', 'piss', 'bullshit', 'hell', 'motherfucker', 'mf', 'twat', 'wanker',
];
export const HOSTILE_PHRASES = [
  /\bshut (the \w+ )?up\b/, /\bgo away\b/, /\bleave me alone\b/, /\bget lost\b/, /\bi hate you\b/, /\bhate you\b/,
  /\byou suck\b/, /\bno one likes you\b/, /\bnobody likes you\b/, /\bnot my friend\b/, /\byou('re| are) not real\b/,
  /\bdrop dead\b/, /\bgo die\b/, /\bkys\b/, /\bscrew you\b/, /\bbite me\b/, /\bget out of my\b/,
  /\byou('re| are) (so )?(bad|terrible|awful|the worst)\b/, /\bl ?o ?l you\b/, /\bcry about it\b/,
  /\bwho asked\b/, /\bnobody asked\b/, /\bdon'?t care\b/, /\bpiece of\b/, /\byour mom\b/, /\bur mom\b/,
];
export const THREATS = [
  /\b(kill|destroy|smash|break|crush|burn|pop|delete|stab|kick|throw|hit|punch|murder|end|melt|shoot|bin|trash) (you|u|verity|it)\b/,
  /\bi('ll| will| am going to|'m gonna| gonna) (kill|destroy|smash|break|burn|pop|delete|end|throw|hurt)\b/,
  /\b(throw|put) you (away|in the trash|out)\b/,
];
export const KIND = [
  /\bthank(s| you)\b/, /\bty\b/, /\bplease\b/, /\bi love you\b/, /\blove you\b/, /\bi like you\b/, /\byou('re| are) (so )?(nice|kind|cute|sweet|great|amazing|awesome|smart|cool|the best|my friend|helpful|good)\b/,
  /\bgood (job|boy|girl|ball|friend)\b/, /\bsorry\b/, /\bmy (best )?friend\b/, /\bwell done\b/, /\bappreciate\b/,
  /\bhave a (good|nice) (day|night)\b/, /\byou('re| are) welcome\b/, /\bbless you\b/, /\bcute\b/,
];
export const APOLOGY = /\b(sorry|i apologi[sz]e|my bad|forgive me|i didn'?t mean)\b/;

const STRONG = ['fuck', 'fuk', 'shit', 'bitch', 'cunt'];
const NEGATORS = new Set(['not', "isn't", 'isnt', "aren't", 'arent', 'never', 'no', "don't", 'dont', "wasn't"]);

// Returns { score, words[], shouting } where score > 0 means rude.
export function rudeness(text) {
  const raw = String(text || '');
  const norm = normalize(raw, true);
  const toks = tokens(raw, true);
  const words = [];
  let score = 0;
  toks.forEach((t, i) => {
    const sq = squash(t.replace(/'s$/, ''));
    const hitInsult = INSULTS.some((w) => sq === squash(w) || (w.length > 4 && sq.startsWith(squash(w))));
    const hitProf = PROFANITY.some((w) => sq === squash(w)) || STRONG.some((w) => sq.includes(w));
    if (!hitInsult && !hitProf) return;
    // "you're not stupid"
    const prev = toks.slice(Math.max(0, i - 2), i);
    if (hitInsult && prev.some((p) => NEGATORS.has(p))) return;
    // "is it weird that..." about something else: only count insults aimed at Verity or bare
    if (hitInsult && ['evil', 'demon', 'monster', 'broken', 'crazy', 'insane', 'weird', 'creepy'].includes(t)) {
      const aimed = /\b(you|u|ur|you're|youre|verity|this thing|it's|its)\b/.test(norm) || toks.length <= 2;
      const asking = /^(is|are|r|am|what|why|how|who|do|does|can|will)\b/.test(norm) || /\b(are|r) (you|u)\b/.test(norm);
      if (!aimed || asking) return;
      score += 0.8;
    } else {
      score += hitProf ? 0.9 : 1;
    }
    words.push(t);
  });
  for (const re of HOSTILE_PHRASES) if (re.test(norm)) { score += 1.2; words.push(norm.match(re)[0]); }
  for (const re of THREATS) if (re.test(norm)) { score += 1.8; words.push(norm.match(re)[0]); }
  const letters = raw.replace(/[^A-Za-z]/g, '');
  const caps = letters.replace(/[^A-Z]/g, '').length;
  const shouting = letters.length >= 6 && caps / letters.length > 0.7;
  if (shouting) score += score > 0 ? 0.8 : 0.5;
  if (/!{3,}/.test(raw) && score > 0) score += 0.3;
  return { score, words, shouting };
}

export function kindness(text) {
  const norm = normalize(text);
  let score = 0;
  for (const re of KIND) if (re.test(norm)) score += 1;
  return score;
}

// Token-set similarity for repeated-question detection.
export function similarity(a, b) {
  const A = new Set(tokens(a).filter((t) => t.length > 1));
  const B = new Set(tokens(b).filter((t) => t.length > 1));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
