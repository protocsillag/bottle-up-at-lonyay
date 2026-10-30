import { IMPORT_MAX, checkScore } from './scoreRules';

// High scores behind a ScoreStore interface: the shared board (Cloudflare Worker + D1,
// server/) when VITE_SCORES_URL is set at build time, with the local store kept as the
// offline fallback; otherwise local only.

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

/** The score Worker's URL, from VITE_SCORES_URL at build time (empty = local only). */
export const SCORES_URL: string = (import.meta.env.VITE_SCORES_URL ?? '').trim().replace(/\/+$/, '');

const TIMEOUT_MS = 6000;

class HttpError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }

/** The shared online board. Every run is also saved locally. Runs that could not be
 *  uploaded (offline, rate-limited) wait in a queue, and the first time the board is
 *  reachable the local scores from before M12 move up too ("import"). While the Worker
 *  is unreachable the table shows the last board seen plus the waiting local runs. */
export class OnlineScoreStore implements ScoreStore {
  offline = false;
  private local = new LocalScoreStore();
  private syncing: Promise<void> | null = null;
  private static PENDING = 'bual.scores.pending.v1';
  private static MIGRATED = 'bual.scores.migrated.v1';
  private static CACHE = 'bual.scores.online.v1';

  constructor(private url: string) {}

  private load<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
  }
  private save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* blocked */ } }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.url + path, body === undefined ? { signal: ctl.signal } : {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status, (data as { error?: string }).error ?? res.statusText);
      return data as T;
    } finally { clearTimeout(timer); }
  }

  /** Network down or server error (not a rejected run or the rate limit). */
  private unreachable(e: unknown) { return !(e instanceof HttpError) || e.status >= 500; }

  private upload(e: ScoreEntry) {
    return { name: e.name, amountFt: e.amountFt, items: e.items, portrait: e.portrait, clientId: e.id, createdAt: e.createdAt };
  }

  /** Uploads waiting runs, and the old local scores the first time. Never throws. */
  sync(): Promise<void> {
    if (!this.syncing) this.syncing = this.doSync().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async doSync() {
    const pending = this.load<ScoreEntry[]>(OnlineScoreStore.PENDING, []);
    const migrated = this.load<boolean>(OnlineScoreStore.MIGRATED, false);
    const old = migrated ? [] : await this.local.top(IMPORT_MAX);
    const seen = new Set<string>();
    const batch = [...pending, ...old].filter((e) => !seen.has(e.id) && seen.add(e.id) && !checkScore(e)).slice(0, IMPORT_MAX);
    if (!batch.length) { if (!migrated) this.save(OnlineScoreStore.MIGRATED, true); return; }
    try {
      await this.request('/scores/import', { scores: batch.map((e) => this.upload(e)) });
      const sent = new Set(batch.map((e) => e.id));
      this.save(OnlineScoreStore.PENDING, pending.filter((e) => !sent.has(e.id)));
      this.save(OnlineScoreStore.MIGRATED, true);
      this.offline = false;
    } catch (e) {
      if (this.unreachable(e)) this.offline = true;
      // A rejected batch (400) would never pass: drop it rather than retry forever.
      else if ((e as HttpError).status === 400) { this.save(OnlineScoreStore.PENDING, []); this.save(OnlineScoreStore.MIGRATED, true); }
    }
  }

  async top(n = TOP_N) {
    await this.sync();
    try {
      const { scores } = await this.request<{ scores: ScoreEntry[] }>('/scores');
      this.offline = false;
      this.save(OnlineScoreStore.CACHE, scores);
      return scores.slice(0, n);
    } catch {
      this.offline = true;
      // The last board seen, plus runs still waiting to go up.
      const cached = this.load<ScoreEntry[]>(OnlineScoreStore.CACHE, []);
      const pending = this.load<ScoreEntry[]>(OnlineScoreStore.PENDING, []);
      const base = cached.length ? cached : await this.local.top(n);
      const ids = new Set(base.map((e) => e.id));
      return [...base, ...pending.filter((e) => !ids.has(e.id))].sort(sortScores).slice(0, n);
    }
  }

  async add(e: Omit<ScoreEntry, 'id' | 'createdAt'>) {
    const mine = await this.local.add(e);
    try {
      const res = await this.request<{ rank: number | null; entry: ScoreEntry }>('/scores', this.upload(mine.entry));
      this.offline = false;
      // Keep the cached board current, so an offline view later still shows this run.
      if (res.rank) {
        const cached = this.load<ScoreEntry[]>(OnlineScoreStore.CACHE, []).filter((x) => x.id !== res.entry.id);
        this.save(OnlineScoreStore.CACHE, [...cached, res.entry].sort(sortScores).slice(0, TOP_N));
      }
      return res;
    } catch (err) {
      if (this.unreachable(err)) this.offline = true;
      // Offline or rate-limited: queue it. A run the board rejects stays local only.
      if (this.unreachable(err) || (err as HttpError).status === 429) {
        const pending = this.load<ScoreEntry[]>(OnlineScoreStore.PENDING, []);
        this.save(OnlineScoreStore.PENDING, [...pending, mine.entry].slice(-IMPORT_MAX));
      }
      return mine;
    }
  }
}

/** The store the game uses: online when a Worker URL was built in, else local. */
export function createScoreStore(): ScoreStore {
  return SCORES_URL ? new OnlineScoreStore(SCORES_URL) : new LocalScoreStore();
}
