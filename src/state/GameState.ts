import { BAG_BIG, BAG_SMALL, CONDITION, ITEM_VALUE_FT, KIND_ODDS } from './balance';
import { Rng } from './rng';
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
}

export interface Toast { text: string; kind?: 'good' | 'bad' | 'info'; }

const freshStats = (): RunStats => ({
  itemsCollected: 0, itemsReturned: 0, itemsRejected: 0, glassBroken: 0, binsSearched: 0,
  doorsSlammed: 0, bellsRung: 0, dogIncidents: 0, hazmesterCatches: 0, itemsLostToHazmester: 0,
  bikeCrashes: 0, distance: 0,
});

export class GameState {
  rng: Rng;
  minute = START_MINUTE;
  money = 0;
  bag: Item[] = [];
  bigBag = false;
  status: RunStatus = 'ready';
  stats = freshStats();
  /** Real seconds since the run started (not counting pauses). */
  realTime = 0;
  /** Multiplies the clock speed (debug key T). */
  timeScale = 1;
  private toastListeners: ((t: Toast) => void)[] = [];

  constructor(seed: number) { this.rng = new Rng(seed); }

  reset(seed: number) {
    this.rng = new Rng(seed);
    this.minute = START_MINUTE;
    this.money = 0;
    this.bag = [];
    this.bigBag = false;
    this.status = 'playing';
    this.stats = freshStats();
    this.realTime = 0;
  }

  get capacity() { return this.bigBag ? BAG_BIG : BAG_SMALL; }
  get bagFull() { return this.bag.length >= this.capacity; }
  get bagSpace() { return Math.max(0, this.capacity - this.bag.length); }
  get hour() { return hourOf(this.minute); }
  get timeLeft() { return END_MINUTE - this.minute; }
  get shopsOpen() { return hourIn(this.hour, SHOP_OPEN, SHOP_CLOSE); }

  /** Advances the clock; returns true when the run just ended. */
  tick(dt: number) {
    if (this.status !== 'playing') return false;
    this.realTime += dt;
    this.minute = Math.min(END_MINUTE, this.minute + dt * GAME_MIN_PER_SEC * this.timeScale);
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
    if (got > 0) this.toast(`+${got} ${got === 1 ? 'item' : 'items'}${got < n ? ' — bag full!' : ''}`, got < n ? 'bad' : 'good');
    return got;
  }

  /** Removes and returns the next item to feed into a machine. */
  takeFromBag(): Item | undefined { return this.bag.shift(); }

  /** Pays for one accepted item. */
  payItem() {
    this.money += ITEM_VALUE_FT;
    this.stats.itemsReturned++;
  }

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
