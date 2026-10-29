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
  /** Key to use instead of E (bikes use F). */
  key?: string;
  act(): void;
}

export type InteractableSource = (x: number, z: number) => Iterable<Interactable>;

export class Interaction {
  private sources: InteractableSource[] = [];
  target: Interactable | null = null;
  progress = 0; // 0–1 while holding
  prompt: string | null = null;
  promptBlocked = false;
  promptKey = 'E';
  /** Set by other systems to switch interaction off. */
  disabledReason: string | null = null;
  /** Blocks only hold-E actions (searching bins on a bike). */
  holdDisabledReason: string | null = null;

  add(src: InteractableSource) { this.sources.push(src); }

  update(dt: number, input: Input, px: number, pz: number, facing: number) {
    let best: Interactable | null = null, bestScore = Infinity;
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    for (const src of this.sources) {
      for (const it of src(px, pz)) {
        const dx = it.x - px, dz = it.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > it.reach || it.label() === null) continue;
        // Prefer things in front of the player.
        const front = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        const score = d * (1.4 - 0.4 * front);
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best !== this.target) { this.target = best; this.progress = 0; }
    this.prompt = null;
    this.promptBlocked = false;
    if (!best) return;

    const blocked = this.disabledReason ?? (best.hold > 0 ? this.holdDisabledReason : null) ?? best.blocked?.() ?? null;
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
      if (this.progress >= 1) {
        this.progress = 0;
        best.act();
      }
    } else {
      this.progress = 0;
    }
  }
}
