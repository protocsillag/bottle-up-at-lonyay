import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import { BuildingIndex, type Placement, type Spot } from '../placement';
import { pointInPolygon } from '../collision';
import { offsetLine } from '../buildCity';
import { colored, signTexture } from './common';
import { merge } from '../items/models';
import { streetFacades, type Facade } from './lonyay';

// Ráday utca from Alex's photos (reference/raday-utca/): paved at one level with a
// grey drive strip and steel channels, green cast-iron bollards, wooden terraces under
// awnings that are packed up in the morning and full at night, a wall of hexagon boxes,
// ground-floor shop signs, the white Art Nouveau house and the empty lot between
// firewalls with a hidden spot behind the substation box.

const RADAY = 'Ráday utca';
/** The north stretch from Kálvin tér is car-free; the rest is one way, slowly. */
const CAR_FREE_NORTH_OF = -290;

type Box = { x: number; z: number; w: number; d: number; rot: number };

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/** The empty lot (reference/raday-utca/firewall-empty-lot.jpg): the open ground on the east
 *  side of Ráday just south of Török Pál utca, between bare firewalls, with the real
 *  substation at its street corner. Found by flood-filling the open ground from a seed. */
export interface Lot {
  /** Ráday centreline point at the Török Pál corner; u runs along the street, n into the lot. */
  o: Vec2; u: Vec2; n: Vec2;
  /** Free 1 m cells of the lot ("i,j" of floor(x), floor(z)). */
  cells: Set<string>;
  /** Street frontage along u (from o), and the fence offset from the centreline. */
  t0: number; t1: number; fence: number;
  /** Convex hull of the cells (gates are kept off the walls around it). */
  hull: Vec2[];
  substation: Building | null;
}
export interface RadayPrep { lot: Lot | null; art: Facade | null; }

const LOT_CORNER: Vec2 = [6.3, -294.2]; // Ráday × Török Pál
const LOT_SEED: Vec2 = [45, -285];

function findLot(city: CityData): Lot | null {
  const road = city.roads.find((r) => r.name === RADAY && r.pts.some((p) => Math.hypot(p[0] - LOT_CORNER[0], p[1] - LOT_CORNER[1]) < 3));
  if (!road) return null;
  const i = road.pts.findIndex((p) => Math.hypot(p[0] - LOT_CORNER[0], p[1] - LOT_CORNER[1]) < 3);
  const o = road.pts[i], q = road.pts[i + 1] ?? road.pts[i - 1];
  const l = Math.hypot(q[0] - o[0], q[1] - o[1]);
  let u: Vec2 = [(q[0] - o[0]) / l, (q[1] - o[1]) / l];
  if (u[1] < 0) u = [-u[0], -u[1]]; // run south along the street
  let n: Vec2 = [u[1], -u[0]];
  if ((LOT_SEED[0] - o[0]) * n[0] + (LOT_SEED[1] - o[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const index = new BuildingIndex(city.buildings.filter((b) => !b.scenery));
  const local = (x: number, z: number) => [(x - o[0]) * u[0] + (z - o[1]) * u[1], (x - o[0]) * n[0] + (z - o[1]) * n[1]];
  const FRONT = 7; // pavement up to here
  const free = (x: number, z: number) => !index.at(x + 0.5, z + 0.5) && local(x + 0.5, z + 0.5)[1] > FRONT && Math.hypot(x - LOT_SEED[0], z - LOT_SEED[1]) < 60;
  const k = (x: number, z: number) => `${x},${z}`;
  const sx = Math.floor(LOT_SEED[0]), sz = Math.floor(LOT_SEED[1]);
  if (!free(sx, sz)) return null;
  const cells = new Set([k(sx, sz)]);
  const stack: [number, number][] = [[sx, sz]];
  while (stack.length) {
    const [x, z] = stack.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (cells.has(k(nx, nz)) || !free(nx, nz)) continue;
      cells.add(k(nx, nz));
      stack.push([nx, nz]);
    }
  }
  if (cells.size < 200 || cells.size > 6000) return null; // not the lot we know
  let t0 = Infinity, t1 = -Infinity;
  const pts: Vec2[] = [];
  for (const c of cells) {
    const [x, z] = c.split(',').map(Number);
    pts.push([x + 0.5, z + 0.5]);
    const [t, off] = local(x + 0.5, z + 0.5);
    if (off < FRONT + 1.5) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  }
  // The substation: a small low building at the lot's street corner.
  const substation = city.buildings.find((b) => {
    if (b.scenery || b.h > 5) return false;
    const [t, off] = local(b.outer[0][0], b.outer[0][1]);
    return off > 4 && off < 20 && t > t0 - 15 && t < t0 + 5;
  }) ?? null;
  // A tiny tall block standing inside the lot (a stair core in OSM) reads as a tower: make
  // it a single-storey site shed.
  for (const b of city.buildings) {
    if (b.scenery || b.h < 8) continue;
    const xs = b.outer.map((p) => p[0]), zs = b.outer.map((p) => p[1]);
    if ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)) > 80) continue;
    if (b.outer.some(([x, z]) => cells.has(k(Math.floor(x + 1), Math.floor(z))) || cells.has(k(Math.floor(x - 1), Math.floor(z))))) b.h = 3;
  }
  return { o, u, n, cells, t0, t1, fence: FRONT + 1, hull: convexHull(pts), substation };
}

