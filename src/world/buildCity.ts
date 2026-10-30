import * as THREE from 'three';
import type { CityData, Vec2 } from './cityData';
import { pointInPolygon } from './collision';
import { facadeMaterial } from './facade';

// Builds the static city meshes from city.json. M1 look: grey extruded blocks on a
// pavement ground, asphalt streets, green parks and the Danube. Buildings are merged
// into one mesh per 200 m tile so the renderer can frustum-cull whole tiles.

const TILE = 200;

const COLORS = {
  ground: new THREE.Color(0xb9b4aa),
  road: new THREE.Color(0x4a4c50),
  foot: new THREE.Color(0xcfc8bb),
  plaza: new THREE.Color(0xd6cfc1),
  park: new THREE.Color(0x7fa35a),
  grass: new THREE.Color(0x8db366),
  pitch: new THREE.Color(0x9a6c50),
  water: new THREE.Color(0x3f7393),
  roof: new THREE.Color(0x6e6c69),
  bridge: new THREE.Color(0x5d6064),
  kerb: new THREE.Color(0xa9a59c),
};

/** A polyline shifted sideways by d metres (per-segment normals, averaged at joints). */
export function offsetLine(pts: Vec2[], d: number): Vec2[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / len) * d, p[1] + (dx / len) * d] as Vec2;
  });
}

/** Collects flat-shaded, vertex-coloured triangles, optionally with facade attributes. */
export class TriBuffer {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  fac: number[] = [];
  sty: number[] = [];
  /** Facade style for following tris: [seed, kind]; kind −1 = no pattern. */
  style: [number, number] = [0, -1];

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, fa?: number[], fb?: number[], fc?: number[]) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const fs = [fa, fb, fc];
    [a, b, c].forEach((v, i) => {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(color.r, color.g, color.b);
      const f = fs[i] ?? [0, 0, 0];
      this.fac.push(f[0], f[1], f[2]);
      this.sty.push(this.style[0], fa ? this.style[1] : -1);
    });
  }

  geometry(facade = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (facade) {
      g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.fac, 3));
      g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.sty, 2));
    }
    g.computeBoundingSphere();
    return g;
  }

  get empty() { return this.pos.length === 0; }
}

/** Triangulates a polygon (with holes) as an upward-facing surface at height y. */
function flatPolygon(buf: TriBuffer, outer: Vec2[], holes: Vec2[][] | undefined, y: number, color: THREE.Color) {
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
  const holeV = (holes ?? []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all = contour.concat(...holeV);
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holeV)) {
    const a = new THREE.Vector3(all[i].x, y, all[i].y);
    let b = new THREE.Vector3(all[j].x, y, all[j].y);
    let c = new THREE.Vector3(all[k].x, y, all[k].y);
    // Normal y = dz1*dx2 - dx1*dz2; make it point up.
    if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
    buf.tri(a, b, c, color);
  }
}

/** Vertical walls around a ring, facing away from the solid side, with facade coordinates.
 *  Outer rings of taller buildings also get a projecting cornice under the roof. */
