import * as THREE from 'three';
import { Pipeline } from './Pipeline.js';

export const QUALITY = {
  low: { pixelRatio: 0.75, texScale: 0.5, ao: false, volumetric: false, volSteps: 12, volScale: 0.35, smaa: false, shadowMap: 1024, localShadows: 0, bloom: true },
  medium: { pixelRatio: 1, texScale: 0.5, ao: true, volumetric: true, volSteps: 16, volScale: 0.35, smaa: true, shadowMap: 1024, localShadows: 0, bloom: true },
  high: { pixelRatio: 1, texScale: 1, ao: true, volumetric: true, volSteps: 24, volScale: 0.5, smaa: true, shadowMap: 2048, localShadows: 1, bloom: true },
  ultra: { pixelRatio: 1.5, texScale: 2, ao: true, volumetric: true, volSteps: 32, volScale: 0.5, smaa: true, shadowMap: 2048, localShadows: 2, bloom: true },
};

export class Renderer2 {
  constructor(container, settings) {
    this.settings = settings;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // AgX lives in the pipeline
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = true;
    this.canvas = r.domElement;
    this.canvas.id = 'game-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 140);
    this.scene.add(this.camera);

    this.pipeline = new Pipeline(r, this.scene, this.camera);
    this.dyn = { enabled: true, acc: 0, over: 0, under: 0, scale: 1, cooldown: 0 };
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    settings.on('change', (k) => {
      if (['quality', 'resolutionScale', 'ao', 'volumetrics', 'motionBlur', 'dof', 'bloom'].includes(k)) { this.applyQuality(); this.resize(); }
      if (k === 'fov') { this.camera.fov = settings.get('fov'); this.camera.updateProjectionMatrix(); }
      if (k === 'dynamicResolution') { this.dyn.enabled = settings.get('dynamicResolution'); if (!this.dyn.enabled) this.setDynScale(1); }
    });
    this.dyn.enabled = settings.get('dynamicResolution') ?? true;
  }

  get quality() { return this._q; }

  applyQuality() {
    const s = this.settings;
    const q = { ...(QUALITY[s.get('quality')] || QUALITY.high) };
    if (s.get('ao') === false) q.ao = false;
    if (s.get('volumetrics') === false) q.volumetric = false;
    q.motionBlur = s.get('motionBlur') !== false;
    q.dof = s.get('dof') !== false;
    if (s.get('bloom') === false) q.bloom = false;
    this._q = q;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * (s.get('resolutionScale') || 1);
    this.renderer.setPixelRatio(Math.max(0.35, pr));
    this.pipeline.q = { ...this.pipeline.q, ao: q.ao, volumetric: q.volumetric, volSteps: q.volSteps, volScale: q.volScale, smaa: q.smaa, motionBlur: q.motionBlur, dof: q.dof, bloom: q.bloom };
    this.applyShadows();
  }

  applyShadows() {
    const q = this._q;
    this.scene.traverse((o) => {
      if (!o.isLight || !o.shadow || !o.userData.shadowRole) return;
      const role = o.userData.shadowRole;
      const size = role === 'hero' ? q.shadowMap : Math.min(1024, q.shadowMap);
      if (o.shadow.mapSize.x !== size) {
        o.shadow.mapSize.set(size, size);
        o.shadow.map?.dispose();
        o.shadow.map = null;
      }
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.pipeline.setSize(size.x, size.y, true);
  }

  setDynScale(s) {
    this.dyn.scale = s;
    this.pipeline.setScale(s);
  }

  // dynamic resolution: keep the frame time near the display's refresh
  updateDynamic(dt) {
    const d = this.dyn;
    if (!d.enabled || dt <= 0 || dt > 0.25) return;
    d.acc = d.acc ? d.acc * 0.95 + dt * 0.05 : dt;
    d.cooldown -= dt;
    if (d.cooldown > 0) return;
    const target = 1 / 60;
    if (d.acc > target * 1.25) d.over += dt; else d.over = 0;
    if (d.acc < target * 1.06) d.under += dt; else d.under = 0;
    if (d.over > 1.0 && d.scale > 0.55) { this.setDynScale(Math.max(0.55, +(d.scale - 0.1).toFixed(2))); d.over = 0; d.cooldown = 1.5; }
    else if (d.under > 4 && d.scale < 1) { this.setDynScale(Math.min(1, +(d.scale + 0.1).toFixed(2))); d.under = 0; d.cooldown = 2.5; }
  }

  render(dt) {
    this.pipeline.render(dt);
  }
}
