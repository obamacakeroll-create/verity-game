import { damp } from '../../core/util.js';

// The HF Security camcorder: raise it to record (VHS look), zoom with the
// wheel, and switch on night vision to see in the dark — and to see things
// that aren't there when you look without it.
export class Camcorder {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.reset();
  }

  reset() {
    this.has = false;
    this.up = false;
    this.nv = false;
    this.zoom = 1;
    this.zoomK = 1;
    this.battery = 1;
    this.raiseT = 0;
    this.recTime = 0;
  }

  toggle() {
    if (!this.has || this.player.hidden) return;
    this.up ? this.lower() : this.raise();
  }
  raise() {
    if (this.battery <= 0.001) { this.game.ui.toast('The camcorder battery is flat.'); this.game.audio.sfx.play('keypadBad', { volume: 0.4 }); return; }
    this.up = true;
    this.game.audio.sfx.play('camBeep');
    this.game.ui.setCamcorder(true, this);
  }
  lower() {
    if (!this.up) return;
    this.up = false;
    this.nv = false;
    this.zoom = 1;
    this.game.audio.sfx.play('click', { volume: 0.4 });
    this.game.ui.setCamcorder(false, this);
    this.applyNV();
  }
  toggleNV() {
    if (!this.has) return;
    if (!this.up) this.raise();
    if (!this.up) return;
    this.nv = !this.nv;
    this.game.audio.sfx.play(this.nv ? 'nvOn' : 'click', { volume: 0.6 });
    this.applyNV();
  }
  applyNV() {
    const g = this.game;
    // an IR illuminator: invisible to the eye, bright through the lens
    g.lights.hemi.intensity = this.nv ? 1.2 : g.story?.hemi ?? 0;
    g.level?.nvLayer && (g.level.nvLayer.visible = this.nv);
    g.story?.onNV?.(this.nv);
  }
  zoomBy(d) {
    if (!this.up) return;
    const z = Math.max(1, Math.min(4, this.zoom + d * 0.5));
    if (z !== this.zoom) { this.zoom = z; this.game.audio.sfx.play('camZoom', { volume: 0.7 }); }
  }

  update(dt) {
    const g = this.game;
    this.zoomK = damp(this.zoomK, this.up ? this.zoom : 1, 8, dt);
    const base = g.settings.get('fov');
    const fov = base / this.zoomK;
    if (Math.abs(g.camera.fov - fov) > 0.01) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
    if (this.up) {
      this.recTime += dt;
      this.battery = Math.max(0, this.battery - dt / (this.nv ? 150 : 420) * (g.state.hard ? 1.4 : 1));
      if (this.battery <= 0) { g.ui.toast('The camcorder died.'); this.lower(); }
    }
    g.ui.updateCamcorder?.(this);
  }
}
