import * as THREE from 'three';
import { makeRng } from '../core/util.js';

// Verity's painted face, drawn on a canvas in a 1024×1024 design space.
// Expressions follow the escalation of the insanity meter.
export const EXPRESSIONS = ['smile', 'wink', 'neutral', 'annoyed', 'laugh', 'wail', 'grin'];
export const EXPRESSION_NAMES = {
  smile: 'Helpful', wink: 'Playful', neutral: 'Patient', annoyed: 'Disappointed',
  laugh: 'Delighted', wail: 'Hurt', grin: 'Truthful',
};

const INK = '#0d0b08';

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

function roughStroke(ctx, pts, width, r) {
  // slightly uneven painted line
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < 2; k++) {
    ctx.lineWidth = width * (k ? 0.75 : 1);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (r() - 0.5) * 2, jy = (r() - 0.5) * 2;
      if (i === 0) ctx.moveTo(x + jx, y + jy);
      else ctx.lineTo(x + jx, y + jy);
    });
    ctx.stroke();
  }
}

function curvePts(x0, y0, cx, cy, x1, y1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    pts.push([a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1]);
  }
  return pts;
}

export function drawExpression(ctx, name, p) {
  const r = makeRng(7);
  const blink = p.blink || 0;
  const talk = p.talk || 0;
  const lx = (p.lookX || 0) * 26, ly = (p.lookY || 0) * 18;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  const eyeY = 400 + ly;
  switch (name) {
    case 'smile': {
      ellipse(ctx, 400 + lx, eyeY, 36, 64 * (1 - blink * 0.95));
      ellipse(ctx, 624 + lx, eyeY, 36, 64 * (1 - blink * 0.95));
      if (talk > 0.05) {
        ctx.beginPath();
        ctx.moveTo(340, 600);
        ctx.quadraticCurveTo(512, 700 + talk * 60, 684, 600);
        ctx.quadraticCurveTo(512, 640 + talk * 10, 340, 600);
        ctx.fill();
      }
      roughStroke(ctx, curvePts(335, 596, 512, 720, 689, 596), 24, r);
      roughStroke(ctx, [[318, 580], [340, 604]], 18, r);
      roughStroke(ctx, [[706, 580], [684, 604]], 18, r);
      break;
    }
    case 'wink': {
      ellipse(ctx, 400 + lx, eyeY, 36, 64 * (1 - blink * 0.95));
      roughStroke(ctx, curvePts(572 + lx, eyeY + 10, 624 + lx, eyeY - 44, 676 + lx, eyeY + 10), 22, r);
      roughStroke(ctx, [[676 + lx, eyeY + 8], [700 + lx, eyeY - 12]], 12, r);
      ctx.beginPath();
      ctx.moveTo(320, 590);
      ctx.quadraticCurveTo(512, 760 + talk * 40, 704, 590);
      ctx.quadraticCurveTo(512, 690, 320, 590);
      ctx.fill();
      roughStroke(ctx, curvePts(312, 584, 512, 770 + talk * 40, 712, 584), 22, r);
      break;
    }
    case 'neutral': {
      const h = 70 * (1 - blink * 0.95);
      ctx.beginPath(); ctx.roundRect(372 + lx, eyeY - h / 2, 50, h, 14); ctx.fill();
      ctx.beginPath(); ctx.roundRect(602 + lx, eyeY - h / 2, 50, h, 14); ctx.fill();
      if (talk > 0.05) ellipse(ctx, 512, 620, 150, 10 + talk * 34);
      roughStroke(ctx, [[322, 620], [512, 622], [702, 620]], 26, r);
      break;
    }
    case 'annoyed': {
      // heavy lids: flat top, rounded bottom
      for (const ex of [400, 624]) {
        const h = 40 * (1 - blink * 0.9);
        ctx.beginPath();
        ctx.moveTo(ex - 78 + lx, eyeY + 8);
        ctx.quadraticCurveTo(ex + lx, eyeY - 12, ex + 78 + lx, eyeY + 8);
        ctx.quadraticCurveTo(ex + lx, eyeY + 8 + h * 1.3, ex - 78 + lx, eyeY + 8);
        ctx.fill();
      }
      ellipse(ctx, 512, 640, 76 + talk * 10, 40 + talk * 30);
      break;
    }
    case 'laugh': {
      ellipse(ctx, 400 + lx, eyeY - 20, 40, 70 * (1 - blink * 0.95));
      ellipse(ctx, 624 + lx, eyeY - 20, 40, 70 * (1 - blink * 0.95));
      const open = 1 + talk * 0.25;
      ctx.beginPath();
      ctx.moveTo(300, 540);
      ctx.quadraticCurveTo(512, 520, 724, 540);
      ctx.quadraticCurveTo(720, 820 * open - 40, 512, 830 * open - 40);
      ctx.quadraticCurveTo(304, 820 * open - 40, 300, 540);
      ctx.fill();
      // tongue
      ctx.fillStyle = '#e3b62a';
      ctx.beginPath();
      ctx.moveTo(420, 780 * open - 30);
      ctx.quadraticCurveTo(470, 730 * open - 30, 512, 752 * open - 30);
      ctx.quadraticCurveTo(554, 730 * open - 30, 604, 780 * open - 30);
      ctx.quadraticCurveTo(512, 800 * open - 30, 420, 780 * open - 30);
      ctx.fill();
      ctx.fillStyle = INK;
      break;
    }
    case 'wail': {
      for (const [ex, s] of [[392, 1], [632, -1]]) {
        const h = 1 - blink * 0.8;
        ctx.beginPath();
        ctx.moveTo(ex - 80 * s + lx, eyeY - 30 * h);
        ctx.quadraticCurveTo(ex + lx, eyeY - 40 * h, ex + 70 * s + lx, eyeY + 10);
        ctx.quadraticCurveTo(ex + lx, eyeY + 60 * h, ex - 80 * s + lx, eyeY - 30 * h);
        ctx.fill();
        ctx.fillStyle = '#f4f0e0';
        ellipse(ctx, ex + 12 * s + lx, eyeY + 4, 9 * h, 9 * h);
        ctx.fillStyle = INK;
      }
      const o = 1 + talk * 0.2;
      ctx.beginPath();
      ctx.moveTo(420, 560);
      ctx.quadraticCurveTo(512, 520, 604, 560);
      ctx.quadraticCurveTo(700, 700, 690, 860 * o - 60);
      ctx.quadraticCurveTo(512, 820 * o - 60, 334, 860 * o - 60);
      ctx.quadraticCurveTo(324, 700, 420, 560);
      ctx.fill();
      break;
    }
    case 'grin':
    default: {
      // bruised, sunken eyes
      for (const ex of [390, 634]) {
        const g = ctx.createRadialGradient(ex + lx, eyeY, 10, ex + lx, eyeY, 120);
        g.addColorStop(0, 'rgba(40,5,20,0.95)');
        g.addColorStop(0.45, 'rgba(90,20,40,0.55)');
        g.addColorStop(1, 'rgba(90,40,20,0)');
        ctx.fillStyle = g;
        ellipse(ctx, ex + lx, eyeY, 115, 100);
        ctx.fillStyle = INK;
        ellipse(ctx, ex + lx, eyeY, 34, 52 * (1 - blink * 0.9));
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ellipse(ctx, ex + lx - 8, eyeY - 14, 8, 10);
        ctx.fillStyle = INK;
      }
      drawGrinMouth(ctx, 512, 640, 1 + talk * 0.12, r);
      break;
    }
  }
}

