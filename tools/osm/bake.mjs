// Bakes the raw OSM data in tools/osm/raw/ into public/data/city.json.
// Run: npm run osm:bake
//
// Input: tools/osm/raw/area.json (Overpass JSON from fetch.mjs) or, as a fallback,
// any *.osm XML export from openstreetmap.org dropped into tools/osm/raw/.
// Output coordinates are local metres around ORIGIN: x = east, z = south
// (so they map straight onto Three.js with y up).
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { ORIGIN } from './area.mjs';

const RAW = new URL('./raw/', import.meta.url);
const OUT = new URL('../../public/data/city.json', import.meta.url);

const STOREY = 3.6;
const DEFAULT_LEVELS = 5;

// Playable boundary, as centreline corners of the edge streets plus the Danube bank.
// Each edge gets pushed outward by `offset` metres so the whole edge street is walkable
// and the barrier sits against the far-side facades. The river edge is not pushed.
const BOUNDARY = [
  { name: 'Fővám tér, Danube bank', lat: 47.48685, lon: 19.05625, offset: 16 }, // edge to next: Kiskörút
  { name: 'Kálvin tér', lat: 47.48950, lon: 19.06190, offset: 14 }, // edge to next: Üllői út
  { name: 'Üllői út × Ferenc körút', lat: 47.48580, lon: 19.07010, offset: 14 }, // edge to next: Ferenc körút
  { name: 'Boráros tér', lat: 47.48070, lon: 19.06770, offset: 14 }, // edge to next: Boráros tér to bank
  { name: 'Petőfi híd, Danube bank', lat: 47.47980, lon: 19.06545, offset: 0 }, // edge to next: Danube bank
];

// ---------------------------------------------------------------- projection

const M_PER_DEG_LAT = 111_132.954 - 559.822 * Math.cos(2 * rad(ORIGIN.lat));
const M_PER_DEG_LON = 111_412.84 * Math.cos(rad(ORIGIN.lat));
function rad(d) { return (d * Math.PI) / 180; }
function project(lat, lon) {
  return [r1((lon - ORIGIN.lon) * M_PER_DEG_LON), r1(-(lat - ORIGIN.lat) * M_PER_DEG_LAT)];
}
function r1(v) { return Math.round(v * 10) / 10; }

// ---------------------------------------------------------------- load

async function loadRaw() {
  const files = await readdir(RAW).catch(() => []);
  if (files.includes('area.json')) {
    const json = JSON.parse(await readFile(new URL('area.json', RAW), 'utf8'));
    return json.elements;
  }
  const osm = files.find((f) => f.endsWith('.osm'));
  if (osm) return parseOsmXml(await readFile(new URL(osm, RAW), 'utf8'));
  throw new Error('No tools/osm/raw/area.json or *.osm found. Run `npm run osm:fetch` first.');
}

