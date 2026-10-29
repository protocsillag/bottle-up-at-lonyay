// All gameplay tuning numbers in one place. Times in game minutes unless noted.
// Target (BRIEF): ~1 400 items spawn per run, ceiling ~50 000 Ft, strong run 25–35k.

export const ITEM_VALUE_FT = 50;
export const BAG_SMALL = 40;
export const BAG_BIG = 100;
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

// Pickup condition odds per source (fine is the remainder).
export const CONDITION = {
  street: { crushed: 0.08, wet: 0.16, nodeposit: 0.05 },
  hidden: { crushed: 0.06, wet: 0.1, nodeposit: 0.05 },
  bin: { crushed: 0.2, wet: 0.08, nodeposit: 0.06 },
  party: { crushed: 0.15, wet: 0.1, nodeposit: 0.04 },
  courtyard: { crushed: 0.18, wet: 0.06, nodeposit: 0.06 },
  jackpot: { crushed: 0.12, wet: 0.05, nodeposit: 0.03 },
} as const;

/** Kind odds: plastic, can, glass. */
export const KIND_ODDS = { pet: 0.45, can: 0.38, glass: 0.17 } as const;

/** Running with a nearly full bag: chance per real second to break a glass bottle. */
export const GLASS_BREAK = { minFill: 0.8, perSecond: 1 / 25 };

export const COURTYARD = {
  bellOdds: 0.1, // 1 in 10 rings buzzes the door open
  binItems: [5, 20] as const,
  binHold: 4,
  binRefill: 12 * 60,
  jackpots: [3, 4] as const,
  jackpotItems: [40, 80] as const,
  jackpotHold: 6,
  hazmester: 0.25,
  hazmesterJackpot: 0.7,
  hazmesterAsleep: 0.7, // at night
};
