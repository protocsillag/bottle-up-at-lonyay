// Game time. The clock counts game minutes since Friday 00:00.
// 30 real minutes = 48 game hours, so one real second is 1.6 game minutes.

export const RUN_REAL_SECONDS = 30 * 60;
export const RUN_GAME_MINUTES = 48 * 60;
export const GAME_MIN_PER_SEC = RUN_GAME_MINUTES / RUN_REAL_SECONDS; // 1.6
export const START_MINUTE = 8 * 60; // Friday 08:00
export const END_MINUTE = START_MINUTE + RUN_GAME_MINUTES; // Sunday 08:00

const DAYS = ['Friday', 'Saturday', 'Sunday', 'Monday'];

/** Hour of day as a float, 0–24. */
export function hourOf(min: number) { return (min / 60) % 24; }
export function dayIndex(min: number) { return Math.floor(min / 1440); }
export function dayName(min: number, short = false) {
  const d = DAYS[dayIndex(min)] ?? '';
  return short ? d.slice(0, 3) : d;
}
/** "08:00" */
export function clockText(min: number) {
  const m = Math.floor(min) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** True if hour h (0–24) lies in [from, to), wrapping past midnight when from > to. */
export function hourIn(h: number, from: number, to: number) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
/** Game minutes from now until the next time the clock reads `hour`:00. */
export function minutesUntilHour(min: number, hour: number) {
  const m = min % 1440;
  let d = hour * 60 - m;
  if (d <= 0) d += 1440;
  return d;
}

/** Hungarian money format: 12 350 Ft (non-breaking spaces). */
export function formatFt(n: number) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`;
}
