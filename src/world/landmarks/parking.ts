import * as THREE from 'three';
import type { CityData } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { carGeometry } from '../../npc/Traffic';

// Parked cars from Alex's photos: dense, almost no gaps, along both kerbs of the side
// streets; on Lónyay utca many stand at an angle, nose-in and half on the kerb. Main
// roads (körút) and car-free streets have none. Instanced, solid.

const COLORS = [0xe8e8e8, 0x1b1b1b, 0x8a8f96, 0xc0c4c8, 0x3d4a66, 0x8a2f2f, 0x2f5a4a, 0xd8d2c4, 0x274060, 0x5a5a5a, 0xf2c418];
const NO_PARK = new Set(['Ráday utca']);

export interface Parked { x: number; z: number; rot: number; }

export function buildParking(city: CityData, place: Placement) {
  const cars: Parked[] = [];
  const nodeDeg = new Map<string, number>();
  for (const r of city.roads) {
    if (r.kind !== 'road') continue;
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) nodeDeg.set(`${p[0]},${p[1]}`, (nodeDeg.get(`${p[0]},${p[1]}`) ?? 0) + 1);
  }
  const junctions = [...nodeDeg.entries()].filter(([, n]) => n >= 2).map(([k]) => k.split(',').map(Number) as [number, number]);
  const nearJunction = (x: number, z: number) => junctions.some(([jx, jz]) => Math.abs(jx - x) < 11 && Math.abs(jz - z) < 11 && Math.hypot(jx - x, jz - z) < 11);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const r of city.roads) {
    if (r.kind !== 'road' || r.bridge || r.w >= 12 || r.w < 7 || !r.name || NO_PARK.has(r.name)) continue;
    if (!['residential', 'tertiary', 'unclassified', 'living_street'].includes(r.hw)) continue;
    const angled = r.name === 'Lónyay utca';
    const step = angled ? 3.1 : 4.9;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 8) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (const side of [-1, 1]) {
        for (let t = 3; t < len - 3; t += step) {
          if (rnd() < 0.1) continue; // the odd gap
          const off = r.w / 2 - (angled ? 0.55 : 1.0);
          const x = ax + ux * t - uz * off * side, z = az + uz * t + ux * off * side;
          if (!pointInPolygon(x, z, city.boundary) || nearJunction(x, z) || place.buildings.blocked(x, z, 1.0)) continue;
          // Heading along the street; angled bays point the nose 35° in toward the kerb.
          let rot = Math.atan2(-ux, -uz) + (rnd() < 0.5 ? Math.PI : 0);
          if (angled) rot = Math.atan2(-ux, -uz) + side * 0.6;
          cars.push({ x, z, rot });
        }
      }
    }
  }
  // One instanced mesh per 250 m tile so the frustum culls the cars out of view.
  const mesh = new THREE.Group();
  mesh.name = 'parked cars';
  const geo = carGeometry(), mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tiles = new Map<string, Parked[]>();
  for (const p of cars) {
    const k = `${Math.floor(p.x / 250)},${Math.floor(p.z / 250)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)!).push(p);
  }
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const list of tiles.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      im.setMatrixAt(i, m.makeRotationY(p.rot).setPosition(p.x, 0, p.z));
      im.setColorAt(i, c.setHex(COLORS[Math.floor(rnd() * COLORS.length)]));
    });
    im.computeBoundingSphere();
    im.castShadow = true;
    im.receiveShadow = true;
    mesh.add(im);
  }
  return { mesh, cars };
}
