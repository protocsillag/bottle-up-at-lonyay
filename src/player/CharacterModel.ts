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

export type HatKind = 'none' | 'beanie' | 'flatcap' | 'bucket' | 'cap';
export type HairKind = 'short' | 'long' | 'mohawk' | 'bald';
export type FaceKind = 'none' | 'beard' | 'moustache' | 'stubble';
export type TopKind = 'parka' | 'leather' | 'tweed' | 'coat' | 'tee' | 'hoodie';
export type BottomsKind = 'jeans' | 'ripped' | 'shorts' | 'trousers' | 'tracksuit';
export type ShoesKind = 'boots' | 'sandals' | 'sneakers' | 'slippers';
export type AccessoryKind = 'none' | 'sunglasses' | 'earring' | 'chain' | 'backpack' | 'dog';

/** Pieces of a character. Every field is optional; NPCs use a few, the creator sets all. */
export interface CharacterOptions {
  hat?: HatKind;
  hairStyle?: HairKind;
  face?: FaceKind;
  top?: TopKind;
  bottomsStyle?: BottomsKind;
  shoesStyle?: ShoesKind;
  accessory?: AccessoryKind;
  /** Carried in the right hand (NPCs). */
  prop?: 'broom' | 'bag';
  /** Body width multiplier (stocky házmester). */
  width?: number;
  /** Overall scale. */
  scale?: number;
}

const HIP_Y = 0.92;

function box(w: number, h: number, d: number, color: number, y = -h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y, 0), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number) { o.position.set(x, y, z); return o; }

/** A limb: pivot group at the joint, upper part, and a lower part with its own pivot. */
function limb(upperLen: number, lowerLen: number, width: number, upperColor: number, lowerColor: number, end?: THREE.Object3D) {
  const pivot = new THREE.Group();
  pivot.add(box(width, upperLen, width, upperColor));
  const knee = new THREE.Group();
  knee.position.y = -upperLen;
  knee.add(box(width * 0.9, lowerLen, width * 0.9, lowerColor));
  if (end) knee.add(end);
  pivot.add(knee);
  return { pivot, knee };
}

const lighten = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const darken = (c: number, k: number) => new THREE.Color(c).multiplyScalar(1 - k).getHex();