function convexHull(p: Vec2[]): Vec2[] {
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [], hi: Vec2[] = [];
  for (const q of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of s.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** Runtime tweaks to the baked map, before anything is built from it: the car-free
 *  stretch, one-way for the rest, the empty lot and the Art Nouveau house (picked here so
 *  its colour can go into the city colour map). */
export function prepareRaday(city: CityData): RadayPrep {
  for (const r of city.roads) {
    if (r.name !== RADAY || r.kind !== 'road') continue;
    if (r.pts.every((p) => p[1] < CAR_FREE_NORTH_OF)) r.nocars = 1;
    else r.oneway ??= 1;
  }
  const lot = findLot(city);
  const fronts = streetFacades(city, RADAY, 12);
  const art = fronts
    .filter((f) => f.len > 12 && f.len < 30 && f.b.h >= 14 && (!lot || Math.hypot(f.a[0] - lot.o[0], f.a[1] - lot.o[1]) > 60))
    .sort((p, q) => hash(p.b.id) - hash(q.b.id))[0] ?? null;
  return { lot, art };
}


// ---------------------------------------------------------------- textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Light beige square tiles laid on the diagonal; one texture repeat = 1 m. */
const beigeTiles = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#b5ab98'; g.fillRect(0, 0, 256, 256);
  g.save(); g.translate(128, 128); g.rotate(Math.PI / 4);
  const s = 256 / Math.SQRT2 / 2;
  for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) {
    const v = 200 + ((i * 7 + j * 13) & 7) * 3;
    g.fillStyle = `rgb(${v},${v - 10},${v - 28})`;
    g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  g.restore();
});

/** Grey concrete paving blocks in a running bond. */
const greyBlocks = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#5e5e5c'; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
    const v = 120 + ((r * 5 + c * 3) & 7) * 4;
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
  }
});