// Minimal parser for the openstreetmap.org XML export; returns Overpass-style elements.
function parseOsmXml(xml) {
  const out = [];
  const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], unescapeXml(m[2])]));
  const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of xml.matchAll(re)) {
    const a = attrs(m[2]);
    const body = m[4] ?? '';
    const el = { type: m[1], id: Number(a.id) };
    const tags = {};
    for (const t of body.matchAll(/<tag\b([^>]*)\/>/g)) { const ta = attrs(t[1]); tags[ta.k] = ta.v; }
    if (Object.keys(tags).length) el.tags = tags;
    if (m[1] === 'node') { el.lat = Number(a.lat); el.lon = Number(a.lon); }
    if (m[1] === 'way') el.nodes = [...body.matchAll(/<nd ref="(\d+)"/g)].map((n) => Number(n[1]));
    if (m[1] === 'relation') {
      el.members = [...body.matchAll(/<member\b([^>]*)\/>/g)].map((mm) => {
        const ma = attrs(mm[1]);
        return { type: ma.type, ref: Number(ma.ref), role: ma.role };
      });
    }
    out.push(el);
  }
  return out;
}
function unescapeXml(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------- geometry helpers

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}
function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}
function pointInPolygon([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToPolygon(p, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, distToSegment(p, ring[j], ring[i]));
  return best;
}
function distToSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
// Drops the closing duplicate and consecutive duplicates.
function cleanRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}
// Ensures a fixed winding: outer rings counter-clockwise in x/z screen terms, holes opposite.
function orient(ring, ccw) {
  return (signedArea(ring) > 0) === ccw ? ring : ring.slice().reverse();
}
// Clips a polygon to an axis-aligned rectangle (Sutherland–Hodgman).
function clipRect(ring, minX, minZ, maxX, maxZ) {
  const edges = [
    (p) => p[0] >= minX, (p) => p[0] <= maxX, (p) => p[1] >= minZ, (p) => p[1] <= maxZ,
  ];
  const cut = [
    (a, b) => lerpAt(a, b, (minX - a[0]) / (b[0] - a[0])), (a, b) => lerpAt(a, b, (maxX - a[0]) / (b[0] - a[0])),
    (a, b) => lerpAt(a, b, (minZ - a[1]) / (b[1] - a[1])), (a, b) => lerpAt(a, b, (maxZ - a[1]) / (b[1] - a[1])),
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) { if (!pi) out.push(cut[e](prev, cur)); out.push(cur); } else if (pi) out.push(cut[e](prev, cur));
    }
  }
  return out.map(([x, z]) => [r1(x), r1(z)]);
}
function lerpAt(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// Offsets each edge of a polygon outward by its own distance and re-intersects neighbours.
function offsetPolygon(pts, offsets) {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    // Outward normal depends on winding.
    let nx = dz / len, nz = -dx / len;
    if (!ccw) { nx = -nx; nz = -nz; }
    const o = offsets[i];
    return { p: [a[0] + nx * o, a[1] + nz * o], d: [dx, dz] };
  });
  return lines.map((l, i) => {
    const prev = lines[(i + n - 1) % n];
    const den = prev.d[0] * l.d[1] - prev.d[1] * l.d[0];
    if (Math.abs(den) < 1e-9) return l.p;
    const t = ((l.p[0] - prev.p[0]) * l.d[1] - (l.p[1] - prev.p[1]) * l.d[0]) / den;
    return [r1(prev.p[0] + prev.d[0] * t), r1(prev.p[1] + prev.d[1] * t)];
  });
}

