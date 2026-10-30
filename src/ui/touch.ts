import type { Input } from '../player/input';

// Phone controls (M14), modelled on Kiruna: The Game. A floating joystick under the left
// thumb, drag-to-look and pinch-to-zoom on the right, and button sets for the street, the
// Mohu machine and the fight. Everything feeds the same Input as the keyboard (virtual key
// codes), so the game systems do not know whether a key or a thumb pressed it.

/** A touchscreen with no mouse: phones and tablets. A laptop with a touchscreen stays a desktop. */
export const isTouchDevice = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

const STICK_R = 60; // px of thumb travel for full deflection
const DEAD = 0.12;
const LOOK_GAIN = 1.4;
const PINCH_STEP = 40; // px of pinch per zoom step

export type TouchMode = 'none' | 'street' | 'mohu' | 'fight';
export type MohuPhase = 'ready' | 'flying' | 'returning' | 'fix' | 'align' | 'lost' | 'pushing' | 'printing';

export interface TouchContext {
  /** A bike in reach, or riding one. */
  bike: boolean;
  /** Tipsy and facing a wall. */
  pee: boolean;
  /** Out of breath: the Run toggle switches itself off. */
  exhausted: boolean;
  mohuPhase: MohuPhase | null;
  mohuReason: string | null;
  mohuAligned: boolean;
  /** Key the prompt button holds (E, or F for bikes). */
  promptKey: string;
}

function el(tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.append(e);
  return e;
}

export class TouchControls {
  private layer = el('div', 'touch-layer', document.body);
  private base = el('div', 'stick-base idle', this.layer);
  private knob = el('div', 'stick-knob', this.base);
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private looks = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private mode: TouchMode = 'none';
  private running = false;
  private run: HTMLElement;
  private bike: HTMLElement;
  private pee: HTMLElement;
  private mohu: Record<'feed' | 'fix' | 'left' | 'right' | 'push' | 'done', HTMLElement>;
  private away: HTMLElement;
  private map: HTMLElement;
  private promptKey = 'KeyE';

  constructor(private input: Input, onPause: () => void) {
    const bar = el('div', 'touch-bar', document.body);
    this.tapButton(bar, '❚❚', 'pause', () => (this.mode === 'fight' ? input.tap('Escape') : onPause()));
    this.map = this.tapButton(bar, 'Map', 'large map', () => input.tap('KeyM'));
    this.away = this.tapButton(bar, 'Walk away', 'walk away from the machine', () => input.tap('KeyS'));
    this.away.classList.add('tc-mohu-only');

    // Street: Run (toggle, like Kiruna's Jog), Jump, Bike, Pee.
    const street = el('div', 'touch-street', document.body);
    this.run = this.tapButton(street, 'Run', 'run', () => this.setRun(!this.running));
    this.run.classList.add('t-run');
    this.holdButton(street, 'Jump', 'Space').classList.add('t-jump');
    this.bike = this.tapButton(street, 'Bike', 'get on or off a bike', () => input.tap('KeyF'));
    this.bike.classList.add('t-bike');
    this.pee = this.tapButton(street, 'Pee', 'pee on the wall', () => input.tap('KeyP'));
    this.pee.classList.add('t-pee');

    // Mohu machine.
    const m = el('div', 'touch-mohu', document.body);
    this.mohu = {
      feed: this.holdButton(m, 'Hold to feed', 'Space'),
      fix: this.holdButton(m, 'Fix', 'KeyE'),
      left: this.holdButton(m, '◀', 'KeyA'),
      right: this.holdButton(m, '▶', 'KeyD'),
      push: this.tapButton(m, 'Push', 'push it in', () => input.tap('Space')),
      done: this.tapButton(m, 'Done', 'take the receipt', () => input.tap('Space')),
    };
    for (const [k, b] of Object.entries(this.mohu)) b.classList.add(`m-${k}`);

    // Fight: Punch, Kick, Special in an arc on the right.
    const f = el('div', 'touch-fight', document.body);
    this.tapButton(f, 'Punch', 'punch', () => input.tap('KeyJ')).classList.add('f-punch');
    this.tapButton(f, 'Kick', 'kick', () => input.tap('KeyK')).classList.add('f-kick');
    this.tapButton(f, 'Special', 'bag swing', () => input.tap('KeyL')).classList.add('f-special');

    // The interaction prompt is the action button: tap for presses, hold for searches.
    const prompt = document.getElementById('prompt')!;
    prompt.addEventListener('pointerdown', (e) => {
      if (!document.body.classList.contains('touch')) return;
      e.preventDefault();
      e.stopPropagation();
      prompt.setPointerCapture(e.pointerId);
      prompt.classList.add('pressed');
      input.setHeld(this.promptKey, true);
    });
    const release = () => { prompt.classList.remove('pressed'); input.setHeld('KeyE', false); input.setHeld('KeyF', false); };
    prompt.addEventListener('pointerup', release);
    prompt.addEventListener('pointercancel', release);

    this.layer.addEventListener('pointerdown', (e) => this.down(e));
    this.layer.addEventListener('pointermove', (e) => this.move(e));
    this.layer.addEventListener('pointerup', (e) => this.up(e));
    this.layer.addEventListener('pointercancel', (e) => this.up(e));
  }

