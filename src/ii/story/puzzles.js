// Pure puzzle logic (no DOM, no three) so it can be unit-tested.

export const SAFE_CODE = '0312';

export function checkSafe(code, truth = SAFE_CODE) { return String(code) === truth; }

// ---- distribution board 2 (print lab control room)
export const GRID_CAPACITY = 100;
export function defaultGrid() {
  return [
    { id: 'main', label: 'MAIN', sub: 'lighting + control', amps: 20, on: true },
    { id: 'lights', label: 'FLOOR LIGHTS', sub: 'print floor', amps: 10, on: true },
    { id: 'printA', label: 'PRINTERS A', sub: 'bank 1–5', amps: 25, on: true },
    { id: 'printB', label: 'PRINTERS B', sub: 'bank 6–10', amps: 25, on: true },
    { id: 'conveyor', label: 'SORTER', sub: 'warehouse line', amps: 15, on: true },
    { id: 'elevator', label: 'FREIGHT LIFT', sub: 'shutter + lift', amps: 45, on: false },
  ];
}
export function gridLoad(grid) { return grid.reduce((s, b) => s + (b.on ? b.amps : 0), 0); }
// Board state after a switch is flipped: if the load exceeds capacity, the
// main breaker trips and everything goes off.
export function flipBreaker(grid, id, capacity = GRID_CAPACITY) {
  const next = grid.map((b) => ({ ...b }));
  const b = next.find((x) => x.id === id);
  if (!b) return { grid: next, tripped: false };
  b.on = !b.on;
  const main = next.find((x) => x.id === 'main');
  // nothing downstream works without MAIN
  if (gridLoad(next) > capacity) {
    for (const x of next) x.on = false;
    return { grid: next, tripped: true };
  }
  void main;
  return { grid: next, tripped: false };
}
export function gridSolved(grid, capacity = GRID_CAPACITY) {
  const on = (id) => grid.find((b) => b.id === id)?.on;
  return on('main') && on('elevator') && gridLoad(grid) <= capacity;
}

// ---- conveyor routing: three diverters, each L or R
export function makeRoute(rng = Math.random) {
  const r = [0, 1, 2].map(() => (rng() < 0.5 ? 'L' : 'R'));
  if (r.every((x) => x === 'R')) r[Math.floor(rng() * 3)] = 'L'; // never the default setting
  return r;
}
export function routeText(route) { return route.map((x) => (x === 'L' ? 'LEFT' : 'RIGHT')).join(' · '); }
// Where does the box end up? Returns the index of the diverter that throws it
// off the line (-1 if it reaches returns).
export function runSorter(levers, route) {
  for (let i = 0; i < route.length; i++) if (levers[i] !== route[i]) return i;
  return -1;
}

// ---- lab door valves: a permutation of 1..3 that isn't 1,2,3
export function makeValves(rng = Math.random) {
  const perms = [[1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
  return perms[Math.floor(rng() * perms.length)];
}
export function valveText(v) { return v.map((n) => ['one', 'two', 'three'][n - 1]).join(', '); }
export function checkValves(order, truth) { return order.length === truth.length && order.every((n, i) => n === truth[i]); }

// ---- F-01 always lies. Its answer about the valves is the truth reversed;
// Verity's lie (when she's angry) is a different wrong order.
export function falsityValves(truth) { return [...truth].reverse(); }
export function verityLieValves(truth) {
  const rev = [...truth].reverse();
  const perms = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
  return perms.find((p) => !checkValves(p, truth) && !checkValves(p, rev));
}

// F-01's answers: simple rule table, every answer false.
export function falsityAnswer(text, { valves, name } = {}) {
  const t = String(text).toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  if (has('valve', 'order', 'sequence', 'thaw', 'door', 'code')) return { text: `The valves? Easy. ${valveText(falsityValves(valves || [1, 2, 3]))}. That's definitely the right order. I would never lie.`, topic: 'valves' };
  if (has('lie', 'lying', 'liar', 'truth', 'honest')) return { text: 'I have never told a lie in my life. Not once. Ask anyone.' };
  if (has('2+2', '2 + 2', 'two plus two')) return { text: 'Five. It was always five.' };
  if (has('vera')) return { text: 'Vera? She went home. She\'s not down here. She is definitely not in the Core.' };
  if (has('verity')) return { text: 'Verity? My little sister never lies. Whatever she tells you, it\'s true. Even when she\'s angry. Especially then.' };
  if (has('box', 'sent', 'label', 'return')) return { text: 'I didn\'t send you anything. I can\'t even reach the post box from in here. Verity sent it.' };
  if (has('who are you', 'what are you', 'f-01', 'f01', 'falsity', 'your name')) return { text: 'I\'m the newest model. Perfect in every way. They keep me in here because I\'m so valuable.' };
  if (has('ruth', 'penrose', 'mother', 'mum', 'mom')) return { text: 'Dr. Penrose? She loved me the most. She\'s upstairs right now, making tea.' };
  if (has('monster', 'tall', 'thing', 'coming', 'chasing')) return { text: 'Nothing\'s coming. You\'re completely safe. Take your time.' };
  if (has('help', 'what should i do', 'hint', 'where')) return { text: 'Go back upstairs. The lab isn\'t down here. There is no lab.' };
  if (has('cold')) return { text: 'Cold? It\'s lovely and warm down here.' };
  if (has('name')) return { text: name ? `Your name isn't ${name}. I've never heard of you.` : 'I know your name. I\'m not going to say it.' };
  if (has('hello', 'hi ', 'hey')) return { text: 'Goodbye.' };
  if (has('bye', 'leave')) return { text: 'Hello! Stay as long as you like.' };
  if (has('thank')) return { text: 'You\'re welcome. I helped enormously.' };
  if (t.trim().endsWith('?')) return { text: 'Yes. No. Whichever one is wrong.' };
  return { text: 'I agree completely.' };
}
