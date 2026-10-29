import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { merge } from '../items/models';
import { CharacterModel } from '../../player/CharacterModel';
import { cosmetic, randomColors } from '../../npc/looks';
import { hourIn } from '../../state/time';
import { sound } from '../../audio/Sfx';

// Street gates: one big wooden gate per residential building on its longest street
// facade (or at an OSM entrance). Residents leave at random and the heavy gate swings
// shut over 4 seconds; the bell next to it is handled by BuildingSystem.

export const GATE_W = 2.4;
export const GATE_H = 3.4;
const OPEN_TIME = 0.6;
export const CLOSE_TIME = 4;
const ANIM_RANGE = 80; // metres: gates further away just tick their timers

export type GateState = 'closed' | 'opening' | 'held' | 'closing';

export interface Gate {
  index: number;
  b: Building;
  /** Point on the wall, centre of the gate. */
  x: number; z: number;
  /** Outward normal (toward the street). */
  nx: number; nz: number;
  /** Heading that faces out to the street (0 = north). */
  facing: number;
  open: number; // 0 closed – 1 fully open
  state: GateState;
  timer: number;
  /** Real seconds until the next resident leaves. */
  nextExit: number;
  bellCooldown: number;
}

interface Resident { model: CharacterModel; gate: Gate; t: number; tx: number; tz: number; }

const NON_RESIDENTIAL = /Vásárcsarnok|Corvinus|templom|Múzeum|plébánia|kápolna|Aldi|Klinika|Intézet|Hivatal|Egyetem|Kollégium|alállomás|áramátalakító|Kórház|Óvoda|Bölcsőde|Gimnázium|Könyvtár|Számvevőszék|laktanya|Center|mozi|Music/i;

function area(ring: Vec2[]) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}

/** Finds a gate position for every residential building. */
export function placeGates(city: CityData, place: Placement, avoid: Vec2[] = []): Omit<Gate, 'index' | 'open' | 'state' | 'timer' | 'nextExit' | 'bellCooldown'>[] {
  const out: Omit<Gate, 'index' | 'open' | 'state' | 'timer' | 'nextExit' | 'bellCooldown'>[] = [];
  for (const b of city.buildings) {
    if (b.scenery || b.h < 8 || area(b.outer) < 150 || (b.name && NON_RESIDENTIAL.test(b.name))) continue;
    let best: { score: number; x: number; z: number; nx: number; nz: number } | null = null;
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < GATE_W + 2.5) continue;
      const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
      let nx = uz, nz = -ux;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (pointInPolygon(mx + nx * 0.2, mz + nz * 0.2, ring)) { nx = -nx; nz = -nz; }
      if (!place.free(mx + nx * 2, mz + nz * 2, 0.6) || !place.free(mx + nx * 4, mz + nz * 4, 0.6)) continue;
      // The gate's whole width must face open pavement.
      if (!place.free(mx + nx * 1.5 + ux * 1.4, mz + nz * 1.5 + uz * 1.4, 0.3) || !place.free(mx + nx * 1.5 - ux * 1.4, mz + nz * 1.5 - uz * 1.4, 0.3)) continue;
      let score = len;
      let gx = mx, gz = mz;
      // An OSM entrance on this edge wins.
      for (const e of city.entrances) {
        const t = (e[0] - a[0]) * ux + (e[1] - a[1]) * uz;
        const d = Math.abs((e[0] - a[0]) * nx + (e[1] - a[1]) * nz);
        if (d < 1.5 && t > GATE_W / 2 + 0.6 && t < len - GATE_W / 2 - 0.6) { score += 1000; gx = a[0] + ux * t; gz = a[1] + uz * t; }
      }
      if (!best || score > best.score) best = { score, x: gx, z: gz, nx, nz };
    }
    if (!best) continue;
    if (avoid.some(([ax, az]) => Math.hypot(ax - best!.x, az - best!.z) < 9)) continue;
    out.push({ b, x: best.x + best.nx * 0.02, z: best.z + best.nz * 0.02, nx: best.nx, nz: best.nz, facing: Math.atan2(-best.nx, -best.nz) });
  }
  return out;
}

