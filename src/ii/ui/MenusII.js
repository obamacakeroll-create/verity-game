import { Menus } from '../../ui/Menus.js';
import { EXPRESSIONS, EXPRESSION_NAMES, renderExpressionIcon } from '../../entities/VerityFace.js';
import { keyLabel } from '../../core/Input.js';
import { DEFAULT_KEYS } from '../core/Settings2.js';
import { CHAPTERS2, ROMAN2, ENDINGS2 } from '../story/chapters.js';
import { TAPES2, DOCS } from '../ai/knowledgeII.js';
import { escapeHTML } from '../../ui/UI.js';

const pct = (v) => `${Math.round(v * 100)}%`;

export class MenusII extends Menus {
  // gamepad navigation (called from the game loop)
  padNav(c) {
    if (!this.current || !this.items) return;
    const n = this.items.length;
    if ((c.padButton(12) || c.padButton(13)) && n) {
      this.sel = (this.sel + (c.padButton(13) ? 1 : -1) + n) % n;
      this.items.forEach((b, i) => b.classList.toggle('sel', i === this.sel));
      this.game.audio.sfx?.play('click', { volume: 0.4 });
    }
    if (c.padButton(0) && this.sel >= 0) this.items[this.sel].click();
    if (c.padButton(1)) {
      if (this.current === 'pause') this.game.resume();
      else if (['settings', 'extras', 'chapters', 'credits', 'newgame', 'transcript'].includes(this.current)) this.back();
    }
  }

  show(name, data) {
    super.show(name, data);
    // include panel buttons in gamepad/keyboard navigation
    if (!this.items.length) this.items = [...this.root.querySelectorAll('.btn, .card.clickable')];
  }

  screen_warning() {
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const d = this.el(`
      <div class="phones">🎧</div>
      <h2>CONTENT WARNING</h2>
      <p>VERITY II: RETURNS contains jumpscares, flashing lights, loud sounds, and themes of grief, loss and psychological distress.<br>Best played alone, in the dark, with headphones.</p>
      <p style="font-size:16px">Verity listens to what you type. She remembers what you said last time.</p>
      ${touch ? '<p style="font-size:16px;color:#f2c21a">This game needs a keyboard and mouse, or a gamepad.</p>' : ''}
      <p class="quality-note">graphics: ${this.game.settings.get('quality')} — change any time in Settings</p>
      <div class="go">CLICK ANYWHERE TO BEGIN</div>`, 'black warning');
    d.onclick = () => {
      this.game.audio.init();
      this.hide();
      this.game.ui.fade(1, 0.01);
      setTimeout(() => this.game.enterMenu(), 50);
    };
    return d;
  }

  screen_title() {
    const g = this.game;
    const d = this.el(`
      <div class="logo2">
        <div class="word">verity<span class="ii">II</span></div>
        <span class="sub">RETURNS</span>
        <div class="stamp">RETURN TO SENDER</div>
      </div>`, 'title2');
    const hasCp = g.save.hasCheckpoint;
    this.list(d, [
      ...(hasCp ? [['Continue', () => g.continueGame()]] : []),
      ['New Game', () => (g.save.ngPlus ? this.push('newgame') : this.confirmNew())],
      ['Chapters', () => this.push('chapters')],
      ['Extras', () => this.push('extras')],
      ['Settings', () => this.push('settings')],
      ['Credits', () => this.push('credits')],
      ['Game Select', () => { location.href = '../'; }],
    ]);
    const cp = g.save.data.checkpoint;
    const mem = g.save.memories;
    const foot = document.createElement('div');
    foot.className = 'menu-foot';
    foot.textContent = cp ? `Last saved: ${ROMAN2[cp.chapter].toLowerCase()} — ${CHAPTERS2[cp.chapter].title.toLowerCase()} · insanity ${Math.round(cp.insanity)}%`
      : mem.played ? 'She remembers Wren Street. Do you?' : 'Three days later, a box arrived on your new doorstep.';
    d.appendChild(foot);
    return d;
  }