export function walls(buf: TriBuffer, ring: Vec2[], hole: boolean, h: number, color: THREE.Color, cornice = false) {
  // Probe one edge to learn whether the left-hand normal points out of the solid.
  const [ax, az] = ring[0], [bx, bz] = ring[1];
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const mx = (ax + bx) / 2 + (-(bz - az) / len) * 0.05;
  const mz = (az + bz) / 2 + ((bx - ax) / len) * 0.05;
  const probeInRing = pointInPolygon(mx, mz, ring);
  // For an outer ring the wall should face out of the ring; for a courtyard hole, into it.
  const flip = hole ? !probeInRing : probeInRing;
  for (let i = 0; i < ring.length; i++) {
    let p = ring[i], q = ring[(i + 1) % ring.length];
    if (flip) [p, q] = [q, p];
    const a = new THREE.Vector3(p[0], 0, p[1]);
    const b = new THREE.Vector3(q[0], 0, q[1]);
    const c = new THREE.Vector3(q[0], h, q[1]);
    const d = new THREE.Vector3(p[0], h, p[1]);
    // Pick the winding whose face normal matches the outward (left-hand) normal.
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const want = new THREE.Vector3(-(q[1] - p[1]), 0, q[0] - p[0]);
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const fa = [0, 0, len], fb = [len, 0, len], fc = [len, h, len], fd = [0, h, len];
    if (n.dot(want) >= 0) { buf.tri(a, b, c, color, fa, fb, fc); buf.tri(a, c, d, color, fa, fc, fd); } else { buf.tri(a, c, b, color, fa, fc, fb); buf.tri(a, d, c, color, fa, fd, fc); }
    if (cornice && h > 8 && len > 0.8) {
      // Projecting ledge: outward along the wall's normal.
      const wl = Math.hypot(want.x, want.z) || 1;
      const sign = n.dot(want) >= 0 ? 1 : -1;
      const ox = (want.x / wl) * 0.35 * sign, oz = (want.z / wl) * 0.35 * sign;
      const y0 = h - 0.85, y1 = h - 0.35;
      const lc = color.clone().lerp(new THREE.Color(0xf2ece0), 0.35);
      const P = (pt: Vec2, y: number, out: number) => new THREE.Vector3(pt[0] + ox * out, y, pt[1] + oz * out);
      const quad = (v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, shade: number) => {
        const cc = lc.clone().multiplyScalar(shade);
        // Pick the winding that faces outward/up.
        const nn = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
        const out = new THREE.Vector3(ox, 0.001, oz);
        if (nn.dot(out) >= 0 || nn.y > 0.5) { buf.tri(v0, v1, v2, cc); buf.tri(v0, v2, v3, cc); } else { buf.tri(v0, v2, v1, cc); buf.tri(v0, v3, v2, cc); }
      };
      quad(P(p, y0, 1), P(q, y0, 1), P(q, y1, 1), P(p, y1, 1), 1); // front
      const top = [P(p, y1, 0), P(q, y1, 0), P(q, y1, 1), P(p, y1, 1)] as const;
      const t = new THREE.Vector3().subVectors(top[1], top[0]).cross(new THREE.Vector3().subVectors(top[2], top[0]));
      if (t.y >= 0) { buf.tri(top[0], top[1], top[2], lc); buf.tri(top[0], top[2], top[3], lc); } else { buf.tri(top[0], top[2], top[1], lc); buf.tri(top[0], top[3], top[2], lc); }
      const bot = [P(p, y0, 0), P(q, y0, 0), P(q, y0, 1), P(p, y0, 1)] as const;
      const bn = new THREE.Vector3().subVectors(bot[1], bot[0]).cross(new THREE.Vector3().subVectors(bot[2], bot[0]));
      const dark = lc.clone().multiplyScalar(0.7);
      if (bn.y <= 0) { buf.tri(bot[0], bot[1], bot[2], dark); buf.tri(bot[0], bot[2], bot[3], dark); } else { buf.tri(bot[0], bot[2], bot[1], dark); buf.tri(bot[0], bot[3], bot[2], dark); }
    }
  }
}

/** Straight ribbon pieces along a polyline, extended at both ends to cover joints. */
function ribbon(buf: TriBuffer, pts: Vec2[], width: number, y: number, color: THREE.Color) {
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = -uz * hw, nz = ux * hw;
    const ex = ux * hw * 0.9, ez = uz * hw * 0.9;
    const p0 = new THREE.Vector3(ax - ex + nx, y, az - ez + nz);
    const p1 = new THREE.Vector3(ax - ex - nx, y, az - ez - nz);
    const p2 = new THREE.Vector3(bx + ex - nx, y, bz + ez - nz);
    const p3 = new THREE.Vector3(bx + ex + nx, y, bz + ez + nz);
    // Up-facing winding.
    const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) >= 0;
    if (up) { buf.tri(p0, p1, p2, color); buf.tri(p0, p2, p3, color); } else { buf.tri(p0, p2, p1, color); buf.tri(p0, p3, p2, color); }
  }
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function groundMaterial(offset: number) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4 });
}

