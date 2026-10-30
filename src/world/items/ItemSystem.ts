import * as THREE from 'three';
import type { GameState, ItemKind } from '../../state/GameState';
import { BIN_TYPES, BINS, HIDDEN, PARTY, SKIP, STREET, TIPSY, WHEELIES } from '../../state/balance';
import { sound } from '../../audio/Sfx';
import { dayIndex, hourIn, hourOf, minutesUntilHour } from '../../state/time';
import type { Interactable } from '../../player/Interaction';
import type { Placement, Spot, Zone } from '../placement';
import type { CityData } from '../cityData';
import { pointInPolygon } from '../collision';
import { limePostBinGeometry, meshHoopBinGeometry, wheelieGeometry } from './models';
import { bigBagGeometry, glintTexture, itemGeometry, partyGeometry, planterGeometry } from './models';

// Everything collectable in the streets: loose items, hidden spots, public bins,
// party leftovers and the hidden big blue bag. Courtyards (M4) add their own sources.

interface StreetItem { spot: Spot; kinds: ItemKind[]; yaw: number[]; off: [number, number][]; it: Interactable; }
interface Hidden { spot: Spot; count: number; refillAt: number; it: Interactable; glint: THREE.Sprite; planter: number; }
interface Bin { x: number; z: number; zone: Zone; readyAt: number; it: Interactable; index: number; broken: boolean; type: 'hoop' | 'lime'; dir: number; }
interface Wheelie { x: number; z: number; dir: number; count: number; outAt: number; gone: boolean; rolled?: boolean; group: number; it: Interactable; }
interface Party { x: number; z: number; count: number; clearAt: number; mesh: THREE.Mesh; it: Interactable; }

const KINDS: ItemKind[] = ['pet', 'can', 'glass'];
const MAX_INSTANCES = STREET.maxActive * 2 + 8;

/** Spawn-rate multiplier for street items by hour (BRIEF: busiest 18:00–02:00, dead 02:00–07:00). */
function streetRate(h: number) {
  if (hourIn(h, 18, 2)) return 2;
  if (hourIn(h, 2, 7)) return 0.3;
  return 1;
}

/** How likely a street item turns up in a zone at a given time. */
export function zoneWeight(zone: Zone, minute: number) {
  const h = hourOf(minute);
  const weekday = dayIndex(minute) === 0; // Friday
  switch (zone) {
    case 'raday': return hourIn(h, 18, 3) ? 5 : 1.6;
    case 'rakpart': return hourIn(h, 17, 3) ? 4.5 : 1.2;
    case 'nehru': return hourIn(h, 17, 24) ? 4.5 : hourIn(h, 10, 17) ? 1.6 : 0.6;
    case 'corvinus': return weekday && hourIn(h, 8, 19) ? 3.5 : 0.8;
    case 'market': return hourIn(h, 7, 18) ? 2.2 : 0.7;
    case 'kalvin': return 1.6;
    case 'bakats': return hourIn(h, 10, 22) ? 1.8 : 1;
    case 'museum': return hourIn(h, 10, 18) ? 1.5 : 0.8;
    default: return 1;
  }
}

export class ItemSystem {
  readonly group = new THREE.Group();
  private street: StreetItem[] = [];
  private hidden: Hidden[] = [];
  private bins: Bin[] = [];
  private party: Party[] = [];
  private partyTimes: number[] = [];
  private bags: { x: number; z: number; mesh: THREE.Mesh; it: Interactable; taken: boolean }[] = [];
  private used = new Set<Spot>();
  private spawnAcc = 0;
  private itemMeshes: Record<ItemKind, THREE.InstancedMesh>;
  private planters: THREE.InstancedMesh;
  private dirty = true;
  private binMeshes!: Record<'hoop' | 'lime', THREE.InstancedMesh>;
  private wheelies: Wheelie[] = [];
  private skips: { x: number; z: number; count: number; it: Interactable }[] = [];
  private wheelieMesh = new THREE.InstancedMesh(wheelieGeometry(0x2f5a3a, 0x2f5a3a), new THREE.MeshLambertMaterial({ vertexColors: true }), 40);
  private wheelieDirty = true;
  private glintMat: THREE.SpriteMaterial;
  private partyGeo = partyGeometry();
  private hiddenCandidates: Spot[];
  private noPlanter: Set<Spot>;
  private bagSpots: [number, number][][];

