import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Film grain, vignette, chromatic aberration and insanity-driven distortion.
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.08 },
    uVignette: { value: 1.1 },
    uChromatic: { value: 0.0015 },
    uInsanity: { value: 0 },
    uWarp: { value: 0 },
    uPulse: { value: 0 },
    uRed: { value: 0 },
    uFlash: { value: 0 },
    uBrightness: { value: 1 },
    uScanline: { value: 0 },
    uBlackout: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uChromatic, uInsanity, uWarp, uPulse, uRed, uFlash, uBrightness, uScanline, uBlackout;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      // insanity warp: breathing lens + wobble
      float w = uWarp;
      uv += c * (sin(uTime * 1.3) * 0.02 * w + uPulse * 0.03 * r);
      uv.x += sin(uv.y * 30.0 + uTime * 4.0) * 0.0025 * w;
      uv.y += cos(uv.x * 24.0 + uTime * 3.1) * 0.0018 * w;
      // horizontal tear glitch at high insanity
      float tear = step(0.985 - uScanline * 0.08, hash(vec2(floor(uv.y * 40.0), floor(uTime * 12.0))));
      uv.x += tear * (hash(vec2(uTime, uv.y)) - 0.5) * 0.06 * uScanline;

      float ca = uChromatic * (1.0 + r * 3.0) + w * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;

      col *= uBrightness;
      // desaturate + sickly tint with insanity
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uInsanity * 0.45);
      col = mix(col, col * vec3(1.15, 0.72, 0.62) + vec3(0.02, 0.0, 0.0) * l, uRed);

      // vignette
      float v = smoothstep(0.85, 0.15, r * uVignette * (1.0 + uPulse * 0.25));
      col *= mix(0.25, 1.0, v);

      // grain
      float g = hash(uv * uResolution + fract(uTime * 7.13) * 100.0) - 0.5;
      col += g * uGrain * (0.6 + l);

      // scanline flicker (VHS-ish when glitching)
      col *= 1.0 - uScanline * 0.12 * sin(vUv.y * uResolution.y * 1.5 + uTime * 30.0);

      col = mix(col, vec3(1.0), uFlash);
      col *= 1.0 - uBlackout;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.build(quality);
  }

  build(quality) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.samples || 0,
    });
    this.composer?.dispose?.();
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.45, 0.9);
    this.bloom.enabled = !!quality.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);
    this.u = this.horror.uniforms;
    this.u.uResolution.value.set(size.x, size.y);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.u.uResolution.value.set(size.x, size.y);
  }

  render(dt) {
    this.u.uTime.value += dt;
    this.composer.render(dt);
  }
}
