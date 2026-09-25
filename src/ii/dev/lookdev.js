import * as THREE from 'three';
import { Renderer2 } from '../render/Renderer2.js';
import { TextureBaker } from '../render/TextureBaker.js';
import { MaterialLib, SHARED } from '../render/MaterialLib.js';
import { grade } from '../render/Grades.js';
import { Level } from '../world/Level.js';
import { Lights2 } from '../world/Lights2.js';
import { Settings2 } from '../core/Settings2.js';
import { Monster } from '../entities/Monster.js';

// Look-development scene: a corridor + room to tune materials and the pipeline.
export async function lookdev() {
  const settings = new Settings2();
  const R = new Renderer2(document.getElementById('canvas-host'), settings);
  const baker = new TextureBaker(R.renderer, { scale: R.quality.texScale });
  const lib = new MaterialLib(baker);
  const game = { renderer: R, lib, scene: R.scene };
  window.__lookdev = game;
  const scene = R.scene;
  const lights = new Lights2(scene, settings);
  const level = new Level(game, 'lookdev');
  scene.add(level.root);
  const hall = level.zone('hall', { x0: -1.2, z0: -12, x1: 1.2, z1: 0, h: 2.8, grade: 'office' });
  const room = level.zone('room', { x0: 1.2, z0: -9, x1: 7, z1: -3, h: 2.8, grade: 'office' });
  const b = level.builder('hall');
  b.room({ x0: -1.2, z0: -12, x1: 1.2, z1: 0, h: 2.8, wall: 'peel', floor: 'vct', ceil: 'ceilingTile', sides: { e: [{ at: 6, w: 1.0, h: 2.1 }] } });
  const b2 = level.builder('room');
  b2.room({ x0: 1.2, z0: -9, x1: 7, z1: -3, h: 2.8, wall: 'cinder', floor: 'concrete', ceil: 'ceilingTile', skip: ['w'] });
  // props
  b.box(0.6, 0.45, 0.45, [0.4, 0.225, -8], { r: 'cardboard' }, { bevel: 0.01, collide: true });
  b.box(0.5, 0.4, 0.4, [-0.6, 0.2, -3.2], { r: 'cardboard' }, { bevel: 0.01, rot: [0, 0.4, 0] });
  b2.box(1.6, 0.75, 0.8, [4, 0.375, -8.4], { r: 'laminate' }, { bevel: 0.02 });
  b2.box(0.5, 1.9, 0.6, [6.6, 0.95, -5], { r: 'metalPaint', color: 0x6d7f74 }, { bevel: 0.015 });
  b2.box(0.9, 0.05, 0.9, [3, 0.025, -5], { r: 'rust' }, {});
  // fluorescent tube mesh
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff6ff, emissiveIntensity: 6 });
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 1.2), tubeMat);
  tube.position.set(0, 2.76, -6);
  scene.add(tube);
  lights.add({ type: 'fluo', position: new THREE.Vector3(0, 2.6, -6), color: 0xdff4ff, intensity: 5, range: 9, zone: hall, emissive: tubeMat, state: 'flicker' });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc98a, emissiveIntensity: 20 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), bulbMat);
  bulb.position.set(4, 2.2, -6);
  scene.add(bulb);
  lights.add({ type: 'bulb', position: new THREE.Vector3(4, 2.2, -6), color: 0xffc98a, intensity: 7, range: 8, zone: room, emissive: bulbMat });
  // Verity ball
  const pla = lib.get('pla', { physical: { clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0 }, rough: 1, metal: 0 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 64, 48), pla);
  ball.position.set(0, 1.45, -5);
  ball.castShadow = true;
  scene.add(ball);
  // flashlight
  const spot = new THREE.SpotLight(0xfff1e0, 30, 18, 0.5, 0.55, 2);
  spot.castShadow = true;
  spot.userData.shadowRole = 'hero';
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0006;
  spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  spot.userData.volScale = +(new URLSearchParams(location.search).get('vs') || 0.12);
  R.pipeline.hero = spot;
  R.pipeline.p.density = +(new URLSearchParams(location.search).get('dens') || 0.02);
  R.applyShadows();

  const P = new URLSearchParams(location.search);
  if (P.has('noao')) R.pipeline.p.ao = 0;
  if (P.has('novol')) R.pipeline.p.volume = 0;
  if (P.has('key')) R.pipeline.p.key = +P.get('key');
  if (P.has('fl')) spot.intensity = +P.get('fl');
  if (P.has('noenv')) for (const m of lib.cache.values()) m.envMapIntensity = 0;
  await level.finalize({ ao: !P.has('novao') });
  for (const z of level.zones.values()) {
    lights.bindAround(z.probeAt, z);
    lights.update(0, 0, z.probeAt, z, new Set([z]));
    z.probe.capture(scene, [tube, bulb, ball, spot]);
  }
  let mon = null;
  if (P.get('view')?.startsWith('monster')) {
    mon = new Monster(game);
    mon.show(true);
    mon.position.set(0, 0, -6);
    mon.root.rotation.y = 0;
    mon.speed = +(P.get('speed') || 0);
    mon.mode = P.get('mode') || 'walk';
    mon.jawTarget = +(P.get('jaw') || 0);
    window.__mon = mon;
  }
  // rebuild materials so they pick up env maps (zone materials already reference probe textures)
  R.pipeline.setLUTs(grade('office'), grade('office'), 0);
  const cam = R.camera;
  let t = 0;
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'hall';
  const clock = new THREE.Timer();
  R.renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    SHARED.uTime.value = t;
    if (view === 'hall') {
      cam.position.set(0.2, 1.6, -1 - Math.sin(t * 0.2) * 0.5);
      cam.lookAt(0.3, 1.3, -8);
    } else if (view === 'room') {
      cam.position.set(2.2, 1.6, -3.8);
      cam.lookAt(5, 0.8, -7);
    } else if (view === 'monster') {
      mon.update(dt);
      cam.position.set(0.9, 1.7, -3.2);
      cam.lookAt(0, 1.4, -6);
      mon.lookAt = cam.position.clone();
    } else if (view === 'monsterface') {
      mon.update(dt);
      cam.position.set(0.1, 2.35, -5.15);
      cam.lookAt(0, 2.3, -6);
      mon.lookAt = cam.position.clone();
    } else {
      cam.position.set(0.3, 1.5, -4.2);
      cam.lookAt(ball.position);
    }
    cam.updateMatrixWorld();
    spot.position.copy(cam.position).add(new THREE.Vector3(0.15, -0.2, 0));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    spot.target.position.copy(spot.position).addScaledVector(dir, 5);
    lights.update(dt, t, cam.position, level.zoneAt(cam.position) || hall, new Set([hall, room]));
    R.pipeline.volLights = lights.volLights;
    R.render(dt);
  });
  window.__lookdevReady = true;
}
