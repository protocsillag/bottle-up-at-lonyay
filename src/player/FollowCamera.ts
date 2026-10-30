import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Input } from './input';

// Third-person orbit camera behind the player. Mouse turns it, the wheel zooms, and
// it pulls in when a wall sits between the camera and the player.

const MOUSE_SENS = 0.0025;
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.2;
const LOOK_HEIGHT = 1.6;

export class FollowCamera {
  yaw = 0;
  /** Mouse sensitivity multiplier (settings). */
  sensitivity = 1;
  /** Tipsy wobble: camera roll (rad) and vertical bob (m), set each frame. */
  roll = 0;
  bob = 0;
  pitch = 0.3;
  distance = 6;
  private current = 6;
  private smoothY = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, public world: CollisionWorld) {}

  update(dt: number, input: Input, target: THREE.Vector3) {
    this.yaw -= input.mouseDX * MOUSE_SENS * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * MOUSE_SENS * this.sensitivity, MIN_PITCH, MAX_PITCH);
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + input.wheel * 0.1), 2.5, 40);

    // Follow jumps only partly so the view does not bounce.
    this.smoothY = THREE.MathUtils.lerp(this.smoothY, target.y * 0.5, 1 - Math.exp(-6 * dt));
    const fx = target.x, fz = target.z, fy = this.smoothY + LOOK_HEIGHT;
    const horiz = Math.cos(this.pitch) * this.distance;
    const dx = Math.sin(this.yaw) * horiz;
    const dz = Math.cos(this.yaw) * horiz;

    // Pull in toward the player if a wall blocks the view (only walls below camera height matter,
    // and the shortest building is taller than the camera at normal zoom).
    const hit = this.world.raycast(fx, fz, fx + dx, fz + dz);
    const want = hit < 1 ? Math.max(0.8, this.distance * hit - 0.4) : this.distance;
    // Snap in fast, ease out slowly.
    this.current = want < this.current ? want : THREE.MathUtils.lerp(this.current, want, 1 - Math.exp(-3 * dt));

    const k = this.current / this.distance;
    this.camera.position.set(fx + dx * k, fy + Math.sin(this.pitch) * this.current, fz + dz * k);
    this.camera.position.y += this.bob;
    this.camera.lookAt(fx, fy, fz);
    if (this.roll) this.camera.rotateZ(this.roll);
  }
}
