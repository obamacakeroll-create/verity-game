import './launcher.css';

// Animated, procedurally painted posters for the two games.

const TAU = Math.PI * 2;
const mouse = { x: 0.5, y: 0.5 };
window.addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx, w, h, amt, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function face(ctx, x, y, r, mood, lookX = 0, lookY = 0) {
  // glossy yellow ball
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff2a0');
  g.addColorStop(0.25, '#f7cf2a');
  g.addColorStop(0.8, '#c48a08');
  g.addColorStop(1, '#5a3a02');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  // layer lines
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.strokeStyle = 'rgba(80,50,0,0.12)';
  ctx.lineWidth = 1;
  for (let yy = y - r; yy < y + r; yy += r * 0.035) { ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke(); }
  ctx.restore();
  const ex = lookX * r * 0.08, ey = lookY * r * 0.06;
  ctx.fillStyle = '#120c04';
  if (mood === 'grin') {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + s * r * 0.34 + ex, y - r * 0.22 + ey, r * 0.13, r * 0.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,40,20,0.9)';
      ctx.beginPath(); ctx.arc(x + s * r * 0.34 + ex, y - r * 0.2 + ey, r * 0.035, 0, TAU); ctx.fill();
      ctx.fillStyle = '#120c04';
    }
    ctx.beginPath();
    ctx.moveTo(x - r * 0.72, y + r * 0.05);
    ctx.quadraticCurveTo(x, y + r * 0.95, x + r * 0.72, y + r * 0.05);
    ctx.quadraticCurveTo(x, y + r * 0.4, x - r * 0.72, y + r * 0.05);
    ctx.fill();
    ctx.fillStyle = '#efe6cf';
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = x - r * 0.62 + t * r * 1.24;
      const top = y + r * 0.13 + Math.sin(t * Math.PI) * r * 0.24;
      ctx.beginPath();
      ctx.moveTo(px - r * 0.045, top); ctx.lineTo(px + r * 0.045, top); ctx.lineTo(px, top + r * 0.12); ctx.fill();
    }
  } else {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * 0.3 + ex, y - r * 0.2 + ey, r * 0.08, r * 0.16, 0, 0, TAU); ctx.fill(); }
    ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.strokeStyle = '#120c04';
    ctx.beginPath(); ctx.arc(x + ex * 0.5, y + r * 0.02, r * 0.45, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
  }
  // specular
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.52, r * 0.16, r * 0.08, -0.6, 0, TAU); ctx.fill();
}

