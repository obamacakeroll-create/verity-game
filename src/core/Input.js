import { Emitter } from './util.js';

// Keyboard/mouse input with action mapping and pointer lock handling.
export class Input extends Emitter {
  constructor(canvas, settings) {
    super();
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.enabled = true; // false while typing in a text box
    this.captureNext = null; // rebinding callback

    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      this.emit('keydown', e);
      if (!this.enabled) return;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.emit('keyup', e);
    });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.pressed.add('Mouse0'); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) this.emit('unlock');
      if (!was && this.locked) this.emit('lock');
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not supported */ }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  key(action) { return this.settings.get('keys')[action]; }
  isDown(action) {
    if (!this.enabled) return false;
    const code = this.key(action);
    if (action === 'sprint') return this.down.has(code) || this.down.has('ShiftRight');
    return this.down.has(code);
  }
  wasPressed(action) {
    if (!this.enabled) return false;
    return this.pressed.has(this.key(action));
  }
  wasPressedCode(code) { return this.pressed.has(code); }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
  endFrame() { this.pressed.clear(); }
}

export function keyLabel(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', Space: 'Space',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab',
  };
  return map[code] || code;
}
