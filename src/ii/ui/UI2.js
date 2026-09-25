import * as THREE from 'three';
import { UI, escapeHTML } from '../../ui/UI.js';
import { keyLabel } from '../../core/Input.js';
import { TAPES2, DOCS } from '../ai/knowledgeII.js';

const TEMPLATE = /* html */ `
<div id="letterbox"><div class="bar top"></div><div class="bar bottom"></div></div>
<div id="cam-hud" class="hidden">
  <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
  <div class="rec"><i></i>REC</div>
  <div class="tc">00:00:00</div>
  <div class="date">MAR 12 1996</div>
  <div class="mode">SP</div>
  <div class="nv">NIGHT&nbsp;SHOT</div>
  <div class="zoom"><span>W</span><div class="zbar"><i></i></div><span>T</span></div>
  <div class="bat"><div class="cells"><i></i><i></i><i></i><i></i></div></div>
  <div class="center"></div>
</div>
<div id="hud" class="hidden">
  <div id="objective"></div>
  <div id="crosshair"></div>
  <div id="glint"></div>
  <div id="prompt"></div>
  <div id="insanity">
    <canvas id="ins-face" width="96" height="96"></canvas>
    <div class="ins-body">
      <div class="label">INSANITY <span id="ins-value"></span></div>
      <div class="track"><div class="fill"></div><div class="ticks"></div></div>
    </div>
    <div id="ins-delta"></div>
  </div>
  <div id="meters">
    <div id="stamina" class="meter"><div class="fill"></div></div>
    <div id="battery" class="meter"><div class="fill"></div></div>
  </div>
  <div id="held"></div>
  <div id="breath"><div class="label">HOLD YOUR BREATH</div><div class="meter"><div class="fill"></div></div></div>
  <div id="talk-hint"></div>
</div>
<div id="chat" class="hidden">
  <div id="chat-log"></div>
  <div id="chat-quick"></div>
  <form id="chat-form" autocomplete="off">
    <span class="chat-caret">›</span>
    <input id="chat-input" maxlength="160" autocomplete="off" spellcheck="false" placeholder="Ask Verity anything…" />
    <span class="chat-help">Enter — ask · Tab — close</span>
  </form>
</div>
<div id="subtitles"></div>
<div id="toast"></div>
<div id="chapter-card"><div class="num"></div><div class="title"></div><div class="sub"></div></div>
<div id="doc" class="hidden"></div>
<div id="panel" class="hidden"></div>
<div id="journal" class="hidden"></div>
<div id="choice" class="hidden"></div>
<div id="flash"></div>
<div id="fade"></div>
<div id="skip-hint">Hold <b>Space</b> to skip</div>
<div id="save-indicator">saving…</div>
<div id="loading" class="hidden"><div class="label"></div><div class="bar"><i></i></div></div>
<div id="menus"></div>
`;

const QUICK = ['Who are you?', 'What should I do now?', 'Where am I?', 'Do you remember me?', 'Tell me a joke', 'What is 9 + 10?', 'Thank you, Verity', 'Who is Vera?'];

