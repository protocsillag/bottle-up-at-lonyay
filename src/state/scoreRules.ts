// Rules shared by the game and the score Worker (server/ imports this file), so both
// sides check names and amounts the same way. No browser or Three.js imports here.

/** Ceiling for one run (BRIEF: 50 000 Ft, 1 000 items). */
export const MAX_AMOUNT_FT = 50_000;
/** Deposit per returned item; a run cannot end with more than items × this. */
export const FT_PER_ITEM = 50;
export const MAX_ITEMS = 1_000;
export const NAME_MAX = 16;
/** Portrait data URL, at most 20 KB. */
export const PORTRAIT_MAX = 20 * 1024;
/** Local scores uploaded in one go when the online board first appears. */
export const IMPORT_MAX = 20;

const BLOCK = ['cigany', 'buzi', 'nigger', 'nigga', 'faggot', 'fagot', 'retard', 'kurva', 'geci', 'fasz', 'picsa', 'zsido', 'nazi', 'hitler', 'cunt', 'whore'];

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

/** Returns an error message, or null if the name is fine. Accents allowed, 1–16 characters. */
export function checkName(name: string): string | null {
  const n = name.trim();
  if (n.length < 1) return 'Type a name';
  if ([...n].length > NAME_MAX) return `Max ${NAME_MAX} characters`;
  if (!/^[\p{L}\p{N} .'\-_!?]+$/u.test(n)) return 'Letters, numbers and spaces only';
  const f = fold(n.replace(/[0-9]/g, (d) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's' }[d] ?? '')));
  if (BLOCK.some((w) => f.includes(w))) return 'Pick a friendlier name';
  return null;
}

export interface ScoreInput { name: string; amountFt: number; items: number; portrait: string; }

/** Validates a run before it goes on the board. Returns an error message or null. */
export function checkScore(e: ScoreInput): string | null {
  if (!e || typeof e !== 'object') return 'Bad request';
  if (typeof e.name !== 'string') return 'Bad name';
  const nameErr = checkName(e.name);
  if (nameErr) return nameErr;
  if (!Number.isInteger(e.amountFt) || e.amountFt < 1 || e.amountFt > MAX_AMOUNT_FT) return 'Amount out of range';
  if (!Number.isInteger(e.items) || e.items < 0 || e.items > MAX_ITEMS) return 'Items out of range';
  if (e.amountFt > e.items * FT_PER_ITEM) return 'Amount does not match the items returned';
  if (typeof e.portrait !== 'string' || e.portrait.length > PORTRAIT_MAX) return 'Portrait too large';
  if (e.portrait && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(e.portrait)) return 'Bad portrait';
  return null;
}
