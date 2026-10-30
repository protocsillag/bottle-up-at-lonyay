import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { colored, obb } from './common';
import { merge } from '../items/models';

// Bálna on the Pest riverbank by Fővám tér (Alex: "a glass whale"): two old yellow-brick
// warehouse wings with a curving glass-and-steel whale arching over and between them,
// bulging towards the Danube. In front, the riverside promenade gets a row of pubs:
// little bar pavilions, beer tables, parasols and festoon lights, busy in the evening.

type Box = { x: number; z: number; w: number; d: number; rot: number };
const NAME = /Bálna/;

export interface BalnaPrep {
  /** Oriented frame of the old footprint: centre, long axis, half length / width. */
  cx: number; cz: number; ux: number; uz: number; hl: number; hw: number;
  /** +1 if the river is on the +v side (v = (-uz, ux)), else −1. */
  river: 1 | -1;
  glassId: string;
}

const rect = (p: BalnaPrep, t0: number, t1: number, w: number): Vec2[] => {
  const vx = -p.uz, vz = p.ux;
  return [[t0, -w], [t1, -w], [t1, w], [t0, w]].map(([t, v]) => [p.cx + p.ux * t + vx * v, p.cz + p.uz * t + vz * v] as Vec2);
};

/** Replaces the Bálna block with two brick wings and a glass middle (collision only; the
 *  glass is hand-built). Run before the city is built; returns null if it is not there. */
export function prepareBalna(city: CityData, brick: Set<string>, colors: Map<string, number>): BalnaPrep | null {
  const i = city.buildings.findIndex((b) => b.name && NAME.test(b.name));
  if (i < 0) return null;
  const b = city.buildings[i];
  const o = obb(b.outer);
  const water = city.areas.filter((a) => a.kind === 'water').map((a) => a.outer);
  const probe = (s: number) => water.some((w) => pointInPolygon(o.cx - o.uz * s * (o.hw + 25), o.cz + o.ux * s * (o.hw + 25), w));
  const p: BalnaPrep = { cx: o.cx, cz: o.cz, ux: o.ux, uz: o.uz, hl: o.hl, hw: o.hw, river: probe(1) ? 1 : -1, glassId: `${b.id}-glass` };
  const W = o.hw * 0.92, L = o.hl;
  const parts: Building[] = [
    { id: `${b.id}-nw`, h: 14.5, outer: rect(p, -L, -L + 0.3 * 2 * L, W), name: 'Bálna raktár' },
    { id: `${b.id}-se`, h: 14.5, outer: rect(p, L - 0.28 * 2 * L, L * 0.95, W * 0.9), name: 'Bálna raktár' },
    { id: p.glassId, h: 12, outer: rect(p, -L + 0.3 * 2 * L, L - 0.28 * 2 * L, W), name: 'Bálna' },
  ];
  city.buildings.splice(i, 1, ...parts);
  for (const w of parts.slice(0, 2)) { brick.add(w.id); colors.set(w.id, 0xc89a58); }
  return p;
}

export interface Balna {
  group: THREE.Group;
  colliders: Box[];
  /** Where evening drinkers gather (in front of the pubs). */
  barSpots: Vec2[];
  update(lamps: number): void;
}

