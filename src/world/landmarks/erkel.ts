import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { colored, signTexture } from './common';
import { merge } from '../items/models';
import { streetFacades, type Facade } from './lonyay';
import { firewallTexture } from './raday';

// Erkel utca and Török Pál utca from Alex's photos (reference/erkel-torok-pal-utca/):
// yellow shared-lane bike symbols with double chevrons, ball-top bollards along the
// kerbs, the long grey neo-Renaissance palace, the old single-storey graffiti house with
// its little checked-tablecloth terrace, and an ochre block with an octagonal sign.

const STREETS = ['Erkel utca', 'Török Pál utca'];
type Box = { x: number; z: number; w: number; d: number; rot: number };

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const area = (ring: Vec2[]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

export interface ErkelPrep { palace: Facade | null; house: Facade | null; ochre: Facade | null; }

/** Picks the buildings before the city is built: the palace (grey-beige, palace facade),
 *  the old low house (dropped to one storey and hand-built) and the ochre block. */
export function prepareErkel(city: CityData, colors: Map<string, number>, taken: Set<Building>): ErkelPrep {
  const fronts = STREETS.flatMap((s) => streetFacades(city, s, 12)).filter((f) => !taken.has(f.b));
  const palace = fronts.filter((f) => f.b.h >= 14).sort((p, q) => q.len - p.len)[0] ?? null;
  const shopAt = (b: Building) => city.shops.some((s) => pointInPolygon(s.p[0], s.p[1], b.outer));
  const count = new Map<Building, number>();
  for (const f of fronts) count.set(f.b, (count.get(f.b) ?? 0) + 1);
  // The old house: a building OSM itself tags as low (single storey) wins, longest front
  // first (the real one wraps around the little park at the Ráday corner); else the
  // smallest single-front building.
  const house = fronts.filter((f) => f.b.h < 6 && f.len > 6).sort((p, q) => q.len - p.len)[0]
    ?? fronts
      .filter((f) => f.b !== palace?.b && f.len > 9 && f.len < 22 && count.get(f.b) === 1 && !f.b.holes?.length && area(f.b.outer) < 420 && !shopAt(f.b))
      .sort((p, q) => area(p.b.outer) - area(q.b.outer))[0] ?? null;
  if (palace) colors.set(palace.b.id, 0xb9b3a6);
  if (house) house.b.h = 4.4; // no gate, no courtyard: a single storey
  // The ochre block: across the street from the house.
  let ochre: Facade | null = null;
  if (house) {
    const hx = (house.a[0] + house.c[0]) / 2, hz = (house.a[1] + house.c[1]) / 2;
    ochre = fronts.filter((f) => f.b !== house.b && f.b !== palace?.b && f.nx * house.nx + f.nz * house.nz < -0.7)
      .sort((p, q) => Math.hypot((p.a[0] + p.c[0]) / 2 - hx, (p.a[1] + p.c[1]) / 2 - hz) - Math.hypot((q.a[0] + q.c[0]) / 2 - hx, (q.a[1] + q.c[1]) / 2 - hz))[0] ?? null;
    if (ochre) colors.set(ochre.b.id, 0xd2a24c);
  }
  return { palace, house, ochre };
}

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One 16 m stretch of the old house's wall, 3.4 m high: peeling yellow plaster with brick
 *  showing through, a grey plinth, white-framed windows, an arched door with a lantern, a
 *  drainpipe, and big colourful graffiti pieces from the pavement up to the windows. */
const houseWallTexture = () => tex(1024, 256, (g) => {
  const PX = 64, PY = 256 / 3.4; // px per metre
  const Y = (m: number) => 256 - m * PY; // metres above the ground → canvas y
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#d6b65c'; g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${150 + rnd() * 80},${120 + rnd() * 60},${60 + rnd() * 40},0.18)`;
    g.beginPath(); g.ellipse(rnd() * 1024, rnd() * 256, 10 + rnd() * 40, 6 + rnd() * 20, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // Peeling patches with brick behind.
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 1000, y = Y(0.6 + rnd() * 2.4), w = 30 + rnd() * 70, h = 14 + rnd() * 30;
    g.save(); g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.6) g.lineTo(x + Math.cos(a) * w * (0.6 + rnd() * 0.5), y + Math.sin(a) * h * (0.6 + rnd() * 0.5));
    g.closePath(); g.clip();
    g.fillStyle = '#8f5a42'; g.fillRect(x - w, y - h, w * 2, h * 2);
    g.fillStyle = '#c8b8a0';
    for (let yy = y - h; yy < y + h; yy += 7) g.fillRect(x - w, yy, w * 2, 1.5);
    g.restore();
  }
  // Plinth and the cornice band under the eaves.
  g.fillStyle = '#8c867a'; g.fillRect(0, Y(0.45), 1024, 0.45 * PY);
  g.fillStyle = '#ece2c4'; g.fillRect(0, 0, 1024, 0.18 * PY);
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0.18 * PY, 1024, 3);
  // Windows (white frames, small panes) and one arched door with a lantern.
  for (const xm of [1.8, 5.2, 12.2, 15.0]) {
    const x = xm * PX, w = 0.95 * PX, top = Y(2.55), h = 1.35 * PY;
    g.fillStyle = '#f0ece0'; g.fillRect(x - w / 2 - 6, top - 6, w + 12, h + 12);
    g.fillStyle = '#2c3640'; g.fillRect(x - w / 2, top, w, h);
    g.fillStyle = '#f0ece0'; g.fillRect(x - 2, top, 4, h); g.fillRect(x - w / 2, top + h * 0.4, w, 4);
    g.fillStyle = '#b8b0a0'; g.fillRect(x - w / 2 - 10, top + h + 6, w + 20, 6);
  }
  {
    const x = 8.6 * PX, w = 1.1 * PX, top = Y(2.4);
    g.fillStyle = '#e4dac0'; g.beginPath(); g.moveTo(x - w / 2 - 8, Y(0)); g.lineTo(x - w / 2 - 8, top); g.arc(x, top, w / 2 + 8, Math.PI, 0); g.lineTo(x + w / 2 + 8, Y(0)); g.fill();
    g.fillStyle = '#5a3a24'; g.beginPath(); g.moveTo(x - w / 2, Y(0)); g.lineTo(x - w / 2, top); g.arc(x, top, w / 2, Math.PI, 0); g.lineTo(x + w / 2, Y(0)); g.fill();
    g.fillStyle = '#3e2818'; for (let k = -2; k <= 2; k++) g.fillRect(x + k * (w / 5) - 1, top - 20, 2, Y(0) - top + 20);
    g.fillStyle = '#d8c070'; g.fillRect(x + w / 2 - 14, Y(1.1), 6, 6);
    g.fillStyle = '#1d1d1d'; g.fillRect(x + w / 2 + 18, Y(2.5), 12, 22); g.fillStyle = '#f2d890'; g.fillRect(x + w / 2 + 20, Y(2.42), 8, 12);
  }
  g.fillStyle = '#7a7a76'; g.fillRect(16.0 * PX - 18, 0, 7, 256);
  // Graffiti: big pieces low down, tags and throw-ups everywhere else (invented words).
  const piece = (word: string, xm: number, ym: number, size: number, fill: string, line: string, rot: number) => {
    g.save(); g.translate(xm * PX, Y(ym)); g.rotate(rot);
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = line; g.strokeText(word, 0, 0);
    g.fillStyle = fill; g.fillText(word, 0, 0);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.strokeText(word, -2, -2);
    g.restore();
  };
  piece('BUMM', 3.4, 1.0, 72, '#2a6ad8', '#f4f4f4', -0.05);
  piece('KÖD', 6.9, 0.9, 64, '#e8822a', '#1d1d1d', 0.06);
  piece('ZIZI', 10.8, 1.05, 70, '#c8c8d0', '#1d1d1d', -0.08);
  piece('ŰR', 13.7, 0.95, 60, '#d84a9a', '#f4f4f4', 0.1);
  piece('POFA', 1.0, 2.9, 30, '#9ad82a', '#1d1d1d', -0.1);
  piece('DÜH', 11.0, 2.75, 28, '#f4f4f4', '#c8202c', 0.05);
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 1000, y = Y(0.6 + rnd() * 2.2);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.quadraticCurveTo(x + k * 9 + rnd() * 10, y - 18 + rnd() * 30, x + k * 12 + 8, y + rnd() * 8 - 4);
    g.stroke();
  }
});

