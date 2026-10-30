import type { CityData, Vec2 } from './cityData';

// 2D collision world: building walls and the map boundary as line segments in a
// uniform grid. The player is a circle (capsule seen from above) pushed out of walls.

interface Segment { ax: number; az: number; bx: number; bz: number; off?: boolean; }

const CELL = 16;

export class CollisionWorld {
  private cells = new Map<number, Segment[]>();
  private boundary: Vec2[];

  /** rings: closed wall rings; boundary: the playable area (also a wall). */
  constructor(rings: Vec2[][], boundary: Vec2[]) {
    this.boundary = boundary;
    for (const r of rings) this.addRing(r);
    this.addRing(boundary);
  }

  static fromCity(city: CityData) {
    const rings: Vec2[][] = [];
    for (const b of city.buildings) {
      rings.push(b.outer);
      b.holes?.forEach((h) => rings.push(h));
    }
    return new CollisionWorld(rings, city.boundary);
  }

  /** Adds an open polyline wall (not closed). */
  addLine(pts: Vec2[]) {
    for (let i = 0; i < pts.length - 1; i++) this.addSegment(pts[i], pts[i + 1]);
  }

  private key(cx: number, cz: number) { return (cx + 4096) * 8192 + (cz + 4096); }

  addRing(ring: Vec2[]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) this.addSegment(ring[j], ring[i]);
  }

  private addSegment(a: Vec2, b: Vec2): Segment {
    const s: Segment = { ax: a[0], az: a[1], bx: b[0], bz: b[1] };
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const z0 = Math.floor(Math.min(s.az, s.bz) / CELL), z1 = Math.floor(Math.max(s.az, s.bz) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(s);
      }
    }
    return s;
  }

  /** A box that can be switched on and off per run (road works). */
  addToggleBox(x: number, z: number, w: number, d: number, rot = 0) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const pts: Vec2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => [x + px * c + pz * sn, z - px * sn + pz * c] as Vec2);
    const segs = pts.map((p, i) => this.addSegment(pts[(i + 3) % 4], p));
    return { set(on: boolean) { for (const s of segs) s.off = !on; } };
  }

  /** Adds a solid rotated rectangle (props: machines, kiosks). rot: radians around y. */
  addBox(x: number, z: number, w: number, d: number, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts: Vec2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    this.addRing(pts.map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c] as Vec2));
  }

  private nearby(x: number, z: number, r: number): Set<Segment> {
    const out = new Set<Segment>();
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) this.cells.get(this.key(cx, cz))?.forEach((s) => out.add(s));
    }
    return out;
  }

  /** Pushes a circle at (x, z) out of any wall it overlaps. Returns the corrected position. */
  resolve(x: number, z: number, radius: number): Vec2 {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const s of this.nearby(x, z, radius)) {
        if (s.off) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
        const px = s.ax + t * dx, pz = s.az + t * dz;
        const ox = x - px, oz = z - pz;
        const d = Math.hypot(ox, oz);
        if (d < radius && d > 1e-6) {
          x = px + (ox / d) * radius;
          z = pz + (oz / d) * radius;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return [x, z];
  }

  /** Moves a circle from (x, z) by (dx, dz) in small steps so it cannot tunnel through walls. */
  move(x: number, z: number, dx: number, dz: number, radius: number): Vec2 {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.4)));
    for (let i = 0; i < steps; i++) [x, z] = this.resolve(x + dx / steps, z + dz / steps, radius);
    return [x, z];
  }

  /** Fraction (0–1) along the 2D line from a to b before it hits a wall; 1 if clear. */
  raycast(ax: number, az: number, bx: number, bz: number): number {
    let best = 1;
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / CELL));
    const seen = new Set<Segment>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      for (const s of this.nearby(ax + (bx - ax) * t, az + (bz - az) * t, CELL * 0.75)) {
        if (seen.has(s) || s.off) continue;
        seen.add(s);
        const hit = segmentIntersect(ax, az, bx, bz, s);
        if (hit !== null && hit < best) best = hit;
      }
    }
    return best;
  }

  isInsideBoundary(x: number, z: number) { return pointInPolygon(x, z, this.boundary); }
}

function segmentIntersect(ax: number, az: number, bx: number, bz: number, s: Segment): number | null {
  const rx = bx - ax, rz = bz - az, sx = s.bx - s.ax, sz = s.bz - s.az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = s.ax - ax, qz = s.az - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function pointInPolygon(x: number, z: number, ring: Vec2[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
