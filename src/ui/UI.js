import { renderExpressionIcon } from '../entities/VerityFace.js';
import { keyLabel } from '../core/Input.js';

const $ = (s) => document.querySelector(s);

// DOM overlay: HUD, chat, subtitles, documents, fades.
export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.hud = $('#hud');
    this.fadeEl = $('#fade');
    this.flashEl = $('#flash');
    this.letterbox = $('#letterbox');
    this.subs = $('#subtitles');
    this.toastEl = $('#toast');
    this.promptEl = $('#prompt');
    this.cross = $('#crosshair');
    this.objEl = $('#objective');
    this.ins = $('#insanity');
    this.insFill = $('#insanity .fill');
    this.insVal = $('#ins-value');
    this.insDelta = $('#ins-delta');
    this.insFace = $('#ins-face');
    this.stamina = $('#stamina');
    this.battery = $('#battery');
    this.breath = $('#breath');
    this.talkHint = $('#talk-hint');
    this.chat = $('#chat');
    this.chatLog = $('#chat-log');
    this.chatInput = $('#chat-input');
    this.chatForm = $('#chat-form');
    this.card = $('#chapter-card');
    this.doc = $('#doc');
    this.choice = $('#choice');
    this.skip = $('#skip-hint');
    this.saveEl = $('#save-indicator');
    this.faceName = '';
    this.subTimer = null;
    this.toastTimer = null;
    this.chatOpen = false;
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.chatInput.value.trim();
      if (!v) { this.game.closeChat(); return; }
      this.chatInput.value = '';
      this.game.askVerity(v);
    });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this.game.closeChat(); }
      e.stopPropagation();
    });
    this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());
    this.applySubtitleSize();
    game.settings.on('change', (k) => { if (k === 'subtitleSize') this.applySubtitleSize(); if (k === 'keys') this.refreshTalkHint(); });
    this.setFace('smile');
  }

  applySubtitleSize() {
    const px = { small: 18, medium: 22, large: 28 }[this.game.settings.get('subtitleSize')] || 22;
    document.documentElement.style.setProperty('--sub-size', px + 'px');
  }

  // ---------------------------------------------------------------- fades
  fade(to, seconds = 1) {
    this.fadeEl.style.transition = `opacity ${seconds}s ease`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000));
  }
  flash(strength = 1, ms = 120) {
    if (this.game.settings.get('reduceFlashing')) strength *= 0.25;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
      this.flashEl.style.opacity = '0';
    });
  }
  setLetterbox(on) { this.letterbox.classList.toggle('on', on); }
  showHUD(on) { this.hud.classList.toggle('hidden', !on); }
  fadeHUD(faded) { this.hud.classList.toggle('faded', faded); }

  // ---------------------------------------------------------------- HUD
  setInsanity(v, delta = 0) {
    this.insFill.style.width = `${Math.max(0, Math.min(100, v))}%`;
    this.insVal.textContent = `${Math.round(v)}%`;
    this.ins.classList.toggle('high', v >= 75);
    if (delta) {
      const el = this.insDelta;
      el.textContent = (delta > 0 ? '+' : '') + Math.round(delta);
      el.className = delta >= 15 ? 'bad' : delta < 0 ? 'good' : '';
      void el.offsetWidth;
      el.classList.add('show');
      if (delta >= 15) {
        this.ins.classList.remove('shake');
        void this.ins.offsetWidth;
        this.ins.classList.add('shake');
      }
    }
  }
  setFace(name) {
    if (name === this.faceName) return;
    this.faceName = name;
    renderExpressionIcon(this.insFace, name);
  }
  setObjective(text) {
    if (!text) { this.objEl.classList.remove('on'); return; }
    this.objEl.innerHTML = `<span class="tag">OBJECTIVE</span>${text}`;
    this.objEl.classList.remove('on');
    void this.objEl.offsetWidth;
    this.objEl.classList.add('on');
  }
  setPrompt(text, key = 'E', hold = 0) {
    if (!text) {
      this.promptEl.classList.remove('on');
      this.cross.classList.remove('active');
      return;
    }
    const html = `<span class="key">${key}</span>${text}${hold > 0 ? `<span class="hold"><i style="width:${Math.round(hold * 100)}%"></i></span>` : ''}`;
    if (this._prompt !== html) { this.promptEl.innerHTML = html; this._prompt = html; }
    this.promptEl.classList.add('on');
    this.cross.classList.add('active');
  }
  setMeters(p) {
    this.stamina.classList.toggle('on', p.stamina < 0.99);
    this.stamina.firstElementChild.style.width = `${p.stamina * 100}%`;
    this.battery.classList.toggle('on', p.hasFlashlight && (p.flashOn || p.battery < 0.3));
    this.battery.classList.toggle('low', p.battery < 0.15);
    this.battery.firstElementChild.style.width = `${p.battery * 100}%`;
    this.breath.classList.toggle('on', !!p.hidden);
    this.breath.querySelector('.fill').style.width = `${p.breath * 100}%`;
  }
  refreshTalkHint(show = this._talkShown) {
    this._talkShown = show;
    this.talkHint.textContent = `${keyLabel(this.game.settings.get('keys').talk)} — TALK TO VERITY`;
    this.talkHint.classList.toggle('on', !!show);
  }

  // ---------------------------------------------------------------- chat
  openChat() {
    this.chatOpen = true;
    this.chat.classList.remove('hidden');
    this.chatInput.disabled = false;
    setTimeout(() => this.chatInput.focus(), 10);
  }
  closeChat() {
    this.chatOpen = false;
    this.chat.classList.add('hidden');
    this.chatInput.blur();
  }
  setChatBusy(b) {
    this.chatInput.disabled = b;
    if (!b && this.chatOpen) setTimeout(() => this.chatInput.focus(), 10);
  }
  addYou(text) {
    const d = document.createElement('div');
    d.className = 'msg you';
    d.textContent = text;
    this.chatLog.appendChild(d);
    this.trimChat();
  }
  addVerity(text, stage) {
    const d = document.createElement('div');
    d.className = `msg verity s${stage}`;
    d.innerHTML = `<span class="who">VERITY</span>` + text.split(/\s+/).map((w) => `<span class="w">${escapeHTML(w)}</span>`).join(' ');
    this.chatLog.appendChild(d);
    this.trimChat();
    const spans = d.querySelectorAll('.w');
    return (n) => { for (let i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < n); };
  }
  trimChat() {
    while (this.chatLog.children.length > 8) this.chatLog.removeChild(this.chatLog.firstChild);
  }
  clearChat() { this.chatLog.innerHTML = ''; }

  // ---------------------------------------------------------------- subtitles
  subtitle(text, { who = '', cls = '', stage = 0, duration = 0 } = {}) {
    clearTimeout(this.subTimer);
    if (!this.game.settings.get('subtitles') && cls !== 'silent') {
      this.subs.classList.remove('on');
      return () => {};
    }
    this.subs.className = `on ${cls} s${stage}`;
    const name = who ? `<span class="who">${who}</span>` : '';
    this.subs.innerHTML = name + text.split(/\s+/).map((w) => `<span class="w">${escapeHTML(w)}</span>`).join(' ');
    const spans = this.subs.querySelectorAll('.w');
    if (duration) {
      spans.forEach((s) => s.classList.add('on'));
      this.subTimer = setTimeout(() => this.clearSubtitle(), duration * 1000);
    }
    return (n) => { for (let i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < n); };
  }
  clearSubtitle(delay = 0) {
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => this.subs.classList.remove('on'), delay * 1000);
  }

  toast(text, seconds = 2.6) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), seconds * 1000);
  }

  chapterCard(num, title, sub, seconds = 4) {
    this.card.querySelector('.num').textContent = num;
    this.card.querySelector('.title').textContent = title;
    this.card.querySelector('.sub').textContent = sub || '';
    this.card.classList.add('on');
    return new Promise((r) => setTimeout(() => { this.card.classList.remove('on'); setTimeout(r, 1400); }, seconds * 1000));
  }

  showSkip(on, progress = 0) {
    this.skip.classList.toggle('on', on);
    this.skip.innerHTML = `Hold <b>Space</b> to skip<span class="bar" style="width:${Math.round(progress * 100)}%"></span>`;
  }

  saving() {
    this.saveEl.classList.add('on');
    setTimeout(() => this.saveEl.classList.remove('on'), 2200);
  }

  // ---------------------------------------------------------------- documents
  showNote(title, text) {
    this.doc.innerHTML = `<div class="paper"><h3>${escapeHTML(title)}</h3>${escapeHTML(text).replace(/\n/g, '<br>')}</div><div class="caption">PRESS E TO CLOSE</div>`;
    this.doc.classList.remove('hidden');
  }
  showCanvas(canvas, caption = 'PRESS E TO CLOSE') {
    this.doc.innerHTML = '';
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    this.doc.appendChild(c);
    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.textContent = caption;
    this.doc.appendChild(cap);
    this.doc.classList.remove('hidden');
  }
  hideDoc() { this.doc.classList.add('hidden'); this.doc.innerHTML = ''; }
  get docOpen() { return !this.doc.classList.contains('hidden'); }

  // Two-button choice; resolves with the chosen index.
  ask(options) {
    return new Promise((resolve) => {
      this.choice.innerHTML = '';
      let sel = 0;
      const buttons = options.map((o, i) => {
        const b = document.createElement('button');
        b.textContent = o;
        b.onclick = () => done(i);
        this.choice.appendChild(b);
        return b;
      });
      const mark = () => buttons.forEach((b, i) => b.classList.toggle('sel', i === sel));
      mark();
      const onKey = (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { sel = (sel + options.length - 1) % options.length; mark(); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { sel = (sel + 1) % options.length; mark(); }
        if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); done(sel); }
        if (e.code === 'Digit1') done(0);
        if (e.code === 'Digit2') done(1);
      };
      const done = (i) => {
        window.removeEventListener('keydown', onKey, true);
        this.choice.classList.add('hidden');
        this.choice.innerHTML = '';
        resolve(i);
      };
      window.addEventListener('keydown', onKey, true);
      this.choice.classList.remove('hidden');
    });
  }

  hurt(on) { this.root.classList.toggle('hurt', on); }
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
