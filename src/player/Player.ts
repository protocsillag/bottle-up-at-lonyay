import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Input } from './input';
import { CharacterModel } from './CharacterModel';

// The player: walks the city at real speeds, runs on stamina, jumps, and collides with
// walls as a circle (capsule seen from above).

export const WALK_SPEED = 2.5; // m/s
export const RUN_SPEED = 5; // m/s
const DEBUG_SPEED = 20; // m/s, G toggles; for exploring the map while testing
const RADIUS = 0.35;
const TURN_RATE = 12; // rad/s toward the movement direction
const ACCEL = 14; // m/s² on the ground
const AIR_ACCEL = 4; // m/s² in the air

const GRAVITY = 16; // m/s²
const JUMP_SPEED = 5; // m/s up: about 0.8 m high, 0.6 s in the air

// Stamina: a full bar is 10 s of running; it refills in 5 s once you stop running.
export const STAMINA_MAX = 100;
const RUN_DRAIN = 10; // per second
const JUMP_COST = 8;
const REGEN = 20; // per second
const REGEN_DELAY = 0.8; // s after the last drain
const EXHAUSTED_UNTIL = 30; // emptying the bar blocks running until it refills this far
// and Shift is pressed again, so holding Shift does not stutter between run and walk.

export class Player {
  readonly mesh: THREE.Group;
  readonly position = new THREE.Vector3();
  private velocity = new THREE.Vector2();
  private vy = 0;
  private heading = 0;
  private model = new CharacterModel();
  private sinceDrain = 0;
  stamina = STAMINA_MAX;
  exhausted = false;
  running = false;
  private shiftLatch = false;
  debugFast = false;

  constructor(private world: CollisionWorld, x: number, z: number) {
    this.position.set(x, 0, z);
    this.mesh = this.model.root;
    this.syncMesh();
  }

  get speed() { return this.velocity.length(); }
  get grounded() { return this.position.y <= 0; }
  /** Facing angle around y; 0 faces north (-z). */
  get facing() { return this.heading; }

  /** cameraYaw: the camera's heading, so W walks away from the camera. */
  update(dt: number, input: Input, cameraYaw: number) {
    if (input.wasPressed('KeyG')) this.debugFast = !this.debugFast;

    let fx = 0, fz = 0;
    if (input.isDown('KeyW')) fz -= 1;
    if (input.isDown('KeyS')) fz += 1;
    if (input.isDown('KeyA')) fx -= 1;
    if (input.isDown('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);

    const wantsRun = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (!wantsRun) this.shiftLatch = false;
    this.running = len > 0 && wantsRun && !this.shiftLatch && !this.exhausted && this.grounded && !this.debugFast;

    const target = new THREE.Vector2();
    if (len > 0) {
      const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
      // Rotate the input from camera space into world space.
      const wx = (fx * cos + fz * sin) / len;
      const wz = (-fx * sin + fz * cos) / len;
      const max = this.debugFast ? DEBUG_SPEED : this.running ? RUN_SPEED : WALK_SPEED;
      target.set(wx * max, wz * max);
      const want = Math.atan2(-wx, -wz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
    } else if (!this.grounded) {
      // No input in the air: keep momentum.
      target.copy(this.velocity);
    }

    // Jump.
    if (input.wasPressed('Space') && this.grounded && this.stamina >= JUMP_COST) {
      this.vy = JUMP_SPEED;
      this.drain(JUMP_COST);
    }

    // Stamina.
    if (this.running && this.speed > WALK_SPEED * 0.8) this.drain(RUN_DRAIN * dt);
    this.sinceDrain += dt;
    if (this.sinceDrain > REGEN_DELAY) this.stamina = Math.min(STAMINA_MAX, this.stamina + REGEN * dt);
    if (this.stamina <= 0 && !this.exhausted) { this.exhausted = true; this.shiftLatch = true; }
    if (this.exhausted && this.stamina >= EXHAUSTED_UNTIL) this.exhausted = false;

    // Ease toward the target velocity.
    const dv = target.sub(this.velocity);
    const maxDv = (this.grounded ? ACCEL : AIR_ACCEL) * dt * (this.debugFast ? 4 : 1);
    if (dv.length() > maxDv) dv.setLength(maxDv);
    this.velocity.add(dv);

    const [x, z] = this.world.move(this.position.x, this.position.z, this.velocity.x * dt, this.velocity.y * dt, RADIUS);
    // Kill velocity lost against walls so we slide instead of pushing.
    if (dt > 0) this.velocity.set((x - this.position.x) / dt, (z - this.position.z) / dt);

    // Vertical: simple ballistic hop over flat ground.
    let y = this.position.y + this.vy * dt;
    this.vy -= GRAVITY * dt;
    if (y <= 0) { y = 0; this.vy = 0; }
    this.position.set(x, y, z);

    this.model.animate(dt, this.speed, this.running, !this.grounded, this.vy);
    this.syncMesh();
  }

  private drain(amount: number) {
    this.stamina = Math.max(0, this.stamina - amount);
    this.sinceDrain = 0;
  }

  private syncMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }
}