// Eclectic Pest plaster colours: cream, ochre, grey, brick red, salmon, pale green, pale yellow.
const PLASTER = [0xe6d9bd, 0xd9b26a, 0xe3c58d, 0xb9b4aa, 0xa8553f, 0xd99b7e, 0xb8c4a0, 0xeadc9a, 0xd8d4cc, 0xaab8c0, 0xc98f5a, 0xdcc8a8];
const ROOFS = [0x5e5a56, 0x6e4a3a, 0x7a3f2e, 0x55595e];

function buildingLook(b: CityData['buildings'][number], seed: number, opts: BuildCityOptions) {
  const name = b.name ?? '';
  let color = opts.colors?.get(b.id) ?? PLASTER[Math.floor(seed * PLASTER.length)];
  let kind = 1;
  if (opts.brick?.has(b.id)) { kind = 4; color = 0x9a4a35; }
  if (opts.palace?.has(b.id)) kind = 3;
  if (/palota|Múzeum|Egyetem|Corvinus|Sóház|Bánffy|Wenckheim|Almássy|Pálffy|Zichy|Hadik|Károlyi/i.test(name)) { kind = 3; color = [0xe8dcc0, 0xd8c8a8, 0xe3d3b0][Math.floor(seed * 3)]; }
  if (/templom|plébánia|kápolna/i.test(name)) { kind = 3; color = 0xe0d6c0; }
  if (/Corvinus Egyetem$/.test(name)) color = 0xd7c9a8;
  if (b.h < 7) kind = 0; // kiosks, sheds, garages
  const wall = new THREE.Color(color);
  // Slight per-building variation so neighbours never match exactly.
  wall.offsetHSL(0, (seed - 0.5) * 0.05, (hash(b.id + 'l') - 0.5) * 0.06);
  return { wall, kind, roof: new THREE.Color(ROOFS[Math.floor(hash(b.id + 'r') * ROOFS.length)]) };
}

export interface BuildCityOptions {
  /** Building ids replaced by hand-built landmarks. */
  skip?: Set<string>;
  /** Plaster colour overrides per building id (street palettes from Alex's photos). */
  colors?: Map<string, number>;
  /** Red-brick buildings with cream bands (facade kind 4). */
  brick?: Set<string>;
  /** Street names paved at one level, without kerbs (Ráday utca). */
  noKerb?: Set<string>;
  /** Buildings drawn with the palace facade (big arched windows). */
  palace?: Set<string>;
}

