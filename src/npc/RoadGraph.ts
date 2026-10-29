import type { CityData, Vec2 } from '../world/cityData';
import type { Placement } from '../world/placement';
import { pointInPolygon } from '../world/collision';

// A walking graph from the OSM ways: road edges are walked on the pavement (offset to
// the right of travel), footpath edges on the path itself. OSM ways that share a node
// share exact baked coordinates, so vertices are joined by key.

export interface GEdge { a: number; b: number; len: number; off: number; road: boolean; name?: string; }
export interface GNode { x: number; z: number; edges: number[]; }

export class RoadGraph {
  readonly nodes: GNode[] = [];
  readonly edges: GEdge[] = [];
  private index = new Map<string, number>();

  constructor(city: CityData, place: Placement) {
    const node = ([x, z]: Vec2) => {
      const k = `${x},${z}`;
      let i = this.index.get(k);
      if (i === undefined) { i = this.nodes.length; this.nodes.push({ x, z, edges: [] }); this.index.set(k, i); }
      return i;
    };
    for (const r of city.roads) {
      if (r.bridge || r.hw === 'steps') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const pa = r.pts[i], pb = r.pts[i + 1];
        // Keep the network to the playable area (plus a little).
        if (!pointInPolygon(pa[0], pa[1], city.boundary) && !pointInPolygon(pb[0], pb[1], city.boundary)) continue;
        const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
        if (len < 0.3) continue;
        let off = 0;
        if (r.kind === 'road') {
          // Pavement offset, pulled in where the street is too narrow for it.
          const ux = (pb[0] - pa[0]) / len, uz = (pb[1] - pa[1]) / len;
          const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
          off = r.w / 2 + 1.5;
          for (const o of [r.w / 2 + 1.5, r.w / 2 + 0.9, r.w / 2 + 0.3]) {
            off = o;
            if (place.free(mx - uz * o, mz + ux * o, 0.4) && place.free(mx + uz * o, mz - ux * o, 0.4)) break;
          }
        }
        const a = node(pa), b = node(pb);
        const e = this.edges.length;
        this.edges.push({ a, b, len, off, road: r.kind === 'road', name: r.name });
        this.nodes[a].edges.push(e);
        this.nodes[b].edges.push(e);
      }
    }
  }

  /** Edges with a midpoint within r metres of (x, z). */
  edgesNear(x: number, z: number, rMin: number, rMax: number) {
    const out: number[] = [];
    this.edges.forEach((e, i) => {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const d = Math.hypot((a.x + b.x) / 2 - x, (a.z + b.z) / 2 - z);
      if (d >= rMin && d <= rMax) out.push(i);
    });
    return out;
  }

  /** Position on edge e at distance t from `from`, offset to the right of travel. */
  point(e: number, from: number, t: number): [number, number, number] {
    const E = this.edges[e];
    const A = this.nodes[from], B = this.nodes[from === E.a ? E.b : E.a];
    const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len;
    // Right of travel in x/z with z south: (−uz, ux) is left… we use (uz·−1) consistently.
    const x = A.x + ux * t - uz * E.off, z = A.z + uz * t + ux * E.off;
    return [x, z, Math.atan2(-ux, -uz)];
  }

  other(e: number, n: number) { const E = this.edges[e]; return n === E.a ? E.b : E.a; }
}