let bandTex: THREE.Texture | null = null;
function bandTexture() {
  if (bandTex) return bandTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(240,232,210,0.85)';
  g.beginPath(); g.arc(64, 58, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(40,30,50,0.9)';
  g.beginPath(); g.moveTo(40, 74); g.lineTo(64, 30); g.lineTo(88, 74); g.fill();
  g.fillStyle = 'rgba(240,232,210,0.9)';
  g.font = 'bold 22px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('ZÚZMARA', 64, 116);
  bandTex = new THREE.CanvasTexture(c);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  return bandTex;
}

/** A small dog on a string that trots beside its owner. */
function dog(color: number) {
  const g = new THREE.Group();
  const body = box(0.18, 0.18, 0.46, color, 0.36);
  const head = at(box(0.16, 0.16, 0.18, color, 0.0), 0, 0.5, -0.29);
  const snout = at(box(0.07, 0.07, 0.1, 0x2a1d15, 0), 0, 0.46, -0.42);
  const ear = at(box(0.05, 0.08, 0.04, darken(color, 0.3), 0), -0.06, 0.6, -0.27);
  const ear2 = at(box(0.05, 0.08, 0.04, darken(color, 0.3), 0), 0.06, 0.6, -0.27);
  const tail = at(box(0.04, 0.14, 0.04, color, 0.07), 0, 0.42, 0.24);
  tail.rotation.x = -0.6;
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.06, -0.17], [0.06, -0.17], [-0.06, 0.17], [0.06, 0.17]]) {
    const l = at(box(0.05, 0.27, 0.05, darken(color, 0.15), -0.135), x, 0.27, z);
    legs.push(l);
  }
  g.add(body, head, snout, ear, ear2, tail, ...legs);
  g.userData.legs = legs;
  g.userData.tail = tail;
  return g;
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
  private pet: THREE.Group | null = null;

  constructor(c: CharacterColors = DEFAULT_COLORS, opts: CharacterOptions = {}) {
    this.root.add(this.body);
    this.body.scale.set((opts.width ?? 1) * (opts.scale ?? 1), opts.scale ?? 1, (opts.width ?? 1) * (opts.scale ?? 1));
    const top = opts.top ?? 'parka';
    const bottoms = opts.bottomsStyle ?? 'jeans';
    const shoes = opts.shoesStyle ?? 'sneakers';
    const acc = opts.accessory ?? 'none';

    // Hips and torso.
    const hips = box(0.36, 0.16, 0.22, c.bottoms, 0.04);
    hips.position.y = HIP_Y;
    this.torso = new THREE.Group();
    this.torso.position.y = HIP_Y;
    const chestColor = top === 'tee' ? c.top : c.top;
    this.torso.add(box(0.44, 0.62, 0.26, chestColor, 0.28));
    switch (top) {
      case 'parka':
        this.torso.add(box(0.46, 0.14, 0.28, c.top, -0.04), box(0.3, 0.06, 0.22, c.top, 0.6), at(box(0.03, 0.6, 0.01, 0x222222, 0.28), 0, 0, -0.135));
        break;
      case 'leather': {
        this.torso.add(box(0.45, 0.1, 0.27, c.top, -0.02), at(box(0.16, 0.5, 0.01, 0xd8d2c4, 0.3), 0, 0, -0.132));
        // Lapels and studs on the shoulders.
        this.torso.add(at(box(0.1, 0.3, 0.02, darken(c.top, 0.2), 0.42), -0.1, 0, -0.135), at(box(0.1, 0.3, 0.02, darken(c.top, 0.2), 0.42), 0.1, 0, -0.135));
        for (const x of [-0.19, -0.13, 0.13, 0.19]) this.torso.add(at(box(0.035, 0.035, 0.035, 0xd8d8d8, 0), x, 0.6, -0.08));
        break;
      }
      case 'tweed':
        this.torso.add(box(0.46, 0.18, 0.28, c.top, -0.06), at(box(0.12, 0.42, 0.01, 0xe8e2d6, 0.38), 0, 0, -0.132));
        this.torso.add(at(box(0.08, 0.36, 0.02, lighten(c.top, 0.15), 0.4), -0.09, 0, -0.136), at(box(0.08, 0.36, 0.02, lighten(c.top, 0.15), 0.4), 0.09, 0, -0.136));
        for (const y of [0.1, 0.22]) this.torso.add(at(box(0.025, 0.025, 0.02, 0x2a1d15, y), 0, 0, -0.14));
        break;
      case 'coat': {
        // Long coat with a scarf; the skirt hangs from the hips.
        this.torso.add(box(0.47, 0.12, 0.29, c.top, -0.02));
        const scarf = at(box(0.32, 0.1, 0.3, opts.hat === 'beanie' ? lighten(c.hat, 0.1) : 0xb33a2e, 0.58), 0, 0, 0);
        const tail = at(box(0.09, 0.32, 0.03, opts.hat === 'beanie' ? lighten(c.hat, 0.1) : 0xb33a2e, 0.42), 0.08, 0, -0.15);
        this.torso.add(scarf, tail);
        break;
      }
      case 'tee': {
        // Faded print of an invented band.
        const print = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshLambertMaterial({ map: bandTexture(), transparent: true }));
        print.position.set(0, 0.34, -0.131);
        print.rotation.y = Math.PI;
        this.torso.add(print);
        break;
      }
      case 'hoodie':
        this.torso.add(box(0.46, 0.12, 0.28, c.top, -0.02), at(box(0.34, 0.24, 0.12, darken(c.top, 0.1), 0.56), 0, 0, 0.16));
        this.torso.add(at(box(0.26, 0.12, 0.02, darken(c.top, 0.12), 0.12), 0, 0, -0.135));
        break;
    }
    if (acc === 'chain') this.torso.add(at(box(0.22, 0.03, 0.02, 0xe0b84a, 0.48), 0, 0, -0.14));
    if (acc === 'backpack') this.torso.add(at(box(0.34, 0.42, 0.18, 0x2f5a8a, 0.3), 0, 0, 0.22), at(box(0.28, 0.14, 0.06, 0x24486e, 0.15), 0, 0, 0.33));

    // Head: skull, hair style, facial hair, hat.
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    const hairStyle = opts.hairStyle ?? 'short';
    const parts: THREE.Object3D[] = [box(0.24, 0.27, 0.25, c.skin, 0.16)];
    if (hairStyle === 'short') parts.push(at(box(0.26, 0.1, 0.27, c.hair, 0.2), 0, 0, 0.01));
    if (hairStyle === 'long') parts.push(at(box(0.26, 0.1, 0.27, c.hair, 0.2), 0, 0, 0.01), at(box(0.27, 0.3, 0.08, c.hair, 0.12), 0, 0, 0.11));
    if (hairStyle === 'mohawk') parts.push(at(box(0.06, 0.2, 0.26, c.hair, 0.36), 0, 0, 0.01), at(box(0.25, 0.03, 0.26, darken(c.skin, 0.2), 0.28), 0, 0, 0.01));
    const face = opts.face ?? 'none';
    if (face === 'beard') parts.push(at(box(0.25, 0.14, 0.08, c.hair, 0.04), 0, 0, -0.1), at(box(0.25, 0.08, 0.2, c.hair, 0.06), 0, 0, 0));
    if (face === 'moustache') parts.push(at(box(0.12, 0.03, 0.02, c.hair, 0.09), 0, 0, -0.13));
    if (face === 'stubble') parts.push(at(box(0.245, 0.08, 0.04, darken(c.skin, 0.25), 0.05), 0, 0, -0.11));
    parts.push(at(box(0.05, 0.06, 0.05, c.skin, 0.13), 0, 0, -0.14)); // nose
    if (acc === 'sunglasses') parts.push(at(box(0.2, 0.05, 0.02, 0x101010, 0.19), 0, 0, -0.13));
    else parts.push(at(box(0.14, 0.03, 0.01, 0x1b1b1b, 0.19), 0, 0, -0.128)); // eyes
    if (acc === 'earring') parts.push(at(box(0.02, 0.04, 0.02, 0xe0b84a, 0.08), 0.13, 0, 0));
    parts.push(box(0.1, 0.06, 0.1, c.skin, 0.02)); // neck
    const hat = opts.hat ?? (opts.hairStyle ? 'none' : 'beanie');
    if (hat === 'beanie') parts.push(box(0.27, 0.12, 0.27, c.hat, 0.31), box(0.28, 0.04, 0.28, c.hat, 0.24));
    if (hat === 'flatcap') parts.push(box(0.28, 0.07, 0.29, c.hat, 0.3), at(box(0.24, 0.03, 0.12, c.hat, 0.29), 0, 0, -0.16));
    if (hat === 'bucket') parts.push(box(0.27, 0.12, 0.27, c.hat, 0.33), box(0.42, 0.03, 0.42, c.hat, 0.27));
    if (hat === 'cap') parts.push(box(0.27, 0.1, 0.27, c.hat, 0.31), at(box(0.22, 0.025, 0.14, c.hat, 0.27), 0, 0, -0.18));
    this.head.add(...parts);
    this.torso.add(this.head);

    // Arms: sleeves in the top colour, bare forearms with a T-shirt, gloves with the coat.
    const handColor = top === 'coat' ? 0x4a4a48 : c.skin;
    const hand = box(0.08, 0.09, 0.09, handColor, -0.3);
    const lower = top === 'tee' ? c.skin : c.top;
    this.armL = limb(0.3, 0.28, 0.11, c.top, lower, hand);
    this.armR = limb(0.3, 0.28, 0.11, c.top, lower, hand.clone());
    this.armL.pivot.position.set(-0.29, 0.56, 0);
    this.armR.pivot.position.set(0.29, 0.56, 0);
    this.torso.add(this.armL.pivot, this.armR.pivot);
    if (opts.prop === 'broom') {
      const broom = new THREE.Group();
      broom.add(box(0.03, 1.3, 0.03, 0x8a6a3e, 0.35), box(0.32, 0.12, 0.08, 0x3a2f22, -0.32));
      broom.position.set(0, -0.3, -0.05);
      broom.rotation.x = 0.25;
      this.armR.knee.add(broom);
    }
    if (opts.prop === 'bag') {
      const bag = box(0.24, 0.3, 0.12, 0xe8e2d0, -0.4);
      bag.position.y = -0.1;
      this.armR.knee.add(bag);
    }
    if (acc === 'dog') {
      // The string from the left hand.
      const str = box(0.01, 0.75, 0.01, 0xd8d2c4, -0.37);
      str.rotation.z = 0.6;
      this.armL.knee.add(at(str, 0, -0.3, 0));
    }

    // Legs: shorts show skin below the knee; ripped jeans get pale knee patches.
    const lowerLeg = bottoms === 'shorts' ? c.skin : c.bottoms;
    const shoe = () => {
      const g = new THREE.Group();
      if (shoes === 'boots') g.add(at(box(0.15, 0.2, 0.28, c.shoes, -0.34), 0, 0, -0.04));
      if (shoes === 'sneakers') g.add(at(box(0.13, 0.08, 0.27, 0xf0eee8, -0.42), 0, 0, -0.05), at(box(0.135, 0.03, 0.275, c.shoes, -0.45), 0, 0, -0.05));
      if (shoes === 'slippers') g.add(at(box(0.14, 0.06, 0.27, c.shoes, -0.43), 0, 0, -0.05));
      if (shoes === 'sandals') {
        g.add(at(box(0.14, 0.12, 0.14, 0xf4f2ec, -0.36), 0, 0, 0)); // socks
        g.add(at(box(0.15, 0.04, 0.28, 0x7a5232, -0.44), 0, 0, -0.05), at(box(0.15, 0.03, 0.04, 0x7a5232, -0.4), 0, 0, -0.12));
      }
      return g;
    };
    this.legL = limb(0.44, 0.4, 0.15, c.bottoms, lowerLeg, shoe());
    this.legR = limb(0.44, 0.4, 0.15, c.bottoms, lowerLeg, shoe());
    if (bottoms === 'ripped') for (const l of [this.legL, this.legR]) l.knee.add(at(box(0.1, 0.08, 0.02, 0xd8cfc0, -0.06), 0, 0, -0.07));
    if (bottoms === 'tracksuit') for (const l of [this.legL, this.legR]) { l.pivot.add(at(box(0.02, 0.44, 0.155, 0xf0eee8, -0.22), 0.07, 0, 0)); }
    if (bottoms === 'shorts') for (const l of [this.legL, this.legR]) l.pivot.add(at(box(0.17, 0.08, 0.17, c.bottoms, -0.4), 0, 0, 0));
    this.legL.pivot.position.set(-0.1, HIP_Y, 0);
    this.legR.pivot.position.set(0.1, HIP_Y, 0);
    this.body.add(hips, this.torso, this.legL.pivot, this.legR.pivot);
    if (top === 'coat') {
      // Coat skirt: front and back flaps that follow the legs a little.
      const skirt = box(0.48, 0.42, 0.3, c.top, -0.2);
      skirt.position.y = HIP_Y;
      this.body.add(skirt);
    }
    if (acc === 'dog') {
      this.pet = dog(0x8a5a2b);
      this.pet.position.set(-0.75, 0, -0.35);
      this.root.add(this.pet);
    }
  }

  /**
   * speed: horizontal m/s. running: sprinting (more lean, bigger stride).
   * airborne: off the ground. vy: vertical velocity, to pick a rising or falling pose.
   */
  animate(dt: number, speed: number, running: boolean, airborne: boolean, vy: number, pose: 'normal' | 'ride' | 'fallen' = 'normal') {
    this.time += dt;
    this.body.rotation.z = 0;
    this.body.position.x = 0;
    if (pose === 'ride') return this.ride(dt, speed);
    if (pose === 'fallen') return this.fallen();
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
    this.animatePet(dt, speed);
  }

  private animatePet(dt: number, speed: number) {
    const pet = this.pet;
    if (!pet) return;
    const t = this.time * (4 + speed * 3);
    const legs = pet.userData.legs as THREE.Mesh[];
    legs.forEach((l, i) => { l.rotation.x = speed > 0.2 ? Math.sin(t + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
    (pet.userData.tail as THREE.Mesh).rotation.z = Math.sin(this.time * 9) * 0.5;
    pet.position.y = speed > 0.2 ? Math.abs(Math.sin(t)) * 0.03 : 0;
    void dt;
  }

  /** On a bike: seated, leaning on the handlebar, pedalling. */
  private ride(dt: number, speed: number) {
    this.phase += speed * 1.1 * dt;
    const p = this.phase;
    this.body.position.y = 0.08;
    this.torso.rotation.x = -0.45;
    this.torso.rotation.y = 0;
    this.head.rotation.x = 0.35;
    for (const [leg, off] of [[this.legL, 0], [this.legR, Math.PI]] as const) {
      leg.pivot.rotation.x = 1.15 + Math.sin(p + off) * 0.35;
      leg.knee.rotation.x = -1.35 + Math.cos(p + off) * 0.35;
    }
    for (const arm of [this.armL, this.armR]) {
      arm.pivot.rotation.x = 1.05;
      arm.knee.rotation.x = 0.35;
    }
    this.armL.pivot.rotation.z = -0.1;
    this.armR.pivot.rotation.z = 0.1;
  }

  /** Thrown off the bike: lying on the side. */
  private fallen() {
    this.body.rotation.z = 1.4;
    this.body.position.y = 0.25;
    this.body.position.x = 0.6;
    this.torso.rotation.set(0, 0, 0);
    this.legL.pivot.rotation.x = 0.3;
    this.legR.pivot.rotation.x = -0.2;
    this.legL.knee.rotation.x = -0.4;
    this.legR.knee.rotation.x = -0.2;
    this.armL.pivot.rotation.x = 1.4;
    this.armR.pivot.rotation.x = 0.4;
  }
}
