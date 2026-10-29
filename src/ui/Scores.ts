import type { ScoreEntry, ScoreStore } from '../state/scores';
import { formatFt } from '../state/time';

// The top 10 table: rank, portrait, name, amount. A run that made it is highlighted.

export async function renderScores(el: HTMLElement, store: ScoreStore, highlightId?: string) {
  const list = await store.top();
  const table = document.createElement('table');
  table.className = 'scores';
  if (!list.length) {
    el.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No scores yet. Be the first on the wall of fame!' }));
    return;
  }
  list.forEach((e: ScoreEntry, i) => {
    const tr = document.createElement('tr');
    if (e.id === highlightId) tr.className = 'me';
    const img = document.createElement('img');
    img.src = e.portrait;
    img.width = img.height = 40;
    img.alt = '';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const cells: (string | HTMLElement)[] = [`${i + 1}.`, img, e.name, formatFt(e.amountFt)];
    for (const c of cells) {
      const td = document.createElement('td');
      if (typeof c === 'string') td.textContent = c; else td.appendChild(c);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  el.replaceChildren(table);
  if (store.offline) el.appendChild(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'offline' }));
}
