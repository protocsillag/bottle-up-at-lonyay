import * as THREE from 'three';
import type { Vec2 } from '../cityData';
import { CollisionWorld } from '../collision';
import { merge } from '../items/models';
import { signTexture } from '../landmarks/common';
import { CharacterModel } from '../../player/CharacterModel';
import { cosmetic, randomColors } from '../../npc/looks';

// Walk-in interiors for the two return points. Like courtyards they live far from the
// map with their own collision; the door is at local (0, 0) and the room extends to −z.

export interface ShopInterior {
  group: THREE.Group;
  world: CollisionWorld;
  spawn: Vec2;
  /** Player z (world) above which they walk out of the door. */
  exitZ: number;
  /** Where the REpont pair stands (world), facing (heading). */
  machines: { x: number; z: number; facing: number };
  /** Where you stand to buy food and beer (world). */
  till: { x: number; z: number };
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
function meshOf(parts: Part[]) {
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function sign(text: string, bg: string, fg: string, w: number, h: number, stripe?: string) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: signTexture(text, bg, fg, 512, Math.round((512 * h) / w), 'bold 70px system-ui, sans-serif', stripe), emissive: 0xffffff, emissiveIntensity: 0.15 }));
  return m;
}
const PRODUCE = [0xd23a2a, 0xf2a31a, 0x6aaa2a, 0xf2d21a, 0x8a2a6a, 0xe86a1a, 0x3a8a2a];

/** SPAR: bright aisles, white floor, red and green signage, fruit and veg up front,
 *  self-checkouts, and the REpont pair by the entrance. */
