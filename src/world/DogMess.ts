import * as THREE from 'three';
import type { Placement } from './placement';
import type { GameState } from '../state/GameState';
import { DOG } from '../state/balance';

// Dog mess on the pavement: a few fixed piles per run plus whatever the dog walkers'
// dogs leave. Stepping in one slows you to 70% for a real minute and leaves brown
// footprints. Bikes ride over safely.

const MAX_PILES = 90;
const MAX_PRINTS = 160;

export class DogMess {
  readonly group = new THREE.Group();
  private piles: THREE.Vector3[] = [];
  private pileMesh: THREE.InstancedMesh;
  private prints: { x: number; z: number; a: number; age: number }[] = [];
  private printMesh: THREE.InstancedMesh;
  private printMat: THREE.MeshBasicMaterial;
  /** Real seconds of slowdown left. */
  slowed = 0;
  private sinceStep = 0;
  private left = false;
  private dirty = true;

  constructor(private place: Placement, private state: GameState) {
    const geo = new THREE.SphereGeometry(0.11, 6, 4).scale(1, 0.55, 1).translate(0, 0.03, 0);
    const blob2 = new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.8, 1).translate(0.04, 0.08, 0.02);
    this.pileMesh = new THREE.InstancedMesh(mergeTwo(geo, blob2), new THREE.MeshLambertMaterial({ color: 0x5a3a1c }), MAX_PILES);
    this.pileMesh.count = 0;
    this.pileMesh.frustumCulled = false;
    this.printMat = new THREE.MeshBasicMaterial({ color: 0x4a2f16, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 });
    this.printMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.26).rotateX(-Math.PI / 2), this.printMat, MAX_PRINTS);
    this.printMesh.count = 0;
    this.printMesh.frustumCulled = false;
    this.group.add(this.pileMesh, this.printMesh);
  }

  reset() {
    this.piles = [];
    this.prints = [];
    this.slowed = 0;
    const rng = this.state.rng;
    for (let i = 0; i < DOG.fixedPiles; i++) {
      const s = rng.pick(this.place.spots);
      this.piles.push(new THREE.Vector3(s.x + rng.range(-1, 1), rng.range(0, 6.28), s.z + rng.range(-1, 1)));
    }
    this.dirty = true;
  }

  add(x: number, z: number) {
    if (!this.place.free(x, z, 0.2)) return;
    if (this.piles.length >= MAX_PILES) this.piles.shift();
    this.piles.push(new THREE.Vector3(x, Math.random() * 6.28, z));
    this.dirty = true;
  }

  /** Call after the player moved. Returns true the moment you step in one. */
  update(dt: number, px: number, pz: number, heading: number, grounded: boolean, onBike: boolean, moved: number): boolean {
    let stepped = false;
    if (grounded && !onBike) {
      for (let i = 0; i < this.piles.length; i++) {
        const p = this.piles[i];
        if (Math.abs(p.x - px) < 0.4 && Math.abs(p.z - pz) < 0.4 && Math.hypot(p.x - px, p.z - pz) < 0.38) {
          this.piles.splice(i, 1); // squashed flat
          this.dirty = true;
          stepped = true;
          this.slowed = DOG.slowSeconds;
          this.state.stats.dogIncidents++;
          break;
        }
      }
    }
    if (this.slowed > 0) {
      this.slowed = Math.max(0, this.slowed - dt);
      // Brown footprints, fading as the shoes wipe clean.
      this.sinceStep += moved;
      if (this.sinceStep > 0.6 && !onBike) {
        this.sinceStep = 0;
        this.left = !this.left;
        const side = this.left ? 0.12 : -0.12;
        const c = Math.cos(heading), s = Math.sin(heading);
        this.prints.push({ x: px + c * side, z: pz - s * side, a: heading, age: 0 });
        if (this.prints.length > MAX_PRINTS) this.prints.shift();
        this.dirty = true;
      }
    }
    for (const p of this.prints) p.age += dt;
    while (this.prints.length && this.prints[0].age > 40) { this.prints.shift(); this.dirty = true; }
    if (this.dirty) this.rebuild();
    return stepped;
  }

  private rebuild() {
    this.dirty = false;
    const m = new THREE.Matrix4();
    this.piles.forEach((p, i) => this.pileMesh.setMatrixAt(i, m.makeRotationY(p.y).setPosition(p.x, 0, p.z)));
    this.pileMesh.count = this.piles.length;
    this.pileMesh.instanceMatrix.needsUpdate = true;
    this.prints.forEach((p, i) => this.printMesh.setMatrixAt(i, m.makeRotationY(p.a).setPosition(p.x, 0.07, p.z)));
    this.printMesh.count = this.prints.length;
    this.printMesh.instanceMatrix.needsUpdate = true;
  }
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const pa = a.toNonIndexed(), pb = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const A = pa.getAttribute(name).array as Float32Array, B = pb.getAttribute(name).array as Float32Array;
    const arr = new Float32Array(A.length + B.length);
    arr.set(A); arr.set(B, A.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return g;
}
