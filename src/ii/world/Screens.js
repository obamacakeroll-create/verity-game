import * as THREE from 'three';
import { drawExpression } from '../../entities/VerityFace.js';

// Canvas-driven screen content: the 1996 HELPFUL FRIENDS TV commercial,
// green-phosphor CRT terminals, vending machine fronts, posters.

export class CanvasScreen {
  constructor(w, h, draw, { fps = 24, emissive = true } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw = draw;
    this.t = 0;
    this.acc = 1;
    this.fps = fps;
    this.state = {};
    this.emissive = emissive;
    this.redraw(0);
  }
  update(dt) {
    this.t += dt;
    this.acc += dt;
    if (this.fps > 0 && this.acc >= 1 / this.fps) { this.acc = 0; this.redraw(this.t); }
  }
  redraw(t) { this.draw(this.ctx, this.canvas.width, this.canvas.height, t, this.state); this.texture.needsUpdate = true; }
}

export function drawBall(ctx, x, y, r, expr = 'smile', p = {}) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff3a6');
  g.addColorStop(0.3, '#f8cf2c');
  g.addColorStop(0.85, '#c38a06');
  g.addColorStop(1, '#6a4400');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x - r, y - r);
  ctx.scale((r * 2) / 1024, (r * 2) / 1024);
  drawExpression(ctx, expr, p);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.55, r * 0.16, r * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
}

function vhsNoise(ctx, w, h, t, amount) {
  // tracking band + noise lines + chroma speckle
  const bandY = ((t * 0.23) % 1.3 - 0.15) * h;
  ctx.fillStyle = `rgba(255,255,255,${0.06 * amount})`;
  ctx.fillRect(0, bandY, w, h * 0.05);
  for (let i = 0; i < 6 * amount; i++) {
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() * 255 | 0},255,${0.12 * amount})`;
    ctx.fillRect(0, y, w, 1 + Math.random() * 2);
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = (w * h) / 6;
  for (let i = 0; i < n * amount; i++) {
    const k = ((Math.random() * w * h) | 0) * 4;
    const v = Math.random() * 255;
    d[k] = d[k + 1] = d[k + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

// The commercial. state.phase: 'off' | 'ad' | 'static' | 'verity' | 'grin'
export function drawTV(ctx, w, h, t, s) {
  const phase = s.phase || 'off';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (phase === 'off') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
  if (phase === 'static') {
    ctx.fillStyle = '#777'; ctx.fillRect(0, 0, w, h);
    vhsNoise(ctx, w, h, t, 3);
    return;
  }
  const lt = t - (s.start || 0);
  if (phase === 'ad') {
    // scene cuts every few seconds
    const scene = Math.floor(lt / 3.2) % 5;
    const k = (lt % 3.2) / 3.2;
    const bg = ['#ffd83a', '#7ecbff', '#ff9ac2', '#ffd83a', '#101010'][scene];
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // sunburst
    ctx.save();
    ctx.translate(w / 2, h * 0.55);
    ctx.rotate(lt * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, -60); ctx.lineTo(w, 60); ctx.fill(); }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1a1a';
    const bounce = Math.abs(Math.sin(lt * 5)) * 16;
    if (scene === 0) {
      drawBall(ctx, w / 2, h * 0.55 - bounce, h * 0.26 * Math.min(1, k * 4), 'smile');
      ctx.font = `bold ${h * 0.12}px Arial Rounded MT Bold, Arial`;
      ctx.fillText('MEET VERITY!', w / 2, h * 0.17);
    } else if (scene === 1) {
      drawBall(ctx, w * 0.3, h * 0.55, h * 0.2, 'wink');
      ctx.font = `bold ${h * 0.085}px Arial`;
      ctx.fillText('ASK ME', w * 0.68, h * 0.42);
      ctx.fillText('ANYTHING!', w * 0.68, h * 0.56 + bounce * 0.3);
      ctx.font = `${h * 0.05}px Arial`;
      ctx.fillText('"What is 2 + 2?"  "FOUR!"', w * 0.68, h * 0.72);
    } else if (scene === 2) {
      // child silhouette hugging the ball
      ctx.fillStyle = '#3a2a4a';
      ctx.beginPath(); ctx.arc(w * 0.62, h * 0.33, h * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(w * 0.56, h * 0.4, w * 0.12, h * 0.4);
      drawBall(ctx, w * 0.5, h * 0.62, h * 0.16, 'laugh');
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${h * 0.08}px Arial`;
      ctx.fillText('A FRIEND WHO', w * 0.3, h * 0.2);
      ctx.fillText('ALWAYS COMES BACK', w * 0.35, h * 0.3);
    } else if (scene === 3) {
      drawBall(ctx, w / 2, h * 0.5, h * 0.3, k > 0.7 ? 'grin' : 'smile');
      ctx.font = `bold ${h * 0.09}px Arial`;
      ctx.fillText('I KNOW EVERYTHING!', w / 2, h * 0.93);
    } else {
      ctx.fillStyle = '#ffd83a';
      ctx.font = `bold ${h * 0.11}px Arial`;
      ctx.fillText('HELPFUL FRIENDS', w / 2, h * 0.42);
      ctx.font = `${h * 0.05}px Arial`;
      ctx.fillStyle = '#eee';
      ctx.fillText('Unit 9, Kessler Industrial Park · 1-800-VERITY', w / 2, h * 0.56);
      ctx.fillText('Please be kind to your Verity.', w / 2, h * 0.66);
    }
    vhsNoise(ctx, w, h, t, 0.6);
    return;
  }
  if (phase === 'verity' || phase === 'grin') {
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
    const zoom = phase === 'grin' ? 0.55 : 0.34 + Math.min(0.1, lt * 0.01);
    drawBall(ctx, w / 2 + Math.sin(lt * 1.3) * 4, h / 2, h * zoom, phase === 'grin' ? 'grin' : (s.expr || 'smile'), { talk: s.talk || 0, lookX: 0, lookY: 0 });
    vhsNoise(ctx, w, h, t, phase === 'grin' ? 1.5 : 0.8);
  }
}

