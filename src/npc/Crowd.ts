import * as THREE from 'three';
import type { RoadGraph } from './RoadGraph';
import type { CityData, Vec2 } from '../world/cityData';
import type { Placement } from '../world/placement';
import { merge } from '../world/items/models';
import { hourIn, hourOf } from '../state/time';
import { cosmetic, randomColors } from './looks';
import type { CharacterColors } from '../player/CharacterModel';
import { pointInPolygon } from '../world/collision';

// Pedestrians, drawn with one InstancedMesh per body part (11 parts + props) so the
// whole crowd costs about 20 draw calls. Walkers follow the road graph on the pavement;
// bar crowds stand on Ráday utca at night, picnickers sit on the Nehru part lawn in
// the evening, and street people sit on benches or push trolleys.

export type NpcType = 'commuter' | 'tourist' | 'student' | 'pensioner' | 'dogwalker' | 'bar' | 'picnic' | 'street' | 'warden';
type Prop = 'none' | 'phone' | 'backpack' | 'trolley' | 'dog' | 'cart' | 'bottle' | 'bag';
type Mode = 'walk' | 'stand' | 'sit';

export interface Npc {
  type: NpcType;
  colors: CharacterColors;
  hat: boolean;
  prop: Prop;
  mode: Mode;
  x: number; z: number; heading: number;
  speed: number; baseSpeed: number;
  edge: number; from: number; t: number;
  phase: number;
  timer: number;
  /** Stationary NPCs belong to a group (spawned and removed together). */
  group: number;
  dropTimer: number;
}

const MAX = 60;
const HIP_Y = 0.92;
const SPAWN_MIN = 45, SPAWN_MAX = 115, DESPAWN = 150;