  screen_newgame() {
    const g = this.game;
    const d = this.el(`<div class="panel"><h2><small>RETURNING CUSTOMER</small>New Game</h2>
      <p class="help">Verity remembers your last visit. New Game+ changes some of what she says.</p>
      <div class="newgame-opts"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button><button class="btn" data-a="go">Begin</button></div></div>`, 'dim');
    const opts = { hard: false, ngPlus: true };
    const box = d.querySelector('.newgame-opts');
    box.appendChild(this.toggleRow('New Game+', () => opts.ngPlus, (v) => (opts.ngPlus = v)));
    box.appendChild(this.toggleRow('Hard mode — faster hunters, weaker batteries, every word costs more', () => opts.hard, (v) => (opts.hard = v)));
    d.querySelector('[data-a=back]').onclick = () => this.back();
    d.querySelector('[data-a=go]').onclick = () => {
      if (g.save.hasCheckpoint && !confirm('Start a new game? Your current progress will be lost.')) return;
      g.newGame(opts);
    };
    return d;
  }

  screen_chapters() {
    const g = this.game;
    const unlocked = Math.max(g.save.data.unlockedChapter, g.save.data.checkpoint?.chapter || 0, g.debug ? 5 : 0);
    const d = this.el(`<div class="panel chapters"><h2><small>SELECT</small>Chapters</h2><div class="grid"></div>
      <p class="help" style="margin-top:18px">Starting from a chapter begins with that chapter’s minimum insanity.</p>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button></div></div>`, 'dim');
    const grid = d.querySelector('.grid');
    CHAPTERS2.forEach((c, i) => {
      const card = document.createElement('div');
      const ok = i <= unlocked;
      card.className = 'card' + (ok ? ' clickable' : ' locked');
      card.innerHTML = `<span class="n">${ROMAN2[i]}</span><b>${ok ? c.title : '? ? ?'}</b>${ok ? escapeHTML(c.sub) : 'Locked'}`;
      if (ok) card.onclick = () => (i === 0 ? g.newGame({}) : g.startChapter(i, {}));
      grid.appendChild(card);
    });
    d.querySelector('[data-a=back]').onclick = () => this.back();
    return d;
  }

  endingHint(id) {
    return {
      returns: 'Get back to your car.',
      recall: 'Find all of Ruth’s tapes. Learn her name. Stay kind. Then tell her.',
      hiring: 'Keep your promise.',
      shipped: 'Don’t make it to the car.',
    }[id];
  }