export function buildSpar(origin: Vec2): ShopInterior {
  const [ox, oz] = origin;
  const W = 18, D = 24, H = 4;
  const parts: Part[] = [];
  bx(parts, W, 0.1, D, 0, -0.05, -D / 2, 0xf2f2ee); // floor
  bx(parts, W, 0.1, D, 0, H, -D / 2, 0xe8e8e4); // ceiling
  for (let z = -3; z > -D; z -= 4) for (const x of [-5, 0, 5]) bx(parts, 2.4, 0.04, 0.5, x, H - 0.05, z, 0xffffff);
  bx(parts, 0.2, H, D, -W / 2, H / 2, -D / 2, 0xdcdcd6);
  bx(parts, 0.2, H, D, W / 2, H / 2, -D / 2, 0xdcdcd6);
  bx(parts, W, H, 0.2, 0, H / 2, -D, 0xdcdcd6);
  // Glass front with the door gap.
  bx(parts, W / 2 - 1.5, H, 0.1, -(W / 4 + 0.75), H / 2, 0, 0x9fc3d0);
  bx(parts, W / 2 - 1.5, H, 0.1, W / 4 + 0.75, H / 2, 0, 0x9fc3d0);
  bx(parts, 3, 0.6, 0.12, 0, H - 0.3, 0, 0x2b8a3e);
  // Red and green stripes along the walls.
  bx(parts, 0.05, 0.35, D, -W / 2 + 0.12, 3.1, -D / 2, 0xc8262c);
  bx(parts, 0.05, 0.2, D, -W / 2 + 0.12, 2.8, -D / 2, 0x2b8a3e);
  bx(parts, 0.05, 0.35, D, W / 2 - 0.12, 3.1, -D / 2, 0xc8262c);
  bx(parts, 0.05, 0.2, D, W / 2 - 0.12, 2.8, -D / 2, 0x2b8a3e);
  const colliders: [number, number, number, number][] = [];
  // Fruit and veg up front on the left: crates with heaps of colour.
  for (let i = 0; i < 4; i++) {
    const x = -6.5 + (i % 2) * 2.4, z = -3.5 - Math.floor(i / 2) * 2.2;
    bx(parts, 2, 0.8, 1.6, x, 0.4, z, 0x8a6a3e);
    for (let k = 0; k < 4; k++) bx(parts, 0.9, 0.22, 0.7, x - 0.48 + (k % 2) * 0.96, 0.9, z - 0.38 + Math.floor(k / 2) * 0.76, PRODUCE[(i * 4 + k) % PRODUCE.length]);
    colliders.push([x, z, 2, 1.6]);
  }
  // Shelf rows, kept to the back half so the till has room in front of it.
  for (const x of [-5.5, -1.5, 2.5]) {
    const z = -17;
    bx(parts, 1.1, 1.8, 8.6, x, 0.9, z, 0xe6e6e0);
    for (let lvl = 0; lvl < 4; lvl++) {
      for (let k = 0; k < 7; k++) {
        bx(parts, 1.14, 0.3, 1.1, x, 0.25 + lvl * 0.42, z - 3.6 + k * 1.2, PRODUCE[(lvl * 3 + k + Math.round(x)) % PRODUCE.length]);
      }
    }
    colliders.push([x, z, 1.1, 8.6]);
  }
  // Fridges along the back wall.
  bx(parts, W - 2, 2.2, 0.9, 0, 1.1, -D + 0.6, 0xbfd8e0);
  colliders.push([0, -D + 0.6, W - 2, 0.9]);
  // Self-checkouts along the right wall, behind the till.
  for (let i = 0; i < 3; i++) {
    const x = 7.3, z = -14.5 - i * 2;
    bx(parts, 0.9, 1.0, 0.7, x, 0.5, z, 0x3a3a3a);
    bx(parts, 0.6, 0.45, 0.06, x - 0.1, 1.3, z, 0x1b4a7a);
    colliders.push([x, z, 0.9, 0.7]);
  }
  const group = new THREE.Group();
  group.add(meshOf(parts));
  const s = sign('SPAR', '#2b8a3e', '#ffffff', 6, 1.2, '#c8262c');
  s.position.set(0, 3.2, -D + 0.05);
  group.add(s);
  const fruit = sign('Zöldség · Gyümölcs', '#2b8a3e', '#ffffff', 4, 0.6);
  fruit.position.set(-5.3, 2.6, -1.2);
  fruit.rotation.y = Math.PI;
  group.add(fruit);
  const light = new THREE.PointLight(0xffffff, 30, 30, 1.2);
  light.position.set(0, 3.6, -10);
  group.add(light);
  // The till: a counter with a cashier behind it, a beer fridge and a bread basket.
  const till: Part[] = [];
  bx(till, 0.8, 1.0, 2.4, 4.4, 0.5, -10, 0x3a3a3a);
  bx(till, 0.82, 0.06, 2.42, 4.4, 1.03, -10, 0xd8d8d0);
  bx(till, 0.35, 0.3, 0.3, 4.4, 1.2, -10.6, 0x1b1b1b); // till screen
  bx(till, 0.5, 0.18, 0.4, 4.4, 1.15, -9.3, 0xc9a25a); // bread rolls
  // Behind the cashier: a shelf of bread, párizsi and beer under an "Étel és ital itt" sign.
  bx(till, 0.5, 2.0, 2.8, 6.8, 1.0, -10, 0xe6e6e0);
  for (let lvl = 0; lvl < 4; lvl++) {
    for (let k = 0; k < 5; k++) {
      const c = lvl === 0 ? 0xc9a25a : lvl === 1 ? 0xe8a0a0 : lvl === 2 ? 0x3d6b2a : 0xd8a020;
      bx(till, 0.42, lvl >= 2 ? 0.3 : 0.18, 0.4, 6.7, 0.3 + lvl * 0.45 + (lvl >= 2 ? 0.15 : 0.09), -11.1 + k * 0.55, c);
    }
  }
  group.add(meshOf(till));
  const foodSign = sign('Étel és ital itt', '#c8262c', '#ffffff', 2.8, 0.55);
  foodSign.position.set(6.5, 2.4, -10);
  foodSign.rotation.y = -Math.PI / 2;
  group.add(foodSign);
  colliders.push([4.4, -10, 0.8, 2.4]);
  colliders.push([6.8, -10, 0.5, 2.8]);
  // A cashier and a couple of shoppers.
  addPeople(group, [[5.4, -10, Math.PI / 2], [-3.4, -12, 0], [0.5, -17, Math.PI]]);
  group.position.set(ox, 0, oz);

  const w = (x: number, z: number): Vec2 => [ox + x, oz + z];
  const world = new CollisionWorld([], [w(-W / 2, 0.2), w(W / 2, 0.2), w(W / 2, -D), w(-W / 2, -D)]);
  world.addLine([w(-W / 2, 0), w(-1.5, 0)]);
  world.addLine([w(1.5, 0), w(W / 2, 0)]);
  for (const [x, z, cw, cd] of colliders) world.addBox(ox + x, oz + z, cw, cd);
  // REpont pair just inside the entrance on the right, facing into the shop's front area.
  return { group, world, spawn: w(0, -1.2), exitZ: oz - 0.4, machines: { x: ox + 7.6, z: oz - 1.6, facing: Math.PI / 2 }, till: { x: ox + 3.4, z: oz - 10 } };
}

