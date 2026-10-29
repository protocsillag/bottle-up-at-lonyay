import { LINES, type Line } from './lines';

// Speaks a line: shows the Hungarian text with an English subtitle, and plays the
// generated voice file when one exists (M9). Subtitles always show.

const el = document.getElementById('subtitle')!;
let hideTimer = 0;
type Player = (line: Line) => void;
let player: Player | null = null;

/** M9 audio hooks in here. */
export function setVoicePlayer(p: Player) { player = p; }

export function say(idOrLine: string | Line, seconds = 3.2) {
  const line = typeof idOrLine === 'string' ? LINES[idOrLine] : idOrLine;
  if (!line) return;
  el.replaceChildren(
    Object.assign(document.createElement('div'), { className: 'hu', textContent: `„${line.hu}”` }),
    Object.assign(document.createElement('div'), { className: 'en', textContent: line.en }),
  );
  el.className = `show ${line.who}`;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => { el.className = ''; }, seconds * 1000);
  player?.(line);
}