export function buildBalna(city: CityData, place: Placement, p: BalnaPrep): Balna {
  const group = new THREE.Group();
  group.name = 'bálna';
  const colliders: Box[] = [];
  const barSpots: Vec2[] = [];
  const vx = -p.uz * p.river, vz = p.ux * p.river; // towards the river
  const at = (t: number, v: number, y = 0) => new THREE.Vector3(p.cx + p.ux * t + vx * v, y, p.cz + p.uz * t + vz * v);

  // ---- The glass whale: a lofted shell along the long axis, rising in the middle and
  // bulging out over the river side, with a steel grid on it.
  const L = p.hl, W = p.hw * 0.95;
  const t0 = -L + 0.22 * 2 * L, t1 = L - 0.2 * 2 * L;
  const NU = 40, NV = 24;
  const pos: number[] = [], idx: number[] = [], lines: number[] = [];
  const point = (i: number, j: number) => {
    const s = i / NU, a = j / NV; // along, around (0 = land side foot, 1 = river side foot)
    const t = t0 + (t1 - t0) * s;
    const hump = Math.pow(Math.sin(Math.PI * s), 0.7);
    const H = 9 + 12 * hump;
    const bulge = 4.5 * hump * Math.pow(Math.sin(Math.PI * a), 2) * a; // only the river side swells
    const v = -W + 2 * W * a + bulge;
    const y = H * Math.pow(Math.sin(Math.PI * a), 0.55) * (0.75 + 0.25 * (1 - a));
    return at(t, v, Math.max(0, y));
  };
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const q = point(i, j); pos.push(q.x, q.y, q.z); }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Steel: every 4th line along and around, plus diagonals for the diagrid look.
  const P = (i: number, j: number) => { const k = (i * (NV + 1) + j) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
  for (let i = 0; i <= NU; i += 2) for (let j = 0; j < NV; j++) lines.push(...P(i, j), ...P(i, j + 1));
  for (let j = 0; j <= NV; j += 3) for (let i = 0; i < NU; i++) lines.push(...P(i, j), ...P(i + 1, j));
  for (let i = 0; i < NU; i += 2) for (let j = 0; j < NV; j += 3) { lines.push(...P(i, j), ...P(i + 2, Math.min(NV, j + 3))); }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x8cc4d0, emissive: 0x1a3a44, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
  const glass = new THREE.Mesh(shell, glassMat);
  glass.renderOrder = 2;
  group.add(glass);
  const steelGeo = new THREE.BufferGeometry();
  steelGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  group.add(new THREE.LineSegments(steelGeo, new THREE.LineBasicMaterial({ color: 0x3a4248 })));
  // Inside the glass: a shop row with warm fronts, so it reads at night.
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, t: number, v: number, y: number, c: number) => {
    const g = colored(new THREE.BoxGeometry(w, h, d).translate(0, 0, 0), c);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(p.ux, p.uz)).setPosition(at(t, v, y)));
    parts.push(g);
  };
  box(0.3, 3, t1 - t0 - 4, (t0 + t1) / 2, -W + 1.5, 1.5, 0x8a6a4a);
  const shopMat = new THREE.MeshLambertMaterial({ color: 0x3a3020, emissive: 0xffc070, emissiveIntensity: 0.15 });
  const fronts = new THREE.Mesh(new THREE.PlaneGeometry(t1 - t0 - 6, 3.6), shopMat);
  fronts.position.copy(at((t0 + t1) / 2, -W + 1.7, 1.9));
  fronts.rotation.y = Math.atan2(vx, vz);
  group.add(fronts);
  // The wings' roofs: low pitched grey zinc.
  for (const [a, b, w] of [[-L, -L + 0.6 * L, W * 0.97], [L - 0.56 * L, L * 0.95, W * 0.87]] as const) {
    const g = colored(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), 0x6a6e72);
    g.scale((b - a) / 2 * Math.SQRT2, 3, w * Math.SQRT2);
    g.rotateY(-Math.atan2(p.uz, p.ux));
    const c = at((a + b) / 2, 0, 14.5 + 1.5);
    g.translate(c.x, c.y, c.z);
    parts.push(g);
  }
  const shellParts = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  shellParts.castShadow = true;
  group.add(shellParts);
  // A big name sign on the river side.
  const signTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, 512, 128); g.fillStyle = '#f4f4f0'; g.font = 'bold 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BÁLNA', 256, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  sign.position.copy(at(-L + 0.3 * L, W * 0.92 + 0.15, 12));
  sign.rotation.y = Math.atan2(vx, vz);
  group.add(sign);

  // ---- The pubs on the promenade between the building and the water.
  const PUBS = [
    { name: 'KIKÖTŐ', color: 0x2a5a8a, awning: 0xf2f1ec },
    { name: 'SÖRKERT', color: 0x2f6a3a, awning: 0x2f6a3a },
    { name: 'HAJÓ PUB', color: 0x6a2a24, awning: 0xe8dcc0 },
    { name: 'DUNAPART', color: 0x3a3a3a, awning: 0xc8202c },
    { name: 'PARTI BÁR', color: 0x8a5a2a, awning: 0x1d1d1d },
  ];
  const prom = city.roads.filter((r) => r.kind === 'foot' && r.pts.some(([x, z]) => Math.hypot(x - p.cx, z - p.cz) < 160));
  // Candidate points every 4 m on the promenade paths, then pubs spread out along them.
  const cands: { x: number; z: number; dx: number; dz: number }[] = [];
  for (const r of prom) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 2; s < len - 2; s += 4) {
      const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len;
      // Only along the stretch by Bálna, inside the playable area.
      if (Math.hypot(x - p.cx, z - p.cz) > 170 || !pointInPolygon(x, z, city.boundary)) continue;
      cands.push({ x, z, dx: (bx - ax) / len, dz: (bz - az) / len });
    }
  }
  const stall = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bulbParts: THREE.BufferGeometry[] = [];
  const pubParts: THREE.BufferGeometry[] = [];
  const placed: Vec2[] = [];
  // Nearest to Bálna first; a pub stands on the land side of the path, or on the river
  // side where the land side is too tight (facing the water either way works).
  const water = city.areas.filter((a) => a.kind === 'water').map((a) => a.outer);
  const wet = (x: number, z: number) => water.some((w) => pointInPolygon(x, z, w));
  const inside = (x: number, z: number) => { const t = (x - p.cx) * p.ux + (z - p.cz) * p.uz, v = (x - p.cx) * vx + (z - p.cz) * vz; return Math.abs(t) < p.hl + 2 && v < p.hw + 0.8 && v > -p.hw - 2; }; // the glass foot stands on the wall line
  cands.sort((a, b) => Math.hypot(a.x - p.cx, a.z - p.cz) - Math.hypot(b.x - p.cx, b.z - p.cz));
  for (const c of cands) {
    if (placed.length >= PUBS.length) break;
    let nx = -c.dz, nz = c.dx;
    if (wet(c.x + nx * 12, c.z + nz * 12)) { nx = -nx; nz = -nz; } // n points inland
    // The pavilion sits 2.4 m behind the spot (away from the path), the terrace in front.
    const ok = (x: number, z: number, bx: number, bz: number) => place.free(x, z, 2.2) && place.free(x + bx * 2.6, z + bz * 2.6, 1.8)
      && !wet(x, z) && !wet(x + bx * 4, z + bz * 4) && !inside(x + bx * 2.6, z + bz * 2.6);
    let x = c.x + nx * 6.5, z = c.z + nz * 6.5;
    if (!ok(x, z, nx, nz)) {
      // River side, back to the water; on the narrow quay the terrace spills onto the path.
      let found = false;
      for (const d of [5, 3.5]) {
        const qx = c.x - nx * d, qz = c.z - nz * d;
        if (place.free(qx, qz, 1.6) && !wet(qx, qz) && !wet(qx - nx * 3.2, qz - nz * 3.2) && !inside(qx, qz)) { x = qx; z = qz; found = true; break; }
      }
      if (!found) continue;
      nx = -nx; nz = -nz;
    }
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 26)) continue;
    const pub = PUBS[placed.length];
    placed.push([x, z]);
    const rot = Math.atan2(-nx, -nz); // local +z faces the path
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
    const put = (g: THREE.BufferGeometry, col: number, mm = m) => { colored(g, col); g.applyMatrix4(mm); pubParts.push(g); };
    // Bar pavilion with a counter hatch and a roof overhang.
    put(new THREE.BoxGeometry(4.2, 2.7, 2.6).translate(0, 1.35, -2.4), pub.color);
    put(new THREE.BoxGeometry(4.6, 0.15, 3.4).translate(0, 2.8, -2.2), 0x2a2a2a);
    put(new THREE.BoxGeometry(3.2, 1.0, 0.1).translate(0, 1.6, -1.08), 0x1a1612);
    put(new THREE.BoxGeometry(3.4, 0.08, 0.5).translate(0, 1.08, -0.9), 0xb88a5a);
    for (let k = 0; k < 6; k++) put(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6).translate(-1.3 + k * 0.5, 1.24, -0.95), k % 2 ? 0x3d6b2a : 0x8a5a2a);
    colliders.push({ x: x - nx * 2.4, z: z - nz * 2.4, w: 4.2, d: 2.6, rot });
    // Name board on the roof.
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g2 = cv.getContext('2d')!;
    g2.fillStyle = '#' + pub.color.toString(16).padStart(6, '0'); g2.fillRect(0, 0, 512, 96);
    g2.fillStyle = '#f8f0d8'; g2.font = 'bold 64px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(pub.name, 256, 50);
    const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.7), new THREE.MeshLambertMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.2 }));
    board.position.copy(new THREE.Vector3(0, 3.25, -1.05).applyMatrix4(m));
    board.rotation.y = rot;
    group.add(board);
    // Terrace: beer tables (light wood, green legs) and two parasols, on a deck.
    put(new THREE.BoxGeometry(7, 0.06, 4).translate(0, 0.03, 1.4), 0x7a5a3a);
    for (const tx of [-2.2, 0, 2.2]) {
      const tm = m.clone().multiply(new THREE.Matrix4().makeTranslation(tx, 0, 1.6).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
      put(new THREE.BoxGeometry(1.8, 0.04, 0.5).translate(0, 0.76, 0), 0xd8b884, tm);
      for (const lx of [-0.7, 0.7]) put(new THREE.BoxGeometry(0.04, 0.74, 0.45).translate(lx, 0.37, 0), 0x2f6a3a, tm);
      for (const bz of [-0.55, 0.55]) put(new THREE.BoxGeometry(1.8, 0.04, 0.25).translate(0, 0.46, bz), 0xd8b884, tm);
      const q = new THREE.Vector3(tx, 0, 1.6).applyMatrix4(m);
      colliders.push({ x: q.x, z: q.z, w: 1.4, d: 1.9, rot });
      barSpots.push([q.x + nx * 1.6, q.z + nz * 1.6]);
    }
    for (const px of [-1.1, 1.1]) {
      put(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6).translate(px, 1.25, 1.6), 0x6a6a6a);
      put(new THREE.ConeGeometry(1.5, 0.6, 8).translate(px, 2.6, 1.6), pub.awning);
    }
    // Festoon lights from the roof to two posts at the path edge.
    for (const ex of [-3.4, 3.4]) {
      put(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 6).translate(ex, 1.45, 3.4), 0x2a2a2a);
      for (let k = 0; k <= 6; k++) {
        const f = k / 6;
        const v = new THREE.Vector3(ex * 0.6 * (1 - f) + ex * f, 2.85 - Math.sin(Math.PI * f) * 0.35, -1.0 + 4.4 * f).applyMatrix4(m);
        bulbParts.push(new THREE.SphereGeometry(0.06, 6, 4).translate(v.x, v.y, v.z));
      }
    }
  }
  if (pubParts.length) {
    const mesh = new THREE.Mesh(merge(pubParts), stall);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a7a5a });
  if (bulbParts.length) group.add(new THREE.Mesh(merge(bulbParts), bulbMat));

  return {
    group, colliders, barSpots,
    update(lamps: number) {
      glassMat.emissiveIntensity = 0.4 + lamps * 1.2;
      shopMat.emissiveIntensity = 0.15 + lamps * 0.9;
      bulbMat.color.setHex(lamps > 0.2 ? 0xffd890 : 0x8a7a5a);
    },
  };
}
