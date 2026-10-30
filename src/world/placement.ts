import type { Building, CityData, Vec2 } from './cityData';
import { pointInPolygon } from './collision';

// Finds walkable spots for items, bins and props: pavements beside streets, footpaths,
// squares and parks. Spots are generated once per city load; each run samples from them.

export type Zone = 'raday' | 'nehru' | 'corvinus' | 'market' | 'kalvin' | 'bakats' | 'museum' | 'lonyay' | 'rakpart' | 'street';

export interface Spot {
  x: number; z: number;
  zone: Zone;
  /** In a park or on a lawn. */
  green: boolean;
  /** Facing angle of the nearest street direction (radians around y), for props. */
  dir: number;
}

const CELL = 32;

/** Grid of building footprints for fast "is this point inside a building?" tests. */
export class BuildingIndex {
  private cells = new Map<number, Building[]>();
  constructor(buildings: Building[]) {
    for (const b of buildings) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of b.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const k = key(cx, cz);
          (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(b);
        }
      }
    }
  }
  /** The building whose outer ring contains the point (courtyards count as inside). */
  at(x: number, z: number): Building | null {
    for (const b of this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      if (pointInPolygon(x, z, b.outer)) return b;
    }
    return null;
  }
  /** True if the point or anything within `margin` metres (8 probes) is inside a building. */
  blocked(x: number, z: number, margin = 0.8) {
    if (this.at(x, z)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.at(x + Math.cos(a) * margin, z + Math.sin(a) * margin)) return true;
    }
    return false;
  }
  near(x: number, z: number): Building[] {
    const out = new Set<Building>();
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) this.cells.get(key(cx + i, cz + j))?.forEach((b) => out.add(b));
    return [...out];
  }
}
function key(cx: number, cz: number) { return (cx + 4096) * 8192 + (cz + 4096); }

export class Placement {
  readonly buildings: BuildingIndex;
  /** Pavement and path spots, every ~10 m. */
  readonly spots: Spot[] = [];
  private water: Vec2[][];
  private greens: Vec2[][];
  private nehru: Vec2[] | null;
  /** Centre of Bálna: the riverside pubs around it are the 'rakpart' zone. */
  private balna: Vec2 | null;

  constructor(private city: CityData) {
    this.buildings = new BuildingIndex(city.buildings);
    this.water = city.areas.filter((a) => a.kind === 'water').map((a) => a.outer);
    this.greens = city.areas.filter((a) => a.kind === 'park' || a.kind === 'grass').map((a) => a.outer);
    this.nehru = city.areas.find((a) => a.name === 'Nehru part')?.outer ?? null;
    const balna = city.buildings.filter((b) => b.name?.startsWith('Bálna'));
    this.balna = balna.length ? balna.flatMap((b) => b.outer).reduce((a, p, _, all) => [a[0] + p[0] / all.length, a[1] + p[1] / all.length] as Vec2, [0, 0] as Vec2) : null;
    this.generate();
  }

  /** Is (x, z) a free, reachable ground spot inside the playable area? */
  free(x: number, z: number, margin = 0.8) {
    if (!pointInPolygon(x, z, this.city.boundary)) return false;
    // Keep away from the boundary barrier itself.
    if (!this.insideBy(x, z, 2)) return false;
    if (this.water.some((w) => pointInPolygon(x, z, w))) return false;
    return !this.buildings.blocked(x, z, margin);
  }

  private insideBy(x: number, z: number, d: number) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      if (!pointInPolygon(x + Math.cos(a) * d, z + Math.sin(a) * d, this.city.boundary)) return false;
    }
    return true;
  }

  zoneAt(x: number, z: number, roadName?: string): Zone {
    const L = this.city.landmarks;
    const near = (p: Vec2 | null | undefined, r: number) => !!p && Math.hypot(x - p[0], z - p[1]) < r;
    if (roadName === 'Ráday utca') return 'raday';
    if (this.nehru && pointInPolygon(x, z, this.nehru)) return 'nehru';
    if (near(L.nehruPart, 140)) return 'nehru';
    if (near(L.corvinus, 110)) return 'corvinus';
    if (near(L.marketHall, 110)) return 'market';
    if (near(L.kalvinTer, 80)) return 'kalvin';
    if (near(L.bakatsTer, 70)) return 'bakats';
    if (near(L.museum, 90)) return 'museum';
    if (roadName === 'Lónyay utca') return 'lonyay';
    if (near(this.balna, 150)) return 'rakpart';
    return 'street';
  }

  private generate() {
    const STEP = 10;
    const seen = new Set<string>();
    const add = (x: number, z: number, dir: number, roadName?: string) => {
      const k = `${Math.round(x / 4)},${Math.round(z / 4)}`;
      if (seen.has(k) || !this.free(x, z)) return;
      seen.add(k);
      const green = this.greens.some((g) => pointInPolygon(x, z, g));
      this.spots.push({ x, z, dir, green, zone: this.zoneAt(x, z, roadName) });
    };
    for (const r of this.city.roads) {
      if (r.bridge) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        const dir = Math.atan2(-ux, -uz);
        // Pavement on both sides of a road; footpaths get spots just off the path.
        const off = r.kind === 'road' ? r.w / 2 + 1.6 : r.w / 2 + 0.6;
        for (let t = STEP / 2; t < len; t += STEP) {
          const px = ax + ux * t, pz = az + uz * t;
          add(px - uz * off, pz + ux * off, dir, r.name);
          add(px + uz * off, pz - ux * off, dir, r.name);
        }
      }
    }
    // Parks and lawns: a loose grid.
    for (const a of this.city.areas) {
      if (a.kind !== 'park' && a.kind !== 'grass' && a.kind !== 'plaza') continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of a.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let x = x0 + 6; x < x1; x += 14) for (let z = z0 + 6; z < z1; z += 14) {
        if (pointInPolygon(x, z, a.outer)) add(x, z, 0);
      }
    }
  }

  /** Nearest free spot to p (spiral search), e.g. to put a machine on the pavement outside a shop. */
  nearestFree(p: Vec2, margin = 1.2): Vec2 {
    for (let r = 0; r <= 60; r += 1) {
      const n = Math.max(1, Math.round(r * 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r;
        if (this.free(x, z, margin)) return [x, z];
      }
    }
    return p;
  }

  spotsIn(zone: Zone) { return this.spots.filter((s) => s.zone === zone); }
}
