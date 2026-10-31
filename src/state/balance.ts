// All gameplay tuning numbers in one place. Times in game minutes unless noted.
// Target (BRIEF): ~1 400 items spawn per run, ceiling ~50 000 Ft, strong run 25–35k.

export const ITEM_VALUE_FT = 50;
export const BAG_SIZE = 50;
export const MAX_BAGS = 3;
/** Extra bags hidden per run, and the share of them on the street (rest in courtyards). */
/** Extra bags: one behind a Nehru part kiosk and one on Ráday utca (the book kiosk or the
 *  empty lot) every run, plus a bag in about one courtyard in ten. */
export const EXTRA_BAGS = { courtyardChance: 0.1 };
export const SHOP_OPEN = 6;
export const SHOP_CLOSE = 24;

export const STREET = {
  initial: 45, // street spots holding items at Friday 08:00
  perHour: 5, // new street spots per game hour (before the time-of-day multiplier)
  maxActive: 220,
  items: [1, 2] as const,
};

export const HIDDEN = {
  count: 44, // spots per run
  items: [2, 6] as const,
  showWithin: 6, // metres: the glint only appears up close
};

/** Public bin types (reference/bins/): green mesh hoop bins in side streets, Ráday and
 *  Bakáts tér; lime-green post bins on main streets, the körút and Kálvin tér. */
export const BIN_TYPES = {
  hoop: { items: [1, 5] as const },
  lime: { items: [1, 4] as const },
};

/** Wheelie bins put out on the pavement for collection on the run's mornings, until the
 *  garbage truck takes them in between 08:00 and 10:00. */
export const WHEELIES = { groups: 6, perGroup: [3, 5] as const, items: [4, 12] as const, hold: 3, out: [5, 6] as const, truck: [8, 10] as const };

/** Renovation skips: one-off street jackpots. */
export const SKIP = { items: [10, 25] as const, hold: 5 };

export const BINS = {
  count: 70, // public bins used per run (from OSM, topped up where sparse)
  items: [2, 8] as const,
  hold: 2, // real seconds
  refill: 6 * 60,
};

export const PARTY = {
  perNight: 4,
  items: [15, 30] as const,
  hold: 3,
  from: 22, to: 4, // spawn window (hours)
  clearAt: 9, // street cleaners clear leftovers at 09:00
};

// Pickup condition odds per source (fine is the remainder). Crushed, wet and no-deposit
// items are always rejected by the machine; together with machine hiccups on fine items
// that makes about 1 in 8 items rejected (BRIEF). Bins: more crushed; street: more wet.
export const CONDITION = {
  street: { crushed: 0.025, wet: 0.055, nodeposit: 0.02 },
  hidden: { crushed: 0.02, wet: 0.04, nodeposit: 0.02 },
  bin: { crushed: 0.06, wet: 0.02, nodeposit: 0.02 },
  party: { crushed: 0.05, wet: 0.03, nodeposit: 0.02 },
  courtyard: { crushed: 0.055, wet: 0.02, nodeposit: 0.025 },
  jackpot: { crushed: 0.04, wet: 0.02, nodeposit: 0.015 },
} as const;

/** Kind odds: plastic, can, glass. */
export const KIND_ODDS = { pet: 0.45, can: 0.38, glass: 0.17 } as const;

/** Running with a nearly full bag: chance per real second to break a glass bottle. */
export const GLASS_BREAK = { minFill: 0.8, perSecond: 1 / 25 };

export const COURTYARD = {
  bellOdds: 0.4, // 4 in 10 rings buzz the door open
  binItems: [5, 20] as const,
  /** Courtyard bins by lid colour (reference/bins/): yellow-lid recycling holds the bottles,
   *  green mixed waste a few (often crushed or wet), blue-lid paper nothing. */
  binKinds: { recycling: [8, 20] as const, mixed: [0, 5] as const, paper: [0, 0] as const },
  binKindOdds: { recycling: 0.45, mixed: 0.35, paper: 0.2 },
  binHold: 4,
  binRefill: 12 * 60,
  jackpots: [3, 4] as const,
  jackpotItems: [40, 80] as const,
  jackpotHold: 6,
  hazmester: 0.25,
  hazmesterJackpot: 0.7,
  hazmesterAsleep: 0.7, // at night
};

