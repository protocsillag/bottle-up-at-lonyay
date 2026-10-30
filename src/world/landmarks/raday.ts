import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement, Spot } from '../placement';
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

export interface RadayPrep { lot: { b: Building; front: Facade } | null; art: Facade | null; }

/** Runtime tweaks to the baked map, before anything is built from it: the car-free
 *  stretch, one-way for the rest, the empty lot (its building is removed) and the
 *  Art Nouveau house (picked here so its colour can go into the city colour map). */
export function prepareRaday(city: CityData): RadayPrep {
  fillRadayGaps(city);
  for (const r of city.roads) {
    if (r.name !== RADAY || r.kind !== 'road') continue;
    if (r.pts.every((p) => p[1] < CAR_FREE_NORTH_OF)) r.nocars = 1;
    else r.oneway ??= 1;
  }
  const fronts = streetFacades(city, RADAY, 12);
  const shopAt = (b: Building) => city.shops.some((s) => pointInPolygon(s.p[0], s.p[1], b.outer));
  const area = (ring: Vec2[]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const count = new Map<Building, number>();
  for (const f of fronts) count.set(f.b, (count.get(f.b) ?? 0) + 1);
  // The empty lot: a small mid-block building with one short Ráday front, no shop.
  const lotFront = fronts
    .filter((f) => f.len > 8 && f.len < 18 && count.get(f.b) === 1 && !f.b.holes?.length && area(f.b.outer) < 450 && !shopAt(f.b))
    .filter((f) => (f.a[1] + f.c[1]) / 2 > CAR_FREE_NORTH_OF)
    .sort((p, q) => area(p.b.outer) - area(q.b.outer))[0];
  let lot: RadayPrep['lot'] = null;
  if (lotFront) {
    city.buildings.splice(city.buildings.indexOf(lotFront.b), 1);
    lot = { b: lotFront.b, front: lotFront };
  }
  const art = fronts
    .filter((f) => f.len > 12 && f.len < 30 && f.b.h >= 14 && (!lot || Math.hypot(f.a[0] - lot.front.a[0], f.a[1] - lot.front.a[1]) > 40))
    .sort((p, q) => hash(p.b.id) - hash(q.b.id))[0] ?? null;
  return { lot, art };
}

/** The baked map misses Ráday's middle stretch (Köztelek utca to Biblia utca, ~230 m):
 *  join loose Ráday ends that face each other across open ground with a new way that runs
 *  through the cross streets' junction nodes, so walkers, cars and the dressing follow it. */
function fillRadayGaps(city: CityData) {
  const rs = city.roads.filter((r) => r.name === RADAY && r.kind === 'road');
  const key = (p: Vec2) => `${p[0]},${p[1]}`;
  const deg = new Map<string, number>();
  for (const r of rs) for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
  const ends = rs.filter((r) => deg.get(key(r.pts[r.pts.length - 1])) === 1);
  const starts = rs.filter((r) => deg.get(key(r.pts[0])) === 1);
  const others = city.roads.filter((r) => r.kind === 'road' && !r.bridge && r.name !== RADAY);
  for (const e of ends) {
    const a = e.pts[e.pts.length - 1], a0 = e.pts[e.pts.length - 2];
    const dir: Vec2 = [a[0] - a0[0], a[1] - a0[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    // The nearest loose start ahead of this end, roughly in line with it.
    const next = starts.filter((s) => s !== e).map((s) => ({ s, b: s.pts[0] }))
      .filter(({ b }) => {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return d > 5 && d < 300 && ((b[0] - a[0]) * dir[0] + (b[1] - a[1]) * dir[1]) / (d * dl) > 0.97;
      })
      .sort((p, q) => Math.hypot(p.b[0] - a[0], p.b[1] - a[1]) - Math.hypot(q.b[0] - a[0], q.b[1] - a[1]))[0];
    if (!next) continue;
    const b = next.b;
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    // Skip if another way already covers the line, or a building stands on it.
    let covered = 0, blocked = false;
    for (let t = 0.1; t < 0.95; t += 0.1) {
      const x = a[0] + dx * t, z = a[1] + dz * t;
      if (city.buildings.some((bd) => pointInPolygon(x, z, bd.outer))) blocked = true;
      if ([...others, ...rs].some((r) => r.pts.some((p, i) => i > 0 && segDist(x, z, r.pts[i - 1], p) < 2))) covered++;
    }
    // Another stretch of Ráday already running alongside means it is no gap.
    const parallel = rs.some((r) => r.pts.some((p) => {
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
      return t > 0.05 && t < 0.95 && Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) < 10;
    }));
    if (blocked || parallel || covered > 4) continue;
    // Pass through junction nodes of crossing streets that touch the line.
    const mid: { t: number; p: Vec2 }[] = [];
    for (const r of others) for (const p of r.pts) {
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
      if (t <= 0.02 || t >= 0.98) continue;
      if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) < 3 && !mid.some((m) => m.p === p)) mid.push({ t, p });
    }
    mid.sort((p, q) => p.t - q.t);
    city.roads.push({ kind: 'road', hw: e.hw, w: e.w, name: RADAY, pts: [a, ...mid.map((m) => m.p), b] });
  }
}