/** The Central Market Hall: one huge hall, orange-brown steel trusses, skylights, two
 *  levels of stalls with a gallery, paprika strings, and the Aldi corner with the REpont pair. */
export function buildHall(origin: Vec2): ShopInterior {
  const [ox, oz] = origin;
  const W = 34, D = 90, H = 20, G = 5.2; // gallery height
  const parts: Part[] = [];
  bx(parts, W, 0.1, D, 0, -0.05, -D / 2, 0x8f8676);
  for (let z = -2; z > -D; z -= 4) bx(parts, W, 0.012, 0.08, 0, 0.005, z, 0x7a7264); // floor tile lines
  // Brick walls.
  bx(parts, 0.6, H, D, -W / 2, H / 2, -D / 2, 0x9a4a33);
  bx(parts, 0.6, H, D, W / 2, H / 2, -D / 2, 0x9a4a33);
  bx(parts, W, H, 0.6, 0, H / 2, -D, 0x9a4a33);
  bx(parts, W / 2 - 2, H, 0.6, -(W / 4 + 1), H / 2, 0, 0x9a4a33);
  bx(parts, W / 2 - 2, H, 0.6, W / 4 + 1, H / 2, 0, 0x9a4a33);
  bx(parts, 4, H - 6, 0.6, 0, 6 + (H - 6) / 2, 0, 0x9a4a33);
  // Tall windows high on the long walls.
  for (let z = -6; z > -D; z -= 9) for (const sx of [-1, 1]) bx(parts, 0.1, 6, 3, sx * (W / 2 - 0.32), 12, z, 0xbcd2dc);
  // Steel trusses: posts, rafters and a tie beam every 9 m.
  const STEEL = 0xa8592a;
  for (let z = -4.5; z > -D; z -= 9) {
    for (const sx of [-1, 1]) {
      bx(parts, 0.5, H - 2, 0.5, sx * (W / 2 - 1.2), (H - 2) / 2, z, STEEL);
      // Rafter from the post top to the ridge, approximated by short steps.
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        bx(parts, (W / 2 - 1.2) / 8 + 0.1, 0.45, 0.4, sx * (W / 2 - 1.2) * (1 - t - 1 / 16), H - 2 + t * 6, z, STEEL);
      }
    }
    bx(parts, W - 2.4, 0.3, 0.3, 0, H - 2.2, z, STEEL);
    for (let i = -3; i <= 3; i++) bx(parts, 0.15, 2.2 + (3 - Math.abs(i)) * 0.9, 0.15, i * 2.4, H - 2.2 + (2.2 + (3 - Math.abs(i)) * 0.9) / 2, z, STEEL);
  }
  // Roof planes and the skylight strip along the ridge.
  bx(parts, W, 0.3, D, 0, H + 4.2, -D / 2, 0x6a4a3a);
  bx(parts, 6, 0.1, D - 4, 0, H + 4, -D / 2, 0xeef6ff);
  // Gallery decks with railings along both long sides.
  for (const sx of [-1, 1]) {
    bx(parts, 4.5, 0.4, D - 4, sx * (W / 2 - 2.6), G, -D / 2, 0x6a5a4a);
    bx(parts, 0.08, 1.0, D - 4, sx * (W / 2 - 4.85), G + 0.7, -D / 2, 0x2b2b2b);
    for (let z = -4; z > -D + 2; z -= 6) {
      bx(parts, 0.3, G, 0.3, sx * (W / 2 - 4.8), G / 2, z, STEEL);
      // Gallery stalls: canopies and goods.
      bx(parts, 3, 1.2, 4, sx * (W / 2 - 1.8), G + 0.8, z - 2, 0xb8a27a);
      bx(parts, 3.2, 0.12, 4.2, sx * (W / 2 - 1.8), G + 2.6, z - 2, [0xc8262c, 0x2b6e3c, 0xe0b23a][(Math.abs(z) / 6) % 3 | 0]);
    }
  }
  const colliders: [number, number, number, number][] = [];
  // Ground-floor stalls in two rows either side of the central aisle, plus wall stalls.
  for (let z = -14; z > -D + 6; z -= 8) {
    for (const x of [-6.5, 6.5]) {
      bx(parts, 5, 1.0, 5, x, 0.5, z, 0x8a6a3e);
      bx(parts, 5.2, 0.12, 5.2, x, 3, z, [0xc8262c, 0x2b6e3c, 0xe0b23a, 0xf2f2ee][(Math.abs(z) / 8 + (x > 0 ? 1 : 0)) % 4 | 0]);
      for (const cx of [-2.4, 2.4]) for (const cz of [-2.4, 2.4]) bx(parts, 0.1, 2, 0.1, x + cx, 2, z + cz, 0x5a4a3a);
      for (let k = 0; k < 6; k++) bx(parts, 1.4, 0.25, 1.2, x - 1.6 + (k % 3) * 1.6, 1.15, z - 0.7 + Math.floor(k / 3) * 1.4, PRODUCE[(k + Math.abs(z)) % PRODUCE.length]);
      // Paprika strings hanging from the canopy.
      for (let k = 0; k < 5; k++) bx(parts, 0.12, 1.1, 0.12, x - 2 + k, 2.35, z - 2.5, 0xc8261c);
      colliders.push([x, z, 5, 5]);
    }
  }
  for (let z = -10; z > -D + 4; z -= 7) for (const sx of [-1, 1]) {
    bx(parts, 3, 1.0, 5, sx * (W / 2 - 2.2), 0.5, z, 0x8a6a3e);
    bx(parts, 2.6, 0.5, 4.4, sx * (W / 2 - 2.2), 1.25, z, PRODUCE[Math.abs(z) % PRODUCE.length]);
    colliders.push([sx * (W / 2 - 2.2), z, 3, 5]);
  }
  // The Aldi corner just inside on the right.
  bx(parts, 9, 3.2, 0.3, W / 2 - 5.5, 1.6, -7.5, 0xf2f2ee);
  bx(parts, 9, 0.8, 0.32, W / 2 - 5.5, 3.6, -7.5, 0x1f3f8a);
  colliders.push([W / 2 - 5.5, -7.5, 9, 0.3]);
  // Aldi till by the corner.
  bx(parts, 2.4, 1.0, 0.8, 8.5, 0.5, -5, 0x3a3a3a);
  bx(parts, 2.42, 0.06, 0.82, 8.5, 1.03, -5, 0xd8d8d0);
  bx(parts, 0.35, 0.3, 0.3, 9.2, 1.2, -5, 0x1b1b1b);
  colliders.push([8.5, -5, 2.4, 0.8]);
  const group = new THREE.Group();
  group.add(meshOf(parts));
  const aldi = sign('ALDI', '#1f3f8a', '#ffffff', 3, 0.8, '#f2a31a');
  aldi.position.set(W / 2 - 5.5, 3.6, -7.33);
  aldi.rotation.y = 0;
  group.add(aldi);
  const sky = new THREE.PointLight(0xfff6e8, 120, 70, 1.0);
  sky.position.set(0, H - 1, -D / 2);
  const sky2 = new THREE.PointLight(0xfff6e8, 60, 40, 1.0);
  sky2.position.set(0, 10, -12);
  group.add(sky, sky2);
  addPeople(group, [[8.5, -6, Math.PI], [-6.5, -11, 0], [6.5, -19, Math.PI], [-6.5, -27, 0], [2, -16, 1.4], [-2, -30, -2], [6.5, -35, Math.PI], [-12, -20, -1.5], [0, -44, 0.3]]);
  group.position.set(ox, 0, oz);

  const w = (x: number, z: number): Vec2 => [ox + x, oz + z];
  const world = new CollisionWorld([], [w(-W / 2 + 0.3, 0.2), w(W / 2 - 0.3, 0.2), w(W / 2 - 0.3, -D + 0.3), w(-W / 2 + 0.3, -D + 0.3)]);
  world.addLine([w(-W / 2, 0), w(-2, 0)]);
  world.addLine([w(2, 0), w(W / 2, 0)]);
  for (const [x, z, cw, cd] of colliders) world.addBox(ox + x, oz + z, cw, cd);
  for (let z = -4.5; z > -D; z -= 9) for (const sx of [-1, 1]) world.addBox(ox + sx * (W / 2 - 1.2), oz + z, 0.5, 0.5);
  return { group, world, spawn: w(0, -1.5), exitZ: oz - 0.4, machines: { x: ox + W / 2 - 4.5, z: oz - 6.6, facing: Math.PI }, till: { x: ox + 8.5, z: oz - 3.9 } };
}

function addPeople(group: THREE.Group, spots: [number, number, number][]) {
  for (const [x, z, h] of spots) {
    const m = new CharacterModel(randomColors(cosmetic), { hat: cosmetic.pick(['none', 'none', 'flatcap', 'beanie'] as const), prop: Math.random() < 0.4 ? 'bag' : undefined });
    m.root.position.set(x, 0, z);
    m.root.rotation.y = h;
    m.animate(0.016, 0, false, false, 0);
    group.add(m.root);
  }
}