  screen_extras() {
    const g = this.game, sd = g.save.data;
    const d = this.el(`<div class="panel"><h2><small>ARCHIVE</small>Extras</h2>
      <div class="tabs"><button class="tab on" data-t="endings">Endings</button><button class="tab" data-t="faces">Faces</button><button class="tab" data-t="docs">Documents</button><button class="tab" data-t="tapes">Tapes</button><button class="tab" data-t="figs">Figures</button></div>
      <div class="tabbody"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="back">Back</button><span class="help">${sd.runs} run${sd.runs === 1 ? '' : 's'} · ${sd.endings.length}/4 endings · ${sd.figures.length}/12 figures</span></div></div>`, 'dim');
    const body = d.querySelector('.tabbody');
    const grid = () => { const x = document.createElement('div'); x.className = 'grid'; return x; };
    const tabs = {
      endings: () => {
        const gr = grid();
        for (const [id, e] of Object.entries(ENDINGS2)) {
          const got = sd.endings.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? '' : ' locked');
          c.innerHTML = `<b>${got ? e.title : '? ? ?'}</b>${got ? escapeHTML(e.text.split('\n')[0]) : this.endingHint(id)}`;
          gr.appendChild(c);
        }
        const mem = g.save.memories;
        if (mem.played) {
          const c = document.createElement('div');
          c.className = 'card';
          c.innerHTML = `<b>WREN STREET</b>Part one: ${mem.endings.length}/4 endings. She remembers.`;
          gr.appendChild(c);
        }
        return gr;
      },
      faces: () => {
        const gr = grid();
        EXPRESSIONS.forEach((e, i) => {
          const got = sd.facesSeen.includes(i);
          const c = document.createElement('div');
          c.className = 'card' + (got ? '' : ' locked');
          const cv = document.createElement('canvas');
          cv.width = cv.height = 192;
          renderExpressionIcon(cv, got ? e : 'neutral');
          c.appendChild(cv);
          c.insertAdjacentHTML('beforeend', `<b>${got ? EXPRESSION_NAMES[e] : '?'}</b>${got ? `Insanity ${[0, 15, 30, 45, 60, 75, 88][i]}%+` : 'Not yet seen'}`);
          gr.appendChild(c);
        });
        return gr;
      },
      docs: () => {
        const gr = grid();
        for (const [id, n] of Object.entries(DOCS)) {
          const got = sd.docs.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? ' clickable' : ' locked');
          c.innerHTML = `<b>${got ? escapeHTML(n.title) : '? ? ?'}</b>${got ? 'Read' : 'Not found'}`;
          if (got) c.onclick = () => this.push('transcript', { title: n.title, text: n.text.replace('{name}', sd.lastRunName || 'YOU').replace('{route}', '—') });
          gr.appendChild(c);
        }
        return gr;
      },
      tapes: () => {
        const gr = grid();
        for (const [id, t] of Object.entries(TAPES2)) {
          const got = sd.tapes.includes(id);
          const c = document.createElement('div');
          c.className = 'card' + (got ? ' clickable' : ' locked');
          c.innerHTML = `<b>${got ? escapeHTML(t.title) : '? ? ?'}</b>${got ? t.speaker : 'Not found'}`;
          if (got) c.onclick = () => this.push('transcript', { title: t.title, text: t.lines.join('\n\n') });
          gr.appendChild(c);
        }
        return gr;
      },
      figs: () => {
        const gr = grid();
        for (let i = 0; i < 12; i++) {
          const got = sd.figures.includes(i);
          const c = document.createElement('div');
          c.className = 'card' + (got ? '' : ' locked');
          const cv = document.createElement('canvas');
          cv.width = cv.height = 192;
          renderExpressionIcon(cv, got ? EXPRESSIONS[i % 7] : 'neutral');
          c.appendChild(cv);
          c.insertAdjacentHTML('beforeend', `<b>${got ? `Tiny Verity #${i + 1}` : '?'}</b>${got ? 'Found' : 'Hidden somewhere'}`);
          gr.appendChild(c);
        }
        return gr;
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

  screen_credits() {
    const d = this.el(`<div class="panel credits"><h2><small>THANK YOU FOR PLAYING</small>VERITY II: RETURNS</h2>
      <p>A first-person psychological horror game.<br>Built with <b>three.js</b> and the Web Audio API.<br>Every texture, model, light, sound and note of music is generated in your browser — there are no image, model or audio files.</p>
      <p>Rendering: HDR pipeline · ambient occlusion · volumetric light · physically based bloom · AgX · procedural colour grading · GPU-baked materials · reflection probes · baked vertex lighting · skinned procedural characters.</p>
      <p>Verity is inspired by the <b>“Something”</b> series and the <b>“hello I am Verity, your personal helper friend”</b> meme.<br>This is an unofficial fan game.</p>
      <p style="margin-top:28px;font-style:italic">“You can stop now, Vera. No more questions tonight.”</p>
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
      ['Journal', () => { g.resume(); g.ui.openJournal(); }],
      ['Settings', () => this.push('settings')],
      ['Restart from checkpoint', () => { g.paused = false; g.audio.resume(); g.continueGame(); }, !g.save.hasCheckpoint],
      ['Quit to title', () => g.quitToMenu()],
    ]);
    const tips = document.createElement('div');
    tips.className = 'help';
    tips.style.marginTop = '30px';
    tips.style.maxWidth = '720px';
    const k = g.settings.get('keys');
    tips.innerHTML = [
      ['WASD', 'move'], [keyLabel(k.sprint), 'run'], [keyLabel(k.crouch), 'crouch'], [keyLabel(k.interact), 'interact'],
      [keyLabel(k.flashlight), 'phone light'], [keyLabel(k.camcorder) + ' / RMB', 'camcorder'], [keyLabel(k.nightvision), 'night vision'], ['Wheel', 'zoom'],
      [keyLabel(k.throw), 'throw'], [keyLabel(k.talk), 'talk to Verity'], [keyLabel(k.hint), 'ask for a hint'], [keyLabel(k.journal), 'journal'], [keyLabel(k.breath), 'hold breath (hiding)'],
    ].map(([a, b]) => `<span class="keycap">${a}</span>${b}`).join('&nbsp;&nbsp; ');
    d.appendChild(tips);
    return d;
  }

  screen_gameover({ reason }) {
    const g = this.game;
    const msgs = {
      caught: ['YOU WERE HER FRIEND', 'She was faster than you. She was always going to be faster than you.'],
      found: ['SHE KNEW WHERE YOU WERE', 'Verity knows everything. Including where you hide.'],
      seconds: ['YOU LOOKED AWAY', 'They only move when you’re not looking.'],
    };
    const [t, p] = msgs[reason] || msgs.caught;
    const d = this.el(`<h1>${t}</h1><p>${p}</p><div class="row-btns"></div>`, 'black gameover');
    const row = d.querySelector('.row-btns');
    const b1 = document.createElement('button');
    b1.className = 'btn menu-item';
    b1.textContent = 'Try again';
    b1.onclick = () => g.continueGame();
    const b2 = document.createElement('button');
    b2.className = 'btn ghost menu-item';
    b2.textContent = 'Title screen';
    b2.onclick = () => g.quitToMenu();
    row.append(b1, b2);
    return d;
  }

  screen_ending({ id }) {
    const g = this.game, s = g.state;
    const e = ENDINGS2[id];
    const mins = Math.round((performance.now() - s.started) / 60000);
    const d = this.el(`<div class="tag">ENDING ${Object.keys(ENDINGS2).indexOf(id) + 1} OF 4</div><h1>${e.title}</h1>
      <p>${escapeHTML(e.text).replace(/\n/g, '<br>')}</p>
      <div class="stats">${mins} min · ${s.questions} questions · rude ${s.rude}× · kind ${s.kind}× · tapes ${s.tapes.length}/5 · figures ${s.figures.length}/12 · caught ${s.deaths}×</div>
      <div class="row-btns"></div>`, 'black ending-screen');
    const row = d.querySelector('.row-btns');
    const b = document.createElement('button');
    b.className = 'btn menu-item';
    b.textContent = 'Title screen';
    b.onclick = () => g.quitToMenu();
    const x = document.createElement('button');
    x.className = 'btn ghost menu-item';
    x.textContent = 'Extras';
    x.onclick = () => { g.quitToMenu().then(() => this.push('extras')); };
    row.append(b, x);
    return d;
  }

  screen_settings() {
    const g = this.game, S = g.settings;
    const d = this.el(`<div class="panel"><h2><small>OPTIONS</small>Settings</h2>
      <div class="tabs"><button class="tab on" data-t="video">Graphics</button><button class="tab" data-t="audio">Audio</button><button class="tab" data-t="controls">Controls</button><button class="tab" data-t="access">Accessibility</button></div>
      <div class="tabbody"></div>
      <div class="panel-foot"><button class="btn ghost" data-a="reset">Reset to defaults</button><button class="btn" data-a="back">Done</button></div></div>`, 'dim');
    const body = d.querySelector('.tabbody');
    const tabs = {
      video: () => [
        this.selectRow('Quality preset', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]),
        this.note('Texture detail changes after reloading the page.'),
        this.toggleRow('Dynamic resolution (keeps it smooth)', () => S.get('dynamicResolution'), (v) => S.set('dynamicResolution', v)),
        this.rangeRow('Resolution scale', 'resolutionScale', 0.5, 1.5, 0.05, pct),
        this.rangeRow('Field of view', 'fov', 55, 100, 1, (v) => `${v}°`),
        this.rangeRow('Brightness', 'brightness', 0.6, 2, 0.05, pct),
        this.toggleRow('Ambient occlusion', () => S.get('ao'), (v) => S.set('ao', v)),
        this.toggleRow('Volumetric light & fog', () => S.get('volumetrics'), (v) => S.set('volumetrics', v)),
        this.toggleRow('Bloom & lens dirt', () => S.get('bloom'), (v) => S.set('bloom', v)),
        this.toggleRow('Motion blur', () => S.get('motionBlur'), (v) => S.set('motionBlur', v)),
        this.toggleRow('Depth of field', () => S.get('dof'), (v) => S.set('dof', v)),
        this.toggleRow('Film grain', () => S.get('grain'), (v) => S.set('grain', v)),
        this.toggleRow('Chromatic aberration', () => S.get('chromatic'), (v) => S.set('chromatic', v)),
        this.note('Brightness: the smiley below should be barely visible.', true),
      ],
      audio: () => [
        this.rangeRow('Master volume', 'masterVolume', 0, 1, 0.01, pct),
        this.rangeRow('Music', 'musicVolume', 0, 1, 0.01, pct),
        this.rangeRow('Sound effects', 'sfxVolume', 0, 1, 0.01, pct),
        this.rangeRow('Voices', 'voiceVolume', 0, 1, 0.01, pct),
        this.selectRow('Voice engine', 'voiceMode', [['tts', 'Speech (browser voice)'], ['synth', 'Synthesised babble']]),
        this.voiceRow(),
        this.buttonRow('Test Verity’s voice', 'Play', () => g.audio.ready && g.audio.voice.speak('Hi, I’m Verity, your personal helper friend. Did you miss me?', { stage: 0 })),
      ],
      controls: () => [
        this.rangeRow('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)),
        this.rangeRow('Gamepad look speed', 'gamepadSensitivity', 0.3, 2.5, 0.05, (v) => v.toFixed(2)),
        this.toggleRow('Invert Y', () => S.get('invertY'), (v) => S.set('invertY', v)),
        this.toggleRow('Head bob', () => S.get('headBob'), (v) => S.set('headBob', v)),
        ...Object.keys(DEFAULT_KEYS).map((a) => this.keyRow(a)),
        this.note('Gamepad: left stick move · right stick look · A interact · B crouch · X light · Y talk · LB camcorder · RB throw · LT hold breath · L3 run · D-pad ↑ night vision · ↓ hint · Back journal · Start pause'),
      ],
      access: () => [
        this.toggleRow('Subtitles', () => S.get('subtitles'), (v) => S.set('subtitles', v)),
        this.selectRow('Subtitle size', 'subtitleSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]),
        this.rangeRow('Text & speech speed', 'textSpeed', 0.6, 1.6, 0.05, (v) => `${v.toFixed(2)}×`),
        this.toggleRow('Reduce flashing', () => S.get('reduceFlashing'), (v) => S.set('reduceFlashing', v)),
        this.toggleRow('Camera shake', () => S.get('cameraShake'), (v) => S.set('cameraShake', v)),
        this.toggleRow('Interaction glints', () => S.get('showHints'), (v) => S.set('showHints', v)),
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

  keyRow(action) {
    const names = {
      forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Run', crouch: 'Crouch', interact: 'Interact',
      flashlight: 'Phone light', talk: 'Talk to Verity', breath: 'Hold breath', camcorder: 'Camcorder', nightvision: 'Night vision', throw: 'Throw', journal: 'Journal', hint: 'Hint',
    };
    const r = super.keyRow(action);
    r.querySelector('label').textContent = names[action] || action;
    return r;
  }
}
