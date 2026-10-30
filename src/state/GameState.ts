import { BAG_SIZE, CONDITION, HUNGER, ITEM_VALUE_FT, KIND_ODDS, MAX_BAGS, SUPPLY, TIPSY } from './balance';
import { Rng } from './rng';
import { sound } from '../audio/Sfx';
import { END_MINUTE, GAME_MIN_PER_SEC, START_MINUTE, hourIn, hourOf } from './time';
import { SHOP_CLOSE, SHOP_OPEN } from './balance';

// The one game-state module: clock, money, bag, run status and fun stats.
// Systems read from it and call its methods; the HUD listens to its events.

export type ItemKind = 'pet' | 'can' | 'glass';
export type ItemCondition = 'fine' | 'crushed' | 'wet' | 'nodeposit';
export type SourceKind = keyof typeof CONDITION;
export interface Item { kind: ItemKind; cond: ItemCondition; }

export type RunStatus = 'ready' | 'playing' | 'ended';

export interface RunStats {
  itemsCollected: number;
  itemsReturned: number;
  itemsRejected: number;
  glassBroken: number;
  binsSearched: number;
  doorsSlammed: number;
  bellsRung: number;
  dogIncidents: number;
  hazmesterCatches: number;
  itemsLostToHazmester: number;
  bikeCrashes: number;
  distance: number; // metres walked
  foodBought: number;
  beersBought: number;
  spentFt: number;
  wallsWatered: number;
  binsKicked: number;
  carHits: number;
  itemsLostToCars: number;
  timesStarving: number;
}

export interface Toast { text: string; kind?: 'good' | 'bad' | 'info'; }

const freshStats = (): RunStats => ({
  itemsCollected: 0, itemsReturned: 0, itemsRejected: 0, glassBroken: 0, binsSearched: 0,
  doorsSlammed: 0, bellsRung: 0, dogIncidents: 0, hazmesterCatches: 0, itemsLostToHazmester: 0,
  bikeCrashes: 0, distance: 0, foodBought: 0, beersBought: 0, spentFt: 0, wallsWatered: 0, binsKicked: 0,
  carHits: 0, itemsLostToCars: 0, timesStarving: 0,
});

export class GameState {
  rng: Rng;
  minute = START_MINUTE;
  money = 0;
  bag: Item[] = [];
  /** 1 = full, 0 = starving. */
  hunger = 1;
  /** Game minute the tipsiness wears off (0 = sober). */
  tipsyUntil = 0;
  /** 1–3: how strong the wobble is. */
  tipsyLevel = 0;
  /** Bags carried, 1–3 (50 items each). */
  bags = 1;
  status: RunStatus = 'ready';
  stats = freshStats();
  /** Real seconds since the run started (not counting pauses). */
  realTime = 0;
  /** Items spawned into the world so far this run (see SUPPLY). */
  spawned = 0;
  /** Multiplies the clock speed (debug key T). */
  timeScale = 1;
  private toastListeners: ((t: Toast) => void)[] = [];

  constructor(seed: number) { this.rng = new Rng(seed); }

  reset(seed: number) {
    this.rng = new Rng(seed);
    this.minute = START_MINUTE;
    this.money = 0;
    this.bag = [];
    this.bags = 1;
    this.hunger = 1;
    this.tipsyUntil = 0;
    this.tipsyLevel = 0;
    this.status = 'playing';
    this.stats = freshStats();
    this.realTime = 0;
    this.spawned = 0;
  }

  /** How generous sources are right now (1 = full, falls to SUPPLY.minFactor). */
  get supplyFactor() {
    const left = SUPPLY.budget - this.spawned;
    return Math.max(SUPPLY.minFactor, Math.min(1, left / (SUPPLY.budget * SUPPLY.soft)));
  }

  /** Scales a rolled amount by the supply budget and counts it as spawned. */
  supply(n: number) {
    if (n <= 0) return 0;
    const m = Math.max(1, Math.round(n * this.supplyFactor));
    this.spawned += m;
    return m;
  }

  get tipsy() { return this.minute < this.tipsyUntil; }
  get starving() { return this.hunger <= 0; }

  /** Spends money at the till. Returns false if there is not enough. */
  spend(ft: number) {
    if (this.money < ft) return false;
    this.money -= ft;
    this.stats.spentFt += ft;
    return true;
  }

  eat() { this.hunger = 1; this.stats.foodBought++; }

