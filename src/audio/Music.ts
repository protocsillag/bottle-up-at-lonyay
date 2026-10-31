// Background music: one track for the menus (title, creator, intro, end screen, high
// scores) and one for the run. Both are optional files in public/audio/music/
// (see the README there). A missing file means no music for that screen, silently.
// The tracks loop and cross-fade when the screen changes.

export type MusicTrack = 'menu' | 'game';

const FILES: Record<MusicTrack, string> = { menu: 'menu.mp3', game: 'game.mp3' };
const FADE = 1.2; // seconds

export class Music {
  private els: Partial<Record<MusicTrack, HTMLAudioElement>> = {};
  private want: MusicTrack | null = null;
  private unlocked = false;
  private level: Record<MusicTrack, number> = { menu: 0, game: 0 };
  private timer = 0;
  /** Master × music volume, 0 when muted (settings). */
  volume = 0.5;

  constructor() {
    for (const t of Object.keys(FILES) as MusicTrack[]) void this.probe(t);
  }

  /** Only real audio files count: a dev server may answer a missing path with index.html. */
  private async probe(t: MusicTrack) {
    const url = `${import.meta.env.BASE_URL}audio/music/${FILES[t]}`;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('audio')) return;
    } catch { return; }
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    this.els[t] = el;
    this.sync();
  }

  /** Browsers only start audio after a click or key press. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.sync();
  }

  play(track: MusicTrack) {
    if (this.want === track) return;
    this.want = track;
    this.sync();
  }

  setVolume(v: number) {
    this.volume = v;
    this.sync();
  }

  /** Steps the fades (a small timer, so it also runs while the game loop skips frames). */
  private sync() {
    if (this.timer) return;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let busy = false;
      for (const t of Object.keys(FILES) as MusicTrack[]) {
        const el = this.els[t];
        if (!el) continue;
        const target = this.unlocked && t === this.want && this.volume > 0 ? 1 : 0;
        const l = this.level[t];
        this.level[t] = target > l ? Math.min(target, l + dt / FADE) : Math.max(target, l - dt / FADE);
        el.volume = Math.min(1, this.level[t] * this.volume);
        if (this.level[t] > 0 && el.paused) void el.play().catch(() => {});
        if (this.level[t] === 0 && !el.paused) el.pause();
        if (this.level[t] !== target) busy = true;
      }
      this.timer = busy ? window.setTimeout(step, 50) : 0;
    };
    this.timer = window.setTimeout(step, 0);
  }
}

export const music = new Music();