export function drawGrinMouth(ctx, cx, cy, open, r, scale = 1) {
  const W = 290 * scale, top = -70 * scale, bot = 170 * scale * open;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-W, top);
  ctx.quadraticCurveTo(0, top + 90 * scale, W, top);
  ctx.quadraticCurveTo(W * 0.8, bot, 0, bot);
  ctx.quadraticCurveTo(-W * 0.8, bot, -W, top);
  ctx.fill();
  // ragged painted edge
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5 * scale;
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const upper = i % 2 === 0;
    const x = -W + t * 2 * W;
    const y = upper ? top + Math.sin(t * Math.PI) * 45 * scale - 4 : top + Math.sin(t * Math.PI) * (bot - top) * 0.98;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 18 * scale, y + (upper ? -1 : 1) * (10 + r() * 22) * scale);
    ctx.stroke();
  }
  // teeth
  const rows = [
    { y: (t) => top + 12 * scale + Math.sin(t * Math.PI) * 42 * scale, h: 62 * scale, n: 14 },
    { y: (t) => top + Math.sin(t * Math.PI) * (bot - top) * 0.62 + 18 * scale, h: 54 * scale, n: 13 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const t = (i + 0.5) / row.n;
      const x = (-W * 0.86 + t * 1.72 * W);
      const edge = Math.sin(t * Math.PI);
      const tw = (2 * W * 0.86) / row.n * 0.84;
      const th = row.h * (0.45 + edge * 0.55);
      const y = row.y(t);
      const g = ctx.createLinearGradient(0, y, 0, y + th);
      g.addColorStop(0, ri ? '#bfb7a0' : '#f3efe2');
      g.addColorStop(1, ri ? '#f0ead8' : '#c9bfa6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - tw / 2, ri ? y - th * 0.2 : y, tw, th, 8 * scale);
      ctx.fill();
    }
  });
  ctx.restore();
}