// Green-phosphor terminal text.
export function drawCRT(lines, { title = '', color = '#7dff9c' } = {}) {
  return (ctx, w, h, t) => {
    ctx.fillStyle = '#031006';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.font = `${Math.round(h / 16)}px VT323, monospace`;
    ctx.textBaseline = 'top';
    let y = h * 0.06;
    if (title) { ctx.fillText(title, w * 0.06, y); y += h / 11; ctx.fillRect(w * 0.06, y - 6, w * 0.88, 2); y += 6; }
    for (const l of lines) { ctx.fillText(l, w * 0.06, y); y += h / 14; }
    if (Math.floor(t * 2) % 2) ctx.fillRect(w * 0.06, y + 2, w * 0.04, h / 16);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let yy = 0; yy < h; yy += 3) ctx.fillRect(0, yy, w, 1);
  };
}

export function drawVending(ctx, w, h) {
  ctx.fillStyle = '#0c0f14'; ctx.fillRect(0, 0, w, h);
  const cols = 5, rows = 6;
  const cw = w / cols, ch = (h * 0.85) / rows;
  const colors = ['#d23b2b', '#2b6bd2', '#f2c21a', '#3ea84a', '#e07b1f', '#8c3ad2'];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw + cw * 0.15, y = r * ch + ch * 0.15;
    ctx.fillStyle = colors[(r * 3 + c) % colors.length];
    if ((r * 7 + c * 3) % 9 === 0) continue; // sold out
    ctx.fillRect(x, y, cw * 0.7, ch * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(x, y, cw * 0.1, ch * 0.6);
    ctx.fillStyle = '#ccc';
    ctx.font = `${ch * 0.16}px Arial`;
    ctx.fillText(`${String.fromCharCode(65 + r)}${c + 1}`, x, y + ch * 0.8);
  }
  ctx.fillStyle = 'rgba(160,210,255,.12)';
  ctx.fillRect(0, 0, w, h * 0.85);
  ctx.fillStyle = '#f2c21a';
  ctx.font = `bold ${h * 0.05}px Arial`;
  ctx.fillText('HF SNACKS', w * 0.1, h * 0.94);
}

export function posterCanvas(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 720;
  const x = c.getContext('2d');
  if (kind === 'meet') {
    x.fillStyle = '#ffd83a'; x.fillRect(0, 0, 512, 720);
    drawBall(x, 256, 330, 170, 'smile');
    x.fillStyle = '#1a1a1a'; x.textAlign = 'center';
    x.font = 'bold 64px Arial'; x.fillText('MEET VERITY', 256, 110);
    x.font = '30px Arial'; x.fillText('your personal helper friend', 256, 580);
    x.font = 'bold 34px Arial'; x.fillText('ASK ME ANYTHING!', 256, 650);
  } else if (kind === 'safety') {
    x.fillStyle = '#f2f0e6'; x.fillRect(0, 0, 512, 720);
    x.fillStyle = '#c9372c'; x.fillRect(0, 0, 512, 140);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 60px Arial'; x.fillText('SAFETY FIRST', 256, 92);
    x.fillStyle = '#222'; x.font = '30px Arial';
    ['DO NOT LOOK AWAY', 'FROM REJECTED UNITS', '', 'KEEP BIN LIDS LOCKED', '', 'BE KIND TO', 'YOUR VERITY'].forEach((l, i) => x.fillText(l, 256, 230 + i * 58));
    x.font = 'italic 22px Arial'; x.fillText(`${Math.floor(Math.random() * 3) + 1} days without an incident`, 256, 680);
  } else if (kind === 'employee') {
    x.fillStyle = '#e8e4d8'; x.fillRect(0, 0, 512, 720);
    x.fillStyle = '#333'; x.textAlign = 'center'; x.font = 'bold 44px Arial'; x.fillText('EMPLOYEE OF', 256, 90); x.fillText('THE MONTH', 256, 140);
    x.fillStyle = '#9aa'; x.fillRect(106, 190, 300, 340);
    drawBall(x, 256, 360, 110, 'grin');
    x.fillStyle = '#333'; x.font = '34px Arial'; x.fillText('VERITY', 256, 590); x.font = '24px Arial'; x.fillText('MARCH · APRIL · MAY · JUNE · …', 256, 640);
  } else if (kind === 'missing') {
    x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 512, 720);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.font = 'bold 90px Arial'; x.fillText('MISSING', 256, 110);
    x.fillStyle = '#bbb'; x.fillRect(116, 150, 280, 320);
    x.fillStyle = '#6a5a4a'; x.beginPath(); x.arc(256, 280, 70, 0, Math.PI * 2); x.fill(); x.fillRect(186, 340, 140, 130);
    x.fillStyle = '#111'; x.font = 'bold 44px Arial'; x.fillText('VERA PENROSE', 256, 530);
    x.font = '26px Arial'; x.fillText('Age 9 · last seen 12 March 1996', 256, 580); x.fillText('Helpful Friends Co., Unit 9', 256, 620);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