/** Brown clay roof tiles; one repeat = 2 m along, 2 m up the slope. */
const roofTileTexture = () => {
  const t = tex(128, 128, (g) => {
    g.fillStyle = '#6a3e26'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      const v = ((r * 7 + c * 5) % 6) * 6;
      g.fillStyle = `rgb(${128 + v},${74 + v / 2},${46 + v / 3})`;
      g.fillRect(c * 22 + (r % 2) * 11, r * 16, 20, 14);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(c * 22 + (r % 2) * 11, r * 16 + 12, 20, 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Offsets a closed ring inward (d > 0) or outward (d < 0) with mitred corners. */
function offsetRing(ring: Vec2[], d: number): Vec2[] {
  const n = ring.length;
  const normals = ring.map((a, i) => {
    const c = ring[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    let nx = -(c[1] - a[1]) / len, nz = (c[0] - a[0]) / len;
    if (!pointInPolygon((a[0] + c[0]) / 2 + nx * 0.05, (a[1] + c[1]) / 2 + nz * 0.05, ring)) { nx = -nx; nz = -nz; }
    return [nx, nz] as Vec2; // inward
  });
  return ring.map((p, i) => {
    const a = normals[(i - 1 + n) % n], b = normals[i];
    let mx = a[0] + b[0], mz = a[1] + b[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const k = Math.min(3, 1 / Math.max(0.33, mx * b[0] + mz * b[1]));
    return [p[0] + mx * d * k, p[1] + mz * d * k] as Vec2;
  });
}

/** Distance across the footprint from the middle of each long edge (its local width). */
function minWidth(ring: Vec2[]) {
  let best = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], c = ring[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 3) continue;
    let nx = -(c[1] - a[1]) / len, nz = (c[0] - a[0]) / len;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    if (!pointInPolygon(mx + nx * 0.05, mz + nz * 0.05, ring)) { nx = -nx; nz = -nz; }
    let d = 0.3;
    while (d < 40 && pointInPolygon(mx + nx * d, mz + nz * d, ring)) d += 0.2;
    best = Math.min(best, d);
  }
  return best;
}

export interface Erkel { group: THREE.Group; colliders: Box[]; skip: Set<string>; }

export function buildErkel(city: CityData, place: Placement, prep: ErkelPrep): Erkel {
  const group = new THREE.Group();
  group.name = 'erkel & török pál';
  const colliders: Box[] = [];
  const vertex = new THREE.MeshLambertMaterial({ vertexColors: true });
  const roads = city.roads.filter((r) => r.kind === 'road' && r.name && STREETS.includes(r.name));

  // ---- Shared-lane markings: a yellow bike with double chevrons, each direction.
  const bikeTex = tex(128, 384, (g) => {
    g.strokeStyle = '#e0b81e'; g.fillStyle = '#e0b81e'; g.lineWidth = 8;
    for (const [x, y] of [[64, 80], [64, 200]]) { g.beginPath(); g.arc(x, y, 32, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(64, 80); g.lineTo(64, 200); g.moveTo(64, 140); g.lineTo(30, 120); g.moveTo(64, 80); g.lineTo(40, 70); g.stroke();
    for (const y of [270, 320]) { g.beginPath(); g.moveTo(14, y + 34); g.lineTo(64, y); g.lineTo(114, y + 34); g.lineTo(114, y + 50); g.lineTo(64, y + 16); g.lineTo(14, y + 50); g.closePath(); g.fill(); }
  });
  bikeTex.colorSpace = THREE.NoColorSpace;
  const marks: THREE.Matrix4[] = [];
  const balls: THREE.Matrix4[] = [];
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 12) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 10; t < len - 8; t += 40) for (const dir of [1, -1]) {
        // Right-hand lane, chevrons pointing the way of travel.
        const off = 1.6 * dir;
        const x = ax + ux * (t + (dir < 0 ? 6 : 0)) - uz * off, z = az + uz * (t + (dir < 0 ? 6 : 0)) + ux * off;
        marks.push(new THREE.Matrix4().makeRotationY(Math.atan2(-ux * dir, -uz * dir)).setPosition(x, 0.064, z));
      }
      // Black ball-top bollards along both kerbs, in short rows.
      for (let t = 4; t < len - 4; t += 2.2) {
        if (Math.floor(t / 11) % 2) continue;
        for (const s of [-1, 1]) {
          const x = ax + ux * t - uz * (r.w / 2 + 0.35) * s, z = az + uz * t + ux * (r.w / 2 + 0.35) * s;
          if (!place.free(x, z, 0.4)) continue;
          balls.push(new THREE.Matrix4().makeTranslation(x, 0, z));
          colliders.push({ x, z, w: 0.2, d: 0.2, rot: 0 });
        }
      }
    }
  }
  const markMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 2.7).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: bikeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }), marks.length);
  marks.forEach((m, i) => markMesh.setMatrixAt(i, m));
  group.add(markMesh);
  const ballGeo = merge([
    colored(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 6, 1, true).translate(0, 0.375, 0), 0x1b1b1b),
    colored(new THREE.SphereGeometry(0.11, 6, 4).translate(0, 0.82, 0), 0x1b1b1b),
  ]);
  const ballMesh = new THREE.InstancedMesh(ballGeo, vertex, balls.length);
  balls.forEach((m, i) => ballMesh.setMatrixAt(i, m));
  group.add(ballMesh);

  const skip = new Set<string>();
  const parts: THREE.BufferGeometry[] = [];
  // ---- The palace: a granite plinth, heavy arches over the ground-floor windows, a
  // dark red service door and a deep dentil cornice.
  if (prep.palace) {
    const f = prep.palace;
    const m = facadeFrame(f);
    put(parts, new THREE.BoxGeometry(f.len, 0.7, 0.12).translate(0, 0.35, 0.06), 0x6a6862, m);
    for (let t = -f.len / 2 + 2.5; t < f.len / 2 - 2; t += 4.2) {
      put(parts, new THREE.TorusGeometry(1.0, 0.22, 4, 10, Math.PI).translate(t, 3.0, 0.1), 0xa29c8e, m);
      put(parts, new THREE.BoxGeometry(0.5, 0.6, 0.3).translate(t, 4.05, 0.12), 0xa29c8e, m);
    }
    put(parts, new THREE.BoxGeometry(1.4, 2.4, 0.06).translate(-f.len / 2 + 4.6, 1.2, 0.04), 0x6a1e1e, m);
    for (let t = -f.len / 2; t < f.len / 2; t += 0.5) put(parts, new THREE.BoxGeometry(0.22, 0.25, 0.35).translate(t, f.b.h - 1.0, 0.2), 0xa8a294, m);
    put(parts, new THREE.BoxGeometry(f.len, 0.3, 0.6).translate(0, f.b.h - 0.75, 0.3), 0xb0aa9c, m);
  }

  // ---- The old low house: hand-built over its footprint.
  if (prep.house) {
    const f = prep.house;
    const b = f.b;
    skip.add(b.id);
    const wallTex = houseWallTexture();
    wallTex.wrapS = THREE.RepeatWrapping;
    const H = 3.4;
    const ring = b.outer;
    const pos: number[] = [], uv: number[] = [];
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u1 = u + len / 16;
      pos.push(a[0], 0, a[1], c[0], 0, c[1], c[0], H, c[1], a[0], 0, a[1], c[0], H, c[1], a[0], H, a[1]);
      // Seen from outside, u must grow to the right or the pieces read mirrored.
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon((a[0] + c[0]) / 2 + nx * 0.3, (a[1] + c[1]) / 2 + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      const [ua, uc] = (c[0] - a[0]) * nz - (c[1] - a[1]) * nx > 0 ? [u, u1] : [u1, u];
      uv.push(ua, 0, uc, 0, uc, 1, ua, 0, uc, 1, ua, 1);
      u = u1;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wg.computeVertexNormals();
    const walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    // Steep tiled hip roof that follows the (long, L-shaped) footprint: each wall throws a
    // slope up to a ridge inset half the narrowest width; wider parts get a short flat top.
    const half = minWidth(ring) / 2 * 0.97;
    const rise = half * 0.95;
    const eave = offsetRing(ring, -0.45), ridge = offsetRing(ring, half);
    const rp: number[] = [], ruv: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const e0 = eave[i], e1 = eave[j], r0 = ridge[i], r1 = ridge[j];
      const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
      const slope = Math.hypot(half + 0.45, rise + 0.1);
      rp.push(e0[0], H - 0.1, e0[1], e1[0], H - 0.1, e1[1], r1[0], H + rise, r1[1], e0[0], H - 0.1, e0[1], r1[0], H + rise, r1[1], r0[0], H + rise, r0[1]);
      ruv.push(0, 0, len / 2, 0, len / 2, slope / 2, 0, 0, len / 2, slope / 2, 0, slope / 2);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    rg.computeVertexNormals();
    const roofMat = new THREE.MeshLambertMaterial({ map: roofTileTexture(), side: THREE.DoubleSide });
    const roof = new THREE.Mesh(rg, roofMat);
    roof.castShadow = true;
    group.add(roof);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(ridge.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, H + rise, 0), roofMat);
    group.add(top);
    // Gutter along the eaves and two brick chimneys on the ridge.
    for (let i = 0; i < eave.length; i++) {
      const e0 = eave[i], e1 = eave[(i + 1) % eave.length];
      const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
      parts.push(colored(new THREE.BoxGeometry(0.1, 0.1, len).rotateY(Math.atan2(e1[0] - e0[0], e1[1] - e0[1])).translate((e0[0] + e1[0]) / 2, H - 0.15, (e0[1] + e1[1]) / 2), 0x5a5a56));
    }
    for (const k of [0.2, 0.6]) {
      const r = ridge[Math.floor(k * ridge.length)];
      parts.push(colored(new THREE.BoxGeometry(0.55, rise + 1.2, 0.55).translate(r[0], H + (rise + 1.2) / 2, r[1]), 0x9a5038));
      parts.push(colored(new THREE.BoxGeometry(0.7, 0.12, 0.7).translate(r[0], H + rise + 1.25, r[1]), 0x7a3e2c));
    }
    const m = facadeFrame(f);
    // Firewalls of the taller neighbours rising behind it.
    const fw = firewallTexture();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 2) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; } // outward
      const nb = place.buildings.near(mx, mz).find((q) => q !== b && pointInPolygon(mx + nx * 0.5, mz + nz * 0.5, q.outer));
      if (!nb || nb.h <= H + 1) continue;
      const t2 = fw.clone(); t2.needsUpdate = true; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(len / 6, (nb.h - H) / 6);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, nb.h - H), new THREE.MeshLambertMaterial({ map: t2 }));
      wall.position.set(mx - nx * 0.05, H + (nb.h - H) / 2, mz - nz * 0.05);
      wall.rotation.y = Math.atan2(-nx, -nz);
      group.add(wall);
    }
    // The terrace: green grass mat, tables with red-and-white checked cloths, black
    // bistro chairs, a closed parasol.
    const check = tex(64, 64, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4f4f0' : '#c8202c'; g.fillRect(i * 8, j * 8, 8, 8); } });
    const cloth = new THREE.MeshLambertMaterial({ map: check });
    const depth = 2.2;
    put(parts, new THREE.BoxGeometry(f.len * 0.7, 0.03, depth).translate(0, 0.075, depth / 2 + 0.3), 0x4f9a3a, m);
    for (const t of [-0.22, 0.22]) {
      const tm = m.clone().multiply(new THREE.Matrix4().makeTranslation(t * f.len, 0, 1.4));
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.8).translate(0, 0.76, 0), cloth);
      top.applyMatrix4(tm);
      group.add(top);
      put(parts, new THREE.BoxGeometry(0.82, 0.18, 0.82).translate(0, 0.66, 0), 0xe8e4dc, tm);
      put(parts, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6).translate(0, 0.35, 0), 0x1d1d1d, tm);
      for (const s of [-1, 1]) {
        put(parts, new THREE.BoxGeometry(0.4, 0.04, 0.4).translate(s * 0.62, 0.45, 0), 0x1d1d1d, tm);
        put(parts, new THREE.BoxGeometry(0.04, 0.42, 0.4).translate(s * 0.82, 0.66, 0), 0x1d1d1d, tm);
        for (const lz of [-0.17, 0.17]) put(parts, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4).translate(s * 0.62, 0.22, lz), 0x1d1d1d, tm);
      }
      const p = new THREE.Vector3().setFromMatrixPosition(tm);
      colliders.push({ x: p.x, z: p.z, w: 1.6, d: 0.8, rot: Math.atan2(f.nx, f.nz) });
    }
    const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.4));
    put(parts, new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6).translate(0, 1.3, 0), 0x6a5a48, pm);
    put(parts, new THREE.ConeGeometry(0.16, 1.4, 8).rotateX(Math.PI).translate(0, 2.0, 0), 0xe8e0cc, pm);
  }

  // ---- The ochre block: arched ground floor and an octagonal restaurant sign.
  if (prep.ochre) {
    const f = prep.ochre;
    const m = facadeFrame(f);
    for (let t = -f.len / 2 + 2; t < f.len / 2 - 1.5; t += 3.6) put(parts, new THREE.TorusGeometry(1.1, 0.16, 4, 10, Math.PI).translate(t, 2.6, 0.08), 0xc0903e, m);
    const signTex = tex(256, 256, (g) => {
      g.fillStyle = '#1f3a2c'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); }
      g.closePath(); g.fill();
      g.strokeStyle = '#e8c86a'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#e8c86a'; g.textAlign = 'center'; g.font = 'bold 40px Georgia, serif';
      g.fillText('PÖRKÖLT', 128, 118); g.font = '30px Georgia, serif'; g.fillText('bisztró', 128, 162);
    });
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8), new THREE.MeshLambertMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }));
    const holder = new THREE.Group();
    holder.add(sign);
    sign.position.set(0, 3.6, 0.85);
    sign.rotation.set(0, Math.PI / 2, Math.PI / 8);
    put(parts, new THREE.BoxGeometry(0.05, 0.05, 1.0).translate(0, 4.25, 0.5), 0x1d1d1d, m);
    holder.applyMatrix4(m);
    group.add(holder);
  }

  // ---- A blue-grey shopfront for rent ("KIADÓ") on the palace's street.
  {
    const f = STREETS.flatMap((s) => streetFacades(city, s, 12))
      .filter((q) => q.b !== prep.palace?.b && q.b !== prep.house?.b && q.b !== prep.ochre?.b && q.len > 8)
      .sort((p, q) => hash(p.b.id) - hash(q.b.id))[0];
    if (f) {
      const m = facadeFrame(f);
      put(parts, new THREE.BoxGeometry(4.2, 3.2, 0.08).translate(0, 1.6, 0.04), 0x6a7a88, m);
      for (const t of [-1.1, 1.1]) put(parts, new THREE.BoxGeometry(1.6, 2.2, 0.06).translate(t, 1.5, 0.09), 0x3a2a1e, m);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshLambertMaterial({ map: signTexture('KIADÓ', '#f2c418', '#c8202c', 512, 128, 'bold 90px system-ui, sans-serif') }));
      banner.position.set(0, 2.9, 0.14);
      const bh = new THREE.Group(); bh.add(banner); bh.applyMatrix4(m);
      group.add(bh);
    }
  }

  if (parts.length) {
    const mesh = new THREE.Mesh(merge(parts), vertex);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, colliders, skip };
}

/** Local frame on a facade: origin at its midpoint, +x along it, +z out to the street. */
function facadeFrame(f: Facade) {
  return new THREE.Matrix4().makeRotationY(Math.atan2(f.nx, f.nz)).setPosition((f.a[0] + f.c[0]) / 2, 0, (f.a[1] + f.c[1]) / 2);
}

function put(parts: THREE.BufferGeometry[], g: THREE.BufferGeometry, c: number, m: THREE.Matrix4) {
  colored(g, c);
  g.applyMatrix4(m);
  parts.push(g);
}
