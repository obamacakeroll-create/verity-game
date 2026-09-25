import { gridLoad, flipBreaker, GRID_CAPACITY } from './puzzles.js';

// DOM device panels opened through game.panel(build). Each builder gets
// done(result) and returns its element.

function el(html, cls = 'device') {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

function withKeys(d, onKey) {
  const h = (e) => { if (!document.body.contains(d)) { window.removeEventListener('keydown', h, true); return; } onKey(e); };
  window.addEventListener('keydown', h, true);
  return () => window.removeEventListener('keydown', h, true);
}

// 4-digit keypad. sfx(name) plays feedback.
export function keypad({ title = 'KEYPAD', length = 4, hint = '', sfx }) {
  return (done) => {
    const d = el(`<h3>${title}</h3><div class="screen7">&nbsp;</div><div class="keys"></div><div class="hint">${hint}</div>`);
    const scr = d.querySelector('.screen7');
    const keys = d.querySelector('.keys');
    let code = '';
    const show = () => { scr.textContent = code.padEnd(length, '·'); scr.classList.remove('err'); };
    let off = null;
    const press = (k) => {
      sfx?.('keypad');
      if (k === 'CLR') code = '';
      else if (k === 'OK') { if (code.length === length) { off?.(); done(code); } return; }
      else if (code.length < length) code += k;
      show();
      if (code.length === length) setTimeout(() => { if (document.body.contains(d) && code.length === length) { off?.(); done(code); } }, 350);
    };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK']) {
      const b = document.createElement('button');
      b.textContent = k;
      if (k.length > 1) b.className = 'fn';
      b.onclick = () => press(k);
      keys.appendChild(b);
    }
    off = withKeys(d, (e) => {
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) { press(e.code.slice(-1)); e.preventDefault(); e.stopPropagation(); }
      if (e.code === 'Backspace') { code = code.slice(0, -1); show(); e.preventDefault(); }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { press('OK'); e.preventDefault(); e.stopPropagation(); }
    });
    show();
    return d;
  };
}

// Breaker board. grid: from puzzles.defaultGrid(); onChange(grid, tripped) is called live.
export function breakerBoard({ grid, capacity = GRID_CAPACITY, onChange, sfx, hint = '' }) {
  return (done) => {
    let g = grid.map((b) => ({ ...b }));
    const d = el(`<h3>DISTRIBUTION BOARD 2 — ${capacity} A</h3><div class="breakers"></div>
      <div class="gauge"><i></i></div><div class="hint load"></div><div class="hint">${hint}</div>
      <div style="text-align:center;margin-top:16px"><button class="dbtn" style="padding:0 30px;height:44px;font-size:16px">CLOSE PANEL</button></div>`);
    const box = d.querySelector('.breakers');
    const gauge = d.querySelector('.gauge');
    const bar = gauge.querySelector('i');
    const load = d.querySelector('.load');
    const render = () => {
      box.innerHTML = '';
      for (const b of g) {
        const x = document.createElement('div');
        x.className = 'breaker' + (b.on ? ' on' : '') + (b.id === 'elevator' || b.id === 'main' ? ' green' : '');
        x.innerHTML = `<div class="lamp"></div><div class="sw"></div><label>${b.label}</label><small>${b.sub} · ${b.amps} A</small>`;
        x.onclick = () => {
          const r = flipBreaker(g, b.id, capacity);
          g = r.grid;
          sfx?.(r.tripped ? 'trip' : 'breaker');
          if (r.tripped) { gauge.classList.remove('over'); void gauge.offsetWidth; gauge.classList.add('over'); }
          onChange?.(g, r.tripped);
          render();
        };
        box.appendChild(x);
      }
      const l = gridLoad(g);
      bar.style.width = `${Math.min(100, (l / capacity) * 100)}%`;
      load.textContent = `LOAD ${l} / ${capacity} A`;
    };
    render();
    d.querySelector('.dbtn').onclick = () => done(g);
    return d;
  };
}

// Three valves, turned in an order. Resolves with the order clicked.
export function valveBoard({ count = 3, sfx, hint = '' }) {
  return (done) => {
    const d = el(`<h3>LAB DOOR — THAW SEQUENCE</h3><div class="valves"></div><div class="seq">— — —</div><div class="hint">${hint}</div>`);
    const box = d.querySelector('.valves');
    const seq = d.querySelector('.seq');
    const order = [];
    for (let i = 1; i <= count; i++) {
      const v = document.createElement('div');
      v.className = 'valve';
      v.innerHTML = `<div class="wheel"></div><label>VALVE ${i}</label>`;
      v.onclick = () => {
        if (v.classList.contains('done') || order.length >= count) return;
        v.classList.add('done');
        order.push(i);
        sfx?.('valve');
        seq.textContent = order.join(' — ') + ' — '.repeat(count - order.length).replace(/ — $/, '');
        if (order.length === count) setTimeout(() => done(order), 700);
      };
      box.appendChild(v);
    }
    withKeys(d, (e) => {
      const m = e.code.match(/^(Digit|Numpad)([1-9])$/);
      if (m) { box.children[+m[2] - 1]?.click(); e.preventDefault(); e.stopPropagation(); }
    });
    return d;
  };
}
