import * as THREE from 'three';
import type { Placement } from './placement';
import type { GameState } from '../state/GameState';
import type { Interactable } from '../player/Interaction';
import { BIKE } from '../state/balance';

// Unlocked bikes leaning on railings and lamp posts. F mounts and dismounts; a bike
// left behind stays where it was dropped.

export interface Bike { mesh: THREE.Group; x: number; z: number; heading: number; ridden: boolean; lying: boolean; droppedAt: number; }

const FRAME_COLORS = [0x1f5fa8, 0xb8332b, 0x2b6e3c, 0xe8e2d6, 0x1b1b1b, 0xd8742a, 0x6b4a7a];

export function bikeMesh(color: number) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  const frame = new THREE.MeshLambertMaterial({ color });
  const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18).rotateY(Math.PI / 2), dark);
    w.position.set(0, 0.36, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).rotateZ(Math.PI / 2), steel);
    hub.position.set(0, 0.36, z);
    g.add(w, hub);
  }
  const tube = (len: number, x: number, y: number, z: number, rx: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), frame);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  tube(0.75, 0, 0.62, -0.05, 1.3); // top tube
  tube(0.68, 0, 0.5, -0.2, 0.75); // down tube
  tube(0.55, 0, 0.62, 0.2, -0.25); // seat tube
  tube(0.45, 0, 0.42, 0.38, 1.2); // chain stay
  tube(0.55, 0, 0.6, -0.5, -0.35); // fork
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.25), dark);
  seat.position.set(0, 0.92, 0.25);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6).rotateZ(Math.PI / 2), steel);
  bar.position.set(0, 1.0, -0.42);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), steel);
  stem.position.set(0, 0.9, -0.44);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), steel);
  basket.position.set(0, 0.9, -0.68);
  g.add(seat, bar, stem);
  if (Math.random() < 0.4) g.add(basket);
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return g;
}

export class Bikes {
  readonly group = new THREE.Group();
  readonly bikes: Bike[] = [];
  current: Bike | null = null;
  /** Set by main: mount or dismount the given bike. */
  onToggle: (b: Bike) => void = () => {};

  constructor(private place: Placement, private state: GameState) {}

  reset() {
    for (const b of this.bikes) this.group.remove(b.mesh);
    this.bikes.length = 0;
    this.current = null;
    const rng = this.state.rng;
    const n = rng.int(BIKE.count[0], BIKE.count[1]);
    const spots = this.place.spots.filter((s) => !s.green);
    for (let i = 0; i < n; i++) {
      const s = rng.pick(spots);
      const mesh = bikeMesh(rng.pick(FRAME_COLORS));
      const b: Bike = { mesh, x: s.x, z: s.z, heading: s.dir, ridden: false, lying: false, droppedAt: 0 };
      this.place_(b, 0.18); // leaning
      this.group.add(mesh);
      this.bikes.push(b);
    }
  }

  private place_(b: Bike, lean: number) {
    b.mesh.position.set(b.x, 0, b.z);
    b.mesh.rotation.set(0, b.heading, 0);
    b.mesh.rotateZ(lean);
  }

  /** Puts the bike down at (x, z); lying after a crash. */
  drop(b: Bike, x: number, z: number, heading: number, crashed: boolean) {
    b.x = x; b.z = z; b.heading = heading; b.ridden = false; b.lying = crashed;
    b.droppedAt = performance.now();
    this.place_(b, crashed ? 1.45 : 0.18);
    if (crashed) b.mesh.position.y = 0.05;
    if (this.current === b) this.current = null;
  }

  /** Keeps the ridden bike under the player. */
  follow(x: number, z: number, heading: number, lean: number) {
    const b = this.current;
    if (!b) return;
    b.mesh.position.set(x, 0, z);
    b.mesh.rotation.set(0, heading, 0);
    b.mesh.rotateZ(lean);
  }

  *interactables(px: number, pz: number): Iterable<Interactable> {
    if (this.current) return;
    for (const b of this.bikes) {
      if (Math.abs(b.x - px) > 3 || Math.abs(b.z - pz) > 3) continue;
      // Just got off: don't offer it again under the same key press.
      if (performance.now() - b.droppedAt < 400) continue;
      yield {
        x: b.x, z: b.z, reach: 1.7, hold: 0, key: 'KeyF',
        label: () => this.current ? null : b.lying ? 'Pick up the bike' : 'Ride the bike',
        act: () => this.onToggle(b),
      } as Interactable;
    }
  }
}
