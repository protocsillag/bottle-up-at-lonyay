import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import type { GameState } from '../../state/GameState';
import type { Interactable } from '../../player/Interaction';
import type { Player } from '../../player/Player';
import type { FollowCamera } from '../../player/FollowCamera';
import type { CollisionWorld } from '../collision';
import type { StreetIndex } from '../streets';
import { GateSystem, type Gate } from './gates';
import { buildInterior, containerMesh, interiorLayout, jackpotMesh, type CourtBinKind, type Interior } from './interior';
import { Hazmester } from '../../npc/Hazmester';
import { INTERCOM_LINES, type Line } from '../../audio/lines';
import { say } from '../../audio/voice';
import { hourIn } from '../../state/time';
import { bigBagGeometry } from '../items/models';
import { COURTYARD, EXTRA_BAGS } from '../../state/balance';
import { sound } from '../../audio/Sfx';

// Getting into buildings: gates (residents, the bell), courtyard interiors with their
// bins, jackpots and the big bag, and the házmester.

interface CourtBin { count: number; readyAt: number; kind: CourtBinKind; paperSeen?: boolean; }
interface CourtState {
  bins: CourtBin[];
  jackpot: { kind: 'skip' | 'party'; count: number } | null;
  hazmester: boolean;
  bigBag: boolean;
}

export interface BuildingHost {
  player: Player;
  follow: FollowCamera;
  cityWorld: CollisionWorld;
  /** Hide or show the street scene (culling while inside). */
  setOutsideVisible(v: boolean): void;
}

const ESCAPE_TIME = 5; // seconds to get out once the házmester spots you

export class BuildingSystem {
  readonly gates: GateSystem;
  readonly group = new THREE.Group();
  private courts = new Map<string, CourtState>();
  private jackpotGates = new Set<number>();
  private lastLine: Line | null = null;
  // Inside state.
  current: Gate | null = null;
  private interior: Interior | null = null;
  private interactables: Interactable[] = [];
  private hazmester: Hazmester | null = null;
  private escape = 0;
  private fadeEl = document.getElementById('fade')!;
  private alertEl = document.getElementById('alert')!;
  /** True while the player holds E on something (noise for the házmester). */
  searching = false;
  /** Reason the player cannot go in right now (on a bike), or null. */
  enterBlock: () => string | null = () => null;

  constructor(city: CityData, place: Placement, private state: GameState, private host: BuildingHost, private streets: StreetIndex, avoid: Vec2[] = []) {
    this.gates = new GateSystem(city, place, avoid);
    this.gates.onSlam = () => {
      this.state.stats.doorsSlammed++;
      this.state.toast('Slam! The gate clicked shut.', 'bad');
    };
    this.group.add(this.gates.group);
  }

  get inside() { return this.current !== null; }
  /** Where the player is on the street map (the gate while inside). */
  mapPos(px: number, pz: number): Vec2 { return this.current ? [this.current.x, this.current.z] : [px, pz]; }
  streetName(): string | null {
    if (!this.current) return null;
    return `Courtyard, ${this.streets.nearest(this.current.x + this.current.nx * 4, this.current.z + this.current.nz * 4) ?? 'Belső-Ferencváros'}`;
  }

  /** New run; `bags` extra bags are hidden in random courtyards. */
  reset() {
    if (this.current) this.leave(false);
    this.gates.reset();
    this.courts.clear();
    const rng = this.state.rng;
    const n = this.gates.gates.length;
    this.jackpotGates = new Set();
    const want = rng.int(COURTYARD.jackpots[0], COURTYARD.jackpots[1]);
    while (this.jackpotGates.size < Math.min(want, n)) this.jackpotGates.add(rng.int(0, n - 1));
  }

  /** Lazily rolls a courtyard's contents the first time you enter this run. */
  private court(g: Gate): CourtState {
    let c = this.courts.get(g.b.id);
    if (c) return c;
    const rng = this.state.rng;
    const nBins = Math.min(3, 1 + Math.floor(rng.next() * (g.b.h > 18 ? 3 : 2)));
    const jackpot = this.jackpotGates.has(g.index);
    c = {
      bins: Array.from({ length: nBins }, () => {
        const kind = rng.weighted(COURTYARD.binKindOdds);
        return { kind, count: this.rollCourtBin(kind), readyAt: 0 };
      }),
      jackpot: jackpot ? { kind: rng.chance(0.5) ? 'skip' : 'party', count: this.state.supply(rng.int(COURTYARD.jackpotItems[0], COURTYARD.jackpotItems[1])) } : null,
      hazmester: rng.chance(jackpot ? COURTYARD.hazmesterJackpot : COURTYARD.hazmester),
      bigBag: rng.chance(EXTRA_BAGS.courtyardChance),
    };
    this.courts.set(g.b.id, c);
    return c;
  }

