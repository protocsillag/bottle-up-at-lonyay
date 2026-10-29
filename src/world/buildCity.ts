import * as THREE from 'three';
import type { CityData, Vec2 } from './cityData';
import { pointInPolygon } from './collision';

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
};

/** Collects flat-shaded, vertex-coloured triangles. */
class TriBuffer {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(color.r, color.g, color.b);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
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

/** Vertical walls around a ring, facing away from the solid side. */
function walls(buf: TriBuffer, ring: Vec2[], hole: boolean, h: number, color: THREE.Color) {
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
    if (n.dot(want) >= 0) { buf.tri(a, b, c, color); buf.tri(a, c, d, color); } else { buf.tri(a, c, b, color); buf.tri(a, d, c, color); }
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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function groundMaterial(offset: number) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4 });
}

export function buildCity(city: CityData): THREE.Group {
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
  for (const r of city.roads) {
    if (r.bridge) ribbon(bridgeBuf, r.pts, r.w + 2, 7, COLORS.bridge);
    else if (r.kind === 'foot') ribbon(footBuf, r.pts, r.w, 0.035, COLORS.foot);
    else ribbon(roadBuf, r.pts, r.w, 0.05, COLORS.road);
  }
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

  // Buildings, merged per tile.
  const tiles = new Map<string, TriBuffer>();
  for (const b of city.buildings) {
    const [cx, cz] = b.outer[0];
    const key = `${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`;
    let buf = tiles.get(key);
    if (!buf) tiles.set(key, (buf = new TriBuffer()));
    const g = 0.6 + hash(b.id) * 0.2;
    const wall = new THREE.Color(g, g * 0.99, g * 0.97);
    walls(buf, b.outer, false, b.h, wall);
    b.holes?.forEach((hole) => walls(buf!, hole, true, b.h, wall.clone().multiplyScalar(0.92)));
    flatPolygon(buf, b.outer, b.holes, b.h, COLORS.roof);
  }
  const buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [key, buf] of tiles) {
    const m = new THREE.Mesh(buf.geometry(), buildingMat);
    m.name = `buildings ${key}`;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  group.add(buildTrees(city.trees));
  return group;
}

function buildTrees(trees: Vec2[]): THREE.Group {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 3, 6).translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5b4636 }), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x5f8f45, flatShading: true }), trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  trees.forEach(([x, z], i) => {
    const k = 0.8 + hash(`${x},${z}`) * 0.5;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(`${z}`) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, s.set(k, k, k));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  });
  crowns.castShadow = true;
  g.add(trunks, crowns);
  return g;
}