  constructor(private city: CityData, private place: Placement, private state: GameState, extra: { hidden?: Spot[]; bagSpots?: [number, number][][]; skips?: { x: number; z: number }[] } = {}) {
    this.skips = (extra.skips ?? []).map((k) => {
      const skip: { x: number; z: number; count: number; it: Interactable } = {
        x: k.x, z: k.z, count: 0,
        it: {
          x: k.x, z: k.z, reach: 2.2, hold: SKIP.hold,
          label: () => (skip.count > 0 ? `Renovation skip — cans on top (${skip.count})` : 'Empty skip'),
          blocked: () => (skip.count > 0 ? this.fullText() : 'Only rubble left'),
          act: () => { skip.count -= this.pickup(skip.count, 'jackpot'); },
        } as Interactable,
      };
      return skip;
    });
    this.bagSpots = extra.bagSpots ?? [];
    this.group.name = 'items';
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.itemMeshes = Object.fromEntries(KINDS.map((k) => {
      const m = new THREE.InstancedMesh(itemGeometry(k), mat, MAX_INSTANCES);
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
      return [k, m];
    })) as unknown as Record<ItemKind, THREE.InstancedMesh>;
    this.glintMat = new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    // Hidden spots favour Nehru part, parks and Ráday utca; they stay in the same places
    // every run (planters do not move), but which ones are stocked varies.
    const nehru = place.spots.filter((s) => s.zone === 'nehru' && s.green);
    const green = place.spots.filter((s) => s.green && s.zone !== 'nehru');
    const raday = place.spots.filter((s) => s.zone === 'raday');
    const other = place.spots.filter((s) => !s.green && s.zone !== 'raday');
    const pickN = (arr: Spot[], n: number, seed: number) => {
      const out: Spot[] = [];
      for (let i = 0; i < n && arr.length; i++) out.push(arr[Math.floor(frac(seed + i * 0.618) * arr.length)]);
      return out;
    };
    this.hiddenCandidates = [...new Set([
      ...pickN(nehru, 16, 0.11), ...pickN(green, 12, 0.37), ...pickN(raday, 8, 0.53), ...pickN(other, 12, 0.71),
    ])];
    // Special stashes (behind the Ráday book kiosk) have no planter of their own.
    this.noPlanter = new Set(extra.hidden ?? []);
    this.hiddenCandidates.push(...(extra.hidden ?? []));
    this.planters = new THREE.InstancedMesh(planterGeometry(), mat, this.hiddenCandidates.length);
    const m = new THREE.Matrix4();
    this.hiddenCandidates.forEach((s, i) => {
      m.makeRotationY(s.dir).setPosition(s.x, 0, s.z);
      if (this.noPlanter.has(s)) m.makeScale(0, 0, 0);
      this.planters.setMatrixAt(i, m);
    });
    this.planters.castShadow = true;
    this.group.add(this.planters);

    this.buildBins();
  }

  // ------------------------------------------------------------------ setup