  private rollCourtBin(kind: CourtBinKind) {
    const [lo, hi] = COURTYARD.binKinds[kind];
    return hi > 0 ? this.state.supply(this.state.rng.int(lo, hi)) : 0;
  }

  // ---------------------------------------------------------------- street side

  private ring(g: Gate) {
    const s = this.state;
    s.stats.bellsRung++;
    g.bellCooldown = 4;
    sound.play('click');
    if (s.rng.chance(COURTYARD.bellOdds)) {
      sound.play('buzz');
      say('ic_buzz', 2);
      this.gates.openGate(g, 3);
      return;
    }
    const night = hourIn(s.hour, 22, 6);
    const pool = INTERCOM_LINES.filter((l) => l !== this.lastLine && (!l.nightOnly || night));
    const line = s.rng.pick(pool);
    this.lastLine = line;
    say(line);
  }

  private gateInteractables(g: Gate): Interactable[] {
    const c = Math.cos(g.facing), sn = Math.sin(g.facing);
    // Intercom: local x = −1.8 on the wall (right of the gate seen from the street).
    const ix = g.x + c * -1.8 + g.nx * 0.5, iz = g.z - sn * -1.8 + g.nz * 0.5;
    return [
      {
        x: ix, z: iz, reach: 1.4, hold: 0,
        label: () => g.open > 0.25 ? null : 'Ring the bell',
        blocked: () => g.bellCooldown > 0 ? 'The intercom crackles…' : null,
        act: () => this.ring(g),
      },
      {
        x: g.x + g.nx * 0.6, z: g.z + g.nz * 0.6, reach: 1.8, hold: 0,
        label: () => g.open > 0.25 ? 'Slip in through the gate!' : null,
        blocked: () => this.enterBlock(),
        act: () => this.enter(g),
      },
    ];
  }

  *getInteractables(px: number, pz: number): Iterable<Interactable> {
    if (this.current) { yield* this.interactables; return; }
    for (const g of this.gates.near(px, pz, 5)) yield* this.gateInteractables(g);
  }

  // ---------------------------------------------------------------- enter / leave

