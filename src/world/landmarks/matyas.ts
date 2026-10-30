import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import type { CollisionWorld } from '../collision';
import type { Placement } from '../placement';
import type { StreetIndex } from '../streets';
import type { Rng } from '../../state/rng';
import { colored } from './common';
import { merge } from '../items/models';
import { streetFacades } from './lonyay';

// Mátyás utca from Alex's photos (reference/matyas-utca/): the street's palette (ochre
// mustard, grey-green, grey-beige, apricot, the olive green house), the MOSODA laundry
// letters down a corner, and the wear and tear found on every side street: painted
// plinths, graffiti tags below 2.5 m and pavement road works.

const MATYAS_PALETTE = [0xc9a24a, 0x9fa894, 0xbfb5a2, 0xe0a978, 0x6f7a4a, 0xa9b4bc, 0xd6c49c];

/** Per-building colour overrides for Mátyás utca. */
export function matyasColors(city: CityData, into = new Map<string, number>()) {
  for (const f of streetFacades(city, 'Mátyás utca', 12)) {
    if (!into.has(f.b.id)) into.set(f.b.id, MATYAS_PALETTE[hash(f.b.id) % MATYAS_PALETTE.length]);
  }
  return into;
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function rnd(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------- graffiti

// Invented tags, not copied from the photos.
const TAGS = ['ZÚZ', 'KÖB', 'ROZS', 'PÖTTY', 'MÉZ', 'BÜTYÖK', 'GOMB', 'FIKA', 'ŐZ', 'TÜSKE', 'KRAK', 'SZÖSZ', 'BUBU', 'NYÚL', 'VAKOND'];
const INKS = ['#111111', '#1c1c1c', '#c8202c', '#2457c5', '#e8e8e8', '#6a2a8a', '#1f7a3a', '#e07a1a', '#d9c21a', '#222a55'];
const COLS = 4, ROWS = 4, CW = 512, CH = 256;

function graffitiTexture() {
  const cv = document.createElement('canvas');
  cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < COLS * ROWS; i++) {
    const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH;
    g.save();
    g.beginPath(); g.rect(ox, oy, CW, CH); g.clip();
    g.translate(ox + CW / 2, oy + CH / 2);
    const word = TAGS[i % TAGS.length];
    const ink = INKS[i % INKS.length], fill = INKS[(i * 3 + 4) % INKS.length];
    const style = i % 3;
    g.rotate((rnd(i) - 0.5) * 0.35);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (style === 0) {
      // Fast scrawl: thin slanted letters with a flourish underneath.
      g.font = `italic bold ${110 + rnd(i + 7) * 40}px "Brush Script MT", "Comic Sans MS", cursive`;
      g.lineWidth = 5; g.strokeStyle = ink; g.strokeText(word, 0, -10);
      g.beginPath(); g.moveTo(-180, 70); g.quadraticCurveTo(0, 110 + rnd(i) * 30, 200, 40); g.stroke();
    } else if (style === 1) {
      // Bubble letters: fat fill with a dark outline.
      g.font = `900 ${120 + rnd(i + 3) * 30}px "Arial Black", Impact, sans-serif`;
      g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = ink; g.strokeText(word, 0, 0);
      g.fillStyle = fill === ink ? '#e8e8e8' : fill; g.fillText(word, 0, 0);
      g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.globalAlpha = 0.5; g.strokeText(word, -4, -4); g.globalAlpha = 1;
    } else {
      // Block tag with drips.
      g.font = `bold ${100 + rnd(i + 5) * 40}px Impact, "Arial Narrow", sans-serif`;
      g.fillStyle = ink; g.fillText(word, 0, -10);
      const w = g.measureText(word).width;
      for (let d = 0; d < 6; d++) {
        const x = -w / 2 + rnd(i * 10 + d) * w;
        g.fillRect(x, 20, 4, 20 + rnd(i * 20 + d) * 70);
      }
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface Wall { a: Vec2; c: Vec2; nx: number; nz: number; len: number; id: string; }

/** Outer building edges that face a street (free pavement in front, a named road near). */
function streetWalls(city: CityData, place: Placement, streets: StreetIndex): Wall[] {
  const out: Wall[] = [];
  for (const b of city.buildings) {
    if (b.scenery) continue;
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 3) continue;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (place.buildings.at(mx + nx * 0.4, mz + nz * 0.4) === b) { nx = -nx; nz = -nz; }
      if (!place.free(mx + nx * 1.5, mz + nz * 1.5, 0.5)) continue;
      if (!streets.nearest(mx + nx * 3, mz + nz * 3, 16)) continue;
      out.push({ a, c, nx, nz, len, id: b.id });
    }
  }
  return out;
}

export interface WearOptions {
  /** Openings to keep clear: gates and shop doors (centre and half width). */
  openings: { x: number; z: number; r: number }[];
  /** Buildings that get no plinth (brick school, landmarks). */
  noPlinth: Set<string>;
}

/** Painted plinths on about a third of the street buildings (all of Mátyás utca) and
 *  graffiti tags on ground floors. Two draw calls. */
export function buildWear(city: CityData, place: Placement, streets: StreetIndex, opts: WearOptions) {
  const group = new THREE.Group();
  group.name = 'wear';
  const walls = streetWalls(city, place, streets);
  const matyas = new Set(streetFacades(city, 'Mátyás utca', 12).map((f) => f.b.id));
  const blocked = (x: number, z: number, pad: number) => opts.openings.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);

  // Plinths: 0.9–1.2 m painted bands, split around openings.
  const PLINTH = [0x6e2a24, 0x5c5c5a, 0x3e4448, 0x5a4030, 0x7a3a2a];
  const parts: THREE.BufferGeometry[] = [];
  for (const w of walls) {
    if (opts.noPlinth.has(w.id)) continue;
    const hb = hash(w.id);
    if (!matyas.has(w.id) && hb % 3 !== 0) continue;
    const color = PLINTH[(hb >> 3) % PLINTH.length];
    const h = 0.9 + ((hb >> 6) % 4) * 0.1;
    const ux = (w.c[0] - w.a[0]) / w.len, uz = (w.c[1] - w.a[1]) / w.len;
    let t0 = 0;
    const flush = (t1: number) => {
      if (t1 - t0 < 0.4) return;
      const m = (t0 + t1) / 2;
      const box = new THREE.BoxGeometry(t1 - t0, h, 0.06);
      box.rotateY(Math.atan2(-uz, ux));
      box.translate(w.a[0] + ux * m + w.nx * 0.03, h / 2, w.a[1] + uz * m + w.nz * 0.03);
      parts.push(colored(box, color));
    };
    for (let t = 0; t <= w.len; t += 0.25) {
      if (blocked(w.a[0] + ux * t, w.a[1] + uz * t, 0.2)) { flush(t - 0.25); t0 = t + 0.25; }
    }
    flush(w.len);
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Graffiti: about one tag every 9 m of street wall, more on Mátyás utca.
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let n = 0;
  for (const w of walls) {
    const hb = hash(w.id + w.a[0]);
    const every = matyas.has(w.id) ? 6 : 9;
    const count = Math.floor(w.len / every + rnd(hb));
    const ux = (w.c[0] - w.a[0]) / w.len, uz = (w.c[1] - w.a[1]) / w.len;
    // Seen from the street, +u must run left to right or the tag reads mirrored.
    const flip = ux * w.nz - uz * w.nx < 0;
    for (let k = 0; k < count; k++) {
      const s = hb + k * 17;
      const width = 0.9 + rnd(s) * 1.4, height = width / 2;
      const t = width / 2 + 0.3 + rnd(s + 1) * Math.max(0, w.len - width - 0.6);
      const cx = w.a[0] + ux * t, cz = w.a[1] + uz * t;
      if (blocked(cx, cz, width / 2)) continue;
      const y0 = 0.25 + rnd(s + 2) * Math.max(0, 2.5 - height - 0.25);
      const cell = Math.floor(rnd(s + 3) * COLS * ROWS);
      const u0 = (cell % COLS) / COLS, v1 = 1 - Math.floor(cell / COLS) / ROWS, v0 = v1 - 1 / ROWS;
      const off = 0.035 + (k % 3) * 0.004;
      const ox = w.nx * off, oz = w.nz * off;
      for (const [a, b] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        pos.push(cx + ux * a * width / 2 + ox, y0 + b * height, cz + uz * a * width / 2 + oz);
        uv.push((a < 0) !== flip ? u0 : u0 + 1 / COLS, b ? v1 : v0);
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
  }
  if (n) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: graffitiTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------- MOSODA

/** Tall white "MOSODA" letters down the corner of a Mátyás utca corner building, over a
 *  big arched laundry window. */
export function buildMosoda(city: CityData): THREE.Group | null {
  const own = streetFacades(city, 'Mátyás utca', 12);
  const others = new Set(city.roads.filter((r) => r.name && r.name !== 'Mátyás utca').map((r) => r.name!));
  let pick: { f: (typeof own)[number]; end: Vec2 } | null = null;
  for (const name of others) {
    if (pick) break;
    const cross = streetFacades(city, name, 12);
    for (const f of own) {
      if (f.b.h <= 10) continue;
      for (const q of cross) {
        if (q.b !== f.b || Math.abs(q.nx * f.nx + q.nz * f.nz) > 0.5) continue;
        // The end of the Mátyás face nearest the cross-street face is the corner.
        const d = (p: Vec2) => Math.min(Math.hypot(p[0] - q.a[0], p[1] - q.a[1]), Math.hypot(p[0] - q.c[0], p[1] - q.c[1]));
        const end = d(f.a) < d(f.c) ? f.a : f.c;
        if (d(end) < 8) { pick = { f, end }; break; }
      }
      if (pick) break;
    }
  }
  if (!pick) return null;
  const { f, end } = pick;
  const other = end === f.a ? f.c : f.a;
  const ux = (other[0] - end[0]) / f.len, uz = (other[1] - end[1]) / f.len;
  const group = new THREE.Group();
  group.name = 'mosoda';
  const rot = Math.atan2(f.nx, f.nz);

  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 768;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2d3a44'; g.fillRect(0, 0, 128, 768);
  g.fillStyle = '#ffffff'; g.font = 'bold 104px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [...'MOSODA'].forEach((ch, i) => g.fillText(ch, 64, 64 + i * 128));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x444444, emissiveMap: tex });
  const edge = new THREE.MeshLambertMaterial({ color: 0x2d3a44 });
  // Letters on both flat sides, read from either end of the street.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.7), [face, face, edge, edge, edge, edge]);
  // A blade sign sticking out of the wall 1 m from the corner, 3–6.6 m up.
  sign.position.set(end[0] + ux * 1.0 + f.nx * 0.4, 4.8, end[1] + uz * 1.0 + f.nz * 0.4);
  sign.rotation.y = rot;
  group.add(sign);

  // Big arched shop window with washing machines glowing behind it.
  const win = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshLambertMaterial({ color: 0x9fc4d4, emissive: 0x6a8a96 }));
  glass.position.y = 1.6;
  const arch = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16, 0, Math.PI), glass.material);
  arch.position.y = 2.7;
  win.add(glass, arch);
  for (let i = 0; i < 3; i++) {
    const drum = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), new THREE.MeshBasicMaterial({ color: 0xdfe8ee }));
    drum.position.set(-0.8 + i * 0.8, 1.15, 0.01);
    win.add(drum);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.1), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
  frame.position.y = 0.5;
  win.add(frame);
  win.position.set(end[0] + ux * 3.6 + f.nx * 0.04, 0, end[1] + uz * 3.6 + f.nz * 0.04);
  win.rotation.y = rot;
  group.add(win);
  return group;
}

