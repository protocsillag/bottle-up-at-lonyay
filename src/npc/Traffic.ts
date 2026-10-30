import * as THREE from 'three';
import type { CityData } from '../world/cityData';
import { pointInPolygon } from '../world/collision';
import { merge } from '../world/items/models';
import { hourIn, hourOf } from '../state/time';
import { TRAFFIC } from '../state/balance';

// Moving cars on the OSM roads. Drive on the right at ~8 m/s, slow down at junctions,
// keep their distance, honk and brake for a player standing in the road ahead, and
// can't stop in time if you step out close in front. One-way rules come from OSM when
// the baked map has them. Pedestrian ways and car-free roads stay empty.

interface Node { x: number; z: number; edges: number[]; }
interface Edge { a: number; b: number; len: number; w: number; oneway: 0 | 1 | -1; }
interface Car {
  edge: number; from: number; t: number; speed: number;
  x: number; z: number; heading: number;
  color: number; taxi: boolean;
  honkCd: number; hold: number;
}

const MAX = 32;
const SPAWN_MIN = 70, SPAWN_MAX = 190, DESPAWN = 240;
const NO_CARS = new Set(['pedestrian', 'service', 'footway', 'path', 'cycleway', 'steps', 'track']);
const COLORS = [0xe8e8e8, 0x1b1b1b, 0x8a8f96, 0x3d4a66, 0x8a2f2f, 0x2f5a4a, 0xc9c2b4, 0x274060, 0x5a5a5a, 0xb33a2e];

export function carGeometry() {
  const p: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    p.push(g);
  };
  // White body parts take the instance colour; dark parts stay dark (multiplied).
  box(1.75, 0.6, 4.2, 0, 0.55, 0, 0xffffff);
  box(1.6, 0.55, 2.2, 0, 1.12, 0.25, 0xffffff);
  box(1.62, 0.45, 2.0, 0, 1.12, 0.25, 0x222a33); // windows band
  for (const [x, z] of [[-0.82, -1.35], [0.82, -1.35], [-0.82, 1.35], [0.82, 1.35]]) box(0.22, 0.62, 0.62, x, 0.31, z, 0x161616);
  box(1.8, 0.18, 0.12, 0, 0.42, -2.12, 0x3a3a3a); // bumpers
  box(1.8, 0.18, 0.12, 0, 0.42, 2.12, 0x3a3a3a);
  box(0.4, 0.12, 0.05, -0.6, 0.62, 2.11, 0xa01818); // tail lights
  box(0.4, 0.12, 0.05, 0.6, 0.62, 2.11, 0xa01818);
  return merge(p);
}

export class Traffic {
  readonly group = new THREE.Group();
  readonly cars: Car[] = [];
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private body: THREE.InstancedMesh;
  private lights: THREE.InstancedMesh;
  private lightMat: THREE.MeshBasicMaterial;
  private signs: THREE.InstancedMesh;
  private spawnTimer = 0;
  private m = new THREE.Matrix4();
  /** Called when a car hits the player. */
  onHit: () => void = () => {};
  /** Called when a car honks (with distance to the player). */
  onHonk: (d: number) => void = () => {};

