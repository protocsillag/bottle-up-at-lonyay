import * as THREE from 'three';

// Low-poly street character built from boxes, with a procedural walk/run/jump cycle.
// Limbs hang from pivot groups at the shoulders and hips so they swing naturally.
// M7 swaps the pieces and colours from the character creator; this is the default look.

export interface CharacterColors {
  skin: number;
  hair: number;
  hat: number;
  top: number;
  bottoms: number;
  shoes: number;
}

export const DEFAULT_COLORS: CharacterColors = {
  skin: 0xe0b48f,
  hair: 0x4a3426,
  hat: 0xb33a2e, // beanie
  top: 0x4f6b45, // army-green parka
  bottoms: 0x3d4a66, // jeans
  shoes: 0x2a2522,
};

const HIP_Y = 0.92;

function box(w: number, h: number, d: number, color: number, y = -h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y, 0), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

/** A limb: pivot group at the joint, upper part, and a lower part with its own pivot. */
function limb(upperLen: number, lowerLen: number, width: number, upperColor: number, lowerColor: number, end?: THREE.Mesh) {
  const pivot = new THREE.Group();
  pivot.add(box(width, upperLen, width, upperColor));
  const knee = new THREE.Group();
  knee.position.y = -upperLen;
  knee.add(box(width * 0.9, lowerLen, width * 0.9, lowerColor));
  if (end) knee.add(end);
  pivot.add(knee);
  return { pivot, knee };
}

export class CharacterModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Group;
  private head: THREE.Group;
  private legL; private legR; private armL; private armR;
  private phase = 0;
  private airBlend = 0;
  private time = 0;

  constructor(c: CharacterColors = DEFAULT_COLORS) {
    this.root.add(this.body);

    // Hips and torso (the parka hangs a little below the waist).
    const hips = box(0.36, 0.16, 0.22, c.bottoms, 0.04);
    hips.position.y = HIP_Y;
    this.torso = new THREE.Group();
    this.torso.position.y = HIP_Y;
    const chest = box(0.44, 0.62, 0.26, c.top, 0.28);
    const hem = box(0.46, 0.14, 0.28, c.top, -0.04);
    // Collar and a dark zip line on the front (the model faces -z).
    const collar = box(0.3, 0.06, 0.22, c.top, 0.6);
    const zip = box(0.03, 0.6, 0.01, 0x222222, 0.28);
    zip.position.z = -0.135;
    this.torso.add(chest, hem, collar, zip);

    // Head with hair, beanie and a nose so the facing reads from behind the camera.
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    const skull = box(0.24, 0.27, 0.25, c.skin, 0.16);
    const hair = box(0.26, 0.1, 0.27, c.hair, 0.2);
    hair.position.z = 0.01;
    const beanie = box(0.27, 0.12, 0.27, c.hat, 0.31);
    const fold = box(0.28, 0.04, 0.28, c.hat, 0.24);
    const nose = box(0.05, 0.06, 0.05, c.skin, 0.13);
    nose.position.z = -0.14;
    const eyes = box(0.14, 0.03, 0.01, 0x1b1b1b, 0.19);
    eyes.position.z = -0.128;
    const neck = box(0.1, 0.06, 0.1, c.skin, 0.02);
    this.head.add(skull, hair, beanie, fold, nose, eyes, neck);
    this.torso.add(this.head);

    // Arms from the shoulders, legs from the hips.
    const hand = box(0.08, 0.09, 0.09, c.skin, -0.3);
    this.armL = limb(0.3, 0.28, 0.11, c.top, c.top, hand);
    this.armR = limb(0.3, 0.28, 0.11, c.top, c.top, hand.clone());
    this.armL.pivot.position.set(-0.29, 0.56, 0);
    this.armR.pivot.position.set(0.29, 0.56, 0);
    this.torso.add(this.armL.pivot, this.armR.pivot);

    const shoe = () => { const s = box(0.13, 0.08, 0.26, c.shoes, -0.42); s.position.z = -0.05; return s; };
    this.legL = limb(0.44, 0.4, 0.15, c.bottoms, c.bottoms, shoe());
    this.legR = limb(0.44, 0.4, 0.15, c.bottoms, c.bottoms, shoe());
    this.legL.pivot.position.set(-0.1, HIP_Y, 0);
    this.legR.pivot.position.set(0.1, HIP_Y, 0);

    this.body.add(hips, this.torso, this.legL.pivot, this.legR.pivot);
  }

  /**
   * speed: horizontal m/s. running: sprinting (more lean, bigger stride).
   * airborne: off the ground. vy: vertical velocity, to pick a rising or falling pose.
   */
  animate(dt: number, speed: number, running: boolean, airborne: boolean, vy: number) {
    this.time += dt;
    // Stride length grows with speed, so the cycle rate stays believable.
    const stride = running ? 1.7 : 1.25;
    this.phase += (speed / stride) * Math.PI * dt;
    const move = Math.min(1, speed / 2.5);
    this.airBlend = THREE.MathUtils.lerp(this.airBlend, airborne ? 1 : 0, 1 - Math.exp(-14 * dt));
    const a = this.airBlend;

    const s = Math.sin(this.phase);
    const swing = (running ? 0.85 : 0.55) * move;
    const lean = (running ? 0.22 : 0.06) * move;

    // Legs: positive x swings a limb forward (the model faces -z). Thigh swings,
    // knee bends backward on the back-swing; in the air one knee tucks up.
    const legL = s * swing, legR = -s * swing;
    this.legL.pivot.rotation.x = THREE.MathUtils.lerp(legL, 0.9, a);
    this.legR.pivot.rotation.x = THREE.MathUtils.lerp(legR, 0.2, a);
    this.legL.knee.rotation.x = THREE.MathUtils.lerp(-Math.max(0, -Math.cos(this.phase)) * swing * 1.3, -1.3, a);
    this.legR.knee.rotation.x = THREE.MathUtils.lerp(-Math.max(0, Math.cos(this.phase)) * swing * 1.3, -0.5, a);

    // Arms counter-swing; elbows bend more when running. In the air they go up and out.
    const armUp = vy > 0 ? 2.2 : 1.6;
    this.armL.pivot.rotation.x = THREE.MathUtils.lerp(-legL * 0.9, armUp, a);
    this.armR.pivot.rotation.x = THREE.MathUtils.lerp(-legR * 0.9, armUp, a);
    this.armL.pivot.rotation.z = THREE.MathUtils.lerp(-0.06, -0.5, a);
    this.armR.pivot.rotation.z = THREE.MathUtils.lerp(0.06, 0.5, a);
    const elbow = running ? 1.2 * move : 0.25 + 0.2 * move;
    this.armL.knee.rotation.x = this.armR.knee.rotation.x = THREE.MathUtils.lerp(elbow, 0.3, a);

    // Body: bob twice per cycle, lean forward with speed, idle breathing.
    const bob = Math.abs(Math.cos(this.phase)) * 0.05 * move * (1 - a);
    const breathe = Math.sin(this.time * 2.2) * 0.008 * (1 - move);
    this.body.position.y = bob;
    this.torso.rotation.x = -lean - breathe * 2;
    this.torso.rotation.y = s * 0.08 * move;
    this.head.rotation.x = lean * 0.6;
  }
}