export const MOHU = {
  feedRate: 3, // items per real second while Space is held
  hiccup: 0.035, // chance a fine item is refused with "Próbálja újra"
  hiccupAgain: 0.35, // chance the retry hiccups again
  mashPresses: 7, // E presses to pop a crushed item back into shape
  wipeHold: 1.2, // seconds of holding E to wipe a wet label
  alignTolerance: 0.26, // radians either side of upright that counts as green
  queueOdds: [0.5, 0.35, 0.15], // 0, 1 or 2 people already at the machines
  queueTime: [8, 20] as const, // real seconds each (at most 20 s wait)
  megtelt: 0.1, // chance one machine is full on arrival
};

export const DOG = {
  fixedPiles: 28,
  slowSeconds: 60, // real seconds
  slowFactor: 0.7,
};

export const BIKE = {
  count: [6, 10] as const,
  speed: 12, // 1.5× the original 8 m/s
  crashSpeed: 4.5, // m/s: hitting a wall or a person faster than this throws you off
  stun: 2.5, // real seconds on the ground
};

/** The world spawns about this many items per run (BRIEF). Sources roll their contents
 *  through GameState.supply(): full amounts until SOFT of the budget is used, then
 *  thinning out to MIN_FACTOR, so a perfect run tops out near the 50 000 Ft ceiling. */
export const SUPPLY = { budget: 1400, soft: 0.35, minFactor: 0.12 };

// ---- M10: hunger, the till, beer, traffic
export const HUNGER = {
  lasts: 14 * 60, // game minutes from full to empty (~9 real minutes, ~3 times a run)
  warnAt: 0.25,
  speed: 0.6, // walking speed multiplier when starving (and no running)
};
export const TILL = { food: 100, beer: 200 };
/** M13 fire barrel fight. Distances are in fight units: the arena is 1600 wide, a
 *  fighter about 360 tall (40% of the 900-unit-high screen). Times in real seconds. */
export const FIGHT = {
  health: 100,
  time: 180,
  walk: 270,
  jumpSpeed: 980,
  gravity: 2700,
  arena: [140, 1460] as const,
  // Moves: startup, active and recovery times, reach, damage.
  punch: { startup: 0.07, active: 0.08, recovery: 0.16, reach: 150, damage: 6 },
  kick: { startup: 0.15, active: 0.1, recovery: 0.26, reach: 215, damage: 9 },
  jumpKick: { reach: 190, damage: 12 },
  special: { startup: 0.6, active: 0.12, recovery: 0.4, reach: 230, damage: 18, cooldown: 10 },
  zsigaSpecial: { startup: 0.55, active: 0.12, recovery: 0.45, reach: 200, damage: 16, every: [8, 12] as const },
  blockedDamage: 1,
  hitStun: 0.32,
  blockStun: 0.16,
  knockback: 70,
  blockKnockback: 28,
  knockdown: 1.1,
  getUpInvuln: 0.6,
  /** Zsiga's brain: reaction time, block chance, gap between attacks. */
  ai: { react: [0.35, 0.5] as const, block: 0.3, attackGap: [0.95, 1.7] as const, range: 175, walk: 0.8 },
  /** Zsiga is big and slow: his punches and kicks wind up this much longer. */
  zsigaWindup: 1.25,
  /** The player's punches do +1 per tipsy level. */
  tipsyPunch: 1,
};

export const TIPSY = {
  /** Real minutes tipsy after the 1st, 2nd and 3rd beer in a row; more beers keep the last. */
  realMinutes: [3, 4, 5] as const,
  speed: 1.2,
  maxLevel: 3, // wobble strength stacks with each beer while tipsy
  peeSeconds: 3,
  kickHold: 1, // hold E on a public bin to kick it over
};
export const TRAFFIC = {
  speed: 8, // m/s (~30 km/h)
  near: [22, 12, 6] as const, // cars around the player: day, evening/night, 02–06
  lostItems: [1, 5] as const, // items lost when hit
  knockdown: 2, // real seconds on the ground
};