  constructor(city: CityData) {
    const index = new Map<string, number>();
    const node = (x: number, z: number) => {
      const k = `${x},${z}`;
      let i = index.get(k);
      if (i === undefined) { i = this.nodes.length; this.nodes.push({ x, z, edges: [] }); index.set(k, i); }
      return i;
    };
    for (const r of city.roads) {
      if (r.kind !== 'road' || r.bridge || r.nocars || NO_CARS.has(r.hw)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const near = (x: number, z: number) => pointInPolygon(x, z, city.boundary) || pointInPolygon(x + 15, z, city.boundary) || pointInPolygon(x - 15, z, city.boundary) || pointInPolygon(x, z + 15, city.boundary) || pointInPolygon(x, z - 15, city.boundary);
        if (!near(ax, az) && !near(bx, bz)) continue;
        const a = node(ax, az), b = node(bx, bz);
        const e = this.edges.length;
        this.edges.push({ a, b, len, w: r.w, oneway: r.oneway ?? 0 });
        this.nodes[a].edges.push(e);
        this.nodes[b].edges.push(e);
      }
    }
    this.body = new THREE.InstancedMesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.body.count = 0;
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    // Headlights: two bright quads at the front, on at night.
    const hl = new THREE.BufferGeometry();
    const quads = [new THREE.PlaneGeometry(0.35, 0.16).rotateY(Math.PI).translate(-0.6, 0.62, -2.13), new THREE.PlaneGeometry(0.35, 0.16).rotateY(Math.PI).translate(0.6, 0.62, -2.13)];
    hl.copy(merge(quads.map((q) => { q.deleteAttribute('uv'); return q; })));
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0x8a8a80 });
    this.lights = new THREE.InstancedMesh(hl, this.lightMat, MAX);
    this.lights.count = 0;
    this.lights.frustumCulled = false;
    // Roof sign on taxis.
    this.signs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.18, 0.25).translate(0, 1.48, 0.3), new THREE.MeshLambertMaterial({ color: 0xf2e8a0, emissive: 0x403a10 }), MAX);
    this.signs.count = 0;
    this.signs.frustumCulled = false;
    this.group.add(this.body, this.lights, this.signs);
  }

  reset() { this.cars.length = 0; }

  private other(e: number, n: number) { const E = this.edges[e]; return n === E.a ? E.b : E.a; }

  /** May a car drive edge e starting at node `from`? */
  private allowed(e: number, from: number) {
    const E = this.edges[e];
    return E.oneway === 0 || (E.oneway === 1 ? from === E.a : from === E.b);
  }

  /** Lane position: right of travel, a quarter of the road width out (centre for one-ways). */
  private place(c: Car) {
    const E = this.edges[c.edge];
    const A = this.nodes[c.from], B = this.nodes[this.other(c.edge, c.from)];
    const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len;
    // Narrow streets have parked cars along both kerbs: keep the lanes clear of them.
    const off = E.oneway ? 0 : E.w < 12 ? Math.max(1.2, E.w / 2 - 3.1) : Math.min(E.w / 4, 3);
    c.x = A.x + ux * c.t - uz * off;
    c.z = A.z + uz * c.t + ux * off;
    const want = Math.atan2(-ux, -uz);
    let d = want - c.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.heading += Math.abs(d) > 1.2 ? d : d * 0.25;
  }

  private spawn(px: number, pz: number) {
    const cand: number[] = [];
    this.edges.forEach((e, i) => {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const d = Math.hypot((A.x + B.x) / 2 - px, (A.z + B.z) / 2 - pz);
      if (d > SPAWN_MIN && d < SPAWN_MAX) cand.push(i);
    });
    if (!cand.length) return;
    const e = cand[Math.floor(Math.random() * cand.length)];
    const E = this.edges[e];
    let from = Math.random() < 0.5 ? E.a : E.b;
    if (!this.allowed(e, from)) from = this.other(e, from);
    const t = Math.random() * E.len;
    if (this.cars.some((c) => c.edge === e && Math.abs(c.t - t) < 10)) return;
    const taxi = Math.random() < 0.18;
    const c: Car = { edge: e, from, t, speed: TRAFFIC.speed, x: 0, z: 0, heading: 0, color: taxi ? 0xf2c418 : COLORS[Math.floor(Math.random() * COLORS.length)], taxi, honkCd: 0, hold: 0 };
    this.place(c);
    const A = this.nodes[from], B = this.nodes[this.other(e, from)];
    c.heading = Math.atan2(-(B.x - A.x), -(B.z - A.z));
    this.cars.push(c);
  }

  private target(minute: number) {
    const h = hourOf(minute);
    if (hourIn(h, 2, 6)) return TRAFFIC.near[2];
    if (hourIn(h, 20, 2)) return TRAFFIC.near[1];
    return TRAFFIC.near[0];
  }

  /** px, pz: the player (null when indoors). */
  update(dt: number, minute: number, player: { x: number; z: number } | null, night: number, visible: boolean) {
    const ref = player ?? { x: 0, z: 0 };
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - ref.x, c.z - ref.z) > DESPAWN || c.hold > 100) this.cars.splice(i, 1);
    }
    this.spawnTimer -= dt;
    if (player && this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      const want = Math.min(MAX, this.target(minute));
      // Fill up quickly at the start of a run, then trickle.
      for (let k = 0; k < (this.cars.length < want / 2 ? 6 : 1) && this.cars.length < want; k++) this.spawn(player.x, player.z);
    }
    for (const c of this.cars) this.step(c, dt, player);
    this.group.visible = visible;
    if (visible) this.draw(night);
  }

  private step(c: Car, dt: number, player: { x: number; z: number } | null) {
    c.honkCd -= dt;
    if (c.hold > 0) { c.hold -= dt; c.speed = 0; return; }
    const E = this.edges[c.edge];
    const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading);
    let want = TRAFFIC.speed;
    // Slow for junctions.
    const toEnd = E.len - c.t;
    const endNode = this.nodes[this.other(c.edge, c.from)];
    if (endNode.edges.length >= 3 && toEnd < 12) want = Math.min(want, 4 + toEnd * 0.3);
    // Keep distance to the car ahead.
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 12 && Math.abs(dx * fz - dz * fx) < 1.6) want = Math.min(want, Math.max(0, (ahead - 6) * 1.2));
    }
    // The player in the road ahead: honk and brake; too close and fast means a hit.
    if (player) {
      const dx = player.x - c.x, dz = player.z - c.z;
      const ahead = dx * fx + dz * fz;
      const lat = Math.abs(dx * fz - dz * fx);
      if (ahead > -2.2 && ahead < 18 && lat < 1.3) {
        if (ahead > 2.6) {
          want = Math.min(want, Math.max(0, (ahead - 4) * 0.8));
          if (c.honkCd <= 0) { c.honkCd = 3; this.onHonk(Math.hypot(dx, dz)); }
        } else if (c.speed > 2.5) {
          c.hold = 1.5;
          c.speed = 0;
          this.onHit();
          return;
        } else want = 0;
      }
    }
    const acc = want > c.speed ? 3 : 7;
    c.speed += Math.sign(want - c.speed) * Math.min(Math.abs(want - c.speed), acc * dt);
    c.t += c.speed * dt;
    if (c.t >= E.len) {
      const node = this.other(c.edge, c.from);
      const opts = this.nodes[node].edges.filter((e) => e !== c.edge && this.allowed(e, node));
      // Dead end: U-turn if the road allows it, otherwise vanish (it drove off the map).
      const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : (this.allowed(c.edge, node) ? c.edge : -1);
      if (next < 0) { c.t = 0; c.hold = 999; return; }
      c.t -= E.len;
      c.from = node;
      c.edge = next;
      if (c.t > this.edges[next].len) c.t = 0;
    }
    this.place(c);
  }

  /** Pushes a circle out of the cars (they are solid). */
  pushOut(x: number, z: number, r: number): [number, number] {
    for (const c of this.cars) {
      const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading);
      for (const k of [-1.3, 0, 1.3]) {
        const cx = c.x + fx * k, cz = c.z + fz * k;
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), min = r + 0.95;
        if (d < min && d > 1e-4) { x = cx + (dx / d) * min; z = cz + (dz / d) * min; }
      }
    }
    return [x, z];
  }

  private draw(night: number) {
    const col = new THREE.Color();
    let s = 0;
    this.cars.forEach((c, i) => {
      this.m.makeRotationY(c.heading).setPosition(c.x, 0, c.z);
      this.body.setMatrixAt(i, this.m);
      this.body.setColorAt(i, col.setHex(c.color));
      this.lights.setMatrixAt(i, this.m);
      if (c.taxi) this.signs.setMatrixAt(s++, this.m);
    });
    this.body.count = this.lights.count = this.cars.length;
    this.signs.count = s;
    this.body.instanceMatrix.needsUpdate = this.lights.instanceMatrix.needsUpdate = this.signs.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.lightMat.color.setRGB(0.55 + night * 0.45, 0.55 + night * 0.45, 0.5 + night * 0.4);
  }
}