/** A UV-mapped flat ribbon; u runs along the street (metres / scale), v across. */
function uvRibbon(pts: Vec2[], half: number, y: number, scale: number) {
  const L = offsetLine(pts, -half), R = offsetLine(pts, half);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(L[i][0], y, L[i][1], R[i][0], y, R[i][1]);
    uv.push(s / scale, 0, s / scale, (2 * half) / scale);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Box helper: adds a coloured box in local terrace space. */
function bx(parts: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, c: number, m?: THREE.Matrix4) {
  const g = colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
  if (m) g.applyMatrix4(m);
  parts.push(g);
}

// ---------------------------------------------------------------- build

export interface RadayOptions {
  /** Gates, shop doors and skips to keep clear (centre and radius). */
  openings: { x: number; z: number; r: number }[];
}

export interface Raday {
  group: THREE.Group;
  colliders: Box[];
  update(hour: number, lamps: number): void;
}

export function buildRaday(city: CityData, place: Placement, prep: RadayPrep, opts: RadayOptions): Raday {
  const group = new THREE.Group();
  group.name = 'raday';
  const colliders: Box[] = [];
  const roads = city.roads.filter((r) => r.name === RADAY && r.kind === 'road');
  const segs = roads.flatMap((r) => r.pts.slice(1).map((p, i) => [r.pts[i], p] as [Vec2, Vec2]));
  const centreDist = (x: number, z: number) => {
    let best = Infinity;
    for (const [p, q] of segs) {
      const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
      best = Math.min(best, Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz));
    }
    return best;
  };
  const blocked = (x: number, z: number, pad: number) => opts.openings.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);

  // ---- Paving: beige diagonal tiles wall to wall, a grey block drive strip, steel channels.
  const vertex = new THREE.MeshLambertMaterial({ vertexColors: true });
  const paveMat = (map: THREE.Texture, off: number) => new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 4 });
  const beige = beigeTiles(), grey = greyBlocks();
  const steel: THREE.BufferGeometry[] = [];
  for (const r of roads) {
    const tiles = new THREE.Mesh(uvRibbon(r.pts, 9.5, 0.062, 1.0), paveMat(beige, 5)); // wall to wall
    tiles.receiveShadow = true;
    group.add(tiles);
    if (!r.nocars) {
      const strip = new THREE.Mesh(uvRibbon(r.pts, 2.4, 0.066, 2.0), paveMat(grey, 6));
      strip.receiveShadow = true;
      group.add(strip);
    }
    for (const off of r.nocars ? [0] : [-2.5, 2.5]) {
      const line = offsetLine(r.pts, off);
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx2, bz] = line[i + 1];
        const len = Math.hypot(bx2 - ax, bz - az);
        steel.push(colored(new THREE.BoxGeometry(0.24, 0.02, len).rotateY(Math.atan2(bx2 - ax, bz - az)).translate((ax + bx2) / 2, 0.072, (az + bz) / 2), 0x55585a));
      }
    }
  }
  const steelMesh = new THREE.Mesh(merge(steel), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -28 }));
  steelMesh.receiveShadow = true;
  group.add(steelMesh);

  // ---- Bollards: dark green cast iron with rounded tops, every 1.5 m along the drive
  // strip, a gap every fifth one so you can cross.
  const bollards: THREE.Matrix4[] = [];
  for (const r of roads) {
    if (r.nocars) continue;
    for (const side of [-1, 1]) {
      const line = offsetLine(r.pts, side * 2.75);
      let k = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx2, bz] = line[i + 1];
        const len = Math.hypot(bx2 - ax, bz - az);
        for (let t = 1; t < len - 0.5; t += 1.5) {
          if (++k % 5 === 0) continue;
          const x = ax + ((bx2 - ax) * t) / len, z = az + ((bz - az) * t) / len;
          if (!place.free(x, z, 0.3) || blocked(x, z, 0)) continue;
          bollards.push(new THREE.Matrix4().makeTranslation(x, 0, z));
          colliders.push({ x, z, w: 0.22, d: 0.22, rot: 0 });
        }
      }
    }
  }
  const bollardGeo = merge([
    colored(new THREE.CylinderGeometry(0.09, 0.11, 0.8, 7, 1, true).translate(0, 0.4, 0), 0x1f3a2c),
    colored(new THREE.SphereGeometry(0.1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.8, 0), 0x1f3a2c),
    colored(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 7, 1, true).translate(0, 0.66, 0), 0x2a4a38),
  ]);
  const bollardMesh = new THREE.InstancedMesh(bollardGeo, vertex, bollards.length);
  bollards.forEach((m, i) => bollardMesh.setMatrixAt(i, m));
  group.add(bollardMesh);

  // ---- Terraces.
  const fronts = streetFacades(city, RADAY, 13);
  const deck: THREE.BufferGeometry[] = [], open: THREE.BufferGeometry[] = [], closed: THREE.BufferGeometry[] = [], bulbs: THREE.BufferGeometry[] = [];
  const AWNINGS = [0x3a2a22, 0x1d1d1d, 0xe6dcc2, 0xf2f1ec];
  let n = 0;
  let hexDone = false;
  const signSpots: { x: number; z: number; rot: number; f: Facade }[] = [];
  for (const f of fronts) {
    const rot = Math.atan2(f.nx, f.nz); // local +z points out of the facade, local +x along it
    for (let t = 3.2; t < f.len - 3.2; t += 7.5) {
      const x0 = f.a[0] + ((f.c[0] - f.a[0]) * t) / f.len, z0 = f.a[1] + ((f.c[1] - f.a[1]) * t) / f.len;
      const out = centreDist(x0, z0);
      const depth = Math.min(2.8, out - 3.1);
      const k = n++;
      if (k % 4 === 3) { signSpots.push({ x: x0, z: z0, rot, f }); continue; }
      if (depth < 1.5 || blocked(x0, z0, 2.8) || (prep.art && f.b === prep.art.b && Math.abs(t - f.len / 2) < 3)) { signSpots.push({ x: x0, z: z0, rot, f }); continue; }
      const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x0, 0, z0);
      const W = 5.2, D = depth, h = hash(f.b.id) + k;
      const kind = h % 4;
      // Deck (sometimes artificial grass), low green railing with a gap in the middle.
      bx(deck, W, 0.08, D, 0, 0.04, D / 2, kind === 2 ? 0x5a8a3a : 0x6a4a32, m);
      for (const s of [-1, 1]) {
        bx(deck, 0.04, 0.04, D, (s * W) / 2, 0.8, D / 2, 0x1f4a2c, m);
        bx(deck, 1.7, 0.04, 0.04, s * (W / 2 - 0.85), 0.8, D, 0x1f4a2c, m);
        for (const px of [W / 2, W / 2 - 1.7]) bx(deck, 0.04, 0.8, 0.04, s * px, 0.4, D, 0x1f4a2c, m);
        bx(deck, 0.04, 0.8, 0.04, (s * W) / 2, 0.4, 0.05, 0x1f4a2c, m);
      }
      // Awning on a black steel frame, sloping from 3.1 m at the wall to 2.6 m out.
      const awn = AWNINGS[kind];
      for (const s of [-1, 1]) bx(deck, 0.07, 2.6, 0.07, (s * W) / 2, 1.3, D - 0.05, 0x1a1a1a, m);
      bx(deck, W, 0.07, 0.07, 0, 2.6, D - 0.05, 0x1a1a1a, m);
      const slope = Math.atan2(0.5, D);
      const roof = colored(new THREE.BoxGeometry(W + 0.2, 0.05, Math.hypot(D, 0.5) + 0.2).rotateX(slope).translate(0, 2.88, D / 2), awn);
      roof.applyMatrix4(m); deck.push(roof);
      bx(deck, W + 0.2, 0.28, 0.03, 0, 2.5, D + 0.08, awn, m);
      if (kind === 3) for (let i = 0; i <= 8; i++) {
        const b = new THREE.SphereGeometry(0.05, 6, 4).translate(-W / 2 + (i * W) / 8, 2.3 - Math.sin((i / 8) * Math.PI) * 0.12, D + 0.1);
        b.applyMatrix4(m); bulbs.push(b);
      }
      // Furniture: beer table sets (light wood, green legs) or café tables with wicker chairs.
      const beer = h % 2 === 0;
      for (const s of [-1, 1]) {
        const cx = s * 1.3, cz = D / 2;
        const cw = m.clone().multiply(new THREE.Matrix4().makeTranslation(cx, 0, cz));
        if (beer) {
          bx(open, 2.0, 0.04, 0.5, 0, 0.76, 0, 0xd8b884, cw);
          for (const lx of [-0.8, 0.8]) bx(open, 0.04, 0.74, 0.45, lx, 0.37, 0, 0x2f6a3a, cw);
          for (const bz2 of [-0.55, 0.55]) {
            bx(open, 2.0, 0.04, 0.25, 0, 0.46, bz2, 0xd8b884, cw);
            for (const lx of [-0.8, 0.8]) bx(open, 0.04, 0.44, 0.22, lx, 0.22, bz2, 0x2f6a3a, cw);
          }
          // Closed: benches folded on the table under a dark green tarp.
          bx(closed, 2.05, 0.82, 0.6, 0, 0.42, 0, 0x2a4a34, cw);
          bx(closed, 2.1, 0.1, 0.62, 0, 0.88, 0, 0x234030, cw);
          colliders.push(boxAt(cw, rot, 2.0, 1.3));
        } else {
          bx(open, 0.06, 0.72, 0.06, 0, 0.36, 0, 0x2b2b2b, cw);
          open.push(colored(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12).translate(0, 0.74, 0).applyMatrix4(cw), 0x2b2b2b));
          for (const c of [-0.55, 0.55]) {
            bx(open, 0.42, 0.06, 0.42, c, 0.45, 0, 0xb08a52, cw);
            bx(open, 0.06, 0.4, 0.42, c + Math.sign(c) * 0.2, 0.66, 0, 0xa07a46, cw);
            for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) bx(open, 0.03, 0.44, 0.03, c + lx, 0.22, lz, 0x8a6a3a, cw);
          }
          // Closed: chairs stacked on the table.
          bx(closed, 0.06, 0.72, 0.06, 0, 0.36, 0, 0x2b2b2b, cw);
          closed.push(colored(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12).translate(0, 0.74, 0).applyMatrix4(cw), 0x2b2b2b));
          bx(closed, 0.44, 0.5, 0.44, 0, 1.0, 0, 0xa07a46, cw);
          colliders.push(boxAt(cw, rot, 1.4, 0.7));
        }
      }
      // Tall black pots with oleanders at the outer corners.
      for (const s of [-1, 1]) {
        bx(deck, 0.4, 0.7, 0.4, s * (W / 2 - 0.3), 0.35, D - 0.35, 0x1d1d1d, m);
        const o = colored(new THREE.IcosahedronGeometry(0.42, 0).scale(1, 1.4, 1).translate(s * (W / 2 - 0.3), 1.2, D - 0.35), (h + s) % 3 ? 0x3f7a3a : 0x4a8a44);
        o.applyMatrix4(m); deck.push(o);
        const fl = colored(new THREE.IcosahedronGeometry(0.12, 0).translate(s * (W / 2 - 0.3) + 0.15, 1.45, D - 0.25), 0xe86a9a);
        fl.applyMatrix4(m); deck.push(fl);
      }
      // One divider is a wall of colourful hexagon boxes with plants in some.
      if (!hexDone && D > 2.2 && k > 6) {
        hexDone = true;
        const HEX = [0xc8202c, 0xf2c418, 0x2457c5, 0xe88aa8, 0xc8c8c4];
        for (let row = 0; row < 4; row++) for (let col = 0; col < Math.floor(D / 0.5); col++) {
          const hz = 0.25 + col * 0.52 + (row % 2) * 0.26;
          if (hz > D) continue;
          const hy = 0.3 + row * 0.45;
          const c = HEX[(row * 3 + col * 2 + k) % HEX.length];
          const hexG = colored(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 6, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).translate(W / 2 + 0.2, hy, hz), c);
          hexG.applyMatrix4(m); deck.push(hexG);
          if ((row + col) % 3 === 0) { const pl = colored(new THREE.IcosahedronGeometry(0.2, 0).translate(W / 2 + 0.2, hy + 0.05, hz), 0x4f8a3a); pl.applyMatrix4(m); deck.push(pl); }
        }
        const p = new THREE.Vector3(W / 2 + 0.2, 0, D / 2).applyMatrix4(m);
        colliders.push({ x: p.x, z: p.z, w: 0.4, d: D, rot });
      }
    }
  }
  const deckMesh = new THREE.Mesh(merge(deck), vertex);
  deckMesh.castShadow = true; deckMesh.receiveShadow = true;
  const openMesh = new THREE.Mesh(merge(open), vertex);
  const closedMesh = new THREE.Mesh(merge(closed), vertex);
  openMesh.castShadow = closedMesh.castShadow = true;
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a7a5a });
  const bulbMesh = new THREE.Mesh(merge(bulbs), bulbMat);
  group.add(deckMesh, openMesh, closedMesh, bulbMesh);

  // ---- Ground-floor shop signs (invented names), A-frame boards and flags.
  const SIGNS = [
    { text: 'AUTOMATA 0–24', bg: '#19b84a', fg: '#ffffff', glow: 0x2a8a3a },
    { text: 'KOREAI BÜFÉ', bg: '#f4f1ea', fg: '#c8202c', glow: 0x6a6a6a },
    { text: 'BOROK', bg: '#5a1a24', fg: '#e8c86a', glow: 0x3a1a1a },
    { text: 'KÁVÉ · REGGELI', bg: '#1d1d1d', fg: '#f4f1ea', glow: 0x2a2a2a },
  ];
  const signMats = SIGNS.map((s) => {
    const tex = signTexture(s.text, s.bg, s.fg, 512, 112, 'bold 64px system-ui, sans-serif');
    return new THREE.MeshLambertMaterial({ map: tex, emissive: s.glow, emissiveIntensity: 0 });
  });
  const flagTex = canvasTex(96, 64, (g) => { g.fillStyle = '#ce2939'; g.fillRect(0, 0, 96, 22); g.fillStyle = '#ffffff'; g.fillRect(0, 22, 96, 21); g.fillStyle = '#477050'; g.fillRect(0, 43, 96, 21); }, false);
  const flagMat = new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide });
  const props: THREE.BufferGeometry[] = [];
  const spread = signSpots.filter((_, i) => i % 2 === 0);
  spread.forEach((s, i) => {
    if (blocked(s.x, s.z, 1)) return;
    const kind = i % SIGNS.length;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), signMats[kind]);
    sign.position.set(s.x + s.f.nx * 0.08, 3.35, s.z + s.f.nz * 0.08);
    sign.rotation.y = s.rot;
    group.add(sign);
    const m = new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z);
    // Steps up to the door, an AC unit above the sign.
    bx(props, 1.6, 0.16, 0.5, 0, 0.08, 0.25, 0x9a968c, m);
    bx(props, 0.8, 0.55, 0.3, 1.2, 4.1, 0.15, 0xdedad2, m);
    if (kind === 1) for (let j = 0; j < 4; j++) {
      // Little flags strung under the sign.
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), flagMat);
      fl.position.copy(new THREE.Vector3(-1.2 + j * 0.8, 2.8, 0.15).applyMatrix4(m));
      fl.rotation.y = s.rot;
      group.add(fl);
    }
    // A-frame chalkboard on the pavement.
    if (place.free(s.x + s.f.nx * 1.4, s.z + s.f.nz * 1.4, 0.3)) {
      const am = m.clone().multiply(new THREE.Matrix4().makeTranslation(-1.2, 0, 1.3));
      for (const sgn of [-1, 1]) {
        const p = colored(new THREE.BoxGeometry(0.55, 0.9, 0.03).translate(0, 0.45, 0).rotateX(sgn * 0.2), 0x1d1d1d);
        p.applyMatrix4(am); props.push(p);
      }
      const p = new THREE.Vector3(-1.2, 0, 1.3).applyMatrix4(m);
      colliders.push({ x: p.x, z: p.z, w: 0.6, d: 0.4, rot: s.rot });
    }
    // Hungarian flag on a bracket above the doorway on every other shop.
    if (i % 2 === 0) {
      const pole = colored(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 5).rotateX(0.7).translate(0, 4.4, 0.55), 0x2b2b2b);
      pole.applyMatrix4(m); props.push(pole);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), flagMat);
      fl.position.copy(new THREE.Vector3(0, 4.3, 0.95).applyMatrix4(m));
      fl.rotation.y = s.rot + Math.PI / 2;
      group.add(fl);
    }
  });
  if (props.length) group.add(new THREE.Mesh(merge(props), vertex));

  // ---- The Art Nouveau house: white with wavy bays, tile stripes, ceramic fruit and a
  // horseshoe-arched ground-floor window.
  if (prep.art) group.add(artNouveau(prep.art));

  return {
    group, colliders,
    update(hour: number, lamps: number) {
      // Packed up in the morning; open from mid-afternoon until the small hours.
      const isOpen = hour >= 15 || hour < 3;
      openMesh.visible = isOpen;
      closedMesh.visible = !isOpen;
      bulbMat.color.setHex(isOpen && lamps > 0.2 ? 0xffd890 : 0x8a7a5a);
      for (const m of signMats) m.emissiveIntensity = lamps * 1.2;
    },
  };
}