  setMode(mode: TouchMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const b = document.body.classList;
    for (const m of ['street', 'mohu', 'fight']) b.toggle(`tc-${m}`, m === mode);
    // Nothing stays held across a mode change (a thumb on Jump when the fight opens).
    this.resetStick();
    this.looks.clear();
    this.input.clearTouch();
    if (this.running && mode === 'street') this.input.setHeld('ShiftLeft', true);
    this.map.classList.toggle('hidden', mode !== 'street');
  }

  update(c: TouchContext) {
    this.promptKey = c.promptKey === 'F' ? 'KeyF' : 'KeyE';
    if (this.mode === 'street') {
      if (c.exhausted && this.running) this.setRun(false);
      this.bike.classList.toggle('hidden', !c.bike);
      this.pee.classList.toggle('hidden', !c.pee);
    }
    if (this.mode === 'mohu') {
      const p = c.mohuPhase;
      const show = (k: keyof typeof this.mohu, on: boolean) => this.mohu[k].classList.toggle('hidden', !on);
      show('feed', p === 'ready' || p === 'flying');
      show('fix', p === 'fix');
      this.mohu.fix.textContent = c.mohuReason === 'crushed' ? 'Tap: fix' : 'Hold: wipe';
      show('left', p === 'align');
      show('right', p === 'align');
      show('push', p === 'align');
      this.mohu.push.classList.toggle('dim', !c.mohuAligned);
      show('done', p === 'printing');
      this.away.classList.toggle('hidden', p === 'printing');
    }
  }

  private setRun(on: boolean) {
    this.running = on;
    this.input.setHeld('ShiftLeft', on);
    this.run.classList.toggle('on', on);
  }

  private tapButton(parent: HTMLElement, text: string, title: string, onTap: () => void): HTMLElement {
    const b = el('button', 'touch-btn', parent, text);
    b.setAttribute('aria-label', title);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('pressed');
      onTap();
    });
    const up = () => b.classList.remove('pressed');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }

  /** Holds a virtual key while the thumb stays on the button. */
  private holdButton(parent: HTMLElement, text: string, code: string): HTMLElement {
    const b = el('button', 'touch-btn', parent, text);
    b.setAttribute('aria-label', text);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('pressed');
      this.input.setHeld(code, true);
    });
    const up = () => { b.classList.remove('pressed'); this.input.setHeld(code, false); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.layer.setPointerCapture(e.pointerId);
    if (this.stickId === null && e.clientX < innerWidth * 0.45) {
      // The joystick appears wherever the left thumb lands.
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.classList.remove('idle');
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      return;
    }
    if (this.mode !== 'street') return; // no camera to turn in the mini-games
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.looks.size === 2) this.pinch = this.spread();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx *= STICK_R / len;
        dy *= STICK_R / len;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(len / STICK_R, 1);
      const scale = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD) / (mag || 1);
      this.input.setStick((dx / STICK_R) * scale, (-dy / STICK_R) * scale);
      return;
    }
    const prev = this.looks.get(e.pointerId);
    if (!prev) return;
    if (this.looks.size === 1) this.input.look((e.clientX - prev.x) * LOOK_GAIN, (e.clientY - prev.y) * LOOK_GAIN);
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (this.looks.size === 2) {
      const d = this.spread();
      this.input.zoom((this.pinch - d) / PINCH_STEP); // spread fingers → zoom in
      this.pinch = d;
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) { this.resetStick(); return; }
    this.looks.delete(e.pointerId);
    if (this.looks.size === 2) this.pinch = this.spread();
  }

  private resetStick() {
    this.stickId = null;
    this.input.setStick(0, 0);
    this.knob.style.transform = '';
    this.base.classList.add('idle');
    this.base.style.left = '';
    this.base.style.top = '';
  }

  private spread(): number {
    const [a, b] = [...this.looks.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
