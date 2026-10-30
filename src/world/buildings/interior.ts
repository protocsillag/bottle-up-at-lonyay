import * as THREE from 'three';
import type { Building, Vec2 } from '../cityData';
import { CollisionWorld } from '../collision';
import { merge } from '../items/models';

// The reusable Pest courtyard: gateway passage with mailboxes, an open courtyard with
// the bin corner, a staircase door and open corridors (gang) on every upper floor.
// Built on entry, scaled to the building's footprint, at a far-away origin with its
// own collision world.

export const INTERIOR_ORIGIN: Vec2 = [6000, 6000];
export const PASSAGE_W = 3.2;
export const PASSAGE_L = 7;
const STOREY = 3.6;

export interface InteriorLayout {
  W: number; D: number; H: number; floors: number;
  /** World positions. */
  bins: Vec2[];
  jackpot: Vec2;
  bag: Vec2;
  spawn: Vec2;
  /** Player z (world) above which they are back at the gate. */
  exitZ: number;
  patrol: Vec2[];
}

export interface Interior {
  group: THREE.Group;
  world: CollisionWorld;
  layout: InteriorLayout;
}

function area(ring: Vec2[]) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const PLASTER = [0xd8cdb4, 0xcbbd9c, 0xe0d6c2, 0xc9b49a, 0xd6c3a5, 0xbfb6a5];

export function interiorLayout(b: Building): InteriorLayout {
  const hole = b.holes?.length ? b.holes.reduce((a, h) => (area(h) > area(a) ? h : a)) : null;
  const A = hole ? area(hole) : area(b.outer) * 0.18;
  const r = 0.75 + hash(b.id + 'r') * 0.6;
  const W = THREE.MathUtils.clamp(Math.sqrt(A * r), 9, 30);
  const D = THREE.MathUtils.clamp(A / W, 9, 28);
  const floors = THREE.MathUtils.clamp(Math.round((b.h - 1.2) / STOREY), 2, 7);
  const [ox, oz] = INTERIOR_ORIGIN;
  const L = PASSAGE_L;
  const w = (x: number, z: number): Vec2 => [ox + x, oz + z];
  const inset = 2.4;
  return {
    W, D, H: floors * STOREY + 1.2, floors,
    bins: [w(W / 2 - 1.1, -L - D + 1.0), w(W / 2 - 2.6, -L - D + 1.0), w(W / 2 - 1.1, -L - D + 2.6)],
    jackpot: w(-W / 2 + 2.2, -L - D / 2),
    bag: w(-W / 2 + 3.4, -L - D + 1.0),
    spawn: w(0, -1.2),
    exitZ: oz - 0.5,
    patrol: [w(-W / 2 + inset, -L - inset), w(-W / 2 + inset, -L - D + inset), w(W / 2 - inset - 2.5, -L - D + inset + 2.2), w(W / 2 - inset, -L - inset)],
  };
}

type Part = THREE.BufferGeometry;
function bx(parts: Part[], w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  parts.push(g);
}

export type CourtBinKind = 'recycling' | 'mixed' | 'paper';
export const COURT_BIN_COLORS: Record<CourtBinKind, [number, number]> = {
  recycling: [0x1f2f5a, 0xf2c418], // dark blue, yellow lid
  mixed: [0x2f5a3a, 0x2f5a3a], // green
  paper: [0x1f2f5a, 0x2f63b8], // dark blue, blue lid
};

/** Wheelie container (1100 l), coloured by what goes in it. */
export function containerMesh(kind: CourtBinKind) {
  const [body, lid] = COURT_BIN_COLORS[kind];
  const parts: Part[] = [];
  bx(parts, 1.3, 1.1, 1.0, 0, 0.65, 0, body);
  bx(parts, 1.36, 0.1, 1.06, 0, 1.25, 0, lid);
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.35, 0.35]) bx(parts, 0.12, 0.14, 0.12, sx, 0.07, sz, 0x1b1b1b);
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  return m;
}