// ---------------------------------------------------------------- road works

interface Works { group: THREE.Group; box: { set(on: boolean): void }; x: number; z: number; }

/** Pavement road works: a patched hole under a plywood board, two striped posts with
 *  yellow-and-black tape and a small barrier. A pool of sites is built once; each run
 *  shows a couple of them (their colliders switch with them). */
export class RoadWorks {
  readonly group = new THREE.Group();
  private sites: Works[] = [];

  constructor(place: Placement, world: CollisionWorld, keepClear: (x: number, z: number) => boolean) {
    this.group.name = 'road works';
    const tapeTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16;
      const g = cv.getContext('2d')!;
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#141414' : '#f2c81a'; g.beginPath(); g.moveTo(i * 16, 16); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 16); g.fill(); }
      const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tapeMat = new THREE.MeshLambertMaterial({ map: tapeTex, side: THREE.DoubleSide });
    // Pavement spots close to a wall, so the works sit on the pavement, not in a junction.
    const candidates = place.spots.filter((s) => !s.green && (s.zone === 'street' || s.zone === 'lonyay') && place.buildings.blocked(s.x, s.z, 3.5));
    const step = Math.max(1, Math.floor(candidates.length / 14));
    for (let i = 0; i < candidates.length && this.sites.length < 14; i += step) {
      const s = candidates[(i + 7) % candidates.length];
      if (keepClear(s.x, s.z) || this.sites.some((w) => Math.hypot(w.x - s.x, w.z - s.z) < 60)) continue;
      const g = new THREE.Group();
      const parts: THREE.BufferGeometry[] = [];
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
        const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(colored(b, c));
      };
      box(2.0, 0.04, 1.5, 0, 0.05, 0, 0x2a2a2a);         // patched asphalt
      box(1.25, 0.03, 1.0, 0.1, 0.085, -0.05, 0xc8a46a);   // plywood board
      box(1.2, 0.006, 0.95, 0.12, 0.103, -0.04, 0xb8945a);
      for (const px of [-0.95, 0.95]) {
        box(0.07, 1.0, 0.07, px, 0.5, 0.7, 0xe8e8e8);
        for (let k = 0; k < 3; k++) box(0.075, 0.12, 0.075, px, 0.2 + k * 0.3, 0.7, 0xc8202c);
        box(0.3, 0.06, 0.3, px, 0.03, 0.7, 0x333333);
      }
      // A small red-white barrier on the far side.
      box(1.4, 0.18, 0.04, 0, 0.75, -0.75, 0xc8202c);
      box(0.05, 0.8, 0.05, -0.6, 0.4, -0.75, 0x9a9a9a);
      box(0.05, 0.8, 0.05, 0.6, 0.4, -0.75, 0x9a9a9a);
      const mesh = new THREE.Mesh(merge(parts), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.08), tapeMat);
      tape.position.set(0, 0.9, 0.7);
      (tape.material as THREE.MeshLambertMaterial).map!.repeat.set(8, 1);
      g.add(mesh, tape);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.dir;
      g.visible = false;
      this.group.add(g);
      const b = world.addToggleBox(s.x, s.z, 2.0, 1.6, s.dir);
      b.set(false);
      this.sites.push({ group: g, box: b, x: s.x, z: s.z });
    }
  }

  /** Shows 2–3 random sites for this run. */
  reset(rng: Rng) {
    const n = 2 + (rng.next() < 0.5 ? 1 : 0);
    const order = this.sites.map((s) => ({ s, k: rng.next() })).sort((p, q) => p.k - q.k);
    order.forEach(({ s }, i) => { s.group.visible = i < n; s.box.set(i < n); });
  }

  /** Active sites (for tests and the minimap). */
  get active() { return this.sites.filter((s) => s.group.visible).map((s) => [s.x, s.z] as Vec2); }
}
