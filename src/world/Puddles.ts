import * as THREE from 'three';

// Peeing against a wall (tipsy): a yellow arc of droplets from the player to the wall, a
// wet streak running down it and a puddle that spreads at its foot. Puddles and streaks
// fade after a minute.

const LIFE = 60; // real seconds
const MAX_DROPS = 160;
const GRAVITY = 9.8;

interface Puddle { mesh: THREE.Mesh; stain: THREE.Mesh; age: number; grow: number; full: number; }
interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; onWall: boolean; }

export class Puddles {
  readonly group = new THREE.Group();
  private list: Puddle[] = [];
  private geo = new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2);
  private stainGeo = new THREE.PlaneGeometry(0.4, 1).translate(0, 0.5, 0);
  private drops: Drop[] = [];
  private dropMesh: THREE.InstancedMesh;
  private stream: { x: number; z: number; fx: number; fz: number; wall: number; left: number; acc: number; puddle: Puddle } | null = null;
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private t = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private sc = new THREE.Matrix4();

  constructor() {
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xe8d040, transparent: true, opacity: 0.85 }), MAX_DROPS);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.group.add(this.dropMesh);
  }

  /** A puddle at (x, z); `grow` > 0 spreads it from small over that many seconds. */
  add(x: number, z: number, grow = 0, facing = 0): Puddle {
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8b84a, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, 0.04, z);
    const full = 0.7 + Math.random() * 0.5;
    mesh.scale.set(grow ? 0.1 : 1, 1, grow ? 0.1 : full);
    mesh.rotation.y = Math.random() * 6;
    // The wet streak on the wall above the puddle (hidden for a plain puddle).
    const stain = new THREE.Mesh(this.stainGeo, new THREE.MeshLambertMaterial({ color: 0x3a3020, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
    stain.visible = grow > 0;
    stain.rotation.y = facing;
    stain.scale.y = 0.01;
    this.group.add(mesh, stain);
    const p: Puddle = { mesh, stain, age: 0, grow, full };
    this.list.push(p);
    if (this.list.length > 12) this.remove(0);
    return p;
  }

  /** Starts a stream from the player at (x, z) facing `facing`, hitting a wall `wall` m ahead. */
  startStream(x: number, z: number, facing: number, wall: number, seconds: number) {
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    const reach = Math.max(0.35, wall - 0.04);
    const puddle = this.add(x + fx * Math.max(0.3, reach - 0.3), z + fz * Math.max(0.3, reach - 0.3), seconds, facing);
    puddle.stain.position.set(x + fx * reach, 0, z + fz * reach);
    this.stream = { x, z, fx, fz, wall: reach, left: seconds - 0.3, acc: 0, puddle };
  }

  private remove(i: number) {
    const p = this.list[i];
    this.group.remove(p.mesh, p.stain);
    (p.mesh.material as THREE.Material).dispose();
    (p.stain.material as THREE.Material).dispose();
    if (this.stream?.puddle === p) this.stream = null;
    this.list.splice(i, 1);
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.grow > 0) {
        const k = Math.min(1, p.age / p.grow);
        p.mesh.scale.set(0.1 + 0.9 * k, 1, (0.1 + 0.9 * k) * p.full);
        p.stain.scale.y = Math.min(0.75, 0.05 + k * 1.2);
      }
      const fade = Math.max(0, 1 - p.age / LIFE);
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = 0.6 * fade;
      (p.stain.material as THREE.MeshLambertMaterial).opacity = 0.35 * fade;
      if (p.age > LIFE) this.remove(i);
    }
    this.updateStream(dt);
  }

  private updateStream(dt: number) {
    const s = this.stream;
    if (s) {
      s.left -= dt;
      // Emit droplets from hip height, aimed in a low arc at the wall; the stream
      // wavers a little and weakens towards the end.
      s.acc += dt * (s.left > 0.6 ? 130 : 60);
      while (s.acc >= 1 && s.left > 0) {
        s.acc -= 1;
        if (this.drops.length >= MAX_DROPS) this.drops.shift();
        const t = performance.now() / 1000;
        const wob = Math.sin(t * 7) * 0.25;
        const speed = (s.left > 0.6 ? 2.4 : 1.6) + Math.random() * 0.2;
        const sx = -s.fz * wob, sz = s.fx * wob;
        this.drops.push({
          x: s.x + s.fx * 0.22, y: 0.88, z: s.z + s.fz * 0.22,
          vx: s.fx * speed + sx * 0.3, vy: 1.0 + Math.random() * 0.15, vz: s.fz * speed + sz * 0.3, onWall: false,
        });
      }
      if (s.left <= 0) this.stream = null;
    }
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.onWall) { d.y -= 1.2 * dt; }
      else {
        d.vy -= GRAVITY * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        // Hit the wall: run down it.
        if (s && (d.x - s.x) * s.fx + (d.z - s.z) * s.fz >= s.wall) { d.onWall = true; d.vx = d.vz = 0; }
      }
      if (d.y <= 0.03) { this.drops.splice(i, 1); continue; }
      if (d.onWall) this.m.makeScale(1, 2.5, 1).setPosition(d.x, d.y, d.z);
      else {
        // Stretched along the direction of flight, so the drops read as a stream.
        this.v.set(d.x, d.y, d.z);
        this.t.set(d.x + d.vx, d.y + d.vy, d.z + d.vz);
        this.m.lookAt(this.v, this.t, this.up).multiply(this.sc.makeScale(1, 1, 4)).setPosition(d.x, d.y, d.z);
      }
      this.dropMesh.setMatrixAt(n++, this.m);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    while (this.list.length) this.remove(0);
    this.drops = [];
    this.stream = null;
    this.dropMesh.count = 0;
  }
}