/** Jackpot: a renovation skip full of cans, or a party flat's recycling heap. */
export function jackpotMesh(kind: 'skip' | 'party') {
  const parts: Part[] = [];
  if (kind === 'skip') {
    bx(parts, 1.6, 1.1, 3.4, 0, 0.6, 0, 0xd8742a);
    bx(parts, 1.4, 0.1, 3.2, 0, 1.12, 0, 0x6e6e6e);
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39996;
      bx(parts, 0.11, 0.24, 0.11, Math.cos(a) * 0.5 * ((i % 5) / 5), 1.25 + (i % 3) * 0.08, Math.sin(a) * 1.4 * ((i % 7) / 7), i % 3 ? 0xc23b32 : 0x8fd0e8);
    }
    bx(parts, 0.5, 0.06, 1.2, 0.2, 1.3, -0.6, 0xb8a27a); // a plank
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7;
      bx(parts, 0.6, 0.7, 0.55, Math.cos(a) * 0.7, 0.35 + (i > 4 ? 0.6 : 0), Math.sin(a) * 0.6, 0x2f63b8);
    }
    bx(parts, 0.4, 0.3, 0.3, 0.9, 0.15, 0.6, 0x2b6e3c);
    bx(parts, 0.4, 0.3, 0.3, 0.9, 0.45, 0.6, 0x2b6e3c);
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  return m;
}