// Part two's HUD: part one's UI plus a camcorder viewfinder, interaction
// glints, a journal of everything you've found, modal puzzle panels, and a
// level loading bar.
export class UI2 extends UI {
  constructor(game) {
    document.getElementById('ui').innerHTML = TEMPLATE;
    super(game);
    const $ = (s) => document.querySelector(s);
    this.cam = $('#cam-hud');
    this.camTC = this.cam.querySelector('.tc');
    this.camZoom = this.cam.querySelector('.zbar i');
    this.camCells = [...this.cam.querySelectorAll('.cells i')];
    this.glint = $('#glint');
    this.panelEl = $('#panel');
    this.journal = $('#journal');
    this.loadEl = $('#loading');
    this.heldEl = $('#held');
    this.quick = $('#chat-quick');
    this.objectiveText = '';
    this._v = new THREE.Vector3();
    this.quick.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !this.chatInput.disabled) this.game.askVerity(b.textContent);
    });
  }

  get overlayOpen() {
    return this.docOpen || !this.panelEl.classList.contains('hidden') || !this.journal.classList.contains('hidden');
  }

  update() {
    const g = this.game;
    this.setMeters(g.player);
    const held = g.throwables.held;
    const txt = held ? `${g.controls.usingPad ? 'RB' : keyLabel(g.settings.get('keys').throw)} — throw ${held.kind}` : '';
    if (this.heldEl.textContent !== txt) this.heldEl.textContent = txt;
  }

  setObjective(text) {
    this.objectiveText = text || '';
    super.setObjective(text);
  }

  // ---------------------------------------------------------------- camcorder
  setCamcorder(on) {
    this.cam.classList.toggle('hidden', !on);
    this.root.classList.toggle('camcorder', on);
  }
  updateCamcorder(cc) {
    if (!cc.up) return;
    const t = cc.recTime;
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor(t / 60) % 60).padStart(2, '0');
    const ss = String(Math.floor(t) % 60).padStart(2, '0');
    const s = `${hh}:${mm}:${ss}`;
    if (this.camTC.textContent !== s) this.camTC.textContent = s;
    this.camZoom.style.width = `${((cc.zoom - 1) / 3) * 100}%`;
    const cells = Math.ceil(cc.battery * 4);
    this.camCells.forEach((c, i) => c.classList.toggle('on', i < cells));
    this.cam.classList.toggle('nvon', cc.nv);
    this.cam.classList.toggle('low', cc.battery < 0.2);
  }

  // ---------------------------------------------------------------- glint on interactables
  setGlint(point) {
    if (!point || !this.game.settings.get('showHints')) { this.glint.classList.remove('on'); return; }
    this._v.copy(point).project(this.game.camera);
    this.glint.style.transform = `translate(${(this._v.x * 0.5 + 0.5) * innerWidth}px, ${(-this._v.y * 0.5 + 0.5) * innerHeight}px)`;
    this.glint.classList.add('on');
  }

  // ---------------------------------------------------------------- loading bar
  loading(on, label = '', p = 0) {
    this.loadEl.classList.toggle('hidden', !on);
    if (on) {
      this.loadEl.querySelector('.label').textContent = label;
      this.loadEl.querySelector('.bar i').style.width = `${Math.round(p * 100)}%`;
    }
  }

  // ---------------------------------------------------------------- chat
  openChat(pad = false) {
    super.openChat();
    this.quick.innerHTML = '';
    // gamepad players (and anyone) can pick a question
    const list = pad ? QUICK : QUICK.slice(0, 4);
    for (const q of list) {
      const b = document.createElement('button');
      b.textContent = q;
      this.quick.appendChild(b);
    }
    this.quick.classList.toggle('pad', pad);
    this.quickSel = 0;
    if (pad) this.markQuick();
  }
  markQuick() { [...this.quick.children].forEach((b, i) => b.classList.toggle('sel', i === this.quickSel)); }
  padChat(c) {
    if (!this.chatOpen || !this.quick.classList.contains('pad')) return;
    const n = this.quick.children.length;
    if (c.padButton(14) || c.padButton(12)) { this.quickSel = (this.quickSel + n - 1) % n; this.markQuick(); }
    if (c.padButton(15) || c.padButton(13)) { this.quickSel = (this.quickSel + 1) % n; this.markQuick(); }
    if (c.padButton(0) && !this.chatInput.disabled) this.game.askVerity(this.quick.children[this.quickSel].textContent);
  }

  // ---------------------------------------------------------------- documents & panels
  showNote(title, text, opts = {}) {
    const g = this.game;
    const name = g.brain?.memory.name || g.save.memories.name || 'OCCUPANT';
    const body = escapeHTML(String(text).replace('{name}', name.toUpperCase()).replace('{route}', g.story?.routeText?.() || '').replace('{valves}', g.story?.valveText?.() || ''));
    const cls = opts.style || 'paper';
    this.doc.innerHTML = `<div class="${cls}"><h3>${escapeHTML(title)}</h3>${body.replace(/\n/g, '<br>')}</div><div class="caption">${g.controls.usingPad ? 'A' : 'E'} — CLOSE</div>`;
    this.doc.classList.remove('hidden');
  }

  openPanel(build, done) {
    this.panelEl.innerHTML = '';
    this.panelEl.classList.remove('hidden');
    const el = build(done, this.panelEl);
    if (el) this.panelEl.appendChild(el);
    this.root.classList.add('modal');
  }

  closeOverlay() {
    this.hideDoc();
    this.panelEl.classList.add('hidden');
    this.panelEl.innerHTML = '';
    this.journal.classList.add('hidden');
    this.root.classList.remove('modal');
    if (this.game.mode === 'play' && !this.game.paused) this.game.input.lock();
  }

  openJournal() {
    const g = this.game, s = g.state;
    const tapes = Object.entries(TAPES2).map(([id, t]) => `<li class="${s.tapes.includes(id) ? '' : 'missing'}" data-tape="${id}">${s.tapes.includes(id) ? escapeHTML(t.title) : '— missing tape —'}</li>`).join('');
    const docs = Object.entries(DOCS).map(([id, d]) => `<li class="${s.docs.includes(id) ? '' : 'missing'}" data-doc="${id}">${s.docs.includes(id) ? escapeHTML(d.title) : '— — —'}</li>`).join('');
    this.journal.innerHTML = `<div class="jpanel">
      <h2><small>JOURNAL</small>${escapeHTML(this.objectiveText || 'Look around.')}</h2>
      <div class="cols">
        <div><h4>TAPES ${s.tapes.length}/5</h4><ul>${tapes}</ul></div>
        <div><h4>DOCUMENTS ${s.docs.length}/${Object.keys(DOCS).length}</h4><ul>${docs}</ul></div>
        <div><h4>FIGURES ${s.figures.length}/12</h4><div class="figs">${Array.from({ length: 12 }, (_, i) => `<i class="${s.figures.includes(i) ? 'on' : ''}"></i>`).join('')}</div>
          <p class="help">Tiny Verities are hidden all over the factory. Some only show up on night vision.</p></div>
      </div>
      <div class="caption">Click an entry to read or replay it · ${g.controls.usingPad ? 'B' : 'Esc'} — close</div></div>`;
    this.journal.classList.remove('hidden');
    g.input.unlock();
    this.journal.onclick = (e) => {
      const li = e.target.closest('li');
      if (!li || li.classList.contains('missing')) return;
      if (li.dataset.doc) { const d = DOCS[li.dataset.doc]; this.journal.classList.add('hidden'); g.showNote(d.title, d.text); }
      if (li.dataset.tape) { this.journal.classList.add('hidden'); g.story.playTape(li.dataset.tape, true); g.input.lock(); }
    };
    g._overlayClose = null;
  }

  chapterCard(num, title, sub, seconds = 4) { return super.chapterCard(num, title, sub, seconds); }
}
