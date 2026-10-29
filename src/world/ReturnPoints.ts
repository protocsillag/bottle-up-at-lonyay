import * as THREE from 'three';
import type { GameState } from '../state/GameState';
import type { Interactable } from '../player/Interaction';
import { MOHU, SHOP_OPEN } from '../state/balance';
import { MachineModel, MACHINE_D } from '../minigames/mohu/MachineModel';
import { CharacterModel } from '../player/CharacterModel';
import { cosmetic, randomColors } from '../npc/looks';
import { binGeometry } from './items/models';

// The two return points: SPAR at Kinizsi/Ráday and Aldi in the Central Market Hall.
// Each has a pair of REpont machines and a bin, inside the shop interiors (M8). When you arrive, 0–2 people are already
// using the machines; rarely one machine shows "Megtelt" (full).

export interface ReturnPoint {
  id: 'spar' | 'aldi';
  name: string;
  /** Centre of the machine pair. */
  x: number; z: number;
  /** Direction the machines face (radians around y; 0 = north). */
  facing: number;
  group: THREE.Group;
  machines: MachineModel[];
  /** Per machine: real seconds until the person using it is done (0 = free). */
  busy: number[];
  people: (Queuer | null)[];
  megtelt: number; // machine index or −1
  rolled: boolean;
}

interface Queuer { model: CharacterModel; prop: THREE.Object3D; leaving: number; }

const PROPS = ['trolley', 'crate', 'sack'] as const;

function propMesh(kind: (typeof PROPS)[number]) {
  const g = new THREE.Group();
  const m = (geo: THREE.BufferGeometry, color: number) => { const x = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })); x.castShadow = true; g.add(x); return x; };
  if (kind === 'trolley') {
    // Pensioner's tartan shopping trolley.
    m(new THREE.BoxGeometry(0.34, 0.55, 0.24).translate(0, 0.45, 0), 0x7a2a2a);
    m(new THREE.BoxGeometry(0.36, 0.06, 0.26).translate(0, 0.5, 0), 0x2a4a7a);
    m(new THREE.CylinderGeometry(0.01, 0.01, 0.5).translate(0, 0.95, 0.1), 0x333333);
    m(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10).rotateZ(Math.PI / 2).translate(-0.15, 0.08, 0.1), 0x222222);
    m(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10).rotateZ(Math.PI / 2).translate(0.15, 0.08, 0.1), 0x222222);
  } else if (kind === 'crate') {
    m(new THREE.BoxGeometry(0.4, 0.3, 0.3).translate(0, 0.15, 0), 0x2b6e3c);
    for (let i = 0; i < 6; i++) m(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6).translate(-0.12 + (i % 3) * 0.12, 0.34, -0.06 + Math.floor(i / 3) * 0.12), 0xc23b32);
  } else {
    m(new THREE.SphereGeometry(0.4, 8, 6).scale(1, 1.3, 0.9).translate(0, 0.5, 0), 0xe8e2d0);
  }
  return g;
}

export class ReturnPoints {
  readonly group = new THREE.Group();
  readonly points: ReturnPoint[] = [];
  private its: Interactable[] = [];
  /** Starts the mini-game; set by main. */
  onUse: (p: ReturnPoint, machine: number) => void = () => {};
  /** Which machine the player is using (−1 = none). */
  inUse: { p: ReturnPoint; m: number } | null = null;

  constructor(private state: GameState, defs: { id: ReturnPoint['id']; name: string; x: number; z: number; facing: number }[]) {
    for (const d of defs) this.add(d.id, d.name, d.x, d.z, d.facing);
  }