// Joins way segments into closed rings (for multipolygon relations).
function assembleRings(wayNodeLists) {
  const pending = wayNodeLists.map((l) => l.slice()).filter((l) => l.length > 1);
  const rings = [];
  while (pending.length) {
    let ring = pending.shift();
    let guard = 0;
    while (ring[0] !== ring.at(-1) && guard++ < 1000) {
      const end = ring.at(-1);
      const idx = pending.findIndex((l) => l[0] === end || l.at(-1) === end);
      if (idx < 0) break;
      const next = pending.splice(idx, 1)[0];
      ring = ring.concat(next[0] === end ? next.slice(1) : next.slice().reverse().slice(1));
    }
    if (ring[0] === ring.at(-1) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

// ---------------------------------------------------------------- bake

const ROAD_WIDTH = {
  primary: 16, secondary: 14, tertiary: 11, residential: 9, living_street: 7, unclassified: 8,
  secondary_link: 8, tertiary_link: 7, primary_link: 8, service: 5, pedestrian: 7,
  footway: 3, path: 2.5, cycleway: 2.5, steps: 3, track: 3,
};
const SKIP_HIGHWAY = new Set(['corridor', 'elevator', 'platform', 'construction', 'proposed', 'bus_stop', 'raceway']);

const elements = await loadRaw();
const nodes = new Map();
const ways = new Map();
for (const e of elements) {
  if (e.type === 'node' && e.lat !== undefined) nodes.set(e.id, e);
  if (e.type === 'way') ways.set(e.id, e);
}
const proj = (id) => { const n = nodes.get(id); return n ? project(n.lat, n.lon) : null; };
const wayPts = (w) => w.nodes.map(proj).filter(Boolean);

// Boundary in metres.
const corners = BOUNDARY.map((c) => project(c.lat, c.lon));
const boundary = offsetPolygon(corners, BOUNDARY.map((c) => c.offset));

// Extent of baked content: boundary plus a margin of scenery all round.
const MARGIN = 220;
const xs = boundary.map((p) => p[0]), zs = boundary.map((p) => p[1]);
const ext = { minX: Math.min(...xs) - MARGIN, maxX: Math.max(...xs) + MARGIN, minZ: Math.min(...zs) - MARGIN, maxZ: Math.max(...zs) + MARGIN };
const inExtent = ([x, z]) => x >= ext.minX && x <= ext.maxX && z >= ext.minZ && z <= ext.maxZ;

function heightOf(tags) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 1) return Math.min(h, 120);
  const lv = parseFloat(tags['building:levels']);
  const roof = parseFloat(tags['roof:levels']) || 0;
  if (Number.isFinite(lv) && lv > 0) return (lv + roof * 0.6) * STOREY + 1.2;
  if (['kiosk', 'shed', 'garage', 'hut', 'toilets', 'service', 'container'].includes(tags.building)) return 3.2;
  return DEFAULT_LEVELS * STOREY + 1.2;
}

// Buildings (ways and multipolygon relations).
const buildings = [];
const usedAsPart = new Set();
for (const e of elements) {
  if (e.type !== 'relation' || !e.tags?.building || e.tags.type !== 'multipolygon') continue;
  const outerWays = [], innerWays = [];
  for (const m of e.members) {
    const w = ways.get(m.ref);
    if (m.type !== 'way' || !w) continue;
    usedAsPart.add(w.id);
    (m.role === 'inner' ? innerWays : outerWays).push(w.nodes);
  }
  const outers = assembleRings(outerWays).map((r) => cleanRing(r.map(proj).filter(Boolean)));
  const inners = assembleRings(innerWays).map((r) => cleanRing(r.map(proj).filter(Boolean)));
  for (const outer of outers) {
    if (outer.length < 3) continue;
    const holes = inners.filter((h) => h.length >= 3 && pointInPolygon(h[0], outer));
    addBuilding(e, outer, holes);
  }
}
for (const w of ways.values()) {
  if (!w.tags?.building || usedAsPart.has(w.id)) continue;
  if (w.nodes[0] !== w.nodes.at(-1)) continue;
  addBuilding(w, cleanRing(wayPts(w)), []);
}
function addBuilding(e, outer, holes) {
  const tags = e.tags;
  if (tags.building === 'roof' || tags.building === 'no' || tags.disused === 'yes' && tags.building === 'construction') return;
  if (outer.length < 3 || Math.abs(signedArea(outer)) < 6) return;
  const c = centroid(outer);
  if (!inExtent(c)) return;
  const inside = pointInPolygon(c, boundary);
  // Far-side scenery only needs the first row or two; drop distant interior blocks.
  if (!inside && distToPolygon(c, boundary) > MARGIN) return;
  const b = { id: `${e.type[0]}${e.id}`, h: r1(heightOf(tags)), outer: orient(outer, true) };
  if (holes.length) b.holes = holes.map((h) => orient(h, false));
  if (tags.name) b.name = tags.name;
  if (!inside) b.scenery = 1;
  buildings.push(b);
}

// Roads and paths.
const roads = [];
const areas = [];
for (const w of ways.values()) {
  const t = w.tags;
  if (!t?.highway || SKIP_HIGHWAY.has(t.highway)) continue;
  if (t.indoor === 'yes' || t.level && parseFloat(t.level) < 0 || t.tunnel === 'yes' || t.layer && parseFloat(t.layer) < 0) continue;
  const pts = wayPts(w);
  if (pts.length < 2 || !pts.some((p) => inExtent(p) && distToPolygon(p, boundary) < MARGIN)) continue;
  const closed = w.nodes[0] === w.nodes.at(-1);
  if (closed && t.area === 'yes') {
    areas.push({ kind: 'plaza', outer: orient(cleanRing(pts), true) });
    continue;
  }
  const lanes = parseFloat(t.lanes);
  let width = ROAD_WIDTH[t.highway] ?? 4;
  if (Number.isFinite(lanes) && lanes > 0 && !['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(t.highway)) width = Math.max(width, lanes * 3.3);
  if (t.footway === 'sidewalk' || t.footway === 'crossing') continue; // pavement is the base ground already
  const kind = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'].includes(t.highway) ? 'foot' : 'road';
  const road = { kind, hw: t.highway, w: width, pts };
  if (t.name) road.name = t.name;
  if (t.bridge === 'yes') road.bridge = 1;
  roads.push(road);
}

// Squares, parks, grass, water (ways and relations).
function areaKind(t) {
  if (!t) return null;
  if (t.natural === 'water' || t.waterway === 'riverbank') return 'water';
  if (t.leisure === 'park') return 'park';
  if (t.leisure === 'playground' || t.leisure === 'pitch') return 'pitch';
  if (t.landuse === 'grass') return 'grass';
  if (t.place === 'square') return 'plaza';
  return null;
}
for (const e of elements) {
  const kind = areaKind(e.tags);
  if (!kind || e.tags.building) continue;
  let rings = [];
  if (e.type === 'way' && e.nodes[0] === e.nodes.at(-1)) rings = [{ outer: cleanRing(wayPts(e)), holes: [] }];
  if (e.type === 'relation') {
    const outerW = [], innerW = [];
    for (const m of e.members) {
      const w = ways.get(m.ref);
      if (m.type === 'way' && w) (m.role === 'inner' ? innerW : outerW).push(w.nodes);
    }
    const inners = assembleRings(innerW).map((r) => cleanRing(r.map(proj).filter(Boolean)));
    rings = assembleRings(outerW).map((r) => {
      const outer = cleanRing(r.map(proj).filter(Boolean));
      return { outer, holes: inners.filter((h) => h.length > 2 && pointInPolygon(h[0], outer)) };
    });
  }
  for (const { outer, holes } of rings) {
    // Clip to the baked extent: the Danube polygon is kilometres long.
    const clipped = clipRect(outer, ext.minX, ext.minZ, ext.maxX, ext.maxZ);
    if (clipped.length < 3 || Math.abs(signedArea(clipped)) < 4) continue;
    const a = { kind, outer: orient(cleanRing(clipped), true) };
    const hs = holes.map((h) => clipRect(h, ext.minX, ext.minZ, ext.maxX, ext.maxZ)).filter((h) => h.length > 2);
    if (hs.length) a.holes = hs.map((h) => orient(h, false));
    if (e.tags.name) a.name = e.tags.name;
    areas.push(a);
  }
}

// Point features.
const trees = [], entrances = [], shops = [], bins = [], benches = [];
for (const n of nodes.values()) {
  const t = n.tags;
  if (!t) continue;
  const p = project(n.lat, n.lon);
  if (!inExtent(p)) continue;
  if (t.natural === 'tree') trees.push(p);
  if (t.entrance) entrances.push(p);
  if (t.shop) shops.push({ p, shop: t.shop, ...(t.name ? { name: t.name } : {}) });
  if (t.amenity === 'waste_basket' || t.amenity === 'recycling') bins.push(p);
  if (t.amenity === 'bench') benches.push(p);
}

// Landmarks used by later milestones, found by name where OSM has them.
// Midpoint of the street segment nearest the street's centre, so it lands mid-block
// rather than on a crossing.
function roadMid(name) {
  const mids = roads.filter((r) => r.name === name && r.kind === 'road')
    .flatMap((r) => r.pts.slice(1).map((p, i) => [r1((p[0] + r.pts[i][0]) / 2), r1((p[1] + r.pts[i][1]) / 2)]))
    .filter((p) => pointInPolygon(p, boundary));
  if (!mids.length) return null;
  const c = centroid(mids);
  return mids.reduce((best, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(best[0] - c[0], best[1] - c[1]) ? p : best));
}
function buildingByName(re) {
  const b = buildings.find((b) => b.name && re.test(b.name));
  return b ? centroid(b.outer).map(r1) : null;
}
const spar = shops.filter((s) => /spar/i.test(s.name ?? '') && pointInPolygon(s.p, boundary))
  .sort((a, b) => distTo(a.p, roadMid('Kinizsi utca')) - distTo(b.p, roadMid('Kinizsi utca')))[0];
function distTo(p, q) { return q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : 0; }

const landmarks = {
  spawn: roadMid('Lónyay utca'),
  spar: spar?.p ?? null,
  marketHall: buildingByName(/Vásárcsarnok/i),
  corvinus: buildingByName(/^Budapesti Corvinus Egyetem$/),
  museum: buildingByName(/Iparművészeti/i),
  radayUtca: roadMid('Ráday utca'),
  bakatsTer: roadMid('Bakáts tér'),
  kalvinTer: roadMid('Kálvin tér'),
  nehruPart: areas.find((a) => a.name && /Nehru/i.test(a.name)) ? centroid(areas.find((a) => /Nehru/i.test(a.name ?? '')).outer).map(r1) : null,
};

const city = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors, ODbL',
  origin: ORIGIN,
  units: 'metres; x = east, z = south',
  extent: ext,
  boundary,
  landmarks,
  buildings,
  roads,
  areas,
  trees,
  entrances,
  shops,
  bins,
  benches,
};

await mkdir(new URL('.', OUT), { recursive: true });
const json = JSON.stringify(city);
await writeFile(OUT, json);
console.log(`city.json: ${(json.length / 1024).toFixed(0)} KB`);
console.log(`  buildings ${buildings.length} (${buildings.filter((b) => !b.scenery).length} playable), roads ${roads.length}, areas ${areas.length}`);
console.log(`  trees ${trees.length}, entrances ${entrances.length}, shops ${shops.length}, bins ${bins.length}, benches ${benches.length}`);
console.log('  landmarks', JSON.stringify(landmarks));