  private buildBins() {
    const pts: { x: number; z: number }[] = [];
    for (const [bx, bz] of this.city.bins) {
      if (!pointInPolygon(bx, bz, this.city.boundary)) continue;
      const [x, z] = this.place.free(bx, bz, 0.6) ? [bx, bz] : this.place.nearestFree([bx, bz], 0.6);
      if (Math.hypot(x - bx, z - bz) > 6) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
      pts.push({ x, z });
    }
    // Top up the hot zones so each has a few bins.
    const want: [Zone, number][] = [['raday', 8], ['nehru', 8], ['corvinus', 5], ['market', 4], ['kalvin', 3], ['bakats', 3], ['lonyay', 4], ['rakpart', 5]];
    for (const [zone, n] of want) {
      const spots = this.place.spotsIn(zone);
      let have = pts.filter((p) => this.place.zoneAt(p.x, p.z) === zone).length;
      for (let i = 0; have < n && i < spots.length; i += Math.max(1, Math.floor(spots.length / n))) {
        const s = spots[i];
        if (pts.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 25)) continue;
        pts.push({ x: s.x, z: s.z });
        have++;
      }
    }
    // Bin type from the street: lime post bins by wide roads (≥ 13 m) and on Kálvin tér,
    // green mesh hoop bins everywhere else. Each faces the nearest road.
    const roadSegs = this.city.roads.filter((r) => r.kind === 'road' && !r.bridge).flatMap((r) => r.pts.slice(1).map((q, j) => [r.pts[j], q, r.w] as const));
    const nearestRoad = (x: number, z: number) => {
      let best = { d: Infinity, w: 0, dir: 0 };
      for (const [a, b, w] of roadSegs) {
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < best.d) best = { d, w, dir: Math.atan2(x - px, z - pz) };
      }
      return best;
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const types = pts.map((p) => {
      const r = nearestRoad(p.x, p.z);
      return { type: (r.w >= 13 || this.place.zoneAt(p.x, p.z) === 'kalvin' ? 'lime' : 'hoop') as Bin['type'], dir: r.dir };
    });
    this.binMeshes = {
      hoop: new THREE.InstancedMesh(meshHoopBinGeometry(), mat, pts.length),
      lime: new THREE.InstancedMesh(limePostBinGeometry(), mat, pts.length),
    };
    const counts = { hoop: 0, lime: 0 };
    const state = this.state;
    pts.forEach((p, i) => {
      const { type, dir } = types[i];
      const index = counts[type]++;
      const bin: Bin = {
        x: p.x, z: p.z, zone: this.place.zoneAt(p.x, p.z), readyAt: 0, index, broken: false, type, dir,
        it: {
          x: p.x, z: p.z, reach: 1.6,
          get hold() { return state.tipsy ? TIPSY.kickHold : BINS.hold; },
          label: () => bin.broken ? 'Kicked-over bin' : state.tipsy ? 'Kick the bin over' : state.minute >= bin.readyAt ? 'Search the bin' : 'Bin already searched',
          blocked: () => bin.broken ? 'Broken — nothing left' : state.tipsy ? this.fullText() : state.minute < bin.readyAt ? `Searched — refills in ${hoursText(bin.readyAt - state.minute)}` : this.fullText(),
          act: () => state.tipsy ? this.kickBin(bin) : this.searchBin(bin),
        },
      };
      this.bins.push(bin);
      this.setBinTilt(bin, false);
    });
    for (const k of ['hoop', 'lime'] as const) {
      const mesh = this.binMeshes[k];
      mesh.count = counts[k];
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  /** Tipsy: kick a public bin over. Everything spills at once, but it never refills. */
  private kickBin(b: Bin) {
    const rng = this.state.rng;
    // Whatever was in it, plus what a search would have found.
    const n = this.state.supply(this.state.minute >= b.readyAt ? rng.int(3, BINS.items[1]) : rng.int(1, 3));
    b.broken = true;
    b.readyAt = Infinity;
    this.state.stats.binsKicked++;
    sound.play('kick');
    this.state.pickup(n, 'bin');
    this.setBinTilt(b, true);
  }

  private setBinTilt(b: Bin, down: boolean) {
    // The opening faces the road (models face −z).
    const m = new THREE.Matrix4().makeTranslation(b.x, 0, b.z).multiply(new THREE.Matrix4().makeRotationY(b.dir + Math.PI));
    if (down) m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0.3, 0, 0));
    const mesh = this.binMeshes[b.type];
    mesh.setMatrixAt(b.index, m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** New run: clears and rolls everything. */
  reset() {
    const rng = this.state.rng;
    this.street = [];
    this.used.clear();
    this.spawnAcc = 0;
    for (const p of this.party) this.group.remove(p.mesh);
    this.party = [];
    for (const h of this.hidden) this.group.remove(h.glint);
    this.hidden = [];

    for (let i = 0; i < STREET.initial; i++) this.spawnStreet();

    // Hidden spots: a random subset of the planters is stocked this run.
    const chosen = rng.shuffle(this.hiddenCandidates.map((s, i) => [s, i] as const).filter(([s]) => !this.noPlanter.has(s))).slice(0, HIDDEN.count - this.noPlanter.size);
    this.hiddenCandidates.forEach((s, i) => { if (this.noPlanter.has(s)) chosen.push([s, i]); });
    for (const [spot, planter] of chosen) {
      // The stash is behind the planter, on the side away from the street.
      const special = this.noPlanter.has(spot);
      const bx = special ? spot.x : spot.x + Math.sin(spot.dir + Math.PI / 2) * 0.7, bz = special ? spot.z : spot.z + Math.cos(spot.dir + Math.PI / 2) * 0.7;
      const glint = new THREE.Sprite(this.glintMat);
      glint.scale.setScalar(0.5);
      glint.position.set(bx, 0.35, bz);
      glint.visible = false;
      this.group.add(glint);
      const h: Hidden = {
        spot, planter, glint, count: this.state.supply(rng.int(HIDDEN.items[0], HIDDEN.items[1])), refillAt: 0,
        it: {
          x: bx, z: bz, reach: 1.4, hold: 0,
          label: () => h.count > 0 ? (special ? 'Look behind the book kiosk' : 'Look behind the planter') : null,
          blocked: () => this.fullText(),
          act: () => this.takeHidden(h),
        },
      };
      this.hidden.push(h);
    }

    // Bins: most start with something in them; kicked bins stand up again.
    for (const b of this.bins) { if (b.broken) { b.broken = false; this.setBinTilt(b, false); } }
    for (const b of this.bins) b.readyAt = rng.chance(0.75) ? 0 : rng.range(60, BINS.refill) + this.state.minute;

    // Party leftovers: a few random times each night.
    this.partyTimes = [];
    for (const night of [0, 1]) {
      for (let i = 0; i < PARTY.perNight; i++) {
        const start = night * 1440 + PARTY.from * 60;
        const len = ((PARTY.to + 24 - PARTY.from) % 24) * 60;
        this.partyTimes.push(start + rng.range(0, len));
      }
    }
    this.partyTimes.sort((a, b) => a - b);

    for (const k of this.skips) k.count = this.state.supply(rng.int(SKIP.items[0], SKIP.items[1]));

    // Wheelie bins put out on the pavement on Saturday and Sunday mornings.
    this.wheelies = [];
    const curb = this.place.spots.filter((s) => !s.green && (s.zone === 'raday' || s.zone === 'lonyay' || s.zone === 'street' || s.zone === 'market' || s.zone === 'bakats'));
    let group = 0;
    for (const day of [1, 2]) {
      for (let g = 0; g < WHEELIES.groups; g++, group++) {
        const s = rng.pick(curb);
        const n = rng.int(WHEELIES.perGroup[0], WHEELIES.perGroup[1]);
        const outAt = day * 1440 + rng.range(WHEELIES.out[0], WHEELIES.out[1]) * 60;
        const ux = -Math.sin(s.dir), uz = -Math.cos(s.dir);
        for (let k = 0; k < n; k++) {
          const x = s.x + ux * (k - n / 2) * 0.8, z = s.z + uz * (k - n / 2) * 0.8;
          if (!this.place.free(x, z, 0.3)) continue;
          const w: Wheelie = {
            x, z, dir: s.dir, count: 0, outAt, gone: false, group,
            it: {
              x, z, reach: 1.4, hold: WHEELIES.hold,
              label: () => (w.count > 0 ? 'Search the wheelie bin' : 'Empty wheelie bin'),
              blocked: () => (w.count > 0 ? this.fullText() : 'Nothing left in it'),
              act: () => { w.count -= this.pickup(w.count, 'courtyard'); this.state.stats.binsSearched++; },
            },
          };
          this.wheelies.push(w);
        }
      }
    }
    this.wheelieDirty = true;

    this.dirty = true;
  }

  /** One bag per group of spots (Nehru part kiosks, Ráday utca), at a random spot in it. */
  placeBags() {
    for (const b of this.bags) this.group.remove(b.mesh);
    this.bags = [];
    const rng = this.state.rng;
    for (const group of this.bagSpots) {
      if (!group.length) continue;
      const [x, z] = rng.pick(group);
      const mesh = new THREE.Mesh(bigBagGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rng.range(0, Math.PI * 2);
      mesh.castShadow = true;
      this.group.add(mesh);
      const bag: ItemSystem['bags'][number] = {
        x, z, mesh, taken: false,
        it: {
          x, z, reach: 1.6, hold: 0,
          label: () => bag.taken ? null : 'Take the blue bag',
          act: () => {
            if (!this.state.takeBag()) return;
            bag.taken = true;
            mesh.visible = false;
          },
        },
      };
      this.bags.push(bag);
    }
  }

  /** Where the street bags are this run (debugging). */
  get bagPositions() { return this.bags.filter((b) => !b.taken).map((b) => [b.x, b.z]); }

  // ------------------------------------------------------------------ actions

  private fullText() {
    return this.state.bagFull ? (this.state.bags > 1 ? 'Bags full — go to a Mohu machine' : 'Bag full — go to a Mohu machine') : null;
  }

  private pickup(n: number, source: Parameters<GameState['collect']>[1], kinds?: ItemKind[]) {
    return this.state.pickup(n, source, kinds);
  }

  private takeStreet(s: StreetItem) {
    const got = this.pickup(s.kinds.length, 'street', s.kinds);
    s.kinds.splice(0, got);
    s.yaw.splice(0, got);
    s.off.splice(0, got);
    if (!s.kinds.length) {
      this.street.splice(this.street.indexOf(s), 1);
      this.used.delete(s.spot);
    }
    this.dirty = true;
  }

  private takeHidden(h: Hidden) {
    const got = this.pickup(h.count, 'hidden');
    h.count -= got;
    if (h.count <= 0) {
      // Restocked once per game day, at the next 06:00.
      h.refillAt = this.state.minute + minutesUntilHour(this.state.minute, 6);
      h.glint.visible = false;
    }
  }

  private searchBin(b: Bin) {
    const rng = this.state.rng;
    const h = this.state.hour;
    const weekday = dayIndex(this.state.minute) === 0;
    const [lo, hi] = BIN_TYPES[b.type].items;
    let n = rng.int(lo, hi);
    if ((b.zone === 'raday' || b.zone === 'rakpart') && hourIn(h, 18, 4)) n += rng.int(1, 3);
    if (b.zone === 'corvinus' && weekday && hourIn(h, 9, 19)) n += rng.int(1, 3);
    if (b.zone === 'nehru' && hourIn(h, 17, 24)) n += rng.int(1, 3);
    if (b.zone === 'bakats' && hourIn(h, 17, 23)) n += rng.int(1, 2);
    if (b.zone === 'market' && hourIn(h, 8, 18)) n += rng.int(0, 2);
    n = this.state.supply(Math.min(hi + 3, n));
    this.state.stats.binsSearched++;
    const got = this.pickup(n, 'bin');
    // Whatever did not fit stays for next time: the bin is ready again sooner.
    b.readyAt = this.state.minute + (got < n ? 30 : BINS.refill);
  }

  private takeParty(p: Party) {
    const got = this.pickup(p.count, 'party');
    p.count -= got;
    if (p.count <= 0) {
      this.group.remove(p.mesh);
      this.party.splice(this.party.indexOf(p), 1);
    }
  }

  // ------------------------------------------------------------------ spawning

  private spawnStreet() {
    if (this.street.length >= STREET.maxActive) return;
    const rng = this.state.rng;
    // Rejection-sample a spot weighted by zone and time.
    for (let tries = 0; tries < 30; tries++) {
      const s = rng.pick(this.place.spots);
      if (this.used.has(s)) continue;
      if (rng.next() * 5 > zoneWeight(s.zone, this.state.minute)) continue;
      this.used.add(s);
      // Late in a generous run, fewer new items turn up.
      if (!rng.chance(this.state.supplyFactor)) return;
      const n = this.state.supply(rng.int(STREET.items[0], STREET.items[1]));
      const kinds: ItemKind[] = [], yaw: number[] = [], off: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        kinds.push(rng.weighted({ pet: 0.45, can: 0.38, glass: 0.17 }));
        yaw.push(rng.range(0, Math.PI * 2));
        off.push([rng.range(-0.4, 0.4), rng.range(-0.4, 0.4)]);
      }
      const item: StreetItem = {
        spot: s, kinds, yaw, off,
        it: {
          x: s.x, z: s.z, reach: 1.5, hold: 0,
          label: () => `Pick up ${item.kinds.length === 1 ? (item.kinds[0] === 'can' ? 'the can' : 'the bottle') : `${item.kinds.length} items`}`,
          blocked: () => this.fullText(),
          act: () => this.takeStreet(item),
        },
      };
      this.street.push(item);
      this.dirty = true;
      return;
    }
  }

  private spawnParty() {
    const rng = this.state.rng;
    const raday = this.place.spotsIn('raday');
    const rakpart = this.place.spotsIn('rakpart');
    const nehru = this.place.spots.filter((s) => s.zone === 'nehru' && s.green);
    // Ráday, then the riverside pubs by Bálna, then Nehru part.
    const roll = rng.next();
    const pool = roll < 0.45 && raday.length ? raday : roll < 0.7 && rakpart.length ? rakpart : nehru.length ? nehru : this.place.spots;
    const s = rng.pick(pool);
    const mesh = new THREE.Mesh(this.partyGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    mesh.castShadow = true;
    this.group.add(mesh);
    const clearAt = this.state.minute + minutesUntilHour(this.state.minute, PARTY.clearAt);
    const p: Party = {
      x: s.x, z: s.z, count: this.state.supply(rng.int(PARTY.items[0], PARTY.items[1])), clearAt, mesh,
      it: {
        x: s.x, z: s.z, reach: 1.8, hold: PARTY.hold,
        label: () => `Party leftovers (${p.count})`,
        blocked: () => this.fullText(),
        act: () => this.takeParty(p),
      },
    };
    this.party.push(p);
  }

  /** Called by the street sweeper (M6): clears loose street items near a point. */
  sweep(x: number, z: number, r: number) {
    for (let i = this.street.length - 1; i >= 0; i--) {
      const s = this.street[i];
      if (Math.hypot(s.spot.x - x, s.spot.z - z) < r) {
        this.used.delete(s.spot);
        this.street.splice(i, 1);
        this.dirty = true;
      }
    }
  }

  /** Drops a single item on the ground (an NPC finishing a drink, M6). */
  drop(x: number, z: number, kind: ItemKind) {
    if (this.street.length >= STREET.maxActive || !this.place.free(x, z, 0.3)) return;
    if (!this.state.rng.chance(this.state.supplyFactor)) return;
    this.state.supply(1);
    const spot: Spot = { x, z, zone: this.place.zoneAt(x, z), green: false, dir: 0 };
    const item: StreetItem = {
      spot, kinds: [kind], yaw: [Math.random() * 6.28], off: [[0, 0]],
      it: {
        x, z, reach: 1.5, hold: 0,
        label: () => `Pick up ${kind === 'can' ? 'the can' : 'the bottle'}`,
        blocked: () => this.fullText(),
        act: () => this.takeStreet(item),
      },
    };
    this.street.push(item);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ per frame

  private nightGlints: THREE.Sprite[] = [];

  /** Faint glints on the nearest loose items at night so they stay findable. */
  private glintTimer = 0;
  private updateNightGlints(night: number, px: number, pz: number, dt: number) {
    this.glintTimer -= dt;
    const refresh = this.glintTimer <= 0;
    if (refresh) this.glintTimer = 0.25;
    if (!this.nightGlints.length) {
      for (let i = 0; i < 24; i++) {
        const s = new THREE.Sprite(this.glintMat.clone());
        s.scale.setScalar(0.35);
        s.visible = false;
        this.nightGlints.push(s);
        this.group.add(s);
      }
    }
    if (!refresh && this.nightGlints.length) {
      this.nightGlints.forEach((g, i) => { if (g.visible) (g.material as THREE.SpriteMaterial).opacity = night * (0.35 + 0.25 * Math.sin(performance.now() / 300 + i)); });
      return;
    }
    const near = night < 0.3 ? [] : this.street
      .map((s) => [s, (s.spot.x - px) ** 2 + (s.spot.z - pz) ** 2] as const)
      .filter(([, d]) => d < 30 * 30)
      .sort((a, b) => a[1] - b[1])
      .slice(0, this.nightGlints.length);
    this.nightGlints.forEach((g, i) => {
      const it = near[i]?.[0];
      g.visible = !!it;
      if (!it) return;
      g.position.set(it.spot.x, 0.25, it.spot.z);
      (g.material as THREE.SpriteMaterial).opacity = night * (0.35 + 0.25 * Math.sin(performance.now() / 300 + i));
    });
  }

  update(dt: number, gameMinutes: number, px: number, pz: number, night = 0) {
    this.updateNightGlints(night, px, pz, dt);
    const minute = this.state.minute;
    // Street spawns.
    this.spawnAcc += (gameMinutes / 60) * STREET.perHour * streetRate(hourOf(minute));
    while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnStreet(); }

    // Party leftovers.
    while (this.partyTimes.length && this.partyTimes[0] <= minute) { this.partyTimes.shift(); this.spawnParty(); }
    for (let i = this.party.length - 1; i >= 0; i--) {
      if (minute >= this.party[i].clearAt) { this.group.remove(this.party[i].mesh); this.party.splice(i, 1); }
    }

    // Hidden spots refill and glint up close.
    for (const h of this.hidden) {
      if (h.count <= 0 && h.refillAt > 0 && minute >= h.refillAt) {
        h.count = this.state.supply(this.state.rng.int(HIDDEN.items[0], HIDDEN.items[1]));
        h.refillAt = 0;
      }
      const d = Math.hypot(h.it.x - px, h.it.z - pz);
      h.glint.visible = h.count > 0 && d < HIDDEN.showWithin;
      if (h.glint.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260 + h.planter);
        h.glint.material.opacity = 1;
        h.glint.scale.setScalar(0.25 + 0.3 * pulse * (1 - d / HIDDEN.showWithin));
      }
    }

    // Wheelie bins come out at dawn (contents roll then) and go when the truck passes.
    for (const w of this.wheelies) {
      if (!w.gone && minute >= w.outAt && !w.rolled) {
        w.rolled = true;
        w.count = this.state.supply(this.state.rng.int(WHEELIES.items[0], WHEELIES.items[1]));
        this.wheelieDirty = true;
      }
      if (!w.gone && hourOf(minute) >= WHEELIES.truck[1] && minute > w.outAt + 60) { w.gone = true; this.wheelieDirty = true; }
    }
    if (this.wheelieDirty) this.rebuildWheelies(minute);
    if (this.dirty) this.rebuildInstances();
  }

  private rebuildWheelies(minute: number) {
    this.wheelieDirty = false;
    const m = new THREE.Matrix4();
    let i = 0;
    for (const w of this.wheelies) {
      if (w.gone || minute < w.outAt || i >= 40) continue;
      this.wheelieMesh.setMatrixAt(i++, m.makeRotationY(w.dir + Math.PI / 2).setPosition(w.x, 0, w.z));
    }
    this.wheelieMesh.count = i;
    this.wheelieMesh.instanceMatrix.needsUpdate = true;
    if (!this.wheelieMesh.parent) { this.wheelieMesh.castShadow = true; this.wheelieMesh.frustumCulled = false; this.group.add(this.wheelieMesh); }
  }

  /** Where the garbage truck should head: the nearest group of bins still out. */
  wheelieTarget(x: number, z: number): [number, number] | null {
    let best: Wheelie | null = null, bd = Infinity;
    for (const w of this.wheelies) {
      if (w.gone || this.state.minute < w.outAt) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bd) { bd = d; best = w; }
    }
    return best ? [best.x, best.z] : null;
  }