export function buildCity(city: CityData, opts: BuildCityOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'city';
  const { extent } = city;

  // Base ground: Pest is pavement wall to wall.
  const size = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) + 4000;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: COLORS.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((extent.minX + extent.maxX) / 2, 0, (extent.minZ + extent.maxZ) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // Areas: water and plazas below parks and grass.
  const areaBuf = new TriBuffer();
  const order = ['water', 'plaza', 'park', 'pitch', 'grass'] as const;
  for (const kind of order) {
    for (const a of city.areas.filter((a) => a.kind === kind)) {
      flatPolygon(areaBuf, a.outer, a.holes, 0.01 + order.indexOf(kind) * 0.004, COLORS[kind]);
    }
  }
  const areas = new THREE.Mesh(areaBuf.geometry(), groundMaterial(1));
  areas.receiveShadow = true;
  group.add(areas);

  // Streets: footpaths over plazas, roads over everything flat.
  const footBuf = new TriBuffer();
  const roadBuf = new TriBuffer();
  const bridgeBuf = new TriBuffer();
  const kerbBuf = new TriBuffer();
  for (const r of city.roads) {
    if (r.bridge) ribbon(bridgeBuf, r.pts, r.w + 2, 7, COLORS.bridge);
    else if (r.kind === 'foot') ribbon(footBuf, r.pts, r.w, 0.035, COLORS.foot);
    else {
      ribbon(roadBuf, r.pts, r.w, 0.05, COLORS.road);
      // Granite kerbs along both edges (not on paved one-level streets).
      if (!opts.noKerb?.has(r.name ?? '')) for (const side of [-1, 1]) ribbon(kerbBuf, offsetLine(r.pts, (side * r.w) / 2), 0.28, 0.11, COLORS.kerb);
    }
  }
  const kerbs = new THREE.Mesh(kerbBuf.geometry(), groundMaterial(4));
  kerbs.receiveShadow = true;
  group.add(kerbs);
  for (const [buf, off] of [[footBuf, 2], [roadBuf, 3]] as const) {
    const m = new THREE.Mesh(buf.geometry(), groundMaterial(off));
    m.receiveShadow = true;
    group.add(m);
  }
  if (!bridgeBuf.empty) {
    const bridges = new THREE.Mesh(bridgeBuf.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    bridges.castShadow = true;
    group.add(bridges);
  }

  // Buildings, merged per tile, with procedural facades.
  const tiles = new Map<string, TriBuffer>();
  for (const b of city.buildings) {
    if (opts.skip?.has(b.id)) continue;
    const [cx, cz] = b.outer[0];
    const key = `${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`;
    let buf = tiles.get(key);
    if (!buf) tiles.set(key, (buf = new TriBuffer()));
    const seed = hash(b.id);
    const { wall, kind, roof } = buildingLook(b, seed, opts);
    buf.style = [seed, kind];
    walls(buf, b.outer, false, b.h, wall, true);
    buf.style = [seed, 2];
    b.holes?.forEach((hole) => walls(buf!, hole, true, b.h, wall.clone().multiplyScalar(0.92)));
    buf.style = [seed, -1];
    flatPolygon(buf, b.outer, b.holes, b.h, roof);
  }
  const buildingMat = facadeMaterial();
  for (const [key, buf] of tiles) {
    const m = new THREE.Mesh(buf.geometry(true), buildingMat);
    m.name = `buildings ${key}`;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  group.add(buildTrees(city.trees));
  return group;
}

/** Plane trees: a pale mottled trunk and a crown of three leafy clumps, colour-varied. */
export function buildTrees(trees: Vec2[]): THREE.Group {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3.4, 6).translate(0, 1.7, 0);
  const clump = (r: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z);
  const parts = [clump(2.0, 0, 5.0, 0), clump(1.5, 1.3, 4.4, 0.5), clump(1.4, -1.1, 4.6, -0.6), clump(1.2, 0.2, 6.2, -0.3)];
  const crownGeo = new THREE.BufferGeometry();
  {
    const nonIdx = parts.map((p) => (p.index ? p.toNonIndexed() : p));
    const count = nonIdx.reduce((a, p) => a + p.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
    let o = 0;
    for (const p of nonIdx) {
      pos.set(p.attributes.position.array as Float32Array, o * 3);
      nrm.set(p.attributes.normal.array as Float32Array, o * 3);
      o += p.attributes.position.count;
    }
    crownGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    crownGeo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x9a8f78 }), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  trees.forEach(([x, z], i) => {
    const k = 0.75 + hash(`${x},${z}`) * 0.55;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(`${z}`) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, s.set(k, k, k));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, c.setHSL(0.24 + hash(`${x}h`) * 0.06, 0.38 + hash(`${z}s`) * 0.15, 0.3 + hash(`${x}${z}`) * 0.1));
  });
  crowns.castShadow = true;
  trunks.castShadow = true;
  g.add(trunks, crowns);
  return g;
}
