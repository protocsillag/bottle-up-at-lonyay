import * as THREE from 'three';
import { CharacterModel } from '../player/CharacterModel';
import { HAZMESTER_COLORS } from './looks';
import type { CollisionWorld } from '../world/collision';
import type { Vec2 } from '../world/cityData';

// The caretaker: stocky, grey work coat, slippers, broom. Patrols the courtyard on a
// loop, spots you within 8 m in his view cone (or hears a noisy bin search), shouts
// and chases at walking speed.

const VIEW_DIST = 8;
const HEAR_DIST = 12;
const VIEW_COS = Math.cos((55 * Math.PI) / 180);
const PATROL_SPEED = 1.1;
const CHASE_SPEED = 2.5;
const RADIUS = 0.4;

export type HazmesterEvent = 'spotted' | 'caught' | null;

export class Hazmester {
  readonly model = new CharacterModel(HAZMESTER_COLORS, { hat: 'none', prop: 'broom', width: 1.25 });
  readonly pos = new THREE.Vector3();
  heading = 0;
  chasing = false;
  private wp = 0;
  private pause = 0;

  constructor(private patrol: Vec2[], private world: CollisionWorld) {
    this.pos.set(patrol[0][0], 0, patrol[0][1]);
    this.sync(0);
  }

  update(dt: number, px: number, pz: number, noisy: boolean): HazmesterEvent {
    let ev: HazmesterEvent = null;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (!this.chasing) {
      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      const inCone = d < VIEW_DIST && (dx * fx + dz * fz) / (d || 1) > VIEW_COS;
      if (inCone || (noisy && d < HEAR_DIST) || d < 1.6) { this.chasing = true; ev = 'spotted'; }
    }
    let tx: number, tz: number, speed: number;
    if (this.chasing) {
      tx = px; tz = pz; speed = CHASE_SPEED;
      if (d < 0.95) return 'caught';
    } else {
      const [wx, wz] = this.patrol[this.wp];
      tx = wx; tz = wz; speed = PATROL_SPEED;
      if (Math.hypot(wx - this.pos.x, wz - this.pos.z) < 0.4) {
        this.wp = (this.wp + 1) % this.patrol.length;
        this.pause = 1 + Math.random() * 2; // sweeps a bit at each corner
      }
      if (this.pause > 0) { this.pause -= dt; speed = 0; }
    }
    const mx = tx - this.pos.x, mz = tz - this.pos.z;
    const md = Math.hypot(mx, mz) || 1;
    if (speed > 0) {
      const [nx, nz] = this.world.move(this.pos.x, this.pos.z, (mx / md) * speed * dt, (mz / md) * speed * dt, RADIUS);
      this.pos.x = nx; this.pos.z = nz;
      const want = Math.atan2(-mx, -mz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 5);
    }
    this.sync(dt, speed);
    return ev;
  }

  private sync(dt: number, speed = 0) {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
    this.model.animate(dt, speed, false, false, 0);
  }
}
