import * as THREE from 'three';
import type { CityData, Vec2 } from '../../world/cityData';
import type { Placement } from '../../world/placement';
import type { CollisionWorld } from '../../world/collision';
import { pointInPolygon } from '../../world/collision';
import { CharacterModel, type CharacterColors, type CharacterOptions } from '../../player/CharacterModel';
import type { Interactable } from '../../player/Interaction';
import { sound } from '../../audio/Sfx';

// M13: four street people around a burning barrel on the Nehru part, at the point nearest
// where Kinizsi utca reaches the river. They are only there while the player is tipsy.
// Zsiga, a Bajnok (Zsiga the Champion) offers one fight per run.

export const ZSIGA_COLORS: CharacterColors = { skin: 0xd9a27a, hair: 0x2a2420, hat: 0x161616, top: 0x5a6a38, bottoms: 0x3a3a34, shoes: 0x2a2018 };
export const ZSIGA_OPTS: CharacterOptions = { hat: 'beanie', hairStyle: 'short', face: 'stubble', top: 'parka', bottomsStyle: 'trousers', shoesStyle: 'boots', width: 1.3, scale: 1.08 };
const MATES: [CharacterColors, CharacterOptions][] = [
  [{ skin: 0xe0b48f, hair: 0x8a8a84, hat: 0x6a3a2a, top: 0x6a4a3a, bottoms: 0x2f3440, shoes: 0x2a2522 }, { hat: 'flatcap', face: 'beard', top: 'coat', bottomsStyle: 'trousers' }],
  [{ skin: 0xc68e6a, hair: 0x3a2a20, hat: 0x2f4a6a, top: 0x8a2f2f, bottoms: 0x3d4a66, shoes: 0x3a3030 }, { hat: 'beanie', face: 'stubble', top: 'hoodie', bottomsStyle: 'tracksuit' }],
  [{ skin: 0xe8c0a0, hair: 0x6a4a2a, hat: 0x4a4a40, top: 0x4a5a6a, bottoms: 0x4a4038, shoes: 0x2a2522 }, { hat: 'none', hairStyle: 'long', face: 'moustache', top: 'leather', bottomsStyle: 'ripped' }],
];

/** The spot: on the Nehru part lawn, as close as possible to the river end of Kinizsi utca,
 *  on open ground at least 4 m off any path. */
