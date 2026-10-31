import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import type { GameState } from '../../state/GameState';
import type { Interactable } from '../../player/Interaction';
import type { BuildingHost } from '../buildings/BuildingSystem';
import { pointInPolygon } from '../collision';
import { buildHall, buildSpar, type ShopInterior } from './interiors';
import { buildSparFront, type SparFront } from './sparFront';
import { SHOP_OPEN } from '../../state/balance';

// The return points as walk-in shops: SPAR on Kinizsi utca, the SPAR on the Lónyay
// utca corner and the Central Market Hall (Aldi inside). Doors are open 06:00–24:00; at midnight you are shown out.

export type ShopId = 'spar' | 'spar-lonyay' | 'aldi';
export interface ShopDoor { id: ShopId; name: string; x: number; z: number; facing: number; interior: ShopInterior; }

export class Shops {
  readonly group = new THREE.Group();
  readonly street = new THREE.Group();
  /** Interior lights live outside the (hidden) interiors so the light count never changes. */
  readonly lights = new THREE.Group();
  readonly doors: ShopDoor[] = [];
  current: ShopDoor | null = null;
  private fadeEl = document.getElementById('fade')!;
  private its: Interactable[] = [];
  enterBlock: () => string | null = () => null;
  /** Opens the till menu; set by main. */
  onTill: (d: ShopDoor) => void = () => {};

  constructor(city: CityData, private state: GameState, private host: BuildingHost, hallDoor: { x: number; z: number; facing: number } | null) {
    const sparP = city.landmarks.spar;
    if (sparP) {
      const d = doorOnFacade(city, sparP);
      this.add('spar', 'SPAR, Kinizsi utca', d, buildSpar([7000, 7000]));
      this.sparFront(d);
    }
    if (hallDoor) this.add('aldi', 'Aldi, Central Market Hall', hallDoor, buildHall([8000, 8000]));
  }

  private add(id: ShopId, name: string, d: { x: number; z: number; facing: number }, interior: ShopInterior) {
    this.group.add(interior.group);
    interior.group.updateMatrixWorld(true);
    const lights: THREE.PointLight[] = [];
    interior.group.traverse((o) => { if (o instanceof THREE.PointLight) lights.push(o); });
    for (const l of lights) {
      this.lights.attach(l);
      l.userData.on = l.intensity;
      l.intensity = 0;
      l.userData.shop = id;
    }
    interior.group.visible = false;
    const door: ShopDoor = { id, name, ...d, interior };
    this.doors.push(door);
    this.its.push({
      x: d.x, z: d.z, reach: 2.4, hold: 0,
      label: () => (this.current ? null : `Go into ${id === 'aldi' ? 'the market hall' : 'SPAR'}`),
      blocked: () => (!this.state.shopsOpen ? `${name}: closed — opens at 0${SHOP_OPEN}:00` : this.enterBlock()),
      act: () => this.enter(door),
    });
  }

  /** SPAR shopfronts in the style of reference/lonyay-utca/spar-corner.jpg. */
  readonly fronts: SparFront[] = [];
  private sparFront(d: { x: number; z: number; facing: number }) {
    const f = buildSparFront(d, 3, true);
    this.fronts.push(f);
    this.street.add(f.group);
  }

  /** The SPAR on the Lónyay utca corner (reference/lonyay-utca/spar-corner.jpg): a second
   *  walk-in SPAR with its own machines and till, the same layout as Kinizsi utca. */
  addLonyaySpar(d: { x: number; z: number; facing: number }) {
    this.add('spar-lonyay', 'SPAR, Lónyay utca', d, buildSpar([9000, 9000]));
    this.sparFront(d);
  }

  /** Grilles down while shut, neon brighter at night. */
  updateFronts(night: number) {
    for (const f of this.fronts) { f.setClosed(!this.state.shopsOpen); f.setNight(night); }
  }

  private setLights(id: ShopId | null) {
    for (const l of this.lights.children as THREE.PointLight[]) l.intensity = l.userData.shop === id ? l.userData.on : 0;
  }

  get inside() { return this.current !== null; }
  mapPos(): Vec2 | null { return this.current ? [this.current.x, this.current.z] : null; }

  *interactables(): Iterable<Interactable> {
    if (!this.current) { yield* this.its; return; }
    const d = this.current;
    yield {
      x: d.interior.till.x, z: d.interior.till.z, reach: 1.8, hold: 0,
      label: () => 'Till: food 100 Ft · beer 200 Ft',
      act: () => this.onTill(d),
    };
  }

  private flash() {
    this.fadeEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.fadeEl.classList.remove('on')));
  }

  enter(d: ShopDoor) {
    if (this.current || !this.state.shopsOpen) return;
    this.current = d;
    d.interior.group.visible = true;
    this.setLights(d.id);
    this.host.setOutsideVisible(false);
    this.host.player.world = d.interior.world;
    this.host.follow.world = d.interior.world;
    this.host.player.teleport(d.interior.spawn[0], d.interior.spawn[1], 0);
    this.host.follow.yaw = 0;
    this.flash();
  }

  leave(fade = true) {
    const d = this.current;
    if (!d) return;
    d.interior.group.visible = false;
    this.setLights(null);
    this.current = null;
    const { player, follow, cityWorld } = this.host;
    player.world = cityWorld;
    follow.world = cityWorld;
    const nx = -Math.sin(d.facing), nz = -Math.cos(d.facing);
    player.teleport(d.x + nx * 0.8, d.z + nz * 0.8, d.facing);
    follow.yaw = d.facing;
    this.host.setOutsideVisible(true);
    if (fade) this.flash();
  }

  /** Returns true if the player was just shown out at closing time. */
  update(): boolean {
    const d = this.current;
    if (!d) return false;
    const p = this.host.player.position;
    if (p.z > d.interior.exitZ) { this.leave(); return false; }
    if (!this.state.shopsOpen) { this.leave(); return true; }
    return false;
  }
}

/** A door on the facade nearest a shop node, facing out to the street. */
export function doorOnFacade(city: CityData, p: Vec2) {
  let best: { d: number; x: number; z: number; nx: number; nz: number } | null = null;
  for (const b of city.buildings) {
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 6) continue;
      const t = Math.max(3 / len, Math.min(1 - 3 / len, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)));
      const x = a[0] + dx * t, z = a[1] + dz * t;
      const d = Math.hypot(x - p[0], z - p[1]);
      if (best && d >= best.d) continue;
      let nx = dz / len, nz = -dx / len;
      if (pointInPolygon(x + nx * 0.3, z + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      best = { d, x, z, nx, nz };
    }
  }
  const b = best!;
  // The door point sits just in front of the wall; facing = heading looking out.
  return { x: b.x + b.nx * 1.0, z: b.z + b.nz * 1.0, facing: Math.atan2(-b.nx, -b.nz) };
}
