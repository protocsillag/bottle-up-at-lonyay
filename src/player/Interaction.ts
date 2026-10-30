import type { Input } from './input';

// Finds the nearest thing the player can use and handles press / hold E.

export interface Interactable {
  x: number; z: number;
  /** Reach in metres. */
  reach: number;
  /** Prompt text; null hides this interactable entirely right now. */
  label(): string | null;
  /** If set, the prompt shows this instead and E does nothing (e.g. "Bag full"). */
  blocked?(): string | null;
  /** Real seconds to hold E; 0 = single press. */
  hold: number;
  /** Collecting something (blocked while starving). */
  collect?: boolean;
  /** Key to use instead of E (bikes use F). */
  key?: string;
  act(): void;
}

export type InteractableSource = (x: number, z: number) => Iterable<Interactable>;

export class Interaction {
  private sources: { src: InteractableSource; collect: boolean }[] = [];
  /** Blocks every collecting action (starving). */
  collectBlockedReason: string | null = null;
  target: Interactable | null = null;
  progress = 0; // 0–1 while holding
  prompt: string | null = null;
  promptBlocked = false;
  promptKey = 'E';
  private rustle = 0;
  /** Called every ~0.3 s while holding E (search sounds). */
  onRustle: () => void = () => {};
  /** Set by other systems to switch interaction off. */
  disabledReason: string | null = null;
  /** Blocks only hold-E actions (searching bins on a bike). */
  holdDisabledReason: string | null = null;

  /** collect: everything this source yields is a collecting action. */
  add(src: InteractableSource, collect = false) { this.sources.push({ src, collect }); }

  update(dt: number, input: Input, px: number, pz: number, facing: number) {
    let best: Interactable | null = null, bestScore = Infinity;
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    let bestCollect = false;
    for (const { src, collect } of this.sources) {
      for (const it of src(px, pz)) {
        const dx = it.x - px, dz = it.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > it.reach || it.label() === null) continue;
        // Prefer things in front of the player.
        const front = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        const score = d * (1.4 - 0.4 * front);
        if (score < bestScore) { bestScore = score; best = it; bestCollect = collect || !!it.collect; }
      }
    }
    if (best !== this.target) { this.target = best; this.progress = 0; }
    this.prompt = null;
    this.promptBlocked = false;
    if (!best) return;

    const blocked = this.disabledReason ?? (bestCollect ? this.collectBlockedReason : null) ?? (best.hold > 0 ? this.holdDisabledReason : null) ?? best.blocked?.() ?? null;
    if (blocked) {
      this.prompt = blocked;
      this.promptBlocked = true;
      this.progress = 0;
      return;
    }
    this.prompt = `${best.label()}${best.hold > 0 ? ' (hold)' : ''}`;
    this.promptKey = best.key === 'KeyF' ? 'F' : 'E';
    if (best.hold <= 0) {
      if (input.wasPressed(best.key ?? 'KeyE')) best.act();
      return;
    }
    if (input.isDown('KeyE')) {
      this.progress += dt / best.hold;
      this.rustle -= dt;
      if (this.rustle <= 0) { this.rustle = 0.28; this.onRustle(); }
      if (this.progress >= 1) {
        this.progress = 0;
        best.act();
      }
    } else {
      this.progress = 0;
    }
  }
}