  private flash() {
    this.fadeEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.fadeEl.classList.remove('on')));
  }

  enter(g: Gate) {
    if (this.current) return;
    const c = this.court(g);
    const layout = interiorLayout(g.b);
    const interior = buildInterior(g.b, layout);
    this.interior = interior;
    this.current = g;
    this.group.add(interior.group);
    this.host.setOutsideVisible(false);
    const { player, follow } = this.host;
    player.world = interior.world;
    follow.world = interior.world;
    player.teleport(layout.spawn[0], layout.spawn[1], 0);
    follow.yaw = 0;
    this.flash();
    this.escape = 0;
    this.alertEl.classList.add('hidden');

    // Contents.
    this.interactables = [];
    c.bins.forEach((bin, i) => {
      const [x, z] = layout.bins[i];
      const mesh = containerMesh(bin.kind);
      mesh.position.set(x, 0, z);
      interior.group.attach(mesh);
      interior.world.addBox(x, z, 1.3, 1.0);
      this.interactables.push({
        x, z, reach: 1.7, hold: COURTYARD.binHold, collect: true,
        label: () => this.state.minute >= bin.readyAt
          ? ({ recycling: 'Search the yellow-lid recycling bin', mixed: 'Search the green bin', paper: 'Search the blue-lid paper bin' } as const)[bin.kind]
          : 'Bin already searched',
        blocked: () => this.state.minute < bin.readyAt ? 'Searched — refills in 12 h' : this.state.bagFull ? 'Bag full — go to a Mohu machine' : null,
        act: () => {
          this.state.stats.binsSearched++;
          if (bin.kind === 'paper' || bin.count <= 0) {
            // Paper bins only ever hold newspapers.
            if (bin.kind === 'paper') say('paper_only', 2);
            else this.state.toast('Nothing but rubbish', 'info');
          } else {
            const got = this.state.pickup(bin.count, bin.kind === 'mixed' ? 'bin' : 'courtyard');
            bin.count -= got;
          }
          if (bin.count <= 0) {
            bin.readyAt = this.state.minute + COURTYARD.binRefill;
            bin.count = this.rollCourtBin(bin.kind);
          }
        },
      });
    });
    if (c.jackpot) {
      const jp = c.jackpot;
      const [x, z] = layout.jackpot;
      const mesh = jackpotMesh(jp.kind);
      mesh.position.set(x, 0, z);
      interior.group.attach(mesh);
      interior.world.addBox(x, z, jp.kind === 'skip' ? 1.6 : 1.8, jp.kind === 'skip' ? 3.4 : 1.6);
      if (jp.count <= 0) mesh.visible = false;
      this.interactables.push({
        x: x + 1.3, z, reach: 2.2, hold: COURTYARD.jackpotHold, collect: true,
        label: () => jp.count > 0 ? (jp.kind === 'skip' ? `Jackpot! Renovation skip full of cans (${jp.count})` : `Jackpot! A party flat's recycling (${jp.count})`) : null,
        blocked: () => this.state.bagFull ? 'Bag full — go to a Mohu machine' : null,
        act: () => {
          jp.count -= this.state.pickup(jp.count, 'jackpot');
          if (jp.count <= 0) { mesh.visible = false; this.state.toast('Jackpot cleared!', 'good'); }
        },
      });
    }
    if (c.bigBag) {
      const [x, z] = layout.bag;
      const mesh = new THREE.Mesh(bigBagGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.position.set(x, 0, z);
      mesh.rotation.y = 0.4;
      interior.group.attach(mesh);
      this.interactables.push({
        x, z, reach: 1.6, hold: 0, collect: true,
        label: () => c.bigBag ? 'Take the blue bag' : null,
        act: () => {
          if (!this.state.takeBag()) return;
          c.bigBag = false;
          mesh.visible = false;
        },
      });
    }

    // The házmester: asleep most nights.
    this.hazmester = null;
    if (c.hazmester) {
      const asleep = hourIn(this.state.hour, 22, 6) && this.state.rng.chance(COURTYARD.hazmesterAsleep);
      if (asleep) setTimeout(() => { if (this.current === g) say('hz_snore', 2.5); }, 1200);
      else {
        this.hazmester = new Hazmester(layout.patrol, interior.world);
        // Start somewhere along his loop, not at the gate.
        this.hazmester.pos.set(layout.patrol[1][0], 0, layout.patrol[1][1]);
        // His position is in world coordinates (the courtyard sits at INTERIOR_ORIGIN), so
        // he lives in this group, not in the offset interior group.
        this.group.add(this.hazmester.model.root);
      }
    }
  }

  /** Back out onto the street in front of the gate. */
  leave(fade = true) {
    const g = this.current;
    if (!g) return;
    if (this.hazmester) this.group.remove(this.hazmester.model.root);
    if (this.interior) {
      this.group.remove(this.interior.group);
      this.interior.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    this.interior = null;
    this.hazmester = null;
    this.interactables = [];
    this.current = null;
    this.alertEl.classList.add('hidden');
    const { player, follow, cityWorld } = this.host;
    player.world = cityWorld;
    follow.world = cityWorld;
    player.teleport(g.x + g.nx * 1.2, g.z + g.nz * 1.2, g.facing);
    // The gate opens freely from the inside and swings shut behind you.
    this.gates.openGate(g, 0.3);
    follow.yaw = g.facing;
    this.host.setOutsideVisible(true);
    if (fade) this.flash();
  }

  /** The player peed against a courtyard wall: an awake házmester gives chase. */
  peed() {
    const h = this.hazmester;
    if (!h || h.chasing) return;
    h.chasing = true;
    say('hz_hey');
    this.escape = ESCAPE_TIME;
  }

  private caught() {
    const s = this.state;
    const lost = Math.floor(s.bag.length / 2);
    s.loseItems(lost);
    s.stats.hazmesterCatches++;
    s.stats.itemsLostToHazmester += lost;
    say('hz_caught');
    s.toast(lost > 0 ? `The házmester took ${lost} items and marched you out!` : 'The házmester marched you out!', 'bad');
    this.leave();
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number) {
    const { player } = this.host;
    const px = player.position.x, pz = player.position.z;
    this.gates.update(dt, this.state.hour, px, pz, !this.current);

    if (!this.current) {
      // Walking into an open gate takes you inside.
      for (const g of this.gates.near(px, pz, 2)) {
        if (g.open > 0.3 && Math.hypot(px - g.x, pz - g.z) < 0.95 && !this.enterBlock()) { this.enter(g); break; }
      }
      return;
    }

    const layout = this.interior!.layout;
    if (pz > layout.exitZ) { this.leave(); return; }

    if (this.hazmester) {
      const ev = this.hazmester.update(dt, px, pz, this.searching);
      if (ev === 'spotted') {
        say('hz_hey');
        this.escape = ESCAPE_TIME;
      }
      if (ev === 'caught') { this.caught(); return; }
      if (this.hazmester.chasing) {
        this.escape -= dt;
        this.alertEl.classList.remove('hidden');
        this.alertEl.textContent = `Get out! ${Math.max(0, this.escape).toFixed(1)}`;
        if (this.escape <= 0) { this.caught(); return; }
      }
    }
  }
}
