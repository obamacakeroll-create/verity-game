import * as THREE from 'three';
import { Level } from '../Level.js';
import { buildExterior } from './factory/Exterior.js';
import { buildFront } from './factory/Front.js';
import { buildProduction } from './factory/Production.js';
import { buildBasement } from './factory/Basement.js';

// HELPFUL FRIENDS Co., Unit 9, Kessler Industrial Park.
// Ground floor (layer 0): car park, lobby, offices, print lab, warehouse.
// Sub-basement (layer -1, y = -8): cold storage, the lab, the tunnel, the Core.
export function buildFactory(game) {
  const L = new Level(game, 'factory');
  L.collect = { tapes: {}, docs: {}, figures: {} };
  L.nvLayer = new THREE.Group();
  L.nvLayer.name = 'nv-only';
  L.nvLayer.visible = false;
  L.dynamic.add(L.nvLayer);

  const dry = { wet: 0 };
  const outdoorFog = { density: 0.016, heightFalloff: 0.12, ambient: [0.0016, 0.0015, 0.0014], noise: 0.9 };
  const indoorFog = { density: 0.024, heightFalloff: 0.25, ambient: [0.0005, 0.0005, 0.0006], noise: 0.7 };
  const bigFog = { density: 0.03, heightFalloff: 0.12, ambient: [0.0007, 0.0007, 0.0008], noise: 0.85 };
  const coldFog = { density: 0.05, heightFalloff: 0.6, ambient: [0.0006, 0.0008, 0.001], noise: 1.0 };
  const Z = (id, o) => L.zone(id, o);
  Z('lot', { x0: -34, z0: 4, x1: 14, z1: 36, h: 12, outdoor: true, grade: 'night', reverb: 'outdoor', fog: outdoorFog, neighbors: ['yard', 'lobby', 'security', 'offices'], probe: [0, 1.8, 12], envIntensity: 0.5, exposure: 1.25, mat: { wet: 1 } });
  Z('yard', { x0: 14, z0: -6, x1: 64, z1: 36, h: 12, outdoor: true, grade: 'night', reverb: 'outdoor', fog: outdoorFog, neighbors: ['lot', 'warehouse', 'security'], probe: [38, 1.8, 4], envIntensity: 0.5, exposure: 1.25, mat: { wet: 1 } });
  Z('lobby', { x0: -8, z0: -10, x1: 8, z1: 4, h: 4.5, grade: 'office', reverb: 'hall', fog: indoorFog, neighbors: ['lot', 'security', 'offices', 'prodhall'], probe: [0, 1.6, -3], mat: dry });
  Z('security', { x0: 8, z0: -6, x1: 14, z1: 4, h: 3, grade: 'office', reverb: 'small', fog: indoorFog, neighbors: ['lobby', 'lot'], mat: dry });
  Z('offices', { x0: -32, z0: -18, x1: -8, z1: 4, h: 3, grade: 'office', reverb: 'office', fog: indoorFog, neighbors: ['lobby', 'manager', 'breakroom', 'lot'], probe: [-18, 1.5, -7], mat: dry });
  Z('manager', { x0: -32, z0: -18, x1: -25, z1: -11, h: 3, grade: 'office', reverb: 'small', fog: indoorFog, neighbors: ['offices'], mat: dry });
  Z('breakroom', { x0: -32, z0: -3, x1: -25, z1: 4, h: 3, grade: 'office', reverb: 'small', fog: indoorFog, neighbors: ['offices'], mat: dry });
  Z('prodhall', { x0: -2, z0: -22, x1: 2, z1: -10, h: 3, grade: 'printlab', reverb: 'small', fog: indoorFog, neighbors: ['lobby', 'printlab'], mat: dry });
  Z('printlab', { x0: -16, z0: -46, x1: 16, z1: -22, h: 5.5, grade: 'printlab', reverb: 'hall', fog: bigFog, neighbors: ['prodhall', 'control', 'warehouse'], probe: [2, 1.8, -34], mat: dry });
  Z('control', { x0: -16, z0: -31, x1: -9, z1: -22, h: 3, grade: 'printlab', reverb: 'small', fog: indoorFog, neighbors: ['printlab'], mat: dry });
  Z('warehouse', { x0: 16, z0: -50, x1: 60, z1: -6, h: 9, grade: 'warehouse', reverb: 'huge', fog: bigFog, neighbors: ['printlab', 'dispatch', 'yard', 'elevator'], probe: [38, 2.2, -28], exposure: 1.1, mat: dry });
  Z('dispatch', { x0: 16, z0: -50, x1: 23, z1: -43, h: 3, grade: 'warehouse', reverb: 'small', fog: indoorFog, neighbors: ['warehouse'], mat: dry });
  Z('elevator', { x0: 54.6, z0: -50, x1: 60, z1: -44.4, floorY: -8, h: 17, anyLayer: true, grade: 'warehouse', reverb: 'small', fog: indoorFog, neighbors: ['warehouse', 'coldhall'], probe: [57.3, -6.4, -47.2], mat: dry });
  const B = { floorY: -8, layer: -1 };
  Z('coldhall', { ...B, x0: 28, z0: -49, x1: 54.6, z1: -45, h: 3, grade: 'cold', reverb: 'tunnel', fog: coldFog, neighbors: ['freezerA', 'freezerB', 'archive', 'lab', 'elevator'], mat: { ...dry, frost: true } });
  Z('freezerA', { ...B, x0: 33, z0: -57, x1: 39, z1: -49, h: 3, grade: 'cold', reverb: 'freezer', fog: coldFog, neighbors: ['coldhall'], mat: { ...dry, frost: true } });
  Z('freezerB', { ...B, x0: 39, z0: -57, x1: 45, z1: -49, h: 3, grade: 'cold', reverb: 'freezer', fog: coldFog, neighbors: ['coldhall'], mat: { ...dry, frost: true } });
  Z('archive', { ...B, x0: 45, z0: -57, x1: 51, z1: -49, h: 3, grade: 'cold', reverb: 'freezer', fog: coldFog, neighbors: ['coldhall'], mat: { ...dry, frost: true } });
  Z('lab', { ...B, x0: 16, z0: -53, x1: 28, z1: -41, h: 3.2, grade: 'office', reverb: 'room', fog: indoorFog, neighbors: ['coldhall', 'vera', 'tunnel'], probe: [22, -6.4, -46], mat: dry });
  Z('vera', { ...B, x0: 16, z0: -53, x1: 21, z1: -48, h: 3.2, grade: 'apartment', reverb: 'small', fog: indoorFog, neighbors: ['lab'], mat: dry });
  Z('tunnel', { ...B, x0: -3, z0: -48.6, x1: 16, z1: -45.4, h: 2.6, grade: 'core', reverb: 'tunnel', fog: { ...coldFog, density: 0.04 }, neighbors: ['lab', 'core'], mat: { wet: 0.8 } });
  Z('core', { ...B, x0: -28, z0: -60, x1: -2, z1: -34, h: 14, grade: 'core', reverb: 'core', fog: { density: 0.035, heightFalloff: 0.08, ambient: [0.0012, 0.0008, 0.0004], noise: 1.0 }, neighbors: ['tunnel'], probe: [-8, -6.2, -47], exposure: 1.1, mat: { wet: 0.5 } });
  Z('road', { x0: 380, z0: -320, x1: 420, z1: 40, h: 14, outdoor: true, grade: 'night', reverb: 'car', fog: { density: 0.02, heightFalloff: 0.1, ambient: [0.0012, 0.001, 0.0009], noise: 0.9 }, neighbors: [], probe: [398.2, 1.3, 0], envIntensity: 0.4, mat: { wet: 1 } });

  const ext = buildExterior(L, game);
  const front = buildFront(L, game);
  const prod = buildProduction(L, game);
  const base = buildBasement(L, game);
  L.refs = { ...ext, ...front, ...prod, ...base };

  L.anchors = {
    lotStart: new THREE.Vector3(2.6, 0, 19.2),
    carDoor: ext.carRef.door,
    carSeat: ext.carRef.seat,
    entry: new THREE.Vector3(0, 0, 6.5),
    lobby: new THREE.Vector3(0, 0, 1.5),
    desk: new THREE.Vector3(0, 1.1, -4.3),
    prodDoor: new THREE.Vector3(0, 0, -9.2),
    prodInside: new THREE.Vector3(0, 0, -11.2),
    labEntry: new THREE.Vector3(0, 0, -23.5),
    bins: new THREE.Vector3(-12, 0, -41.5),
    labRoller: new THREE.Vector3(16, 0, -34),
    whEntry: new THREE.Vector3(18.5, 0, -34),
    dispatch: new THREE.Vector3(20.5, 0, -44.5),
    cage: new THREE.Vector3(52.4, 0, -14.3),
    cabCentre: new THREE.Vector3(57.4, 0, -47.2),
    coldStart: new THREE.Vector3(53.2, -8, -47),
    labDoor: new THREE.Vector3(28.8, -8, -47),
    labInside: new THREE.Vector3(26.5, -8, -47),
    tunnelStart: new THREE.Vector3(15, -8, -47),
    coreEntry: new THREE.Vector3(-3, -8, -47),
    coreSpot: base.coreSpot,
    dock3: new THREE.Vector3(42, 0, -6),
    road: ext.road.seat,
  };
  // monster patrol through the warehouse aisles
  L.patrols = {
    warehouse: [[27, -46], [27, -20], [33, -20], [33, -46], [39, -46], [39, -20], [45, -20], [45, -46], [51, -46], [51, -20]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    cold: [[30, -47], [53, -47], [42, -53], [41.5, -47], [36, -53], [48, -53]].map(([x, z]) => new THREE.Vector3(x, -8, z)),
    lab: [[0, -38], [12, -26], [-6, -26], [12, -40]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  };
  const cab = prod.cab;
  L.heightAt = (x, z, layer) => {
    if (x > cab.x0 && x < cab.x1 && z > cab.z0 && z < cab.z1) return cab.y;
    return layer === -1 ? -8 : 0;
  };
  L.inCab = (p) => p.x > cab.x0 && p.x < cab.x1 && p.z > cab.z0 && p.z < cab.z1;
  L.surface = (p, zone) => {
    if (L.inCab(p)) return 'metal';
    const id = zone?.id;
    return {
      lot: 'asphalt', yard: 'asphalt', road: 'asphalt', lobby: 'tile', security: 'tile', offices: 'carpet', manager: 'wood', breakroom: 'tile',
      prodhall: 'concrete', printlab: 'concrete', control: 'tile', warehouse: 'concrete', dispatch: 'tile', coldhall: 'frost', freezerA: 'grate',
      freezerB: 'frost', archive: 'tile', lab: 'tile', vera: 'carpet', tunnel: 'puddle', core: 'concrete',
    }[id] || 'concrete';
  };
  return L;
}
