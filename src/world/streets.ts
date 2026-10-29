import type { CityData } from './cityData';

// Answers "which street am I on?" from the named OSM roads.

interface NamedSeg { ax: number; az: number; bx: number; bz: number; name: string; }

const CELL = 40;

export class StreetIndex {
  private cells = new Map<string, NamedSeg[]>();

  constructor(city: CityData) {
    for (const r of city.roads) {
      if (!r.name) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const s = { ax: r.pts[i][0], az: r.pts[i][1], bx: r.pts[i + 1][0], bz: r.pts[i + 1][1], name: r.name };
        const mx = Math.floor((s.ax + s.bx) / 2 / CELL), mz = Math.floor((s.az + s.bz) / 2 / CELL);
        const k = `${mx},${mz}`;
        (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(s);
      }
    }
  }

  nearest(x: number, z: number, maxDist = 30): string | null {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best: string | null = null, bestD = maxDist;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        for (const s of this.cells.get(`${cx + i},${cz + j}`) ?? []) {
          const dx = s.bx - s.ax, dz = s.bz - s.az;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(x - s.ax - t * dx, z - s.az - t * dz);
          if (d < bestD) { bestD = d; best = s.name; }
        }
      }
    }
    return best;
  }
}