function part(w: number, h: number, d: number, y: number, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, y, z);
  g.deleteAttribute('uv');
  return g;
}
function colored(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Body part geometries in their pivot frames (same proportions as CharacterModel).
const PARTS = {
  torso: () => merge([part(0.44, 0.62, 0.26, 0.28), part(0.46, 0.14, 0.28, -0.04), part(0.3, 0.06, 0.22, 0.6)]),
  hips: () => part(0.36, 0.16, 0.22, HIP_Y + 0.04),
  head: () => merge([part(0.24, 0.27, 0.25, 0.16), part(0.05, 0.06, 0.05, 0.13, -0.14), part(0.1, 0.06, 0.1, 0.02)]),
  hair: () => part(0.26, 0.1, 0.27, 0.2, 0.01),
  hat: () => merge([part(0.27, 0.12, 0.27, 0.31), part(0.28, 0.04, 0.28, 0.24)]),
  armU: () => part(0.11, 0.3, 0.11, -0.15),
  armL: () => part(0.1, 0.28, 0.1, -0.14),
  hand: () => part(0.08, 0.09, 0.09, -0.3),
  legU: () => part(0.15, 0.44, 0.15, -0.22),
  legL: () => part(0.135, 0.4, 0.135, -0.2),
  shoe: () => part(0.13, 0.08, 0.26, -0.42, -0.05),
};
type PartName = keyof typeof PARTS;

const PROPS: Record<Exclude<Prop, 'none'>, () => THREE.BufferGeometry> = {
  phone: () => colored(part(0.08, 0.14, 0.02, -0.36, -0.04), 0x111111),
  backpack: () => merge([colored(part(0.32, 0.4, 0.16, 0.3, 0.21), 0x2f5a8a), colored(part(0.26, 0.12, 0.05, 0.16, 0.3), 0x24486e)]),
  bottle: () => merge([colored(part(0.06, 0.18, 0.06, -0.42), 0x3d6b2a), colored(part(0.025, 0.07, 0.025, -0.3), 0x3d6b2a)]),
  bag: () => colored(part(0.26, 0.3, 0.12, -0.48), 0xe8e2d0),
  trolley: () => merge([
    colored(part(0.32, 0.5, 0.22, 0.42), 0x7a2a2a), colored(part(0.34, 0.05, 0.24, 0.45), 0x2a4a7a),
    colored(part(0.02, 0.6, 0.02, 0.95), 0x333333), colored(part(0.04, 0.16, 0.16, 0.08, 0.08), 0x222222),
  ]).translate(0.32, 0, 0.45),
  dog: () => merge([
    colored(part(0.18, 0.18, 0.5, 0.36), 0x8a5a2b), colored(part(0.16, 0.16, 0.18, 0.5, -0.3), 0x8a5a2b),
    colored(part(0.06, 0.06, 0.1, 0.46, -0.42), 0x2a1d15), colored(part(0.04, 0.12, 0.04, 0.5, 0.28), 0x8a5a2b),
    ...[[-0.06, -0.18], [0.06, -0.18], [-0.06, 0.18], [0.06, 0.18]].map(([x, z]) => colored(part(0.05, 0.28, 0.05, 0.14, z).translate(x, 0, 0), 0x6e4622)),
  ]).translate(0.55, 0, -0.5),
  cart: () => merge([
    colored(part(0.6, 0.45, 0.9, 0.75), 0x9aa0a6), colored(part(0.62, 0.04, 0.04, 1.0, 0.47), 0x555555),
    colored(part(0.5, 0.35, 0.7, 1.0), 0xd8cfb8), // a sack of collected stuff
    ...[[-0.26, -0.38], [0.26, -0.38], [-0.26, 0.38], [0.26, 0.38]].map(([x, z]) => colored(part(0.06, 0.12, 0.12, 0.06, z).translate(x, 0, 0), 0x222222)),
  ]).translate(0, 0, -0.95),
};

const TYPE_PROPS: Record<NpcType, Prop[]> = {
  commuter: ['none', 'bag', 'none'], tourist: ['phone', 'backpack', 'phone'], student: ['backpack', 'backpack', 'phone'],
  pensioner: ['trolley', 'bag', 'trolley'], dogwalker: ['dog'], bar: ['bottle', 'bottle', 'none'], picnic: ['bottle', 'none'],
  street: ['cart', 'none', 'bag'],
  warden: ['phone', 'none'],
};
const TYPE_SPEED: Record<NpcType, number> = { commuter: 1.45, tourist: 1.0, student: 1.35, pensioner: 0.8, dogwalker: 1.1, bar: 0, picnic: 0, street: 0.75, warden: 0.9 };

/** Walker mix by hour. */
function walkerMix(h: number): Record<string, number> {
  if (hourIn(h, 7, 10)) return { commuter: 0.45, student: 0.2, pensioner: 0.13, dogwalker: 0.12, street: 0.06, tourist: 0.04 };
  if (hourIn(h, 10, 18)) return { tourist: 0.3, pensioner: 0.2, student: 0.2, commuter: 0.1, dogwalker: 0.1, street: 0.1, warden: 0.05 };
  if (hourIn(h, 18, 2)) return { student: 0.35, tourist: 0.2, commuter: 0.15, dogwalker: 0.1, street: 0.2 };
  return { street: 0.55, student: 0.3, dogwalker: 0.15 };
}
/** Target number of walkers around the player by hour (stationary groups come on top, all within MAX). */
function walkerTarget(h: number) {
  if (hourIn(h, 7, 10)) return 40;
  if (hourIn(h, 10, 18)) return 36;
  if (hourIn(h, 18, 22)) return 34;
  if (hourIn(h, 22, 2)) return 26;
  if (hourIn(h, 2, 5)) return 5;
  return 12;
}

export interface CrowdHooks {
  /** An NPC finished a drink and dropped it. */
  drop(x: number, z: number): void;
  /** A dog walker's dog left a pile. */
  dogMess(x: number, z: number): void;
  /** A street person greets the player. */
  greet(): void;
}

export class Crowd {
  readonly group = new THREE.Group();
  readonly npcs: Npc[] = [];
  /** Cap on visible people (graphics quality). */
  maxNpcs = MAX;
  private meshes = {} as Record<PartName, THREE.InstancedMesh>;
  private propMeshes = {} as Record<Exclude<Prop, 'none'>, THREE.InstancedMesh>;
  private groupId = 1;
  private spawnTimer = 0;
  private greetCooldown = 0;
  private benches: Vec2[];
  private radayEdges: number[];
  private nehruSpots: Vec2[];
  private m = Array.from({ length: 8 }, () => new THREE.Matrix4());
  private tmp = new THREE.Matrix4();
  private col = new THREE.Color();

  constructor(city: CityData, private graph: RoadGraph, place: Placement, private hooks: CrowdHooks) {
    this.group.name = 'crowd';
    const mat = new THREE.MeshLambertMaterial();
    const counts: Record<PartName, number> = { torso: 1, hips: 1, head: 1, hair: 1, hat: 1, armU: 2, armL: 2, hand: 2, legU: 2, legL: 2, shoe: 2 };
    for (const name of Object.keys(PARTS) as PartName[]) {
      const im = new THREE.InstancedMesh(PARTS[name](), mat, MAX * counts[name]);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * counts[name] * 3), 3);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      this.meshes[name] = im;
      this.group.add(im);
    }
    const pmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const name of Object.keys(PROPS) as Exclude<Prop, 'none'>[]) {
      const im = new THREE.InstancedMesh(PROPS[name](), pmat, MAX);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      this.propMeshes[name] = im;
      this.group.add(im);
    }
    this.benches = city.benches.filter(([x, z]) => pointInPolygon(x, z, city.boundary) && place.free(x, z, 0.3));
    this.radayEdges = graph.edges.map((e, i) => [e, i] as const).filter(([e]) => e.name === 'Ráday utca' && e.road).map(([, i]) => i);
    this.nehruSpots = place.spots.filter((s) => s.zone === 'nehru' && s.green).map((s) => [s.x, s.z] as Vec2);
  }

  reset() { this.npcs.length = 0; this.spawnTimer = 0; }

  private make(type: NpcType, x: number, z: number, heading: number, mode: Mode, group = 0): Npc {
    const colors = randomColors(cosmetic);
    if (type === 'street') { colors.top = cosmetic.pick([0x5a4a3a, 0x4a4f3a, 0x3a3a3a, 0x6a5a48]); colors.bottoms = 0x3a3530; }
    if (type === 'commuter') { colors.top = cosmetic.pick([0x2c3445, 0x1f1f1f, 0x4a4036, 0x5a5a5a]); }
    // Parking wardens (parkolóőr): yellow hi-vis vests, dark trousers, walking in pairs.
    if (type === 'warden') { colors.top = 0xd8e02a; colors.bottoms = 0x23262e; colors.hat = 0x23262e; }
    const prop = cosmetic.pick(TYPE_PROPS[type]);
    const speed = TYPE_SPEED[type] * (0.85 + Math.random() * 0.3);
    return {
      type, colors, hat: type === 'street' || type === 'pensioner' ? Math.random() < 0.7 : Math.random() < 0.15, prop, mode,
      x, z, heading, speed, baseSpeed: speed, edge: -1, from: -1, t: 0, phase: Math.random() * 10, timer: 0, group,
      dropTimer: 30 + Math.random() * 300,
    };
  }

  private spawnWalker(px: number, pz: number, h: number, rMin: number) {
    let edges = this.graph.edgesNear(px, pz, rMin, SPAWN_MAX);
    if (!edges.length) return;
    // Busy streets at night: Ráday utca gets a share.
    if (hourIn(h, 18, 3) && this.radayEdges.length && Math.random() < 0.3) {
      const near = edges.filter((e) => this.radayEdges.includes(e));
      if (near.length) edges = near;
    }
    const e = edges[Math.floor(Math.random() * edges.length)];
    const E = this.graph.edges[e];
    const type = pickWeighted(walkerMix(h)) as NpcType;
    const from = Math.random() < 0.5 ? E.a : E.b;
    const t = Math.random() * E.len;
    const [x, z, hd] = this.graph.point(e, from, t);
    const n = this.make(type, x, z, hd, 'walk');
    n.edge = e; n.from = from; n.t = t;
    this.npcs.push(n);
    if (type === 'warden' && t + 1.3 < E.len) {
      const [x2, z2] = this.graph.point(e, from, t + 1.3);
      const m = this.make('warden', x2, z2, hd, 'walk');
      m.edge = e; m.from = from; m.t = t + 1.3; m.baseSpeed = m.speed = n.baseSpeed;
      this.npcs.push(m);
    }
  }

  private spawnGroup(kind: 'bar' | 'picnic' | 'bench', px: number, pz: number) {
    const id = this.groupId++;
    if (kind === 'bench') {
      const b = this.benches.filter(([x, z]) => { const d = Math.hypot(x - px, z - pz); return d > SPAWN_MIN && d < SPAWN_MAX; });
      if (!b.length) return;
      const [x, z] = b[Math.floor(Math.random() * b.length)];
      this.npcs.push(this.make('street', x, z, Math.random() * 6.28, 'sit', id));
      return;
    }
    let cx: number, cz: number;
    if (kind === 'bar') {
      const edges = this.radayEdges.filter((e) => {
        const E = this.graph.edges[e], A = this.graph.nodes[E.a];
        const d = Math.hypot(A.x - px, A.z - pz);
        return d > 30 && d < SPAWN_MAX + 30;
      });
      if (!edges.length) return;
      const e = edges[Math.floor(Math.random() * edges.length)];
      const E = this.graph.edges[e];
      [cx, cz] = this.graph.point(e, Math.random() < 0.5 ? E.a : E.b, Math.random() * E.len);
    } else {
      const s = this.nehruSpots.filter(([x, z]) => { const d = Math.hypot(x - px, z - pz); return d > 30 && d < SPAWN_MAX + 30; });
      if (!s.length) return;
      [cx, cz] = s[Math.floor(Math.random() * s.length)];
    }
    const n = kind === 'bar' ? 3 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = kind === 'bar' ? 0.75 : 0.9;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      // Face the middle of the circle.
      const heading = Math.atan2(x - cx, z - cz);
      const npc = this.make(kind === 'bar' ? 'bar' : 'picnic', x, z, heading, kind === 'bar' ? 'stand' : 'sit', id);
      this.npcs.push(npc);
    }
  }

  /** Pushes a circle at (x, z) out of pedestrians. */
  pushOut(x: number, z: number, r: number): [number, number] {
    for (const n of this.npcs) {
      const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz), min = r + 0.28;
      if (d < min && d > 1e-4) { x = n.x + (dx / d) * min; z = n.z + (dz / d) * min; }
    }
    return [x, z];
  }

  /** True if anyone stands within r of (x, z). */
  hit(x: number, z: number, r: number) {
    return this.npcs.some((n) => Math.hypot(n.x - x, n.z - z) < r + 0.28);
  }

  update(dt: number, minute: number, px: number, pz: number, visible: boolean) {
    const h = hourOf(minute);
    this.greetCooldown -= dt;

    // Despawn far away.
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (Math.hypot(n.x - px, n.z - pz) > DESPAWN) this.npcs.splice(i, 1);
    }
    // Remove stationary groups out of their hours.
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if ((n.type === 'bar' && !hourIn(h, 18, 3)) || (n.type === 'picnic' && !hourIn(h, 16, 23))) {
        if (Math.hypot(n.x - px, n.z - pz) > 40) this.npcs.splice(i, 1);
      }
    }

    // Spawn toward the targets.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      const walkers = this.npcs.filter((n) => n.mode === 'walk').length;
      const first = this.npcs.length === 0;
      const scale = this.maxNpcs / MAX;
      for (let k = 0; k < (first ? 30 : 2) && walkers + k < walkerTarget(h) * scale && this.npcs.length < this.maxNpcs; k++) this.spawnWalker(px, pz, h, first ? 15 : SPAWN_MIN);
      const groups = (type: NpcType) => new Set(this.npcs.filter((n) => n.type === type).map((n) => n.group)).size;
      if (hourIn(h, 18, 3) && groups('bar') < 4 && this.npcs.length < this.maxNpcs - 5) this.spawnGroup('bar', px, pz);
      if (hourIn(h, 16, 23) && groups('picnic') < 3 && this.npcs.length < this.maxNpcs - 4) this.spawnGroup('picnic', px, pz);
      if (this.npcs.filter((n) => n.type === 'street' && n.mode === 'sit').length < 3 && this.npcs.length < this.maxNpcs) this.spawnGroup('bench', px, pz);
    }

    for (const n of this.npcs) this.step(n, dt, h, px, pz);
    if (visible) this.draw();
    this.group.visible = visible;
  }

  private step(n: Npc, dt: number, h: number, px: number, pz: number) {
    const dp = Math.hypot(n.x - px, n.z - pz);
    // Street people greet you as you pass.
    if (n.type === 'street' && dp < 2.5 && this.greetCooldown <= 0) {
      this.greetCooldown = 25;
      if (Math.random() < 0.35) this.hooks.greet();
    }
    // Finishing a drink.
    n.dropTimer -= dt * (hourIn(h, 18, 2) ? 1 : 0.3);
    if (n.dropTimer <= 0) {
      n.dropTimer = 400 + Math.random() * 900;
      if (n.type === 'bar' || n.type === 'picnic' || n.type === 'student' || n.type === 'tourist') this.hooks.drop(n.x + (Math.random() - 0.5), n.z + (Math.random() - 0.5));
    }
    if (n.mode !== 'walk') { n.phase += dt; return; }

    // Pause for the player standing right in front.
    const fx = -Math.sin(n.heading), fz = -Math.cos(n.heading);
    const ahead = (px - n.x) * fx + (pz - n.z) * fz;
    const lateral = Math.abs((px - n.x) * fz - (pz - n.z) * fx);
    n.speed = ahead > 0 && ahead < 1.3 && lateral < 0.6 ? Math.max(0, n.speed - dt * 4) : Math.min(n.baseSpeed, n.speed + dt * 2);
    // Tourists stop for photos now and then.
    if (n.type === 'tourist') {
      n.timer -= dt;
      if (n.timer < -12) n.timer = 2 + Math.random() * 3;
      if (n.timer > 0) n.speed = 0;
    }
    if (n.type === 'dogwalker') {
      n.timer += dt;
      if (n.timer > 70 + Math.random() * 60) {
        n.timer = 0;
        const s = Math.sin(n.heading), c = Math.cos(n.heading);
        // Where the dog walks: 0.55 right, 0.5 ahead.
        this.hooks.dogMess(n.x + c * 0.55 - s * 0.5, n.z - s * 0.55 - c * 0.5);
      }
    }

    n.t += n.speed * dt;
    const E = this.graph.edges[n.edge];
    if (n.t >= E.len) {
      // Next edge at the far node: anything but straight back, unless it is a dead end.
      const node = this.graph.other(n.edge, n.from);
      const opts = this.graph.nodes[node].edges.filter((e) => e !== n.edge);
      const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : n.edge;
      n.t -= E.len;
      n.from = node;
      n.edge = next;
      if (n.t > this.graph.edges[next].len) n.t = 0;
    }
    const [x, z, hd] = this.graph.point(n.edge, n.from, n.t);
    n.x = x; n.z = z;
    let diff = hd - n.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    n.heading += diff * Math.min(1, dt * 6);
    n.phase += (n.speed / 1.25) * Math.PI * dt;
  }

  private draw() {
    const counts = {} as Record<PartName, number>;
    for (const k of Object.keys(this.meshes) as PartName[]) counts[k] = 0;
    const pcount = {} as Record<string, number>;
    for (const k of Object.keys(this.propMeshes)) pcount[k] = 0;
    const [root, torso, head, arm, low, leg, lowLeg] = this.m;
    const t = this.tmp;
    const put = (name: PartName, mat: THREE.Matrix4, color: number) => {
      const im = this.meshes[name];
      const i = counts[name]++;
      im.setMatrixAt(i, mat);
      im.setColorAt(i, this.col.setHex(color));
    };
    const putProp = (name: Exclude<Prop, 'none'>, mat: THREE.Matrix4) => {
      this.propMeshes[name].setMatrixAt(pcount[name]++, mat);
    };

    for (const n of this.npcs) {
      const c = n.colors;
      const moving = n.mode === 'walk' ? Math.min(1, n.speed / 1.2) : 0;
      const s = Math.sin(n.phase);
      const swing = 0.55 * moving;
      const sit = n.mode === 'sit';
      const bodyY = sit ? (n.type === 'picnic' ? -0.78 : -0.45) : Math.abs(Math.cos(n.phase)) * 0.04 * moving;
      root.makeRotationY(n.heading).setPosition(n.x, bodyY, n.z);
      // Torso and head.
      const breathe = Math.sin(n.phase * 1.7) * 0.01;
      torso.copy(root).multiply(t.makeTranslation(0, HIP_Y, 0)).multiply(t.makeRotationX(-0.06 * moving - breathe));
      put('torso', torso, c.top);
      put('hips', root, c.bottoms);
      // Bar crowds and picnickers turn their heads while chatting.
      const look = n.mode === 'walk' ? 0 : Math.sin(n.phase * 0.7 + n.x) * 0.5;
      head.copy(torso).multiply(t.makeTranslation(0, 0.62, 0)).multiply(t.makeRotationY(look));
      put('head', head, c.skin);
      put('hair', head, c.hair);
      if (n.hat) put('hat', head, c.hat);

      // Arms.
      for (const side of [-1, 1]) {
        const legSwing = s * swing * side;
        let ax = -legSwing * 0.9, elbow = 0.25 + 0.2 * moving, az = side * 0.06;
        const right = side === 1;
        if (right && (n.prop === 'phone')) { ax = 1.25; elbow = 1.0; }
        if (right && n.prop === 'bottle') { ax = n.mode === 'walk' ? 0.4 : 0.7 + Math.max(0, Math.sin(n.phase * 0.5)) * 0.9; elbow = 1.3; }
        if (n.prop === 'cart') { ax = 1.15; elbow = 0.2; }
        if (right && n.prop === 'trolley') { ax = -0.35; elbow = 0.1; }
        if (right && n.prop === 'dog') { ax = 0.5; elbow = 0.3; az = 0.25; }
        if (sit && !(right && n.prop === 'bottle')) { ax = 0.5; elbow = 0.6; }
        arm.copy(torso).multiply(t.makeTranslation(0.29 * side, 0.56, 0)).multiply(t.makeRotationX(ax)).multiply(t.makeRotationZ(az));
        put('armU', arm, c.top);
        low.copy(arm).multiply(t.makeTranslation(0, -0.3, 0)).multiply(t.makeRotationX(elbow));
        put('armL', low, c.top);
        put('hand', low, c.skin);
        if (right && (n.prop === 'phone' || n.prop === 'bottle' || n.prop === 'bag')) putProp(n.prop, low);
      }
      // Legs.
      for (const side of [-1, 1]) {
        const lx = sit ? 1.5 : s * swing * side;
        const knee = sit ? -1.45 : -Math.max(0, -Math.cos(n.phase) * side) * swing * 1.3;
        leg.copy(root).multiply(t.makeTranslation(0.1 * side, HIP_Y, 0)).multiply(t.makeRotationX(lx));
        put('legU', leg, c.bottoms);
        lowLeg.copy(leg).multiply(t.makeTranslation(0, -0.44, 0)).multiply(t.makeRotationX(knee));
        put('legL', lowLeg, c.bottoms);
        put('shoe', lowLeg, c.shoes);
      }
      if (n.prop === 'backpack') putProp('backpack', torso);
      if (n.prop === 'trolley' || n.prop === 'dog' || n.prop === 'cart') {
        // Props on the ground stay level.
        const g = t.makeRotationY(n.heading).setPosition(n.x, 0, n.z);
        putProp(n.prop, g);
      }
    }
    for (const k of Object.keys(this.meshes) as PartName[]) {
      const im = this.meshes[k];
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const k of Object.keys(this.propMeshes) as Exclude<Prop, 'none'>[]) {
      const im = this.propMeshes[k];
      im.count = pcount[k];
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

function pickWeighted(w: Record<string, number>) {
  let total = 0;
  for (const v of Object.values(w)) total += v;
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) if ((r -= v) < 0) return k;
  return Object.keys(w)[0];
}
