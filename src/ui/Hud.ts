import type { GameState, RunStats } from '../state/GameState';
import type { Interaction } from '../player/Interaction';
import { END_MINUTE, GAME_MIN_PER_SEC, clockText, dayName, formatFt } from '../state/time';
import { SHOP_CLOSE, SHOP_OPEN } from '../state/balance';

// The in-run HUD: clock, money, bag, interaction prompt, toasts and status chips.

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private day = $('day');
  private countdown = $('countdown');
  private timeleft = $('timeleft');
  private warned5 = false;
  private lastTick = -1;
  /** Plays the last-minute tick (set by main). */
  onTick: () => void = () => {};
  private time = $('time');
  private shops = $('shops');
  private money = $('money');
  private bagCount = $('bagcount');
  private bagFill = $('bag-fill');
  private wallet = $('wallet');
  private status = $('status');
  private prompt = $('prompt');
  private promptText = $('prompt-text');
  private promptKeyEl = $('prompt-key');
  private promptFill = $('prompt-fill');
  private toasts = $('toasts');
  private lastStatus = '';

  constructor(state: GameState) {
    state.onToast((t) => {
      const el = document.createElement('div');
      el.className = `toast ${t.kind ?? ''}`;
      el.textContent = t.text;
      this.toasts.appendChild(el);
      while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
      setTimeout(() => el.remove(), 2700);
    });
  }

  update(state: GameState, inter: Interaction, status: string[]) {
    // Countdown in real time, with the game time left under it.
    const realLeft = Math.max(0, (END_MINUTE - state.minute) / GAME_MIN_PER_SEC);
    const m = Math.floor(realLeft / 60), sec = Math.floor(realLeft % 60);
    this.countdown.textContent = `Ends in ${m}:${String(sec).padStart(2, '0')}`;
    this.timeleft.textContent = `Ends Sunday 08:00 · ${Math.ceil(state.timeLeft / 60)} h left`;
    this.countdown.classList.toggle('warn', realLeft <= 300 && realLeft > 60);
    this.countdown.classList.toggle('final', realLeft <= 60);
    if (state.minute < END_MINUTE - 300 * GAME_MIN_PER_SEC) this.warned5 = false;
    if (realLeft <= 300 && !this.warned5 && state.status === 'playing') {
      this.warned5 = true;
      state.toast('5 minutes left — empty your bags!', 'bad');
    }
    if (realLeft <= 60 && state.status === 'playing' && Math.floor(realLeft) !== this.lastTick) {
      this.lastTick = Math.floor(realLeft);
      this.onTick();
    }
    this.day.textContent = dayName(state.minute);
    this.time.textContent = clockText(state.minute);
    const open = state.shopsOpen;
    this.shops.textContent = open ? `Machines open until ${SHOP_CLOSE === 24 ? '24:00' : SHOP_CLOSE}` : `Machines closed — open at 0${SHOP_OPEN}:00`;
    this.shops.classList.toggle('closed', !open);
    this.money.textContent = formatFt(state.money);
    this.bagCount.textContent = `${state.bag.length} / ${state.capacity} · ${state.bags} ${state.bags === 1 ? 'bag' : 'bags'}`;
    this.bagFill.style.width = `${(state.bag.length / state.capacity) * 100}%`;
    this.wallet.classList.toggle('full', state.bagFull);

    const s = status.join('|');
    if (s !== this.lastStatus) {
      this.lastStatus = s;
      this.status.replaceChildren(...status.map((t) => Object.assign(document.createElement('span'), { textContent: t })));
    }

    if (inter.prompt) {
      this.prompt.classList.remove('hidden');
      this.promptText.textContent = inter.prompt;
      this.promptKeyEl.textContent = inter.promptKey;
      this.prompt.classList.toggle('blocked', inter.promptBlocked);
      const holding = !inter.promptBlocked && (inter.target?.hold ?? 0) > 0;
      this.prompt.classList.toggle('holding', holding);
      this.promptFill.style.width = `${inter.progress * 100}%`;
    } else {
      this.prompt.classList.add('hidden');
    }
  }
}

/** Picks the funniest stat for the end screen. */
export function funniestStat(s: RunStats): string {
  const options: [number, string][] = [
    [s.hazmesterCatches * 3, `Caught by the házmester ${s.hazmesterCatches}× (lost ${s.itemsLostToHazmester} items)`],
    [s.dogIncidents * 2.5, `Stepped in dog mess ${s.dogIncidents}×`],
    [s.doorsSlammed * 1.2, `Doors that slammed in your face: ${s.doorsSlammed}`],
    [s.bellsRung * 0.4, `Doorbells rung: ${s.bellsRung}. The grannies remember you.`],
    [s.glassBroken * 2, `Glass bottles smashed by running: ${s.glassBroken}`],
    [s.bikeCrashes * 2, `Bike crashes: ${s.bikeCrashes}`],
    [s.itemsRejected * 0.3, `Items the machine refused: ${s.itemsRejected}`],
    [s.binsSearched * 0.2, `Bins searched: ${s.binsSearched}`],
    [s.wallsWatered * 2.5, `Walls watered: ${s.wallsWatered}`],
    [s.binsKicked * 2, `Bins kicked over: ${s.binsKicked}`],
    [s.carHits * 3, `Hit by cars ${s.carHits}× (${s.itemsLostToCars} items smashed)`],
    [s.beersBought * 1.5, `Beers: ${s.beersBought}. Folyékony kenyér!`],
    [s.timesStarving * 2, `Went hungry ${s.timesStarving}×`],
  ];
  options.sort((a, b) => b[0] - a[0]);
  return options[0][0] > 0 ? options[0][1] : `You walked ${(s.distance / 1000).toFixed(1)} km and kept your shoes clean.`;
}
