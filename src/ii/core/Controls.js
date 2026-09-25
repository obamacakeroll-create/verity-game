// Unified controls: keyboard/mouse (part one's Input) + gamepad (standard mapping).

const PAD = {
  interact: [0], crouch: [1], flashlight: [2], talk: [3], camcorder: [4], throw: [5],
  breath: [6], sprint: [10], pause: [9], journal: [8], nightvision: [12], hint: [13],
};

export class Controls {
  constructor(input, settings) {
    this.input = input;
    this.settings = settings;
    this.padIndex = -1;
    this.padDown = new Set();
    this.padPressed = new Set();
    this.move = { x: 0, z: 0 };
    this.look = { x: 0, y: 0 };
    this.usingPad = false;
    this.sprintToggle = false;
    window.addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.padIndex = -1; this.padDown.clear(); });
  }

  poll(dt) {
    this.padPressed.clear();
    this.look.x = 0; this.look.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = this.padIndex >= 0 ? pads[this.padIndex] : [...pads].find((x) => x);
    // keyboard move
    const I = this.input;
    let x = 0, z = 0;
    if (I.isDown('forward') || I.down.has('ArrowUp')) z += 1;
    if (I.isDown('back') || I.down.has('ArrowDown')) z -= 1;
    if (I.isDown('left') || I.down.has('ArrowLeft')) x -= 1;
    if (I.isDown('right') || I.down.has('ArrowRight')) x += 1;
    if (p && p.connected) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0);
      const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (lx || ly) { x += lx; z -= ly; this.usingPad = true; }
      const sens = 2.6 * (this.settings.get('gamepadSensitivity') || 1);
      // quadratic response for fine aim
      this.look.x = Math.sign(rx) * rx * rx * sens * dt;
      this.look.y = Math.sign(ry) * ry * ry * sens * dt * 0.8;
      if (rx || ry) this.usingPad = true;
      p.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        const key = 'b' + i;
        if (down && !this.padDown.has(key)) { this.padPressed.add(key); this.usingPad = true; }
        if (down) this.padDown.add(key); else this.padDown.delete(key);
      });
      if (this.padPressed.has('b10')) this.sprintToggle = !this.sprintToggle;
      if (!(lx || ly)) this.sprintToggle = false;
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.x = x; this.move.z = z;
  }

  isDown(action) {
    if (this.input.isDown(action)) return true;
    if (action === 'sprint' && this.sprintToggle) return true;
    return (PAD[action] || []).some((i) => this.padDown.has('b' + i));
  }

  wasPressed(action) {
    if (this.input.wasPressed(action)) return true;
    if (action === 'sprint') return false;
    return (PAD[action] || []).some((i) => this.padPressed.has('b' + i));
  }

  padButton(i) { return this.padPressed.has('b' + i); }

  endFrame() { this.input.endFrame(); }
}
