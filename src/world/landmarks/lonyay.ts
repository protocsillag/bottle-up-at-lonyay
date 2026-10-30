import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import { pointInPolygon } from '../collision';
import { colored, pyramid } from './common';
import { merge } from '../items/models';

// Lónyay utca from Alex's photos (reference/lonyay-utca/): the red-brick Református
// gimnázium with its stepped gable and slim grey spire, and the street's own palette of
// cream, sand, ochre, pale mint and grey tenements.

export interface Facade { b: Building; a: Vec2; c: Vec2; nx: number; nz: number; len: number; }

/** Building edges that face a named street, with outward normals. */
export function streetFacades(city: CityData, street: string, reach = 14): Facade[] {
  const segs = city.roads.filter((r) => r.name === street).flatMap((r) => r.pts.slice(1).map((p, i) => [r.pts[i], p] as [Vec2, Vec2]));
  const out: Facade[] = [];
  for (const b of city.buildings) {
    if (b.scenery) continue;
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 4) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let ok = false;
      for (const [p, q] of segs) {
        const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((mx - p[0]) * dx + (mz - p[1]) * dz) / l2));
        if (Math.hypot(mx - p[0] - t * dx, mz - p[1] - t * dz) < reach) {
          // Roughly parallel to the street.
          const cos = Math.abs((dx * (c[0] - a[0]) + dz * (c[1] - a[1])) / (Math.sqrt(l2) * len));
          if (cos > 0.85) { ok = true; break; }
        }
      }
      if (!ok) continue;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      out.push({ b, a, c, nx, nz, len });
    }
  }
  return out;
}

/** The school: the longest Lónyay facade 60–320 m from the Kiskörút end. */
export function findGimnazium(city: CityData): Facade | null {
  const lonyay = city.roads.filter((r) => r.name === 'Lónyay utca').flatMap((r) => r.pts);
  const korut = city.roads.filter((r) => r.name === 'Vámház körút').flatMap((r) => r.pts);
  if (!lonyay.length || !korut.length) return null;
  let end: Vec2 = lonyay[0], bd = Infinity;
  for (const p of lonyay) for (const q of korut) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; end = p; } }
  const cands = streetFacades(city, 'Lónyay utca').filter((f) => {
    const d = Math.hypot((f.a[0] + f.c[0]) / 2 - end[0], (f.a[1] + f.c[1]) / 2 - end[1]);
    return d > 60 && d < 320 && f.len > 25 && f.b.h >= 11;
  });
  return cands.sort((p, q) => q.len - p.len)[0] ?? null;
}

const LONYAY_PALETTE = [0xe8dcc0, 0xd9c49a, 0xd4ae6a, 0xb8cbb8, 0xb6b2aa, 0xe3cfa0, 0x9a9a92];

/** Per-building colour overrides for Lónyay utca (cream, sand, ochre, pale mint, grey). */
export function lonyayColors(city: CityData, gim: Facade | null) {
  const map = new Map<string, number>();
  for (const f of streetFacades(city, 'Lónyay utca')) {
    if (gim && f.b === gim.b) continue;
    if (!map.has(f.b.id)) map.set(f.b.id, LONYAY_PALETTE[Math.abs(hashStr(f.b.id)) % LONYAY_PALETTE.length]);
  }
  return map;
}

function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** Stepped gable with pinnacles in the middle of the school facade and a slim grey
 *  spire rising behind it. */
export function buildGimnaziumExtras(f: Facade): THREE.Group {
  const g = new THREE.Group();
  const mx = (f.a[0] + f.c[0]) / 2, mz = (f.a[1] + f.c[1]) / 2;
  g.position.set(mx, 0, mz);
  g.rotation.y = Math.atan2(-f.nx, -f.nz); // local −z = out to the street
  const H = f.b.h;
  const brick = 0x9a4a35, cream = 0xdcd0b0;
  const parts: THREE.BufferGeometry[] = [];
  // Stepped gable: three tiers above the cornice, cream copings, pinnacles at the steps.
  const steps = [[9, 3.2], [6.4, 2.8], [3.6, 2.6]] as const;
  let y = H;
  for (const [w, h] of steps) {
    parts.push(colored(new THREE.BoxGeometry(w, h, 0.8).translate(0, y + h / 2, -0.1), brick));
    parts.push(colored(new THREE.BoxGeometry(w + 0.3, 0.3, 1.0).translate(0, y + h, -0.1), cream));
    for (const s of [-1, 1]) {
      parts.push(colored(new THREE.BoxGeometry(0.45, 1.6, 0.45).translate(s * (w / 2), y + h + 0.8, -0.1), cream));
      parts.push(colored(pyramid(0.5, 0.9).translate(s * (w / 2), y + h + 1.6, -0.1), cream));
    }
    y += h;
  }
  // A paired arched window in the gable.
  parts.push(colored(new THREE.BoxGeometry(1.6, 2.2, 0.1).translate(0, H + 2.6, -0.55), 0x28303a));
  parts.push(colored(new THREE.BoxGeometry(0.15, 2.2, 0.12).translate(0, H + 2.6, -0.57), cream));
  // The slim grey spire behind.
  parts.push(colored(new THREE.BoxGeometry(3, 6, 3).translate(0, H + 3, 6), 0x8a8a86));
  parts.push(colored(new THREE.ConeGeometry(1.9, 16, 8).translate(0, H + 14, 6), 0x7a7f84));
  parts.push(colored(new THREE.CylinderGeometry(0.06, 0.06, 2.4).translate(0, H + 23, 6), 0x3a3a3a));
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  g.add(m);
  return g;
}