function boxAt(m: THREE.Matrix4, rot: number, w: number, d: number): Box {
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  return { x: p.x, z: p.z, w, d, rot };
}

function artNouveau(f: Facade) {
  const parts: THREE.BufferGeometry[] = [];
  const rot = Math.atan2(f.nx, f.nz);
  const mx = (f.a[0] + f.c[0]) / 2, mz = (f.a[1] + f.c[1]) / 2;
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(mx, 0, mz);
  const top = f.b.h - 1.5;
  const put = (g: THREE.BufferGeometry, c: number) => { colored(g, c); g.applyMatrix4(m); parts.push(g); };
  // Two wavy bays: half cylinders from the first floor to the top, with curving balcony slabs.
  for (const s of [-1, 1]) {
    const x = s * f.len * 0.28;
    put(new THREE.CylinderGeometry(1.15, 1.15, top - 4.2, 16, 1, false, -Math.PI / 2, Math.PI).translate(x, (top + 4.2) / 2, 0), 0xf3f0e8);
    for (let y = 4.2; y < top; y += 3.6) {
      put(new THREE.CylinderGeometry(1.45, 1.45, 0.16, 16, 1, false, -Math.PI / 2, Math.PI).translate(x, y, 0), 0xe8e4da);
      // Blue window band in the bay.
      put(new THREE.CylinderGeometry(1.17, 1.17, 1.5, 16, 1, true, -Math.PI / 3, (Math.PI * 2) / 3).translate(x, y + 1.6, 0), 0x2f5a8a);
    }
    put(new THREE.SphereGeometry(1.15, 16, 6, -Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, top, 0), 0x6a8a5a);
  }
  // Thin peach and blue tile stripes along the floor lines.
  for (let y = 4.0; y < top; y += 3.6) {
    put(new THREE.BoxGeometry(f.len - 0.4, 0.12, 0.05).translate(0, y, 0.03), 0xe8a882);
    put(new THREE.BoxGeometry(f.len - 0.4, 0.08, 0.05).translate(0, y + 0.16, 0.03), 0x4a7ab0);
  }
  // Green and orange ceramic fruit near the top, between the bays.
  for (let i = 0; i < 9; i++) {
    const x = -f.len * 0.15 + (i / 8) * f.len * 0.3;
    put(new THREE.SphereGeometry(0.16, 8, 6).translate(x, top - 0.6 + Math.sin(i) * 0.15, 0.12), i % 2 ? 0xe8822a : 0x4a9a4a);
  }
  put(new THREE.BoxGeometry(f.len * 0.34, 0.5, 0.12).translate(0, top - 0.6, 0.05), 0xf3f0e8);
  // Horseshoe-arched window on the ground floor.
  put(new THREE.TorusGeometry(1.0, 0.14, 6, 20, Math.PI * 1.3).rotateZ(-Math.PI * 0.15).translate(0, 2.0, 0.08), 0xe8e4da);
  put(new THREE.CircleGeometry(0.95, 20).translate(0, 2.0, 0.06), 0x24384a);
  put(new THREE.BoxGeometry(1.5, 1.2, 0.03).translate(0, 0.9, 0.06), 0x24384a);
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  return mesh;
}

