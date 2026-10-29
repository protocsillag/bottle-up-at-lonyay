import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Input } from './input';
import { CharacterModel, type CharacterColors, type CharacterOptions } from './CharacterModel';
import { BIKE } from '../state/balance';

const BIKE_TURN = 3.2; // rad/s
const BIKE_ACCEL = 5; // m/s²

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
  private holder = new THREE.Group();
  private sinceDrain = 0;
  stamina = STAMINA_MAX;
  exhausted = false;
  running = false;
  private shiftLatch = false;
  debugFast = false;
  /** G toggles the fast debug walk only when this is set (?debug or dev builds). */
  allowDebug = false;
  /** Speed multiplier (dog mess slows to 0.7). */
  speedMul = 1;
  onBike = false;
  /** Seconds left lying on the ground after a crash. */
  stun = 0;
  /** Set for one frame when a bike ride ends in a wall. */
  crashed = false;

  constructor(public world: CollisionWorld, x: number, z: number) {
    this.position.set(x, 0, z);
    this.mesh = this.holder;
    this.holder.add(this.model.root);
    this.syncMesh();
  }

  /** Swaps the character model (creator). */
  setLook(colors: CharacterColors, opts: CharacterOptions) {
    this.holder.remove(this.model.root);
    this.model = new CharacterModel(colors, opts);
    this.holder.add(this.model.root);
  }

  /** Knocked down: lie on the ground for `seconds`. */
  fall(seconds: number) {
    this.stun = seconds;
    this.velocity.set(0, 0);
  }

  /** Moves the player instantly (new run, entering or leaving a building). */
  teleport(x: number, z: number, heading = this.heading) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0);
    this.vy = 0;
    this.heading = heading;
    this.syncMesh();
  }

  get speed() { return this.velocity.length(); }
  get grounded() { return this.position.y <= 0; }
  /** Facing angle around y; 0 faces north (-z). */
  get facing() { return this.heading; }

  /** cameraYaw: the camera's heading, so W walks away from the camera. */
  update(dt: number, input: Input, cameraYaw: number) {
    if (this.allowDebug && input.wasPressed('KeyG')) this.debugFast = !this.debugFast;
    this.crashed = false;
    if (this.stun > 0) {
      this.stun -= dt;
      this.velocity.set(0, 0);
      this.model.animate(dt, 0, false, false, 0, 'fallen');
      this.syncMesh();
      return;
    }

    let fx = 0, fz = 0;
    if (input.isDown('KeyW')) fz -= 1;
    if (input.isDown('KeyS')) fz += 1;
    if (input.isDown('KeyA')) fx -= 1;
    if (input.isDown('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);

    const wantsRun = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (!wantsRun) this.shiftLatch = false;
    this.running = len > 0 && wantsRun && !this.shiftLatch && !this.exhausted && this.grounded && !this.debugFast && !this.onBike;

    const target = new THREE.Vector2();
    if (len > 0) {
      const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
      // Rotate the input from camera space into world space.
      const wx = (fx * cos + fz * sin) / len;
      const wz = (-fx * sin + fz * cos) / len;
      const max = this.debugFast ? DEBUG_SPEED : this.onBike ? BIKE.speed : (this.running ? RUN_SPEED : WALK_SPEED) * this.speedMul;
      const want = Math.atan2(-wx, -wz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), (this.onBike ? BIKE_TURN : TURN_RATE) * dt);
      if (this.onBike) {
        // A bike goes where it points; sharp turns slow it down.
        const k = Math.max(0.25, Math.cos(diff));
        target.set(-Math.sin(this.heading) * max * k, -Math.cos(this.heading) * max * k);
      } else target.set(wx * max, wz * max);
    } else if (!this.grounded) {
      // No input in the air: keep momentum.
      target.copy(this.velocity);
    }

    // Jump.
    if (input.wasPressed('Space') && this.grounded && this.stamina >= JUMP_COST && !this.onBike) {
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
    const maxDv = (this.onBike ? BIKE_ACCEL : this.grounded ? ACCEL : AIR_ACCEL) * dt * (this.debugFast ? 4 : 1);
    if (dv.length() > maxDv) dv.setLength(maxDv);
    this.velocity.add(dv);

    const before = this.velocity.length();
    const [x, z] = this.world.move(this.position.x, this.position.z, this.velocity.x * dt, this.velocity.y * dt, RADIUS);
    // Kill velocity lost against walls so we slide instead of pushing.
    if (dt > 0) this.velocity.set((x - this.position.x) / dt, (z - this.position.z) / dt);
    // Riding into a wall throws you off.
    if (this.onBike && before > BIKE.crashSpeed && this.velocity.length() < before * 0.45) this.crashed = true;

    // Vertical: simple ballistic hop over flat ground.
    let y = this.position.y + this.vy * dt;
    this.vy -= GRAVITY * dt;
    if (y <= 0) { y = 0; this.vy = 0; }
    this.position.set(x, y, z);

    this.model.animate(dt, this.speed, this.running, !this.grounded, this.vy, this.onBike ? 'ride' : 'normal');
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