function colored(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Stone surround, dark passage behind, intercom panel. Local: wall plane z = 0, street side −z. */
function frameGeometry() {
  const p = 0.35;
  return merge([
    colored(new THREE.BoxGeometry(p, GATE_H + 0.3, 0.2).translate(-GATE_W / 2 - p / 2, (GATE_H + 0.3) / 2, -0.08), 0xcfc4ad),
    colored(new THREE.BoxGeometry(p, GATE_H + 0.3, 0.2).translate(GATE_W / 2 + p / 2, (GATE_H + 0.3) / 2, -0.08), 0xcfc4ad),
    colored(new THREE.BoxGeometry(GATE_W + 2 * p, 0.45, 0.24).translate(0, GATE_H + 0.2, -0.1), 0xc4b89f),
    colored(new THREE.BoxGeometry(GATE_W, GATE_H, 0.02).translate(0, GATE_H / 2, 0.02), 0x121212),
    // Intercom panel to the right of the gate (as seen from the street).
    colored(new THREE.BoxGeometry(0.2, 0.34, 0.05).translate(-(GATE_W / 2 + p + 0.25), 1.35, -0.03), 0xb59a5a),
    colored(new THREE.BoxGeometry(0.14, 0.2, 0.02).translate(-(GATE_W / 2 + p + 0.25), 1.38, -0.06), 0x2b2b2b),
  ]);
}

/** One gate leaf with the hinge at the origin, spanning +x. */
function leafGeometry() {
  const w = GATE_W / 2;
  const parts = [colored(new THREE.BoxGeometry(w, GATE_H, 0.08).translate(w / 2, GATE_H / 2, 0), 0x5a3a22)];
  // Raised panels.
  for (const y of [0.9, 2.3]) parts.push(colored(new THREE.BoxGeometry(w * 0.7, 1.0, 0.04).translate(w / 2, y, -0.05), 0x6b4529));
  parts.push(colored(new THREE.BoxGeometry(0.05, 0.25, 0.06).translate(w - 0.12, 1.15, -0.07), 0xb59a5a));
  return merge(parts);
}

export class GateSystem {
  readonly group = new THREE.Group();
  readonly gates: Gate[];
  private leaves: THREE.InstancedMesh;
  private residents: Resident[] = [];
  private pool: CharacterModel[] = [];
  /** Called when a gate clicks shut right in front of the player. */
  onSlam: (g: Gate) => void = () => {};

  constructor(city: CityData, place: Placement, avoid: Vec2[] = []) {
    this.group.name = 'gates';
    this.gates = placeGates(city, place, avoid).map((g, index) => ({ ...g, index, open: 0, state: 'closed' as GateState, timer: 0, nextExit: 5 + Math.random() * 60, bellCooldown: 0 }));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const frames = new THREE.InstancedMesh(frameGeometry(), mat, this.gates.length);
    this.leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), this.gates.length * 2);
    const m = new THREE.Matrix4();
    for (const g of this.gates) {
      frames.setMatrixAt(g.index, m.makeRotationY(g.facing).setPosition(g.x, 0, g.z));
      this.setLeaves(g);
    }
    frames.receiveShadow = true;
    this.leaves.castShadow = true;
    this.group.add(frames, this.leaves);
  }

  private setLeaves(g: Gate) {
    const base = new THREE.Matrix4().makeRotationY(g.facing).setPosition(g.x, 0, g.z);
    const a = g.open * 1.45;
    const l = new THREE.Matrix4().makeTranslation(-GATE_W / 2, 0, -0.06).multiply(new THREE.Matrix4().makeRotationY(a));
    const r = new THREE.Matrix4().makeTranslation(GATE_W / 2, 0, -0.06).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    this.leaves.setMatrixAt(g.index * 2, base.clone().multiply(l));
    this.leaves.setMatrixAt(g.index * 2 + 1, base.clone().multiply(r));
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const g of this.gates) {
      g.open = 0; g.state = 'closed'; g.timer = 0; g.bellCooldown = 0;
      g.nextExit = 5 + Math.random() * 60;
      this.setLeaves(g);
    }
    for (const r of this.residents) { this.group.remove(r.model.root); this.pool.push(r.model); }
    this.residents = [];
  }

  private px = 0;
  private pz = 0;

  /** Opens the gate; it stays open `hold` seconds and then swings shut over 4 s. */
  openGate(g: Gate, hold: number) {
    const d = Math.hypot(g.x - this.px, g.z - this.pz);
    if (d < 30 && g.state === 'closed') sound.play('creak', 1 - d / 30);
    if (g.state === 'closed' || g.state === 'closing') { g.state = 'opening'; g.timer = hold; }
    else g.timer = Math.max(g.timer, hold);
  }

  /** Average seconds between residents leaving, by hour (BRIEF: 30–90 s, busy at commute times, rare after midnight). */
  private exitInterval(hour: number) {
    const base = 30 + Math.random() * 60;
    if (hourIn(hour, 7, 9) || hourIn(hour, 17, 19)) return base * 0.45;
    if (hourIn(hour, 0, 6)) return base * 6;
    if (hourIn(hour, 22, 24)) return base * 2;
    return base;
  }

  update(dt: number, hour: number, px: number, pz: number, playerOutside: boolean) {
    this.px = px; this.pz = pz;
    for (const g of this.gates) {
      g.bellCooldown = Math.max(0, g.bellCooldown - dt);
      g.nextExit -= dt;
      const near = Math.abs(g.x - px) < ANIM_RANGE && Math.abs(g.z - pz) < ANIM_RANGE;
      if (g.nextExit <= 0) {
        g.nextExit = this.exitInterval(hour);
        if (near && playerOutside) { this.openGate(g, 1.4); this.spawnResident(g); }
      }
      if (g.state === 'closed') continue;
      const before = g.open;
      if (g.state === 'opening') {
        g.open = Math.min(1, g.open + dt / OPEN_TIME);
        if (g.open >= 1) g.state = 'held';
      } else if (g.state === 'held') {
        g.timer -= dt;
        if (g.timer <= 0) g.state = 'closing';
      } else if (g.state === 'closing') {
        // Heavy gate: slow at first, then it gathers speed and clicks.
        g.open = Math.max(0, g.open - (dt / CLOSE_TIME) * (0.6 + 0.8 * (1 - g.open)));
        if (g.open <= 0) {
          g.state = 'closed';
          const d = Math.hypot(px - g.x, pz - g.z);
          if (playerOutside && d < 25) sound.play('slam', Math.max(0.15, 1 - d / 25));
          if (playerOutside && d < 2.5) this.onSlam(g);
        }
      }
      if (near && g.open !== before) this.setLeaves(g);
    }
    this.updateResidents(dt);
  }

  private spawnResident(g: Gate) {
    const model = this.pool.pop() ?? new CharacterModel(randomColors(cosmetic), { hat: Math.random() < 0.3 ? 'flatcap' : 'none', prop: Math.random() < 0.3 ? 'bag' : undefined });
    model.root.position.set(g.x + g.nx * 0.2, 0, g.z + g.nz * 0.2);
    model.root.rotation.y = g.facing;
    model.root.visible = true;
    // Step out, then turn left or right along the pavement.
    const side = Math.random() < 0.5 ? 1 : -1;
    const tx = g.x + g.nx * 2.2 + -g.nz * side * 25, tz = g.z + g.nz * 2.2 + g.nx * side * 25;
    this.group.add(model.root);
    this.residents.push({ model, gate: g, t: 0, tx, tz });
  }

  private updateResidents(dt: number) {
    for (let i = this.residents.length - 1; i >= 0; i--) {
      const r = this.residents[i];
      r.t += dt;
      const p = r.model.root.position;
      const g = r.gate;
      let speed = 1.3;
      if (r.t < 0.45) speed = 0; // waiting for the gate to swing
      const outDist = (p.x - g.x) * g.nx + (p.z - g.z) * g.nz;
      let dx: number, dz: number;
      if (outDist < 1.8) { dx = g.nx; dz = g.nz; } else {
        dx = r.tx - p.x; dz = r.tz - p.z;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d; dz /= d;
      }
      p.x += dx * speed * dt; p.z += dz * speed * dt;
      const want = Math.atan2(-dx, -dz);
      let diff = want - r.model.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.model.root.rotation.y += diff * Math.min(1, dt * 6);
      r.model.animate(dt, speed, false, false, 0);
      if (r.t > 22 || Math.hypot(r.tx - p.x, r.tz - p.z) < 1) {
        this.group.remove(r.model.root);
        this.pool.push(r.model);
        this.residents.splice(i, 1);
      }
    }
  }

  /** Gates whose centre is within r metres. */
  near(x: number, z: number, r: number) {
    return this.gates.filter((g) => Math.abs(g.x - x) < r && Math.abs(g.z - z) < r);
  }
}
