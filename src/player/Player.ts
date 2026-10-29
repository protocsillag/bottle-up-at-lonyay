import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Input } from './input';

// M1 player: a capsule that walks the city at real speeds. Animation, jump and
// stamina arrive in M2.

export const WALK_SPEED = 2.5; // m/s
export const RUN_SPEED = 5; // m/s
const DEBUG_SPEED = 20; // m/s, G toggles; for exploring the map while testing
const RADIUS = 0.35;
const HEIGHT = 1.8;
const TURN_RATE = 12; // rad/s toward the movement direction
const ACCEL = 14; // m/s²

export class Player {
  readonly mesh: THREE.Group;
  readonly position = new THREE.Vector3();
  private velocity = new THREE.Vector2();
  private heading = 0;
  debugFast = false;

  constructor(private world: CollisionWorld, x: number, z: number) {
    this.position.set(x, 0, z);
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 6, 12).translate(0, HEIGHT / 2, 0),
      new THREE.MeshLambertMaterial({ color: 0xffd200 }),
    );
    // A dark visor so you can see which way the capsule faces.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.2), new THREE.MeshLambertMaterial({ color: 0x1b1b1b }));
    visor.position.set(0, HEIGHT - 0.3, -RADIUS + 0.05);
    body.castShadow = visor.castShadow = true;
    this.mesh.add(body, visor);
    this.syncMesh();
  }

  get speed() { return this.velocity.length(); }

  /** cameraYaw: the camera's heading, so W walks away from the camera. */
  update(dt: number, input: Input, cameraYaw: number) {
    if (input.wasPressed('KeyG')) this.debugFast = !this.debugFast;

    let fx = 0, fz = 0;
    if (input.isDown('KeyW')) fz -= 1;
    if (input.isDown('KeyS')) fz += 1;
    if (input.isDown('KeyA')) fx -= 1;
    if (input.isDown('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);

    const target = new THREE.Vector2();
    if (len > 0) {
      const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
      // Rotate the input from camera space into world space.
      const wx = (fx * cos + fz * sin) / len;
      const wz = (-fx * sin + fz * cos) / len;
      const max = this.debugFast ? DEBUG_SPEED : input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? RUN_SPEED : WALK_SPEED;
      target.set(wx * max, wz * max);
      const want = Math.atan2(-wx, -wz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
    }

    // Ease toward the target velocity.
    const dv = target.sub(this.velocity);
    const maxDv = ACCEL * dt * (this.debugFast ? 4 : 1);
    if (dv.length() > maxDv) dv.setLength(maxDv);
    this.velocity.add(dv);

    const [x, z] = this.world.move(this.position.x, this.position.z, this.velocity.x * dt, this.velocity.y * dt, RADIUS);
    // Kill velocity lost against walls so we slide instead of pushing.
    if (dt > 0) this.velocity.set((x - this.position.x) / dt, (z - this.position.z) / dt);
    this.position.set(x, 0, z);
    this.syncMesh();
  }

  private syncMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }
}
