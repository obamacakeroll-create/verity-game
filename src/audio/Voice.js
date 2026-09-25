import { distortionCurve } from './Sfx.js';

// Verity's voice. Browser speech synthesis (pitched per stage) with a
// Web Audio "undervoice" that grows as she loses control, or a fully
// synthesised formant babble voice. Also plays the optional intro clip.

const VOWELS = [[800, 1150], [400, 1600], [350, 2300], [450, 800], [325, 700], [600, 1900]];

export class Voice {
  constructor(engine, settings) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.settings = settings;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.speaking = false;
    this.token = 0;
    this.introBuffer = null;
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices() || []; };
      load();
      this.synth.onvoiceschanged = load;
    }
    this.loadIntroClip();
  }

  async loadIntroClip() {
    try {
      const res = await fetch(this.e.opts?.introClip || 'audio/verity_intro.mp3', { cache: 'no-cache' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/audio|mpeg|octet/.test(type)) return;
      const buf = await res.arrayBuffer();
      this.introBuffer = await this.ctx.decodeAudioData(buf);
    } catch { /* no clip provided — the voice engine will say it */ }
  }

  pickVoice(kind = 'verity') {
    const name = this.settings.get('voiceName');
    const en = this.voices.filter((v) => /^en/i.test(v.lang));
    if (kind === 'verity' && name) {
      const v = this.voices.find((x) => x.name === name);
      if (v) return v;
    }
    const prefs = kind === 'verity' || kind === 'female'
      ? (kind === 'female' ? [/google uk english female/i, /serena/i, /hazel/i, /susan/i, /libby/i, /moira/i, /karen/i, /female/i, /samantha/i] : [/google us english/i, /samantha/i, /zira/i, /aria/i, /jenny/i, /female/i, /karen/i, /moira/i])
      : [/google uk english male/i, /daniel/i, /david/i, /guy/i, /male/i, /fred/i];
    for (const re of prefs) {
      const v = en.find((x) => re.test(x.name));
      if (v) return v;
    }
    return en[0] || this.voices[0] || null;
  }

  stop() {
    this.token++;
    this.synth?.cancel();
    this.speaking = false;
    this._under?.stop();
    this._under = null;
    this._clip?.stop();
    this._clip = null;
  }

  // Play the drop-in intro clip if present. Resolves true if it played.
  playIntroClip() {
    if (!this.introBuffer) return Promise.resolve(false);
    return new Promise((resolve) => {
      const s = this.ctx.createBufferSource();
      s.buffer = this.introBuffer;
      const g = this.ctx.createGain();
      g.gain.value = 1;
      s.connect(g).connect(this.e.buses.voice);
      s.onended = () => resolve(true);
      s.start();
      this._clip = s;
    });
  }

  // Speak `text`. opts: { stage 0..6, who: 'verity'|'marcus'|'radio', onWord(i, words), onStart, onEnd, position }
  speak(text, opts = {}) {
    this.stop();
    const token = ++this.token;
    const who = opts.who || 'verity';
    const stage = opts.stage || 0;
    const words = text.split(/\s+/).filter(Boolean);
    const mode = who === 'verity' ? this.settings.get('voiceMode') : 'tts';
    const rateMul = this.settings.get('textSpeed') || 1;
    const est = Math.max(1.2, (text.length / 14.5) / rateMul + 0.4);
    this.speaking = true;
    opts.onStart?.();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (token === this.token) {
          this.speaking = false;
          this._under?.stop();
          this._under = null;
        }
        opts.onWord?.(words.length, words);
        opts.onEnd?.();
        resolve();
      };
      // fallback word reveal timer (also used if boundary events never arrive)
      let wi = 0;
      const perWord = (est * 1000) / Math.max(1, words.length);
      let gotBoundary = false;
      const tick = () => {
        if (done || token !== this.token) return;
        if (!gotBoundary && wi < words.length) { wi++; opts.onWord?.(wi, words); }
        if (wi < words.length || gotBoundary) setTimeout(tick, perWord);
      };
      setTimeout(tick, 60);

      const useTTS = mode === 'tts' && this.synth && this.voices.length > 0;
      if (who === 'verity' && stage >= 3) this._under = this.undervoice(est + 0.5, stage);
      if (!useTTS) {
        if (who === 'verity' || !this.synth || this.e.opts?.voices?.[who]?.synthOnly) this.babble(text, est, stage, who);
        setTimeout(finish, est * 1000 + 200);
        return;
      }
      const u = new SpeechSynthesisUtterance(text.replace(/[—–]/g, ', ').replace(/\.\.\./g, '…'));
      const v = this.pickVoice(who === 'verity' ? 'verity' : 'male');
      if (v) u.voice = v;
      const prof = this.e.opts?.voices?.[who];
      if (prof) {
        u.pitch = prof.pitch ?? 1; u.rate = (prof.rate ?? 1) * rateMul;
        const pv = this.pickVoice(prof.voice || 'male');
        if (pv) u.voice = pv;
      } else if (who === 'verity') {
        u.pitch = Math.max(0.05, 1.75 - stage * 0.26);
        u.rate = (1.04 - stage * 0.045) * rateMul;
      } else if (who === 'marcus') {
        u.pitch = 0.85; u.rate = 0.92 * rateMul;
      } else {
        u.pitch = 0.7; u.rate = 0.95 * rateMul;
      }
      u.volume = Math.min(1, this.settings.get('voiceVolume') * this.settings.get('masterVolume') * (who === 'verity' ? 1 : 0.8));
      u.onboundary = (ev) => {
        if (ev.name && ev.name !== 'word') return;
        gotBoundary = true;
        const upto = text.slice(0, ev.charIndex + 1).split(/\s+/).filter(Boolean).length;
        wi = Math.max(wi, upto);
        opts.onWord?.(wi, words);
      };
      u.onend = finish;
      u.onerror = finish;
      // safety net: some browsers never fire onend
      setTimeout(finish, (est / Math.max(0.5, u.rate)) * 1000 + 4000);
      try { this.synth.speak(u); } catch { finish(); }
    });
  }

  // Deep ring-modulated growl that sits under the TTS once she turns.
  undervoice(dur, stage) {
    if (!this.e.ready) return null;
    const ctx = this.ctx, t = ctx.currentTime;
    const k = (stage - 2) / 4;
    const n = ctx.createBufferSource();
    n.buffer = this.e.brown;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180;
    bp.Q.value = 2;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 55 - k * 12;
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const mod = ctx.createOscillator();
    mod.frequency.value = 23;
    const mg = ctx.createGain();
    mg.gain.value = 1;
    mod.connect(mg).connect(ring.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * k + 0.02, t + 0.15);
    const sh = ctx.createWaveShaper();
    sh.curve = distortionCurve(40 + k * 120);
    n.connect(bp).connect(ring);
    saw.connect(ring);
    ring.connect(sh).connect(g).connect(this.e.buses.voice);
    const syll = setInterval(() => {
      const tt = ctx.currentTime;
      g.gain.setTargetAtTime((0.12 + Math.random() * 0.2) * k + 0.02, tt, 0.03);
      saw.frequency.setTargetAtTime(45 + Math.random() * 25 - k * 10, tt, 0.05);
    }, 110);
    n.start(t); saw.start(t); mod.start(t);
    const stop = () => {
      clearInterval(syll);
      const tt = ctx.currentTime;
      g.gain.setTargetAtTime(0.0001, tt, 0.08);
      for (const s of [n, saw, mod]) s.stop(tt + 0.4);
    };
    const to = setTimeout(stop, dur * 1000);
    return { stop: () => { clearTimeout(to); stop(); } };
  }

  // Formant babble voice (used for "Synth" voice mode or when TTS is missing).
  babble(text, dur, stage, who) {
    if (!this.e.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.03;
    const chars = text.replace(/[^a-z ]/gi, '');
    const syl = Math.max(2, Math.round(chars.replace(/ /g, '').length / 2.6));
    const step = dur / syl;
    const base = this.e.opts?.voices?.[who]?.babble ?? (who === 'verity' ? 330 - stage * 38 : 120);
    const g = ctx.createGain();
    g.gain.value = 0.9;
    const sh = ctx.createWaveShaper();
    sh.curve = distortionCurve(stage * 25);
    g.connect(sh).connect(this.e.buses.voice);
    let tt = t0;
    for (let i = 0; i < syl; i++) {
      const [f1, f2] = VOWELS[(Math.random() * VOWELS.length) | 0];
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      const pitch = base * (1 + Math.sin(i * 0.7) * 0.08 + (Math.random() - 0.5) * 0.06) * (i === syl - 1 ? 0.85 : 1);
      src.frequency.setValueAtTime(pitch, tt);
      src.frequency.linearRampToValueAtTime(pitch * 0.94, tt + step);
      const a = ctx.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = f1 * (who === 'verity' ? 1.15 : 0.9); a.Q.value = 7;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f2 * (who === 'verity' ? 1.15 : 0.9); b.Q.value = 9;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, tt);
      env.gain.exponentialRampToValueAtTime(0.5, tt + step * 0.2);
      env.gain.exponentialRampToValueAtTime(0.0001, tt + step * 0.92);
      src.connect(a).connect(env);
      src.connect(b).connect(env);
      env.connect(g);
      src.start(tt);
      src.stop(tt + step);
      tt += step * (text[Math.floor((i / syl) * text.length)] === ' ' ? 1.1 : 1);
    }
  }
}
