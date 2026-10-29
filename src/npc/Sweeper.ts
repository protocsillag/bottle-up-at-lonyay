import * as THREE from 'three';
import type { RoadGraph } from './RoadGraph';
import { hourIn, hourOf } from '../state/time';

// The street sweeper: a small orange truck that drives the roads between 02:00 and
// 07:00, brushing loose street items away. It starts near the player each night so
// you actually meet it.

const SPEED = 3.5; // m/s
const SWEEP_R = 6;

function truckMesh() {
  const g = new THREE.Group();
  const m = (geo: THREE.BufferGeometry, color: number, emissive = 0) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 1 : 0 }));
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  m(new THREE.BoxGeometry(1.7, 1.6, 1.6).translate(0, 1.3, -1.4), 0xe8e2d6); // cab
  m(new THREE.BoxGeometry(1.5, 0.6, 1.0).translate(0, 1.6, -2.2), 0x2b3a4a); // windscreen
  m(new THREE.BoxGeometry(1.8, 1.9, 2.6).translate(0, 1.45, 0.8), 0xe0702a); // hopper
  m(new THREE.BoxGeometry(1.82, 0.2, 2.62).translate(0, 1.6, 0.8), 0xe8e2d6); // stripe
  for (const [x, z] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) {
    m(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12).rotateZ(Math.PI / 2).translate(x, 0.38, z), 0x1b1b1b);
  }
  const brushL = m(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 10).translate(-0.9, 0.08, -2.1), 0x3a3a3a);
  const brushR = m(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 10).translate(0.9, 0.08, -2.1), 0x3a3a3a);
  const beacon = m(new THREE.BoxGeometry(0.3, 0.2, 0.3).translate(0, 2.2, -1.4), 0xffa000, 0xff8a00);
  return { g, brushL, brushR, beacon };
}

export class Sweeper {
  readonly group = new THREE.Group();
  private truck = truckMesh();
  private edge = -1;
  private from = -1;
  private t = 0;
  private sweepTimer = 0;
  active = false;
  x = 0; z = 0;
  private heading = 0;
  /** Clears items around a point; set by main. */
  onSweep: (x: number, z: number, r: number) => void = () => {};

  constructor(private graph: RoadGraph) {
    this.group.add(this.truck.g);
    this.group.visible = false;
  }

  reset() { this.active = false; this.group.visible = false; this.edge = -1; }

  update(dt: number, minute: number, px: number, pz: number) {
    const night = hourIn(hourOf(minute), 2, 7);
    if (!night) {
      if (this.active) this.reset();
      return;
    }
    if (!this.active) {
      // Start on a road 60–140 m from the player.
      const edges = this.graph.edgesNear(px, pz, 60, 140).filter((e) => this.graph.edges[e].road);
      if (!edges.length) return;
      this.edge = edges[Math.floor(Math.random() * edges.length)];
      this.from = this.graph.edges[this.edge].a;
      this.t = 0;
      this.active = true;
      this.group.visible = true;
    }
    this.t += SPEED * dt;
    const E = this.graph.edges[this.edge];
    if (this.t >= E.len) {
      const node = this.graph.other(this.edge, this.from);
      const opts = this.graph.nodes[node].edges.filter((e) => e !== this.edge && this.graph.edges[e].road);
      // Prefer roads that lead toward the player so the sweeper stays in the neighbourhood.
      opts.sort((a, b) => this.distTo(a, node, px, pz) - this.distTo(b, node, px, pz));
      const next = opts.length ? (Math.random() < 0.6 ? opts[0] : opts[Math.floor(Math.random() * opts.length)]) : this.edge;
      this.t -= E.len;
      this.from = node;
      this.edge = next;
    }
    const A = this.graph.nodes[this.from], B = this.graph.nodes[this.graph.other(this.edge, this.from)];
    const len = this.graph.edges[this.edge].len;
    const k = Math.min(1, this.t / len);
    // Keep to the right-hand lane.
    const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
    this.x = A.x + (B.x - A.x) * k - uz * 1.6;
    this.z = A.z + (B.z - A.z) * k + ux * 1.6;
    const want = Math.atan2(-ux, -uz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, dt * 3);
    this.truck.g.position.set(this.x, 0, this.z);
    this.truck.g.rotation.y = this.heading;
    this.truck.brushL.rotation.y += dt * 12;
    this.truck.brushR.rotation.y -= dt * 12;
    this.truck.beacon.visible = Math.sin(performance.now() / 120) > 0;
    this.sweepTimer -= dt;
    if (this.sweepTimer <= 0) {
      this.sweepTimer = 0.4;
      this.onSweep(this.x, this.z, SWEEP_R);
    }
  }

  private distTo(e: number, from: number, px: number, pz: number) {
    const n = this.graph.nodes[this.graph.other(e, from)];
    return Math.hypot(n.x - px, n.z - pz);
  }

  /** Pushes the player out of the truck's footprint. */
  pushOut(x: number, z: number, r: number): [number, number] {
    if (!this.active) return [x, z];
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz), min = r + 1.7;
    if (d < min && d > 1e-4) return [this.x + (dx / d) * min, this.z + (dz / d) * min];
    return [x, z];
  }
}