export function buildInterior(b: Building, layout: InteriorLayout): Interior {
  const { W, D, H, floors } = layout;
  const L = PASSAGE_L, PW = PASSAGE_W;
  const plaster = PLASTER[Math.floor(hash(b.id) * PLASTER.length)];
  const dark = 0x2a2724;
  const parts: Part[] = [];

  // Passage: floor, ceiling, walls with a darker dado, mailboxes, the closed gate behind you.
  bx(parts, PW, 0.1, L, 0, -0.05, -L / 2, 0x8d877c);
  bx(parts, PW + 0.6, 0.3, L, 0, 4.35, -L / 2, 0xe6dfcf);
  for (const sx of [-1, 1]) {
    bx(parts, 0.3, 4.2, L, sx * (PW / 2 + 0.15), 2.1, -L / 2, plaster);
    bx(parts, 0.04, 1.2, L, sx * (PW / 2 - 0.01), 0.6, -L / 2, 0x9a8a6c);
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) bx(parts, 0.12, 0.2, 0.3, -PW / 2 + 0.06, 1.2 + r * 0.24, -2 - c * 0.34, 0x3d5a45);
  bx(parts, PW + 0.4, 4.2, 0.2, 0, 2.1, 0.25, 0x5a3a22);
  bx(parts, 0.06, 4.2, 0.22, 0, 2.1, 0.12, 0x3a2614);

  // Courtyard floor.
  bx(parts, W, 0.1, D, 0, -0.05, -L - D / 2, 0x9c968c);
  bx(parts, 0.5, 0.02, 0.5, 0, 0.01, -L - D / 2, 0x4a4a4a); // drain

  // Courtyard walls: front (with the passage opening), back, left, right.
  const z0 = -L, z1 = -L - D;
  bx(parts, (W - PW) / 2, H, 0.3, -(W + PW) / 4, H / 2, z0 + 0.15, plaster);
  bx(parts, (W - PW) / 2, H, 0.3, (W + PW) / 4, H / 2, z0 + 0.15, plaster);
  bx(parts, PW, H - 4.2, 0.3, 0, 4.2 + (H - 4.2) / 2, z0 + 0.15, plaster);
  bx(parts, W, H, 0.3, 0, H / 2, z1 - 0.15, plaster);
  bx(parts, 0.3, H, D, -W / 2 - 0.15, H / 2, -L - D / 2, plaster);
  bx(parts, 0.3, H, D, W / 2 + 0.15, H / 2, -L - D / 2, plaster);
  // Roof ledge.
  bx(parts, W + 1, 0.3, 0.8, 0, H, z0 - 0.1, 0x7a6f62);
  bx(parts, W + 1, 0.3, 0.8, 0, H, z1 + 0.1, 0x7a6f62);
  bx(parts, 0.8, 0.3, D, -W / 2 + 0.1, H, -L - D / 2, 0x7a6f62);
  bx(parts, 0.8, 0.3, D, W / 2 - 0.1, H, -L - D / 2, 0x7a6f62);

  // Windows and flat doors on every floor; gang on the three inner sides above the ground floor.
  const winRow = (len: number, place: (t: number, y: number, door: boolean) => void, floor: number) => {
    const n = Math.max(1, Math.floor(len / 2.8));
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n);
      place(t, floor * STOREY, floor > 0 && i % 3 === 1);
    }
  };
  for (let f = 0; f < floors; f++) {
    // Back wall.
    winRow(W - 2, (t, y, door) => {
      if (f === 0 && t < -W / 2 + 4) return; // stair door goes here
      bx(parts, door ? 1.0 : 1.1, door ? 2.3 : 1.5, 0.08, t, y + (door ? 1.15 : 1.6), z1 + 0.02, door ? 0x5a3a22 : dark);
    }, f);
    // Side walls.
    for (const sx of [-1, 1]) {
      winRow(D - 2, (t, y, door) => {
        bx(parts, 0.08, door ? 2.3 : 1.5, door ? 1.0 : 1.1, sx * (W / 2 - 0.02), y + (door ? 1.15 : 1.6), -L - D / 2 + t, door ? 0x5a3a22 : dark);
      }, f);
    }
    // Front wall (above the passage only on upper floors).
    if (f > 0) winRow(W - 2, (t, y) => {
      if (Math.abs(t) < PW / 2 + 0.4) return;
      bx(parts, 1.1, 1.5, 0.08, t, y + 1.6, z0 - 0.02, dark);
    }, f);
    if (f === 0) continue;
    // Gang: slab with a rail along the back and both sides.
    const y = f * STOREY;
    const g = 1.3;
    bx(parts, W, 0.18, g, 0, y, z1 + g / 2, 0xb8b0a0);
    bx(parts, g, 0.18, D - 2 * g, -W / 2 + g / 2, y, -L - D / 2, 0xb8b0a0);
    bx(parts, g, 0.18, D - 2 * g, W / 2 - g / 2, y, -L - D / 2, 0xb8b0a0);
    bx(parts, W - 2 * g, 0.05, 0.05, 0, y + 1.0, z1 + g, 0x2b2b2b);
    bx(parts, 0.05, 0.05, D - 2 * g, -W / 2 + g, y + 1.0, -L - D / 2, 0x2b2b2b);
    bx(parts, 0.05, 0.05, D - 2 * g, W / 2 - g, y + 1.0, -L - D / 2, 0x2b2b2b);
    for (let t = -W / 2 + g; t <= W / 2 - g; t += 1.2) bx(parts, 0.03, 1.0, 0.03, t, y + 0.5, z1 + g, 0x2b2b2b);
    for (const sx of [-1, 1]) for (let t = -D / 2 + g; t <= D / 2 - g; t += 1.2) bx(parts, 0.03, 1.0, 0.03, sx * (W / 2 - g), y + 0.5, -L - D / 2 + t, 0x2b2b2b);
  }
  // Staircase door at the back-left: a dark opening with a few visible steps.
  bx(parts, 1.6, 2.6, 0.1, -W / 2 + 2, 1.3, z1 + 0.03, 0x161412);
  for (let s = 0; s < 4; s++) bx(parts, 1.4, 0.16, 0.3, -W / 2 + 2, 0.08 + s * 0.16, z1 + 0.25 - s * 0.05, 0x8d877c);
  // A couple of plant pots and a bike stand for life.
  bx(parts, 0.5, 0.45, 0.5, W / 2 - 1, 0.22, z0 - 1, 0x9a5a3a);
  bx(parts, 0.6, 0.6, 0.6, W / 2 - 1, 0.75, z0 - 1, 0x55803e);
  bx(parts, 0.5, 0.45, 0.5, -W / 2 + 1, 0.22, z0 - 1, 0x9a5a3a);
  bx(parts, 0.6, 0.7, 0.6, -W / 2 + 1, 0.8, z0 - 1, 0x4f7a39);

  const group = new THREE.Group();
  group.name = `interior ${b.id}`;
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.position.set(INTERIOR_ORIGIN[0], 0, INTERIOR_ORIGIN[1]);

  // Collision in world coordinates.
  const [ox, oz] = INTERIOR_ORIGIN;
  const w = (x: number, z: number): Vec2 => [ox + x, oz + z];
  const outer: Vec2[] = [w(-W / 2 - 2, 2), w(W / 2 + 2, 2), w(W / 2 + 2, -L - D - 2), w(-W / 2 - 2, -L - D - 2)];
  const world = new CollisionWorld([], outer);
  world.addLine([w(-PW / 2, 0.15), w(PW / 2, 0.15)]);
  world.addLine([w(-PW / 2, 0.15), w(-PW / 2, z0), w(-W / 2, z0), w(-W / 2, z1), w(W / 2, z1), w(W / 2, z0), w(PW / 2, z0), w(PW / 2, 0.15)]);
  return { group, world, layout };
}