export function findBarrelSpot(city: CityData, place: Placement): Vec2 | null {
  const nehru = city.areas.find((a) => a.name === 'Nehru part');
  if (!nehru) return null;
  const water = city.areas.filter((a) => a.kind === 'water').map((a) => a.outer);
  const dWater = (p: Vec2) => Math.min(...water.flatMap((w) => w.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))));
  const ends = city.roads.filter((r) => r.name === 'Kinizsi utca').flatMap((r) => [r.pts[0], r.pts[r.pts.length - 1]]);
  if (!ends.length) return null;
  const end = ends.reduce((a, b) => (dWater(b) < dWater(a) ? b : a));
  const paths = city.roads.filter((r) => r.kind === 'foot').flatMap((r) => r.pts.slice(1).map((p, i) => [r.pts[i], p] as [Vec2, Vec2]));
  const offPath = (x: number, z: number) => paths.every(([p, q]) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
    return Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz) > 4;
  });
  let best: Vec2 | null = null, bestD = Infinity;
  const xs = nehru.outer.map((p) => p[0]), zs = nehru.outer.map((p) => p[1]);
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 2) {
    for (let z = Math.min(...zs); z < Math.max(...zs); z += 2) {
      if (!pointInPolygon(x, z, nehru.outer) || !place.free(x, z, 3) || !offPath(x, z)) continue;
      const d = Math.hypot(x - end[0], z - end[1]);
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  return best;
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 40, 2, 32, 36, 30);
  r.addColorStop(0, 'rgba(255,250,200,1)'); r.addColorStop(0.35, 'rgba(255,170,50,0.9)'); r.addColorStop(0.7, 'rgba(220,70,20,0.45)'); r.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(90,90,96,0.7)'); r.addColorStop(1, 'rgba(90,90,96,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Person { model: CharacterModel; home: THREE.Vector3; heading: number; phase: number; }

export class FireBarrel {
  readonly group = new THREE.Group();
  /** True while the group is around the barrel (tipsy). */
  present = false;
  onTalk: () => void = () => {};
  private people: Person[] = [];
  private flames: THREE.Sprite[] = [];
  private smoke: { s: THREE.Sprite; age: number }[] = [];
  private sparks: THREE.Points;
  private sparkData: { x: number; y: number; z: number; vy: number; age: number }[] = [];
  private bottle: THREE.Mesh;
  private light: THREE.PointLight;
  private boxes: { set(on: boolean): void }[] = [];
  private fade = 0; // 0 gone … 1 fully there
  private leaving = 0; // seconds left of walking off
  private leaveDir: Vec2 = [0, 1];
  private crackle = 0;
  private time = 0;
  readonly x: number;
  readonly z: number;

  constructor(spot: Vec2, world: CollisionWorld, light: THREE.PointLight, river: Vec2) {
    this.group.name = 'fire barrel';
    [this.x, this.z] = spot;
    this.light = light;
    light.color.setHex(0xff8a3a);
    light.distance = 22;
    const l = Math.hypot(river[0] - spot[0], river[1] - spot[1]) || 1;
    this.leaveDir = [(river[0] - spot[0]) / l, (river[1] - spot[1]) / l];
    // The barrel: rusty steel drum, darker rims, glowing embers inside.
    const rust = new THREE.MeshLambertMaterial({ color: 0x7a4a2a });
    const barrel = new THREE.Group();
    barrel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 14, 1, true).translate(0, 0.45, 0), rust));
    for (const y of [0.05, 0.45, 0.88]) barrel.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 4, 16).rotateX(Math.PI / 2).translate(0, y, 0), new THREE.MeshLambertMaterial({ color: 0x4a2a1a })));
    barrel.add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2).translate(0, 0.78, 0), new THREE.MeshBasicMaterial({ color: 0xff6a20 })));
    barrel.position.set(this.x, 0, this.z);
    this.group.add(barrel);
    this.boxes.push(world.addToggleBox(this.x, this.z, 0.7, 0.7));
    // Flames, smoke and sparks.
    const fMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(fMat);
      s.position.set(this.x + (Math.random() - 0.5) * 0.25, 1.0, this.z + (Math.random() - 0.5) * 0.25);
      this.flames.push(s);
      this.group.add(s);
    }
    const sMat = new THREE.SpriteMaterial({ map: smokeTexture(), depthWrite: false, transparent: true });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(sMat.clone());
      this.smoke.push({ s, age: (i / 14) * 7 });
      this.group.add(s);
    }
    const sp = new THREE.BufferGeometry();
    sp.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3));
    this.sparks = new THREE.Points(sp, new THREE.PointsMaterial({ color: 0xffb040, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    for (let i = 0; i < 24; i++) this.sparkData.push({ x: 0, y: 99, z: 0, vy: 0, age: 99 });
    this.group.add(this.sparks);
    // The four of them in a ring round the barrel, Zsiga first.
    const looks: [CharacterColors, CharacterOptions][] = [[ZSIGA_COLORS, ZSIGA_OPTS], ...MATES];
    looks.forEach(([c, o], i) => {
      const a = (i / looks.length) * Math.PI * 2 + 0.4;
      const home = new THREE.Vector3(this.x + Math.cos(a) * 1.25, 0, this.z + Math.sin(a) * 1.25);
      const model = new CharacterModel(c, o);
      const heading = Math.atan2(home.x - this.x, home.z - this.z); // face the barrel (model faces −z)
      model.root.position.copy(home);
      model.root.rotation.y = heading;
      this.group.add(model.root);
      this.people.push({ model, home, heading, phase: i * 1.7 });
      this.boxes.push(world.addToggleBox(home.x, home.z, 0.6, 0.6));
    });
    // A bottle doing the rounds.
    this.bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8), new THREE.MeshLambertMaterial({ color: 0x3d6b2a }));
    this.group.add(this.bottle);
    this.group.visible = false;
    for (const b of this.boxes) b.set(false);
  }

  /** E on the group: talk to Zsiga. */
  interactables(px: number, pz: number): Interactable[] {
    if (!this.present || this.fade < 0.9 || Math.hypot(px - this.x, pz - this.z) > 3.4) return [];
    return [{ x: this.x, z: this.z, reach: 3.4, hold: 0, label: () => 'Talk to Zsiga', act: () => this.onTalk() }];
  }

  /** New run: nobody there. */
  reset() {
    this.present = false;
    this.fade = 0;
    this.leaving = 0;
    this.group.visible = false;
    this.light.intensity = 0;
    for (const b of this.boxes) b.set(false);
    this.people.forEach((p) => { p.model.root.position.copy(p.home); p.model.root.rotation.y = p.heading; });
  }

  update(dt: number, tipsy: boolean, night: number, px: number, pz: number) {
    this.time += dt;
    const dist = Math.hypot(px - this.x, pz - this.z);
    if (tipsy && !this.present) {
      // They turn up when the drink kicks in.
      this.present = true;
      this.leaving = 0;
      this.fade = dist > 40 ? 1 : 0.01;
      this.people.forEach((p) => { p.model.root.position.copy(p.home); p.model.root.rotation.y = p.heading; });
      for (const b of this.boxes) b.set(true);
    } else if (!tipsy && this.present) {
      // Sober again: they walk off toward the river if you can see them, else just go.
      this.present = false;
      for (const b of this.boxes) b.set(false);
      if (dist < 60) this.leaving = 7;
      else this.fade = 0;
    }
    if (this.present) this.fade = Math.min(1, this.fade + dt / 1.5);
    else if (this.leaving > 0) { this.leaving -= dt; if (this.leaving <= 0) this.fade = 0; else this.fade = Math.min(1, this.leaving / 3); }
    else this.fade = 0;
    this.group.visible = this.fade > 0;
    if (!this.group.visible) { this.light.intensity = 0; return; }

    // Fire: flicker, rising smoke, sparks; the barrel light glows more at night.
    const flick = 0.85 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 31) * 0.06 + Math.random() * 0.05;
    this.flames.forEach((s, i) => {
      const k = 0.5 + 0.5 * Math.sin(this.time * (6 + i) + i * 2);
      s.scale.set(0.5 + k * 0.25, (0.7 + k * 0.5) * this.fade, 1);
      s.position.y = 0.95 + k * 0.2;
    });
    this.light.position.set(this.x, 1.6, this.z);
    this.light.intensity = (4 + 14 * night) * flick * this.fade;
    for (const sm of this.smoke) {
      sm.age += dt;
      if (sm.age > 7) sm.age -= 7;
      const k = sm.age / 7;
      sm.s.position.set(this.x + Math.sin(sm.age * 0.7 + k * 5) * 0.4 + k * 2.2, 1.4 + k * 16, this.z + k * 1.2);
      const size = 0.8 + k * 4.5;
      sm.s.scale.set(size, size, 1);
      (sm.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * k) * 0.45 * this.fade * (0.6 + night * 0.4);
    }
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    this.sparkData.forEach((s, i) => {
      s.age += dt;
      if (s.age > 1.6 && Math.random() < dt * 4) { s.x = this.x + (Math.random() - 0.5) * 0.4; s.z = this.z + (Math.random() - 0.5) * 0.4; s.y = 1.0; s.vy = 1.2 + Math.random() * 1.8; s.age = 0; }
      s.y += s.vy * dt; s.x += Math.sin(this.time * 3 + i) * dt * 0.3;
      pos.setXYZ(i, s.x, s.age < 1.6 ? s.y : -50, s.z);
    });
    pos.needsUpdate = true;
    // Crackle, fading with distance.
    this.crackle -= dt;
    if (this.crackle <= 0 && dist < 45) { this.crackle = 0.35; sound.play('fire', Math.max(0, 1 - dist / 45) * this.fade); }

    // People: warming hands and swaying, or walking off.
    this.people.forEach((p, i) => {
      if (this.leaving > 0) {
        const r = p.model.root;
        r.position.x += this.leaveDir[0] * 1.2 * dt;
        r.position.z += this.leaveDir[1] * 1.2 * dt;
        r.rotation.y = Math.atan2(-this.leaveDir[0], -this.leaveDir[1]);
        p.model.animate(dt, 1.2, false, false, 0);
      } else {
        p.model.animate(dt, 0, false, false, 0, 'warm');
        // Now and then someone laughs: a little bounce.
        p.model.root.position.y = Math.max(0, Math.sin(this.time * 7 + p.phase) * 0.04 * (Math.sin(this.time * 0.5 + i) > 0.8 ? 1 : 0));
      }
    });
    // The bottle passes from hand to hand every 4 s.
    const k = (this.time / 4) % this.people.length;
    const a = this.people[Math.floor(k)].model.root.position, b = this.people[(Math.floor(k) + 1) % this.people.length].model.root.position;
    const f = Math.min(1, (k % 1) * 3);
    this.bottle.position.set(a.x + (b.x - a.x) * f, 1.15 + Math.sin(f * Math.PI) * 0.25, a.z + (b.z - a.z) * f);
    this.bottle.visible = this.leaving <= 0;
  }
}