  drinkBeer() {
    // 3 real minutes, then 4, then 5 while still tipsy; further beers restart the 5.
    this.tipsyLevel = this.tipsy ? Math.min(TIPSY.maxLevel, this.tipsyLevel + 1) : 1;
    const realMin = TIPSY.realMinutes[Math.min(this.tipsyLevel, TIPSY.realMinutes.length) - 1];
    this.tipsyUntil = this.minute + realMin * 60 * GAME_MIN_PER_SEC;
    this.stats.beersBought++;
  }

  get capacity() { return this.bags * BAG_SIZE; }

  /** Picks up another bag. Returns false (and says so) when already carrying the maximum. */
  takeBag(): boolean {
    if (this.bags >= MAX_BAGS) { this.toast("Can't carry more bags", 'bad'); return false; }
    this.bags++;
    this.toast(`Another bag! You can carry ${this.capacity} items now.`, 'good');
    sound.play('bag');
    return true;
  }
  get bagFull() { return this.bag.length >= this.capacity; }
  get bagSpace() { return Math.max(0, this.capacity - this.bag.length); }
  get hour() { return hourOf(this.minute); }
  get timeLeft() { return END_MINUTE - this.minute; }
  get shopsOpen() { return hourIn(this.hour, SHOP_OPEN, SHOP_CLOSE); }

  /** Advances the clock; returns true when the run just ended. */
  tick(dt: number) {
    if (this.status !== 'playing') return false;
    this.realTime += dt;
    const before = this.minute;
    this.minute = Math.min(END_MINUTE, this.minute + dt * GAME_MIN_PER_SEC * this.timeScale);
    const wasFed = this.hunger > 0;
    this.hunger = Math.max(0, this.hunger - (this.minute - before) / HUNGER.lasts);
    if (wasFed && this.hunger <= 0) this.stats.timesStarving++;
    if (!this.tipsy) this.tipsyLevel = 0;
    if (this.minute >= END_MINUTE) { this.status = 'ended'; return true; }
    return false;
  }

  /** Rolls a new item as found at a source. */
  rollItem(source: SourceKind): Item {
    const kind = this.rng.weighted(KIND_ODDS);
    const odds = CONDITION[source];
    const r = this.rng.next();
    let cond: ItemCondition = 'fine';
    if (r < odds.crushed) cond = 'crushed';
    else if (r < odds.crushed + odds.wet) cond = 'wet';
    else if (r < odds.crushed + odds.wet + odds.nodeposit) cond = 'nodeposit';
    return { kind, cond };
  }

  /** Puts up to n new items from a source into the bag. Returns how many fit.
   *  `kinds` fixes the item kinds (for items the player could see lying there). */
  collect(n: number, source: SourceKind, kinds?: ItemKind[]) {
    const take = Math.min(n, this.bagSpace);
    for (let i = 0; i < take; i++) {
      const it = this.rollItem(source);
      if (kinds?.[i]) it.kind = kinds[i];
      this.bag.push(it);
    }
    this.stats.itemsCollected += take;
    return take;
  }

  /** collect() plus the pickup toast. */
  pickup(n: number, source: SourceKind, kinds?: ItemKind[]) {
    const got = this.collect(n, source, kinds);
    if (got > 0) {
      this.toast(`+${got} ${got === 1 ? 'item' : 'items'}${got < n ? ' — bag full!' : ''}`, got < n ? 'bad' : 'good');
      sound.play(got > 3 ? 'bag' : 'pickup');
      if (got > 1) setTimeout(() => sound.play('pickup', 0.7), 90);
    }
    return got;
  }

  /** Removes and returns the next item to feed into a machine. */
  takeFromBag(): Item | undefined { return this.bag.shift(); }

  /** Counts one item accepted by a machine; returns its value. Money arrives with the receipt. */
  acceptItem() {
    this.stats.itemsReturned++;
    return ITEM_VALUE_FT;
  }

  /** The receipt: money goes straight into the total. */
  payout(ft: number) { this.money += ft; }

  /** Loses one glass item (running with a full bag). */
  breakGlass() {
    const i = this.bag.findIndex((it) => it.kind === 'glass');
    if (i < 0) return false;
    this.bag.splice(i, 1);
    this.stats.glassBroken++;
    return true;
  }

  /** Loses `n` random items from the bag. */
  loseItems(n: number) {
    for (let i = 0; i < n && this.bag.length; i++) this.bag.splice(this.rng.int(0, this.bag.length - 1), 1);
  }

  onToast(fn: (t: Toast) => void) { this.toastListeners.push(fn); }
  toast(text: string, kind: Toast['kind'] = 'info') { this.toastListeners.forEach((fn) => fn({ text, kind })); }
}
