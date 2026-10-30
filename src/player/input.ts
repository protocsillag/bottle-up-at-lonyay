// Keyboard and pointer-lock mouse input, plus the hooks the phone controls feed
// (src/ui/touch.ts): an analog stick, virtual keys, look drags and pinch zoom.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Keys held by on-screen buttons (kept apart so a keyup or blur does not drop them). */
  private held = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Analog stick, −1…1; y is up (forward). Zero on desktop. */
  stickX = 0;
  stickY = 0;
  /** Phones have no pointer lock (iPhone has none at all): "locked" means "playing, not paused". */
  touch = false;
  private virtualLock = false;

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  get locked() { return this.touch ? this.virtualLock : document.pointerLockElement === this.canvas; }
  lock() {
    if (this.touch) {
      this.virtualLock = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return;
    }
    if (!this.canvas.requestPointerLock) return;
    try { void (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* not allowed now */ }
  }
  unlock() {
    if (this.touch) {
      if (!this.virtualLock) return;
      this.virtualLock = false;
      this.clearTouch();
      document.dispatchEvent(new Event('pointerlockchange'));
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  isDown(code: string) { return this.down.has(code) || this.held.has(code); }
  /** True once per key press. */
  wasPressed(code: string) { return this.pressed.has(code); }

  // ---- touch hooks
  setStick(x: number, y: number) { this.stickX = x; this.stickY = y; }
  setHeld(code: string, on: boolean) {
    if (on && !this.held.has(code)) this.pressed.add(code);
    if (on) this.held.add(code); else this.held.delete(code);
  }
  tap(code: string) { this.pressed.add(code); }
  look(dx: number, dy: number) { this.mouseDX += dx; this.mouseDY += dy; }
  zoom(steps: number) { this.wheel += steps; }
  /** Let go of everything the on-screen controls hold (pause, mode change). */
  clearTouch() { this.held.clear(); this.stickX = this.stickY = 0; }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }
}