function posterOne(ctx, w, h, t) {
  ctx.fillStyle = '#070605'; ctx.fillRect(0, 0, w, h);
  // hallway in one-point perspective
  const vx = w * 0.5, vy = h * 0.42;
  const hall = (k) => ({ x0: vx - w * 0.9 * k, x1: vx + w * 0.9 * k, y0: vy - h * 0.62 * k, y1: vy + h * 0.72 * k });
  for (let i = 12; i >= 1; i--) {
    const k = i / 12, a = hall(k), b = hall((i - 1) / 12 + 0.001);
    const shade = Math.pow(1 - k, 1.6);
    ctx.fillStyle = `rgb(${24 + shade * 50},${20 + shade * 40},${14 + shade * 26})`;
    ctx.beginPath(); ctx.moveTo(a.x0, a.y0); ctx.lineTo(b.x0, b.y0); ctx.lineTo(b.x0, b.y1); ctx.lineTo(a.x0, a.y1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(a.x1, a.y0); ctx.lineTo(b.x1, b.y0); ctx.lineTo(b.x1, b.y1); ctx.lineTo(a.x1, a.y1); ctx.fill();
    ctx.fillStyle = `rgb(${14 + shade * 40},${10 + shade * 28},${8 + shade * 16})`;
    ctx.beginPath(); ctx.moveTo(a.x0, a.y1); ctx.lineTo(b.x0, b.y1); ctx.lineTo(b.x1, b.y1); ctx.lineTo(a.x1, a.y1); ctx.fill();
  }
  // bulb light pool
  const flick = 0.85 + Math.sin(t * 13) * 0.05 + (Math.sin(t * 2.3) > 0.97 ? -0.5 : 0);
  const lg = ctx.createRadialGradient(vx, vy - h * 0.05, 5, vx, vy + h * 0.05, h * 0.45);
  lg.addColorStop(0, `rgba(255,214,150,${0.55 * flick})`);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(255,236,190,${flick})`;
  ctx.beginPath(); ctx.arc(vx, vy - h * 0.2, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(vx, 0); ctx.lineTo(vx, vy - h * 0.2); ctx.stroke();
  // the box
  const bx = vx, by = vy + h * 0.18;
  ctx.fillStyle = '#7a5a33'; ctx.fillRect(bx - 70, by - 30, 140, 80);
  ctx.fillStyle = '#9b7443'; ctx.beginPath(); ctx.moveTo(bx - 70, by - 30); ctx.lineTo(bx - 40, by - 52); ctx.lineTo(bx + 100, by - 52); ctx.lineTo(bx + 70, by - 30); ctx.fill();
  ctx.fillStyle = '#5c4122'; ctx.beginPath(); ctx.moveTo(bx + 70, by - 30); ctx.lineTo(bx + 100, by - 52); ctx.lineTo(bx + 100, by + 28); ctx.lineTo(bx + 70, by + 50); ctx.fill();
  ctx.fillStyle = '#1a1208'; ctx.font = 'bold 22px "Special Elite", monospace'; ctx.textAlign = 'center'; ctx.fillText('VERITY', bx, by + 18);
  // Verity rising
  const bob = Math.sin(t * 1.6) * 8;
  face(ctx, vx, h * 0.3 + bob, w * 0.13, 'smile', (mouse.x - 0.5) * 2, (mouse.y - 0.5) * 2);
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

function posterTwo(ctx, w, h, t, drops) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#05080a'); bg.addColorStop(0.6, '#0b1113'); bg.addColorStop(1, '#030404');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // warehouse racks receding
  for (let i = 0; i < 7; i++) {
    const k = 1 - i / 8;
    const cx = w * 0.5 + (i % 2 ? 1 : -1) * w * (0.2 + 0.28 * k);
    const rw = w * 0.22 * k, rh = h * 0.85 * k;
    const top = h * 0.55 - rh * 0.6;
    ctx.fillStyle = `rgba(${20 + i * 3},${28 + i * 2},${30 + i * 2},1)`;
    ctx.fillRect(cx - rw / 2, top, rw, rh);
    for (let s = 0; s < 5; s++) {
      const sy = top + (s + 0.2) * rh / 5;
      ctx.fillStyle = `rgba(200,90,30,${0.35 * k})`; ctx.fillRect(cx - rw / 2, sy - 3, rw, 3);
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = `rgba(${110 * k + 20},${80 * k + 15},${45 * k + 10},1)`;
        ctx.fillRect(cx - rw / 2 + 4 + b * rw / 4, sy + 4, rw / 4 - 6, rh / 5 - 14);
      }
    }
  }
  // fluorescent strip
  const on = Math.sin(t * 17) > -0.6 || Math.sin(t * 3.1) < 0.9;
  const lg = ctx.createRadialGradient(w * 0.5, h * 0.12, 4, w * 0.5, h * 0.3, h * 0.5);
  lg.addColorStop(0, on ? 'rgba(170,230,220,0.35)' : 'rgba(170,230,220,0.05)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = on ? 'rgba(220,255,250,0.95)' : 'rgba(120,140,140,0.5)';
  ctx.fillRect(w * 0.38, h * 0.11, w * 0.24, 5);
  // the grin in the dark
  const peek = (Math.sin(t * 0.5) * 0.5 + 0.5);
  ctx.globalAlpha = 0.25 + peek * 0.75;
  face(ctx, w * 0.5, h * 0.44, w * 0.12, 'grin', (mouse.x - 0.5) * 2, (mouse.y - 0.5) * 2);
  ctx.globalAlpha = 1;
  // shipping label
  ctx.save();
  ctx.translate(w * 0.72, h * 0.66); ctx.rotate(-0.14);
  ctx.strokeStyle = 'rgba(201,55,44,0.85)'; ctx.lineWidth = 4;
  ctx.strokeRect(-110, -34, 220, 68);
  ctx.fillStyle = 'rgba(201,55,44,0.85)'; ctx.font = 'bold 22px "Special Elite", monospace'; ctx.textAlign = 'center';
  ctx.fillText('RETURN TO', 0, -6); ctx.fillText('SENDER', 0, 22);
  ctx.restore();
  // rain
  ctx.strokeStyle = 'rgba(180,210,220,0.18)'; ctx.lineWidth = 1;
  for (const d of drops) {
    d.y += d.v; if (d.y > h) { d.y = -20; d.x = Math.random() * w; }
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + d.l); ctx.stroke();
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

const cards = [...document.querySelectorAll('.card')];
const drops = Array.from({ length: 140 }, () => ({ x: Math.random() * 600, y: Math.random() * 840, v: 9 + Math.random() * 8, l: 14 + Math.random() * 16 }));
let frame = 0;
function loop(ts) {
  const t = ts / 1000;
  for (const c of cards) {
    const cv = c.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (c.dataset.poster === 'one') posterOne(ctx, cv.width, cv.height, t);
    else posterTwo(ctx, cv.width, cv.height, t, drops);
    if (frame % 2 === 0) grain(ctx, cv.width, cv.height, 22, frame);
  }
  frame++;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// progress summary from both games' saves
try {
  const one = JSON.parse(localStorage.getItem('verity.save.v1') || 'null');
  const two = JSON.parse(localStorage.getItem('verity2.save.v1') || 'null');
  const parts = [];
  if (one?.endings?.length) parts.push(`PART ONE — ${one.endings.length}/4 ENDINGS`);
  if (two?.endings?.length) parts.push(`PART TWO — ${two.endings.length}/4 ENDINGS`);
  document.getElementById('progress').textContent = parts.join('  ·  ');
} catch { /* storage unavailable */ }