/** Firewall brick with patched plaster, light-shaft slits and chimney-flue marks. */
export const firewallTexture = () => canvasTex(512, 512, (g) => {
  // One repeat = 6 m. Old brick, a few soft plaster patches, sooty flue streaks.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#8a5a44'; g.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 64; r++) for (let c = -1; c < 17; c++) {
    const v = Math.floor(rnd() * 40);
    g.fillStyle = `rgb(${128 + v},${80 + v / 2},${60 + v / 3})`;
    g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 8 + 1, 30, 6);
  }
  // Irregular plaster remains, blotchy rather than square.
  for (let i = 0; i < 4; i++) {
    const x = rnd() * 512, y = rnd() * 512, rx = 40 + rnd() * 70, ry = 25 + rnd() * 45;
    g.fillStyle = `rgba(${185 + rnd() * 20},${172 + rnd() * 20},${150 + rnd() * 20},0.75)`;
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) g.lineTo(x + Math.cos(a) * rx * (0.7 + rnd() * 0.5), y + Math.sin(a) * ry * (0.7 + rnd() * 0.5));
    g.closePath(); g.fill();
  }
  // Dark streaks where flues and old floors were.
  g.fillStyle = 'rgba(50,40,35,0.35)';
  g.fillRect(140, 0, 18, 512); g.fillRect(380, 0, 12, 512);
  g.fillStyle = 'rgba(60,50,40,0.2)';
  for (const y of [120, 300, 470]) g.fillRect(0, y, 512, 6);
});