  private add(id: ReturnPoint['id'], name: string, x: number, z: number, facing: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    const machines = [new MachineModel(), new MachineModel()];
    machines[0].root.position.x = 0.42;
    machines[1].root.position.x = -0.42;
    group.add(machines[0].root, machines[1].root);
    // The bin for refused items, beside the pair (to the left as seen from the front).
    const bin = new THREE.Mesh(binGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    bin.position.set(1.15, 0, 0);
    group.add(bin);
    this.group.add(group);
    const p: ReturnPoint = { id, name, x, z, facing, group, machines, busy: [0, 0], people: [null, null], megtelt: -1, rolled: false };
    this.points.push(p);
    const ix = x - Math.sin(facing) * 1.1, iz = z - Math.cos(facing) * 1.1;
    this.its.push({
      x: ix, z: iz, reach: 2.4, hold: 0,
      label: () => this.inUse ? null : `Use the bottle machine — ${name}`,
      blocked: () => {
        if (!this.state.shopsOpen) return `${name}: closed — opens at 0${SHOP_OPEN}:00`;
        if (!this.state.bag.length) return 'Your bag is empty';
        if (this.freeMachine(p) < 0) {
          const wait = Math.min(...p.busy.filter((b, i) => i !== p.megtelt && b > 0));
          return `Wait in line — a machine frees up in ${Math.ceil(wait)} s`;
        }
        return null;
      },
      act: () => {
        const m = this.freeMachine(p);
        if (m < 0) return;
        this.inUse = { p, m };
        this.onUse(p, m);
      },
    });
  }

  /** The working, free machine nearest the player's side, or −1. */
  private freeMachine(p: ReturnPoint) {
    for (const i of [0, 1]) if (i !== p.megtelt && p.busy[i] <= 0) return i;
    return -1;
  }

  /** World collision footprint for the machine pair. */
  footprint(p: ReturnPoint) { return { x: p.x, z: p.z, w: 2.6, d: MACHINE_D + 0.1, rot: p.facing }; }

  private roll(p: ReturnPoint) {
    const rng = this.state.rng;
    p.rolled = true;
    p.megtelt = rng.chance(MOHU.megtelt) ? rng.int(0, 1) : -1;
    const r = rng.next();
    const n = r < MOHU.queueOdds[0] ? 0 : r < MOHU.queueOdds[0] + MOHU.queueOdds[1] ? 1 : 2;
    const slots = [0, 1].filter((i) => i !== p.megtelt);
    for (let k = 0; k < n; k++) {
      // With one machine full, the second person waits behind the first.
      const i = slots[k % slots.length];
      p.busy[i] += rng.range(MOHU.queueTime[0], MOHU.queueTime[1]);
      if (!p.people[i]) this.spawnPerson(p, i);
    }
  }

  private spawnPerson(p: ReturnPoint, i: number) {
    const kind = cosmetic.pick(PROPS);
    const model = new CharacterModel(randomColors(cosmetic), { hat: kind === 'trolley' ? 'flatcap' : kind === 'sack' ? 'beanie' : 'none' });
    const prop = propMesh(kind);
    const lx = i === 0 ? 0.42 : -0.42;
    model.root.position.set(lx, 0, -0.75);
    model.root.rotation.y = Math.PI; // facing the machine (+z local)
    prop.position.set(lx + (i === 0 ? 0.45 : -0.45), 0, -0.7);
    p.group.add(model.root, prop);
    p.people[i] = { model, prop, leaving: 0 };
  }

  reset() {
    for (const p of this.points) {
      for (const q of p.people) if (q) p.group.remove(q.model.root, q.prop);
      p.people = [null, null];
      p.busy = [0, 0];
      p.megtelt = -1;
      p.rolled = false;
    }
    this.inUse = null;
  }

  update(dt: number, px: number, pz: number) {
    const open = this.state.shopsOpen;
    for (const p of this.points) {
      const d = Math.hypot(px - p.x, pz - p.z);
      if (!p.rolled && d < 30 && open) this.roll(p);
      if (p.rolled && d > 80 && !this.inUse) {
        // Walked away: the next arrival rolls a new queue.
        p.rolled = false;
        for (let i = 0; i < 2; i++) {
          const q = p.people[i];
          if (q) p.group.remove(q.model.root, q.prop);
          p.people[i] = null;
          p.busy[i] = 0;
        }
      }
      for (let i = 0; i < 2; i++) {
        const q = p.people[i];
        if (p.busy[i] > 0) {
          p.busy[i] = Math.max(0, p.busy[i] - dt);
          if (q) {
            // Feeding motion.
            q.model.animate(dt, 0, false, false, 0);
          }
        } else if (q) {
          // Done: walk off to the side and vanish.
          q.leaving += dt;
          const side = i === 0 ? 1 : -1;
          q.model.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          q.model.root.position.x += side * 1.3 * dt;
          q.prop.position.x += side * 1.3 * dt;
          q.model.animate(dt, 1.3, false, false, 0);
          if (q.leaving > 4) { p.group.remove(q.model.root, q.prop); p.people[i] = null; }
        }
        if (this.inUse?.p === p && this.inUse.m === i) continue;
        const screen = !open ? { kind: 'closed' as const } : i === p.megtelt ? { kind: 'megtelt' as const } : p.busy[i] > 0 ? { kind: 'busy' as const } : { kind: 'idle' as const };
        p.machines[i].setScreen(screen);
      }
    }
  }

  stop() { this.inUse = null; }

  *interactables(): Iterable<Interactable> { yield* this.its; }
}
