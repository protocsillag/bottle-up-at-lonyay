import type { CityData, Road, Vec2 } from './cityData';
import { pointInPolygon } from './collision';

// Streets the baked map is missing. OSM tags streets under renovation as
// `highway=construction`, which the bake skipped until now (tools/osm/bake.mjs maps them to
// their real class since this fix), so parts of Ráday utca, Lónyay utca and two cross
// streets between them showed as bare grey ground. Run before anything reads the map.

/** Corridors with no way at all in the baked data: end points (junction nodes once the
 *  gaps above are filled) and a name. The Lónyay → Ráday corridor lines up with Mátyás
 *  utca across Lónyay utca, so it is taken to be Mátyás utca's continuation. (The other
 *  missing cross street, Kinizsi utca across Ráday, is found by `fillGaps`.) */
const CROSS_STREETS: { a: Vec2; b: Vec2; name?: string }[] = [
  { a: [-43.2, -34.8], b: [110.2, -86.4], name: 'Mátyás utca' },
];

export function fixRoads(city: CityData) {
  const before = new Set(city.roads);
  fillGaps(city);
  for (const c of CROSS_STREETS) addCrossStreet(city, c.a, c.b, c.name);
  joinCrossings(city, city.roads.filter((r) => !before.has(r)));
}

/** Where an added street crosses another without a shared node, add one to both, so
 *  walkers and cars can turn there (graphs join streets at identical points). */
function joinCrossings(city: CityData, added: Road[]) {
  const roads = city.roads.filter((r) => r.kind === 'road' && !r.bridge);
  for (const n of added) {
    for (const r of roads) {
      if (r === n) continue;
      for (let i = 0; i < n.pts.length - 1; i++) {
        for (let j = 0; j < r.pts.length - 1; j++) {
          const p = n.pts[i], q = n.pts[i + 1], u = r.pts[j], v = r.pts[j + 1];
          const ax = q[0] - p[0], az = q[1] - p[1], bx = v[0] - u[0], bz = v[1] - u[1];
          const den = ax * bz - az * bx;
          if (Math.abs(den) < 1e-6) continue;
          const s = ((u[0] - p[0]) * bz - (u[1] - p[1]) * bx) / den;
          const t = ((u[0] - p[0]) * az - (u[1] - p[1]) * ax) / den;
          if (s <= 0.01 || s >= 0.99 || t <= 0.01 || t >= 0.99) continue;
          const x: Vec2 = [Math.round((p[0] + ax * s) * 10) / 10, Math.round((p[1] + az * s) * 10) / 10];
          n.pts.splice(i + 1, 0, x);
          r.pts.splice(j + 1, 0, x);
          i++; // the new node splits this segment; carry on after it
          break;
        }
      }
    }
  }
}

function segDist(x: number, z: number, p: Vec2, q: Vec2) {
  const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
  return Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz);
}

const nearRoad = (roads: Road[], x: number, z: number, d: number) =>
  roads.some((r) => r.pts.some((p, i) => i > 0 && segDist(x, z, r.pts[i - 1], p) < d));

const inBuilding = (city: CityData, x: number, z: number) => city.buildings.some((b) => !b.scenery && pointInPolygon(x, z, b.outer));

/** Joins loose ends of the same named street that face each other across open ground,
 *  through the junction nodes of the streets crossing the gap. */