function segDist(x: number, z: number, p: Vec2, q: Vec2) {
  const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
  return Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz);
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
  const fronts = streetFacades(city, RADAY, 13).filter((f) => f.b !== prep.lot?.b);
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
export const firewallTexture = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#8a5a44'; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 32; r++) for (let c = -1; c < 9; c++) {
    const v = ((r * 13 + c * 7) % 9) * 5;
    g.fillStyle = `rgb(${140 + v},${82 + v / 2},${62 + v / 3})`;
    g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 8 + 1, 30, 6);
  }
  g.fillStyle = 'rgba(190,180,160,0.85)';
  g.fillRect(30, 40, 70, 50); g.fillRect(150, 150, 60, 80); g.fillRect(10, 190, 40, 30);
  g.fillStyle = 'rgba(60,50,45,0.6)';
  g.fillRect(120, 0, 10, 256);
});

/** The empty lot between firewalls: fence, gravel, the substation box and the
 *  always-stocked hidden spot behind it (`spot`). Built before the item system. */
export function buildLot(lot: NonNullable<RadayPrep['lot']>, place: Placement) {
  const group = new THREE.Group();
  group.name = 'empty lot';
  const colliders: Box[] = [];
  const lines: Vec2[][] = [];
  const ring = lot.b.outer;
  const front = lot.front;
  const parts: THREE.BufferGeometry[] = [];
  // Firewalls: neighbour walls along the lot's other edges get bare brick.
  const fire = firewallTexture();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    if ((a === front.a && c === front.c) || (a === front.c && c === front.a)) continue;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 2) continue;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
    if (!pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; } // into the lot
    const nb = place.buildings.at(mx - nx * 0.5, mz - nz * 0.5);
    if (!nb) continue;
    const h = nb.h;
    const tex = fire.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 6, h / 6);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshLambertMaterial({ map: tex }));
    wall.position.set(mx + nx * 0.05, h / 2, mz + nz * 0.05);
    wall.rotation.y = Math.atan2(nx, nz);
    group.add(wall);
    // Stepped chimney stacks on top of the firewall.
    for (const s of [-0.3, 0.25]) parts.push(colored(new THREE.BoxGeometry(0.7, 1.4, 0.5).translate(mx + ((c[0] - a[0]) * s), h + 0.7, mz + ((c[1] - a[1]) * s)), 0x7a4a38));
  }
  // Fence 2.6 m back from the street, green posts with red-white tape.
  const ux = (front.c[0] - front.a[0]) / front.len, uz = (front.c[1] - front.a[1]) / front.len;
  const inx = -front.nx, inz = -front.nz;
  const rot = Math.atan2(front.nx, front.nz);
  const fa: Vec2 = [front.a[0] + inx * 2.6 + ux * 0.3, front.a[1] + inz * 2.6 + uz * 0.3];
  const fc: Vec2 = [front.c[0] + inx * 2.6 - ux * 0.3, front.c[1] + inz * 2.6 - uz * 0.3];
  lines.push([[front.a[0] + inx * 2.6, front.a[1] + inz * 2.6], [front.c[0] + inx * 2.6, front.c[1] + inz * 2.6]]);
  const fl = Math.hypot(fc[0] - fa[0], fc[1] - fa[1]);
  for (let t = 0; t <= fl + 0.01; t += 2) {
    const x = fa[0] + ux * t, z = fa[1] + uz * t;
    parts.push(colored(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6).translate(x, 0.6, z), 0x2f6a3a));
  }
  const tapeTex = canvasTex(64, 8, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c8202c' : '#f4f4f4'; g.fillRect(i * 8, 0, 8, 8); } });
  tapeTex.repeat.set(fl / 0.5, 1);
  for (const y of [0.6, 1.05]) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(fl, 0.07), new THREE.MeshLambertMaterial({ map: tapeTex, side: THREE.DoubleSide }));
    tape.position.set((fa[0] + fc[0]) / 2, y, (fa[1] + fc[1]) / 2);
    tape.rotation.y = rot;
    group.add(tape);
  }
  // Inside: gravel heap and loose paving stones.
  const cx = (front.a[0] + front.c[0]) / 2 + inx * 6, cz = (front.a[1] + front.c[1]) / 2 + inz * 6;
  parts.push(colored(new THREE.ConeGeometry(2.2, 1.3, 9).translate(cx, 0.65, cz), 0x9a948a));
  for (let i = 0; i < 10; i++) {
    const a = i * 2.3, r = 1.5 + (i % 3) * 0.9;
    parts.push(colored(new THREE.BoxGeometry(0.4, 0.1, 0.4).rotateY(a).translate(cx + Math.cos(a) * r + ux * 2, 0.05 + (i % 2) * 0.1, cz + Math.sin(a) * r + uz * 2), 0xb5ab98));
  }
  // Street side: the substation box covered in posters and tags, two big green planters.
  const sbx = (front.a[0] + front.c[0]) / 2 + inx * 1.2 - ux * front.len * 0.22, sbz = (front.a[1] + front.c[1]) / 2 + inz * 1.2 - uz * front.len * 0.22;
  const posterTex = canvasTex(256, 192, (g) => {
    g.fillStyle = '#7a7a72'; g.fillRect(0, 0, 256, 192);
    const cols = ['#e8d84a', '#f4f4f0', '#e86a3a', '#8ac8e8', '#f0a0c0'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % cols.length]; g.save(); g.translate(20 + (i % 4) * 60, 16 + Math.floor(i / 4) * 60); g.rotate((i % 3 - 1) * 0.08); g.fillRect(0, 0, 54, 70); g.fillStyle = '#222'; g.fillRect(6, 10, 40, 6); g.fillRect(6, 24, 30, 4); g.restore(); }
    g.font = 'bold 60px Impact, sans-serif'; g.fillStyle = '#c8202c'; g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeText('BUBU', 128, 170); g.fillText('BUBU', 128, 170);
  }, false);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 0.9), [
    new THREE.MeshLambertMaterial({ color: 0x6a6a64 }), new THREE.MeshLambertMaterial({ color: 0x6a6a64 }),
    new THREE.MeshLambertMaterial({ color: 0x5a5a54 }), new THREE.MeshLambertMaterial({ color: 0x5a5a54 }),
    new THREE.MeshLambertMaterial({ map: posterTex }), new THREE.MeshLambertMaterial({ map: posterTex }),
  ]);
  box.position.set(sbx, 0.85, sbz);
  box.rotation.y = rot;
  group.add(box);
  colliders.push({ x: sbx, z: sbz, w: 2.2, d: 0.9, rot });
  for (const s of [0.28]) {
    const px = (front.a[0] + front.c[0]) / 2 + inx * 1.0 + ux * front.len * s, pz = (front.a[1] + front.c[1]) / 2 + inz * 1.0 + uz * front.len * s;
    parts.push(colored(new THREE.BoxGeometry(1.8, 0.8, 0.9).rotateY(rot).translate(px, 0.4, pz), 0x24402c));
    parts.push(colored(new THREE.IcosahedronGeometry(0.6, 0).scale(1.4, 0.8, 0.7).rotateY(rot).translate(px, 1.0, pz), 0x4f7a3a));
    colliders.push({ x: px, z: pz, w: 1.8, d: 0.9, rot });
  }
  group.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // The hidden spot: behind the substation box, against the fence.
  const spot: Spot = { x: sbx + inx * 0.95, z: sbz + inz * 0.95, zone: 'raday', green: false, dir: rot };
  return { group, colliders, lines, spot };
}

