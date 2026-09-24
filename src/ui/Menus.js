import { EXPRESSIONS, EXPRESSION_NAMES, renderExpressionIcon } from '../entities/VerityFace.js';
import { keyLabel } from '../core/Input.js';
import { DEFAULT_KEYS } from '../core/Settings.js';
import { CHAPTERS, ENDINGS } from '../story/Story.js';
import { NOTES, TAPES } from '../ai/knowledge.js';
import { escapeHTML } from './UI.js';

const ROMAN = ['Prologue', 'I', 'II', 'III', 'IV', 'V'];

export class Menus {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('menus');
    this.stack = [];
    this.current = null;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  hide() {
    this.root.innerHTML = '';
    this.current = null;
    this.stack = [];
  }

  show(name, data = {}) {
    this.current = name;
    this.data = data;
    this.root.innerHTML = '';
    const el = this['screen_' + name](data);
    this.root.appendChild(el);
    this.items = [...el.querySelectorAll('.menu-item:not(:disabled)')];
    this.sel = -1;
  }

  push(name, data) {
    this.stack.push([this.current, this.data]);
    this.show(name, data);
  }
  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev[0], prev[1]);
    else if (this.game.paused) this.show('pause');
    else this.show('title');
  }

  onKey(e) {
    if (!this.current || !this.items) return;
    if (this.game.input.captureNext) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      if (!this.items.length) return;
      e.preventDefault();
      this.sel = (this.sel + (e.code === 'ArrowDown' ? 1 : -1) + this.items.length) % this.items.length;
      this.items.forEach((b, i) => b.classList.toggle('sel', i === this.sel));
      this.game.audio.sfx?.play('click', { volume: 0.4 });
    } else if (e.code === 'Enter' && this.sel >= 0) {
      e.preventDefault();
      this.items[this.sel].click();
    } else if (e.code === 'Escape') {
      if (this.current === 'pause') this.game.resume();
      else if (['settings', 'extras', 'chapters', 'credits', 'newgame', 'transcript'].includes(this.current)) this.back();
    }
  }

  el(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'screen ' + cls;
    d.innerHTML = html;
    return d;
  }
  item(label, fn, disabled = false) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = () => {
      this.game.audio.sfx?.play('click', { volume: 0.5 });
      fn();
    };
    b.onmouseenter = () => { if (!disabled) this.game.audio.sfx?.play('click', { volume: 0.15 }); };
    return b;
  }
  list(parent, items) {
    const l = document.createElement('div');
    l.className = 'menu-list';
    for (const [label, fn, dis] of items) l.appendChild(this.item(label, fn, dis));
    parent.appendChild(l);
    return l;
  }

  // ---------------------------------------------------------------- screens
  screen_warning() {
    const d = this.el(`
      <div class="phones">🎧</div>
      <h2>CONTENT WARNING</h2>
      <p>VERITY contains jumpscares, flashing lights, loud sounds and themes of psychological distress.<br>Best played alone, in the dark, with headphones.</p>
      <p style="font-size:16px">Verity listens to what you type. Be careful what you say.</p>
      <div class="go">CLICK ANYWHERE TO BEGIN</div>`, 'black warning');
    d.onclick = () => {
      this.game.audio.init();
      this.game.menus.hide();
      this.game.ui.fade(1, 0.01);
      setTimeout(() => this.game.enterMenu(), 50);
    };
    return d;
  }

  screen_title() {
    const g = this.game;
    const d = this.el(`
      <div class="logo">
        <div class="word">verity</div>
        <div class="bubble">hello i am verity · your personal helper friend</div>
      </div>`, 'title-screen');
    const hasCp = g.save.hasCheckpoint;
    this.list(d, [
      ...(hasCp ? [['Continue', () => g.continueGame()]] : []),
      ['New Game', () => (g.save.ngPlus ? this.push('newgame') : this.confirmNew())],
      ['Chapters', () => this.push('chapters')],
      ['Extras', () => this.push('extras')],
      ['Settings', () => this.push('settings')],
      ['Credits', () => this.push('credits')],
    ]);
    const cp = g.save.data.checkpoint;
    const foot = document.createElement('div');
    foot.className = 'menu-foot';
    foot.textContent = cp ? `Last saved: ${ROMAN[cp.chapter]} — ${CHAPTERS[cp.chapter].title.toLowerCase()} · insanity ${Math.round(cp.insanity)}%` : 'Ask me anything. I know everything.';
    d.appendChild(foot);
    // the speech bubble occasionally says something else
    const bubble = d.querySelector('.bubble');
    const alt = ['hello i am verity · your only friend', 'hello i am verity · i know where you live', 'hello i am verity · please stay', 'hello i am verity · ask me anything'];
    clearInterval(this._bubbleTimer);
    this._bubbleTimer = setInterval(() => {
      if (!document.body.contains(bubble)) { clearInterval(this._bubbleTimer); return; }
      bubble.textContent = alt[Math.floor(Math.random() * alt.length)];
      bubble.classList.add('glitch');
      g.audio.sfx?.play('glitch', { volume: 0.15, dur: 0.2 });
      setTimeout(() => { bubble.classList.remove('glitch'); bubble.textContent = 'hello i am verity · your personal helper friend'; }, 700);
    }, 9000);
    return d;
  }

  confirmNew() {
    const g = this.game;
    if (g.save.hasCheckpoint && !confirm('Start a new game? Your current progress will be lost.')) return;
    g.newGame({});
  }

  screen_newgame() {
    const g = this.game;
    const d = this.el(`<div class="panel"><h2><small>A NEW FRIEND</small>New Game</h2>
      <p class="help">Verity remembers you. New Game+ changes some of what she says.</p>
      <div class="newgame-opts"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button><button class="btn" data-a="go">Begin</button></div></div>`, 'dim');
    const opts = { hard: false, ngPlus: true };
    const box = d.querySelector('.newgame-opts');
    box.appendChild(this.toggleRow('New Game+', () => opts.ngPlus, (v) => (opts.ngPlus = v)));
    box.appendChild(this.toggleRow('Hard mode — she’s faster, batteries are rarer, every word costs more', () => opts.hard, (v) => (opts.hard = v)));
    d.querySelector('[data-a=back]').onclick = () => this.back();
    d.querySelector('[data-a=go]').onclick = () => {
      if (g.save.hasCheckpoint && !confirm('Start a new game? Your current progress will be lost.')) return;
      g.newGame(opts);
    };
    return d;
  }

  screen_chapters() {
    const g = this.game;
    const unlocked = Math.max(g.save.data.unlockedChapter, g.save.data.checkpoint?.chapter || 0);
    const d = this.el(`<div class="panel chapters"><h2><small>SELECT</small>Chapters</h2><div class="grid"></div>
      <p class="help" style="margin-top:18px">Starting from a chapter begins with that chapter’s minimum insanity.</p>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button></div></div>`, 'dim');
    const grid = d.querySelector('.grid');
    CHAPTERS.forEach((c, i) => {
      const card = document.createElement('div');
      const ok = i <= unlocked;
      card.className = 'card' + (ok ? ' clickable' : ' locked');
      card.innerHTML = `<span class="n">${ROMAN[i].toUpperCase()}</span><b>${ok ? c.title : '? ? ?'}</b>${ok ? escapeHTML(c.sub) : 'Locked'}`;
      if (ok) card.onclick = () => (i === 0 ? g.newGame({}) : g.startChapter(i, {}));
      grid.appendChild(card);
    });
    d.querySelector('[data-a=back]').onclick = () => this.back();
    return d;
  }

  screen_extras() {
    const g = this.game, sd = g.save.data;
    const d = this.el(`<div class="panel"><h2><small>MEMORIES</small>Extras</h2>
      <div class="tabs"><button class="tab on" data-t="endings">Endings</button><button class="tab" data-t="faces">Faces</button><button class="tab" data-t="notes">Notes</button><button class="tab" data-t="tapes">Tapes</button></div>
      <div class="tabbody"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button><span class="help">${sd.runs} run${sd.runs === 1 ? '' : 's'} · ${sd.endings.length}/4 endings${sd.falsity ? ' · ??? found' : ''}</span></div></div>`, 'dim');
    const body = d.querySelector('.tabbody');
    const tabs = {
      endings: () => {
        const grid = document.createElement('div');
        grid.className = 'grid';
        for (const [id, e] of Object.entries(ENDINGS)) {
          const got = sd.endings.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? '' : ' locked');
          c.innerHTML = `<b>${got ? e.title : '? ? ?'}</b>${got ? escapeHTML(e.text.split('\n')[0]) : this.endingHint(id)}`;
          grid.appendChild(c);
        }
        if (sd.falsity) {
          const c = document.createElement('div');
          c.className = 'card';
          c.innerHTML = '<b>FALSITY</b>You asked about someone who doesn’t exist.';
          grid.appendChild(c);
        }
        return grid;
      },
      faces: () => {
        const grid = document.createElement('div');
        grid.className = 'grid';
        EXPRESSIONS.forEach((e, i) => {
          const got = sd.facesSeen.includes(i);
          const c = document.createElement('div');
          c.className = 'card' + (got ? '' : ' locked');
          const cv = document.createElement('canvas');
          cv.width = cv.height = 192;
          renderExpressionIcon(cv, got ? e : 'neutral');
          c.appendChild(cv);
          c.insertAdjacentHTML('beforeend', `<b>${got ? EXPRESSION_NAMES[e] : '?'}</b>${got ? `Insanity ${[0, 15, 30, 45, 60, 75, 88][i]}%+` : 'Not yet seen'}`);
          grid.appendChild(c);
        });
        return grid;
      },
      notes: () => {
        const grid = document.createElement('div');
        grid.className = 'grid';
        for (const [id, n] of Object.entries(NOTES)) {
          const got = sd.notes.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? ' clickable' : ' locked');
          c.innerHTML = `<b>${got ? escapeHTML(n.title) : '? ? ?'}</b>${got ? 'Read' : 'Not found'}`;
          if (got) c.onclick = () => this.push('transcript', { title: n.title, text: n.text });
          grid.appendChild(c);
        }
        return grid;
      },
      tapes: () => {
        const grid = document.createElement('div');
        grid.className = 'grid';
        for (const [id, t] of Object.entries(TAPES)) {
          const got = sd.tapes.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? ' clickable' : ' locked');
          c.innerHTML = `<b>${got ? escapeHTML(t.title) : '? ? ?'}</b>${got ? t.speaker : 'Not found'}`;
          if (got) c.onclick = () => this.push('transcript', { title: t.title, text: t.lines.join('\n\n') });
          grid.appendChild(c);
        }
        return grid;
      },
    };
    const show = (t) => {
      body.innerHTML = '';
      body.appendChild(tabs[t]());
      d.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    };
    d.querySelectorAll('.tab').forEach((b) => (b.onclick = () => show(b.dataset.t)));
    show(this.data?.tab || 'endings');
    d.querySelector('[data-a=back]').onclick = () => this.back();
    return d;
  }

  endingHint(id) {
    return {
      escape: 'Some doors only open the third time.',
      friends: 'Be kind. Then give her what she wants.',
      sender: 'Marcus knew the words.',
      caught: 'This one is easy.',
    }[id];
  }

  screen_transcript({ title, text }) {
    const d = this.el(`<div class="panel"><h2><small>TRANSCRIPT</small>${escapeHTML(title)}</h2>
      <div class="help" style="font-family:var(--type);font-size:18px;white-space:pre-wrap;color:#d8d1bd">${escapeHTML(text)}</div>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button></div></div>`, 'dim');
    d.querySelector('[data-a=back]').onclick = () => this.back();
    return d;
  }

  screen_credits() {
    const d = this.el(`<div class="panel credits"><h2><small>THANK YOU FOR PLAYING</small>VERITY</h2>
      <p>A first-person psychological horror game.<br>Built with <b>three.js</b> and the Web Audio API — every texture, sound and note of music is generated in your browser.</p>
      <p>Verity is inspired by the <b>“Something”</b> series and the <b>“hello I am Verity, your personal helper friend”</b> meme.<br>This is an unofficial fan game.</p>
      <p>Hallway design inspired by <i>P.T.</i> (2014).</p>
      <p style="margin-top:28px;font-style:italic">“Ask me anything. I know everything.”</p>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button></div></div>`, 'dim');
    d.querySelector('[data-a=back]').onclick = () => this.back();
    return d;
  }

  screen_pause() {
    const g = this.game;
    const d = this.el(`<h2>PAUSED</h2>`, 'dim pause');
    d.style.flexDirection = 'column';
    d.style.alignItems = 'flex-start';
    d.style.justifyContent = 'center';
    this.list(d, [
      ['Resume', () => g.resume()],
      ['Settings', () => this.push('settings')],
      ['Restart from checkpoint', () => { g.paused = false; g.audio.resume(); g.continueGame(); }, !g.save.hasCheckpoint],
      ['Quit to title', () => g.quitToMenu()],
    ]);
    const tips = document.createElement('div');
    tips.className = 'help';
    tips.style.marginTop = '30px';
    const k = g.settings.get('keys');
    tips.innerHTML = [
      ['WASD', 'move'], [keyLabel(k.sprint), 'run'], [keyLabel(k.crouch), 'crouch'], [keyLabel(k.interact), 'interact'],
      [keyLabel(k.flashlight), 'flashlight'], [keyLabel(k.talk), 'talk to Verity'], [keyLabel(k.breath), 'hold breath (hiding)'],
    ].map(([a, b]) => `<span class="keycap">${a}</span>${b}`).join('&nbsp;&nbsp; ');
    d.appendChild(tips);
    return d;
  }

  screen_gameover({ reason }) {
    const g = this.game;
    const msgs = {
      caught: ['YOU WERE VERITY’S FRIEND', 'It was faster than you. It was always going to be faster than you.'],
      found: ['IT KNEW WHERE YOU WERE', 'Verity knows everything. Including where you hide.'],
    };
    const [t, p] = msgs[reason] || msgs.caught;
    const d = this.el(`<h1>${t}</h1><p>${p}</p><div class="row-btns"></div>`, 'black gameover');
    const row = d.querySelector('.row-btns');
    const b1 = document.createElement('button');
    b1.className = 'btn';
    b1.textContent = 'Try again';
    b1.onclick = () => g.continueGame();
    const b2 = document.createElement('button');
    b2.className = 'btn ghost';
    b2.textContent = 'Title screen';
    b2.onclick = () => g.quitToMenu();
    row.append(b1, b2);
    return d;
  }

  screen_ending({ id }) {
    const g = this.game, s = g.state;
    const e = ENDINGS[id];
    const mins = Math.round((performance.now() - s.started) / 60000);
    const d = this.el(`<div class="tag">ENDING ${Object.keys(ENDINGS).indexOf(id) + 1} OF 4</div><h1>${e.title}</h1>
      <p>${escapeHTML(e.text).replace(/\n/g, '<br>')}</p>
      <div class="stats">${mins} min · ${s.questions} questions asked · rude ${s.rude} time${s.rude === 1 ? '' : 's'} · transformed ${s.transformations}×</div>
      <div class="row-btns"></div>`, 'black ending-screen');
    const row = d.querySelector('.row-btns');
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Title screen';
    b.onclick = () => g.quitToMenu();
    const x = document.createElement('button');
    x.className = 'btn ghost';
    x.textContent = 'Extras';
    x.onclick = () => { g.quitToMenu().then(() => this.push('extras')); };
    row.append(b, x);
    return d;
  }

  // ---------------------------------------------------------------- settings
  screen_settings() {
    const g = this.game, S = g.settings;
    const d = this.el(`<div class="panel"><h2><small>OPTIONS</small>Settings</h2>
      <div class="tabs"><button class="tab on" data-t="video">Video</button><button class="tab" data-t="audio">Audio</button><button class="tab" data-t="controls">Controls</button><button class="tab" data-t="access">Accessibility</button></div>
      <div class="tabbody"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="reset">Reset to defaults</button><button class="btn" data-a="back">Done</button></div></div>`, 'dim');
    const body = d.querySelector('.tabbody');
    const tabs = {
      video: () => [
        this.selectRow('Quality', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]),
        this.rangeRow('Resolution scale', 'resolutionScale', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`),
        this.rangeRow('Field of view', 'fov', 55, 95, 1, (v) => `${v}°`),
        this.rangeRow('Brightness', 'brightness', 0.6, 1.8, 0.05, (v) => `${Math.round(v * 100)}%`),
        this.toggleRow('Shadows', () => S.get('shadows'), (v) => S.set('shadows', v)),
        this.toggleRow('Bloom', () => S.get('bloom'), (v) => S.set('bloom', v)),
        this.toggleRow('Film grain', () => S.get('grain'), (v) => S.set('grain', v)),
        this.toggleRow('Chromatic aberration', () => S.get('chromatic'), (v) => S.set('chromatic', v)),
        this.toggleRow('Head bob', () => S.get('headBob'), (v) => S.set('headBob', v)),
        this.note('Brightness: the smiley below should be barely visible.', true),
      ],
      audio: () => [
        this.rangeRow('Master volume', 'masterVolume', 0, 1, 0.01, pct),
        this.rangeRow('Music', 'musicVolume', 0, 1, 0.01, pct),
        this.rangeRow('Sound effects', 'sfxVolume', 0, 1, 0.01, pct),
        this.rangeRow('Verity’s voice', 'voiceVolume', 0, 1, 0.01, pct),
        this.selectRow('Voice engine', 'voiceMode', [['tts', 'Speech (browser voice)'], ['synth', 'Synthesised babble']]),
        this.voiceRow(),
        this.buttonRow('Test Verity’s voice', 'Play', () => g.audio.ready && g.audio.voice.speak('Hi, I’m Verity, your personal helper friend. Ask me anything — I know everything.', { stage: 0 })),
        this.note('Tip: put an audio file at <b>public/audio/verity_intro.mp3</b> and the intro will use it.'),
      ],
      controls: () => [
        this.rangeRow('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)),
        this.toggleRow('Invert Y', () => S.get('invertY'), (v) => S.set('invertY', v)),
        ...Object.keys(DEFAULT_KEYS).map((a) => this.keyRow(a)),
      ],
      access: () => [
        this.toggleRow('Subtitles', () => S.get('subtitles'), (v) => S.set('subtitles', v)),
        this.selectRow('Subtitle size', 'subtitleSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]),
        this.rangeRow('Text & speech speed', 'textSpeed', 0.6, 1.6, 0.05, (v) => `${v.toFixed(2)}×`),
        this.toggleRow('Reduce flashing', () => S.get('reduceFlashing'), (v) => S.set('reduceFlashing', v)),
      ],
    };
    const show = (t) => {
      body.innerHTML = '';
      for (const r of tabs[t]()) body.appendChild(r);
      d.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      this.tab = t;
    };
    d.querySelectorAll('.tab').forEach((b) => (b.onclick = () => show(b.dataset.t)));
    show(this.tab || 'video');
    d.querySelector('[data-a=back]').onclick = () => this.back();
    d.querySelector('[data-a=reset]').onclick = () => { S.reset(); show(this.tab); };
    return d;
  }

  row(label) {
    const r = document.createElement('div');
    r.className = 'row';
    r.innerHTML = `<label>${label}</label><div class="ctl"></div>`;
    return [r, r.querySelector('.ctl')];
  }
  rangeRow(label, key, min, max, step, fmt) {
    const S = this.game.settings;
    const [r, c] = this.row(label);
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'range', min, max, step, value: S.get(key) });
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = fmt(S.get(key));
    inp.oninput = () => { const v = parseFloat(inp.value); val.textContent = fmt(v); S.set(key, v); };
    c.append(inp, val);
    return r;
  }
  toggleRow(label, get, set) {
    const [r, c] = this.row(label);
    const t = document.createElement('div');
    t.className = 'toggle' + (get() ? ' on' : '');
    t.onclick = () => { const v = !get(); set(v); t.classList.toggle('on', v); this.game.audio.sfx?.play('click', { volume: 0.4 }); };
    c.appendChild(t);
    return r;
  }
  selectRow(label, key, opts) {
    const S = this.game.settings;
    const [r, c] = this.row(label);
    const sel = document.createElement('select');
    for (const [v, l] of opts) sel.add(new Option(l, v, false, S.get(key) === v));
    sel.onchange = () => S.set(key, sel.value);
    c.appendChild(sel);
    return r;
  }
  voiceRow() {
    const g = this.game, S = g.settings;
    const [r, c] = this.row('Browser voice');
    const sel = document.createElement('select');
    sel.add(new Option('Automatic', ''));
    const voices = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en/i.test(v.lang));
    for (const v of voices) sel.add(new Option(`${v.name} (${v.lang})`, v.name, false, S.get('voiceName') === v.name));
    sel.onchange = () => S.set('voiceName', sel.value);
    c.appendChild(sel);
    if (!voices.length) c.insertAdjacentHTML('beforeend', '<span class="val" style="width:auto">none found</span>');
    return r;
  }
  buttonRow(label, text, fn) {
    const [r, c] = this.row(label);
    const b = document.createElement('button');
    b.className = 'btn-small';
    b.textContent = text;
    b.onclick = fn;
    c.appendChild(b);
    return r;
  }
  keyRow(action) {
    const g = this.game, S = g.settings;
    const names = { forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Run', crouch: 'Crouch', interact: 'Interact', flashlight: 'Flashlight', talk: 'Talk to Verity', breath: 'Hold breath' };
    const [r, c] = this.row(names[action] || action);
    const b = document.createElement('button');
    b.className = 'btn-small';
    b.textContent = keyLabel(S.get('keys')[action]);
    b.onclick = () => {
      b.textContent = 'press a key…';
      g.input.captureNext = (code) => {
        if (code !== 'Escape') {
          const keys = { ...S.get('keys'), [action]: code };
          S.set('keys', keys);
        }
        b.textContent = keyLabel(S.get('keys')[action]);
      };
    };
    c.appendChild(b);
    return r;
  }
  note(html, calib = false) {
    const d = document.createElement('div');
    d.className = 'help';
    d.style.padding = '14px 0';
    d.innerHTML = html;
    if (calib) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      cv.style.cssText = 'display:block;margin:12px 0;width:72px;height:72px;opacity:.07;filter:brightness(' + this.game.settings.get('brightness') + ')';
      renderExpressionIcon(cv, 'smile');
      d.appendChild(cv);
    }
    return d;
  }
}

const pct = (v) => `${Math.round(v * 100)}%`;