function fillGaps(city: CityData) {
  const roads = city.roads.filter((r) => r.kind === 'road' && !r.bridge);
  const byName = new Map<string, Road[]>();
  for (const r of roads) if (r.name) (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)!).push(r);
  const key = (p: Vec2) => `${p[0]},${p[1]}`;
  for (const [name, rs] of byName) {
    // Loose ends with the direction the street was heading when it stopped.
    // (Counted within the street only: a cross street may start at the very end.)
    const deg = new Map<string, number>();
    for (const r of rs) for (const p of r.pts) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
    const ends: { r: Road; p: Vec2; out: Vec2; atEnd: boolean }[] = [];
    for (const r of rs) {
      const n = r.pts.length;
      for (const [p, q, atEnd] of [[r.pts[0], r.pts[1], false], [r.pts[n - 1], r.pts[n - 2], true]] as [Vec2, Vec2, boolean][]) {
        if (deg.get(key(p)) !== 1) continue; // joined to more of the street: not a loose end
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        ends.push({ r, p, out: [(p[0] - q[0]) / l, (p[1] - q[1]) / l], atEnd });
      }
    }
    const used = new Set<number>();
    ends.forEach((A, i) => {
      if (used.has(i)) return;
      let best = -1, bestD = 300;
      ends.forEach((B, j) => {
        if (j === i || used.has(j) || B.r === A.r) return;
        const dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1], d = Math.hypot(dx, dz);
        if (d < 5 || d > bestD) return;
        // Both ends must point at each other.
        if ((dx * A.out[0] + dz * A.out[1]) / d < 0.97 || (-dx * B.out[0] - dz * B.out[1]) / d < 0.97) return;
        best = j; bestD = d;
      });
      if (best < 0) return;
      const B = ends[best];
      const a = A.p, b = B.p;
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      let covered = 0, blocked = false;
      for (let t = 0.1; t < 0.95; t += 0.1) {
        const x = a[0] + dx * t, z = a[1] + dz * t;
        if (inBuilding(city, x, z)) blocked = true;
        if (nearRoad(roads, x, z, 2)) covered++;
      }
      // Another stretch of the same street already running alongside means it is no gap.
      const parallel = rs.some((r) => r.pts.some((p) => {
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
        return t > 0.05 && t < 0.95 && Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) < 10;
      }));
      if (blocked || parallel || covered > 4) return;
      const mid: { t: number; p: Vec2 }[] = [];
      for (const r of roads) {
        if (r.name === name) continue;
        for (const p of r.pts) {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
          if (t <= 0.02 || t >= 0.98) continue;
          if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) < 3 && !mid.some((m) => m.p === p)) mid.push({ t, p });
        }
      }
      mid.sort((p, q) => p.t - q.t);
      used.add(i); used.add(best);
      // Keep the street's direction (one-way rules follow `pts`).
      const pts = [a, ...mid.map((m) => m.p), b];
      const r: Road = { kind: 'road', hw: A.r.hw, w: A.r.w, name, pts: A.atEnd ? pts : pts.reverse() };
      city.roads.push(r);
      roads.push(r);
    });
  }
}

/** A street along the line a→b, extended at both ends to the streets it meets (a node is
 *  inserted there so walkers and cars can turn in). Skipped if a way already runs there. */
function addCrossStreet(city: CityData, a: Vec2, b: Vec2, name?: string) {
  const roads = city.roads.filter((r) => r.kind === 'road' && !r.bridge);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  let covered = 0;
  for (let t = 0.1; t < 0.95; t += 0.1) if (nearRoad(roads, a[0] + ux * len * t, a[1] + uz * len * t, 4)) covered++;
  if (covered > 4) return;
  // Where the extended line crosses a street: s along the line from a.
  const hits: { s: number; r: Road; i: number; p: Vec2 }[] = [];
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p = r.pts[i], q = r.pts[i + 1];
      const ex = q[0] - p[0], ez = q[1] - p[1];
      const den = ux * ez - uz * ex;
      if (Math.abs(den) < 1e-6) continue;
      const wx = p[0] - a[0], wz = p[1] - a[1];
      const s = (wx * ez - wz * ex) / den;
      const k = (wx * uz - wz * ux) / den;
      if (k < 0 || k > 1) continue;
      hits.push({ s, r, i, p: [Math.round((a[0] + ux * s) * 10) / 10, Math.round((a[1] + uz * s) * 10) / 10] });
    }
  }
  const startHit = hits.filter((h) => h.s <= len * 0.2 && h.s >= -40).sort((p, q) => Math.abs(p.s) - Math.abs(q.s))[0];
  const endHit = hits.filter((h) => h.s >= len * 0.8 && h.s <= len + 40).sort((p, q) => Math.abs(p.s - len) - Math.abs(q.s - len))[0];
  if (!startHit || !endHit) return;
  // Nothing built across it.
  for (let t = 0.05; t < 0.95; t += 0.05) {
    const s = startHit.s + (endHit.s - startHit.s) * t;
    if (inBuilding(city, a[0] + ux * s, a[1] + uz * s)) return;
  }
  const node = (h: (typeof hits)[number]): Vec2 => {
    const pts = h.r.pts;
    for (const v of [pts[h.i], pts[h.i + 1]]) if (Math.hypot(v[0] - h.p[0], v[1] - h.p[1]) < 1.5) return v;
    pts.splice(h.i + 1, 0, h.p);
    return h.p;
  };
  // Insert the far node first so the near hit's segment index stays valid if both hit one way.
  const [first, second] = startHit.r === endHit.r && endHit.i < startHit.i ? [startHit, endHit] : [endHit, startHit];
  const n1 = node(first), n2 = node(second);
  const [pa, pb] = first === startHit ? [n1, n2] : [n2, n1];
  city.roads.push({ kind: 'road', hw: 'residential', w: 9, pts: [pa, pb], ...(name ? { name } : {}) });
}