  /** The garbage truck takes in every bin within r of (x, z). */
  collectWheelies(x: number, z: number, r: number) {
    for (const w of this.wheelies) {
      if (!w.gone && this.state.minute >= w.outAt && Math.hypot(w.x - x, w.z - z) < r) { w.gone = true; this.wheelieDirty = true; }
    }
  }

  private rebuildInstances() {
    this.dirty = false;
    const counts: Record<ItemKind, number> = { pet: 0, can: 0, glass: 0 };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const s of this.street) {
      s.kinds.forEach((k, i) => {
        const mesh = this.itemMeshes[k];
        if (counts[k] >= MAX_INSTANCES) return;
        q.setFromAxisAngle(up, s.yaw[i]);
        m.compose(new THREE.Vector3(s.spot.x + s.off[i][0], 0, s.spot.z + s.off[i][1]), q, one);
        mesh.setMatrixAt(counts[k]++, m);
      });
    }
    for (const k of KINDS) {
      this.itemMeshes[k].count = counts[k];
      this.itemMeshes[k].instanceMatrix.needsUpdate = true;
    }
  }

  /** Interactables near the player. */
  *interactables(px: number, pz: number): Iterable<Interactable> {
    const near = (x: number, z: number) => Math.abs(x - px) < 4 && Math.abs(z - pz) < 4;
    for (const s of this.street) if (near(s.spot.x, s.spot.z)) yield s.it;
    for (const h of this.hidden) if (h.count > 0 && near(h.it.x, h.it.z)) yield h.it;
    for (const b of this.bins) if (near(b.x, b.z)) yield b.it;
    for (const p of this.party) if (near(p.x, p.z)) yield p.it;
    for (const b of this.bags) if (!b.taken && near(b.x, b.z)) yield b.it;
    for (const w of this.wheelies) if (!w.gone && this.state.minute >= w.outAt && near(w.x, w.z)) yield w.it;
    for (const k of this.skips) if (near(k.x, k.z)) yield k.it;
  }

  /** For the minimap / debugging. */
  get counts() {
    return {
      street: this.street.reduce((a, s) => a + s.kinds.length, 0),
      hidden: this.hidden.reduce((a, h) => a + h.count, 0),
      bins: this.bins.filter((b) => this.state.minute >= b.readyAt).length,
      party: this.party.length,
    };
  }
}

function frac(v: number) { return v - Math.floor(v); }
function hoursText(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
