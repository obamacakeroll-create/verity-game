import * as THREE from 'three';
import { PostFX } from './PostFX.js';
import { QUALITY_PRESETS } from '../core/Settings.js';

export class Renderer {
  constructor(container, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x050403, 0.085);
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.03, 80);
    this.scene.add(this.camera);

    this.applyQuality(false);
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    settings.on('change', (k) => {
      if (k === 'quality' || k === 'resolutionScale') {
        this.applyQuality(true);
        this.post.build(this.quality);
        this.resize();
      }
      if (k === 'fov') { this.camera.fov = settings.get('fov'); this.camera.updateProjectionMatrix(); }
      if (k === 'bloom') this.post.bloom.enabled = this.quality.bloom && settings.get('bloom');
      if (k === 'shadows') this.applyShadows();
    });
  }

  get quality() { return this._quality; }

  applyQuality(rebuild) {
    const preset = QUALITY_PRESETS[this.settings.get('quality')] || QUALITY_PRESETS.high;
    this._quality = { ...preset, bloom: preset.bloom && this.settings.get('bloom') };
    const pr = Math.min(window.devicePixelRatio || 1, preset.pixelRatio) * this.settings.get('resolutionScale');
    this.renderer.setPixelRatio(Math.max(0.4, pr));
    if (rebuild) this.applyShadows();
  }

  applyShadows() {
    this.renderer.shadowMap.enabled = true; // flashlight cookie needs a shadow map
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.userData.shadowRole) {
        const role = o.userData.shadowRole;
        const on = role === 'flashlight' || (this.settings.get('shadows') && this._quality.pointShadows);
        o.castShadow = on;
        const s = role === 'flashlight' ? this._quality.shadowMap : Math.min(512, this._quality.shadowMap);
        if (o.shadow.mapSize.x !== s) {
          o.shadow.mapSize.set(s, s);
          o.shadow.map?.dispose();
          o.shadow.map = null;
        }
      }
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  render(dt) {
    this.post.render(dt);
  }
}
