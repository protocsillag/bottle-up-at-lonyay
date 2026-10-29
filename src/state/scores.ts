// High scores behind a ScoreStore interface: local (localStorage) now, a Cloudflare
// Worker + D1 store in M10 with this one kept as the offline fallback.

export interface ScoreEntry {
  id: string;
  name: string;
  amountFt: number;
  items: number;
  /** 128 × 128 PNG data URL. */
  portrait: string;
  createdAt: number; // ms since epoch
}

export interface ScoreStore {
  /** Top entries, best first (amount desc, earlier date first on ties). */
  top(n?: number): Promise<ScoreEntry[]>;
  /** Saves a run. Returns its rank (1-based) if it made the top 10, else null. */
  add(entry: Omit<ScoreEntry, 'id' | 'createdAt'>): Promise<{ rank: number | null; entry: ScoreEntry }>;
  /** True when the store could not reach its backend (shown as "offline"). */
  readonly offline: boolean;
}

export const TOP_N = 10;

export function sortScores(a: ScoreEntry, b: ScoreEntry) {
  return b.amountFt - a.amountFt || a.createdAt - b.createdAt;
}

export class LocalScoreStore implements ScoreStore {
  readonly offline = false;
  constructor(private key = 'bual.scores.v1') {}

  private read(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(this.key);
      const arr = raw ? (JSON.parse(raw) as ScoreEntry[]) : [];
      return Array.isArray(arr) ? arr.filter((e) => e && typeof e.amountFt === 'number') : [];
    } catch { return []; }
  }

  private write(list: ScoreEntry[]) {
    try { localStorage.setItem(this.key, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  }

  async top(n = TOP_N) { return this.read().sort(sortScores).slice(0, n); }

  async add(e: Omit<ScoreEntry, 'id' | 'createdAt'>) {
    const entry: ScoreEntry = { ...e, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
    const list = this.read();
    list.push(entry);
    list.sort(sortScores);
    const idx = list.findIndex((x) => x.id === entry.id);
    // Keep a few more than the table shows so ties and deletions stay sane.
    this.write(list.slice(0, TOP_N * 2));
    return { rank: idx < TOP_N ? idx + 1 : null, entry };
  }
}