/** The empty lot between firewalls: a fence of green posts and red-white tape along the
 *  street, gravel and loose paving stones inside, bare brick firewalls with chimneys on
 *  the neighbours, posters and tags on the substation, planters and bike-share bikes on
 *  the pavement, and the always-stocked hidden spot tucked beside the substation.
 *  Built before the item system. */
export function buildLot(lot: Lot, place: Placement) {
  const group = new THREE.Group();
  group.name = 'empty lot';
  const colliders: Box[] = [];
  const lines: Vec2[][] = [];
  const parts: THREE.BufferGeometry[] = [];
  const { o, u, n } = lot;
  const W = (t: number, off: number): Vec2 => [o[0] + u[0] * t + n[0] * off, o[1] + u[1] * t + n[1] * off];
  const inLot = (x: number, z: number) => lot.cells.has(`${Math.floor(x)},${Math.floor(z)}`);
  const rot = Math.atan2(-n[0], -n[1]); // local +z faces the street

  // Firewalls: every neighbour wall that faces into the lot gets bare, patched brick and
  // chimney stacks along its top.
  const fire = firewallTexture();
  const seen = new Set<Building>();
  for (const [x, z] of lot.hull) for (const b of place.buildings.near(x, z)) seen.add(b);
  for (const b of seen) {
    if (b.scenery || b.h < 6) continue;
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 2) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; } // outward
      if (!inLot(mx + nx * 1.2, mz + nz * 1.2)) continue;
      const tex = fire.clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 10, b.h / 10);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, b.h), new THREE.MeshLambertMaterial({ map: tex }));
      wall.position.set(mx + nx * 0.05, b.h / 2, mz + nz * 0.05);
      wall.rotation.y = Math.atan2(nx, nz);
      group.add(wall);
      for (let s = 0.15; s < 1; s += Math.max(0.2, 5 / len)) {
        parts.push(colored(new THREE.BoxGeometry(0.8, 1.5, 0.6).translate(a[0] + (c[0] - a[0]) * s - nx * 0.4, b.h + 0.75, a[1] + (c[1] - a[1]) * s - nz * 0.4), 0x8a4a34));
      }
    }
  }

  // Fence along the street: green posts, red-white tape, a yellow-black run at one end.
  const f0 = W(lot.t0 + 0.4, lot.fence), f1 = W(lot.t1 - 0.4, lot.fence);
  lines.push([f0, f1]);
  const fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
  for (let t = 0; t <= fl + 0.01; t += 2.2) {
    const [x, z] = [f0[0] + u[0] * t, f0[1] + u[1] * t];
    parts.push(colored(new THREE.CylinderGeometry(0.045, 0.05, 1.3, 6).translate(x, 0.65, z), 0x2f6a3a));
  }
  const tapeTex = (a: string, b: string) => canvasTex(64, 8, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, 8); } });
  const red = tapeTex('#c8202c', '#f4f4f4'), yellow = tapeTex('#141414', '#f2c418');
  for (const [y, tex] of [[0.62, red], [1.08, red], [0.85, yellow]] as const) {
    const len = tex === yellow ? Math.min(fl, 9) : fl;
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / 0.5, 1);
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    const m = tex === yellow ? fl - len / 2 : fl / 2;
    tape.position.set(f0[0] + u[0] * m + n[0] * 0.03, y, f0[1] + u[1] * m + n[1] * 0.03);
    tape.rotation.y = rot;
    group.add(tape);
  }

  // Inside: a gravel heap, loose paving stones, a pile of tyres, weeds.
  const inside = [...lot.cells].map((c) => c.split(',').map(Number) as Vec2).map(([x, z]) => [x + 0.5, z + 0.5] as Vec2)
    .filter(([x, z]) => {
      const off = (x - o[0]) * n[0] + (z - o[1]) * n[1];
      return off > lot.fence + 3 && inLot(x + 2, z) && inLot(x - 2, z) && inLot(x, z + 2) && inLot(x, z - 2);
    });
  const pick = (f: number) => inside[Math.floor(f * (inside.length - 1))];
  if (inside.length) {
    const [gx, gz] = pick(0.45);
    parts.push(colored(new THREE.ConeGeometry(2.6, 1.4, 10).translate(gx, 0.7, gz), 0x9a948a));
    parts.push(colored(new THREE.ConeGeometry(1.4, 0.8, 8).translate(gx + 2.2, 0.4, gz + 1.2), 0xa8a296));
    for (let i = 0; i < 18; i++) {
      const [sx, sz] = pick((i * 0.37 + 0.11) % 1);
      parts.push(colored(new THREE.BoxGeometry(0.4, 0.1, 0.4).rotateY(i * 1.3).translate(sx + Math.sin(i) * 0.8, 0.05 + (i % 3) * 0.1, sz + Math.cos(i) * 0.8), 0xb5ab98));
    }
    for (let i = 0; i < 26; i++) {
      const [wx, wz] = pick((i * 0.53 + 0.07) % 1);
      parts.push(colored(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.12, 0).scale(1, 0.6, 1).translate(wx, 0.15, wz), i % 2 ? 0x5a7a3a : 0x6a8a44));
    }
    const [tx, tz] = pick(0.8);
    for (let i = 0; i < 4; i++) parts.push(colored(new THREE.TorusGeometry(0.33, 0.12, 6, 12).rotateX(Math.PI / 2).translate(tx, 0.12 + i * 0.22, tz), 0x1d1d1d));
  }

  // Posters, notices and tags on the substation's street sides.
  const posterTex = canvasTex(256, 192, (g) => {
    g.fillStyle = '#d8d4c8'; g.fillRect(0, 0, 256, 192);
    const cols = ['#e8d84a', '#f4f4f0', '#e86a3a', '#8ac8e8', '#f0a0c0', '#9ad86a'];
    for (let i = 0; i < 14; i++) { g.fillStyle = cols[i % cols.length]; g.save(); g.translate(8 + (i % 5) * 50, 8 + Math.floor(i / 5) * 58); g.rotate((i % 3 - 1) * 0.08); g.fillRect(0, 0, 46, 62); g.fillStyle = '#222'; g.fillRect(5, 8, 34, 6); g.fillRect(5, 22, 26, 4); g.fillRect(5, 30, 30, 3); g.restore(); }
    g.font = 'bold 54px Impact, sans-serif'; g.lineWidth = 6; g.strokeStyle = '#111';
    g.fillStyle = '#c8202c'; g.strokeText('BUBU', 70, 178); g.fillText('BUBU', 70, 178);
    g.fillStyle = '#2457c5'; g.strokeText('ÖZ', 200, 120); g.fillText('ÖZ', 200, 120);
  }, false);
  const posterMat = new THREE.MeshLambertMaterial({ map: posterTex });
  let spot: Spot;
  const sub = lot.substation;
  if (sub) {
    const ring = sub.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 1) continue;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (pointInPolygon(mx + nx * 0.2, mz + nz * 0.2, ring)) { nx = -nx; nz = -nz; }
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, Math.min(sub.h, 3) - 0.3), posterMat);
      plane.position.set(mx + nx * 0.04, (Math.min(sub.h, 3) - 0.3) / 2 + 0.1, mz + nz * 0.04);
      plane.rotation.y = Math.atan2(nx, nz);
      group.add(plane);
    }
    // Tucked against the substation's south side, on the pavement.
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    cx /= ring.length; cz /= ring.length;
    let best: Vec2 = W(lot.t0 - 1, lot.fence - 1);
    for (let d = 1; d < 8; d += 0.5) {
      const p: Vec2 = [cx + u[0] * d, cz + u[1] * d];
      const off = (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
      if (place.free(p[0], p[1], 0.5) && off < lot.fence - 0.4) { best = p; break; }
      const q: Vec2 = [p[0] - n[0] * 2, p[1] - n[1] * 2];
      if (place.free(q[0], q[1], 0.5)) { best = q; break; }
    }
    spot = { x: best[0], z: best[1], zone: 'raday', green: false, dir: rot };
  } else {
    const p = W(lot.t0 + 1, lot.fence - 0.8);
    spot = { x: p[0], z: p[1], zone: 'raday', green: false, dir: rot };
  }

  // On the pavement in front: big dark green planters and a bike-share dock with lime bikes.
  for (const t of [lot.t0 + 3.5, lot.t0 + 7]) {
    const [px, pz] = W(t, lot.fence - 0.9);
    if (!place.free(px, pz, 0.6)) continue;
    parts.push(colored(new THREE.BoxGeometry(1.4, 0.85, 1.0).rotateY(rot).translate(px, 0.425, pz), 0x24402c));
    parts.push(colored(new THREE.IcosahedronGeometry(0.55, 0).scale(1.2, 0.9, 0.9).translate(px, 1.15, pz), 0x4f7a3a));
    colliders.push({ x: px, z: pz, w: 1.4, d: 1.0, rot });
  }
  for (let i = 0; i < 3; i++) {
    const [bx, bz] = W(lot.t0 + 10 + i * 0.9, lot.fence - 1.2);
    if (!place.free(bx, bz, 0.4)) continue;
    const m = new THREE.Matrix4().makeRotationY(rot + Math.PI / 2).setPosition(bx, 0, bz);
    for (const s of [-0.5, 0.5]) {
      const w = colored(new THREE.TorusGeometry(0.32, 0.035, 4, 14).translate(s, 0.34, 0), 0x1d1d1d); w.applyMatrix4(m); parts.push(w);
    }
    const fr = colored(new THREE.BoxGeometry(1.0, 0.07, 0.07).translate(0, 0.55, 0), 0x9ad82a); fr.applyMatrix4(m); parts.push(fr);
    const bk = colored(new THREE.BoxGeometry(0.3, 0.2, 0.25).translate(0.55, 0.85, 0), 0x9ad82a); bk.applyMatrix4(m); parts.push(bk);
    const dock = colored(new THREE.BoxGeometry(0.12, 0.9, 0.2).translate(0.8, 0.45, 0), 0x3a3a3a); dock.applyMatrix4(m); parts.push(dock);
    colliders.push({ x: bx, z: bz, w: 0.4, d: 1.3, rot });
  }

  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return { group, colliders, lines, spot };
}
