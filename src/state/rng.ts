// Small seeded RNG (mulberry32) so a run's random layout can be reproduced from its seed.

export class Rng {
  private s: number;
  constructor(readonly seed: number) { this.s = seed >>> 0; }

  /** Uniform in [0, 1). */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number) { return a + (b - a) * this.next(); }
  /** Integer in [a, b] inclusive. */
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }

  /** Picks a key by weight. */
  weighted<T extends string>(w: Record<T, number>): T {
    const entries = Object.entries(w) as [T, number][];
    let total = 0;
    for (const [, v] of entries) total += v;
    let r = this.next() * total;
    for (const [k, v] of entries) if ((r -= v) < 0) return k;
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function newSeed() { return (Math.random() * 2 ** 32) >>> 0; }