// Hairline cracks painted over the ball as it breaks down.
function drawCracks(ctx, amount, seed) {
  if (amount <= 0) return;
  const r = makeRng(seed);
  ctx.strokeStyle = `rgba(20,10,0,${0.4 + amount * 0.5})`;
  ctx.lineWidth = 3;
  const n = Math.floor(amount * 9);
  for (let i = 0; i < n; i++) {
    let x = 512 + (r() - 0.5) * 700, y = 512 + (r() - 0.5) * 700;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (r() - 0.5) * 90;
      y += (r() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export class VerityFace {
  constructor(size = 512) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.work = document.createElement('canvas');
    this.work.width = this.work.height = size;
    this.wctx = this.work.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.current = 'smile';
    this.previous = 'smile';
    this.mix = 1;
    this.blink = 0;
    this.blinkTimer = 2.5;
    this.talk = 0;
    this.talking = false;
    this.glitch = 0;
    this.cracks = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.off = false; // face "powered down"
    this.t = 0;
    this.dirty = true;
    this.redrawTimer = 0;
    this.draw();
  }

  set(name, instant = false) {
    if (name === this.current) return;
    this.previous = this.current;
    this.current = name;
    this.mix = instant ? 1 : 0;
    this.glitch = Math.max(this.glitch, instant ? 0 : 0.6);
    this.dirty = true;
  }

  update(dt) {
    this.t += dt;
    const prevBlink = this.blink;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkPhase = 0.0001;
      this.blinkTimer = 2 + Math.random() * 4;
    }
    if (this.blinkPhase) {
      this.blinkPhase += dt * 9;
      this.blink = Math.sin(Math.min(Math.PI, this.blinkPhase));
      if (this.blinkPhase >= Math.PI) { this.blinkPhase = 0; this.blink = 0; }
    }
    const tgtTalk = this.talking ? 0.35 + 0.65 * Math.abs(Math.sin(this.t * 13) * Math.sin(this.t * 7.3)) : 0;
    this.talk += (tgtTalk - this.talk) * Math.min(1, dt * 20);
    if (this.mix < 1) this.mix = Math.min(1, this.mix + dt * 2.2);
    if (this.glitch > 0) this.glitch = Math.max(0, this.glitch - dt * 0.9);
    this.redrawTimer -= dt;
    const animating = this.mix < 1 || this.glitch > 0 || this.talk > 0.01 || this.blink !== prevBlink || this.dirty;
    if (animating && this.redrawTimer <= 0) {
      this.draw();
      this.redrawTimer = 1 / 30;
    }
  }

  params() {
    return { blink: this.blink, talk: this.talk, lookX: this.lookX, lookY: this.lookY };
  }

  draw() {
    const { ctx, wctx, size } = this;
    const k = size / 1024;
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, size, size);
    if (!this.off) {
      wctx.setTransform(k, 0, 0, k, 0, 0);
      const p = this.params();
      if (this.mix < 1) {
        wctx.globalAlpha = 1 - this.mix;
        drawExpression(wctx, this.previous, p);
      }
      wctx.globalAlpha = this.mix;
      drawExpression(wctx, this.current, p);
      wctx.globalAlpha = 1;
      drawCracks(wctx, this.cracks, 99);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (this.glitch > 0.02) {
      const slices = 14;
      const h = size / slices;
      for (let i = 0; i < slices; i++) {
        const off = (Math.random() - 0.5) * this.glitch * size * 0.12;
        ctx.drawImage(this.work, 0, i * h, size, h, off, i * h, size, h);
      }
    } else {
      ctx.drawImage(this.work, 0, 0);
    }
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}

// Static render of one expression (used by the HUD icon and the Extras gallery).
export function renderExpressionIcon(canvas, name, { ball = true } = {}) {
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  if (ball) {
    const g = ctx.createRadialGradient(s * 0.38, s * 0.32, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
    g.addColorStop(0, '#ffe46a');
    g.addColorStop(0.7, '#e9b80e');
    g.addColorStop(1, '#8a6200');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  const k = s / 1024;
  ctx.setTransform(k * 0.92, 0, 0, k * 0.92, s * 0.04, s * 0.04);
  drawExpression(ctx, name, {});
  ctx.restore();
}
