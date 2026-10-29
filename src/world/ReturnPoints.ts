import * as THREE from 'three';
import type { CityData, Vec2 } from './cityData';
import type { Placement } from './placement';
import type { GameState } from '../state/GameState';
import type { Interactable } from '../player/Interaction';
import { SHOP_OPEN } from '../state/balance';

// The two return points: SPAR at Kinizsi/Ráday and Aldi in the Central Market Hall.
// M3 placeholder: a yellow box pair on the pavement that accepts every item at 3 per second.

export interface ReturnPoint {
  id: 'spar' | 'aldi';
  name: string;
  /** Where the machines stand (pavement in front of the shop). */
  x: number; z: number;
  /** Direction the machines face (radians around y; 0 = north). */
  facing: number;
  group: THREE.Group;
}

const FEED_RATE = 3; // items per real second

export class ReturnPoints {
  readonly group = new THREE.Group();
  readonly points: ReturnPoint[] = [];
  private feeding: ReturnPoint | null = null;
  private acc = 0;
  private its: Interactable[] = [];

  constructor(city: CityData, place: Placement, private state: GameState) {
    const spar = city.landmarks.spar;
    if (spar) this.add('spar', 'SPAR, Kinizsi utca', place.nearestFree(spar, 1.4), spar);
    const hall = city.buildings.find((b) => b.name === 'Központi Vásárcsarnok');
    if (hall) {
      // Main entrance: the middle of the short north-west facade facing Fővám tér.
      const [a, b] = mostNorthWestEdge(hall.outer);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
      if (nx + nz > 0) { nx = -nx; nz = -nz; }
      this.add('aldi', 'Aldi, Central Market Hall', place.nearestFree([mx + nx * 3, mz + nz * 3], 1.4), [mx, mz]);
    } else if (city.landmarks.marketHall) {
      this.add('aldi', 'Aldi, Central Market Hall', place.nearestFree(city.landmarks.marketHall, 1.4), city.landmarks.marketHall);
    }
  }

  private add(id: ReturnPoint['id'], name: string, [x, z]: Vec2, shop: Vec2) {
    // Back to the shop wall, front to the street.
    const facing = Math.atan2(-(x - shop[0]), -(z - shop[1]));
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    const body = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const front = new THREE.MeshLambertMaterial({ color: 0xffd200 });
    for (const dx of [-0.45, 0.45]) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.6), body);
      top.position.set(dx, 1.35, 0);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), front);
      bottom.position.set(dx, 0.4, 0);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0x444444 }));
      hole.position.set(dx, 1.25, -0.301);
      hole.rotation.y = Math.PI;
      top.castShadow = bottom.castShadow = true;
      group.add(top, bottom, hole);
    }
    this.group.add(group);
    const p: ReturnPoint = { id, name, x, z, facing, group };
    this.points.push(p);
    // The interaction point sits in front of the machines.
    const ix = x - Math.sin(facing) * 0.9, iz = z - Math.cos(facing) * 0.9;
    this.its.push({
      x: ix, z: iz, reach: 2.2, hold: 0,
      label: () => this.feeding === p ? null : `Use the bottle machine — ${name}`,
      blocked: () => {
        if (!this.state.shopsOpen) return `${name}: closed — opens at 0${SHOP_OPEN}:00`;
        if (!this.state.bag.length) return 'Your bag is empty';
        return null;
      },
      act: () => { this.feeding = p; this.acc = 0; },
    });
  }

  get isFeeding() { return this.feeding !== null; }
  get current() { return this.feeding; }

  update(dt: number, px: number, pz: number) {
    const p = this.feeding;
    if (!p) return;
    if (Math.hypot(px - p.x, pz - p.z) > 3 || !this.state.shopsOpen || !this.state.bag.length) {
      if (!this.state.bag.length) this.state.toast('Bag empty — receipt printed', 'good');
      else if (!this.state.shopsOpen) this.state.toast('The shop just closed!', 'bad');
      this.feeding = null;
      return;
    }
    this.acc += dt * FEED_RATE;
    while (this.acc >= 1 && this.state.bag.length) {
      this.acc--;
      this.state.takeFromBag();
      this.state.payItem();
    }
  }

  stop() { this.feeding = null; }

  *interactables(): Iterable<Interactable> { yield* this.its; }
}

function mostNorthWestEdge(ring: Vec2[]): [Vec2, Vec2] {
  // The edge whose midpoint is furthest toward -x -z, among edges longer than 15 m.
  let best: [Vec2, Vec2] = [ring[0], ring[1]], bestV = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 15) continue;
    const v = (a[0] + b[0]) / 2 + (a[1] + b[1]) / 2;
    if (v < bestV) { bestV = v; best = [a, b]; }
  }
  return best;
}
