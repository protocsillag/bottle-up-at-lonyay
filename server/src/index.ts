import { IMPORT_MAX, checkScore, type ScoreInput } from '../../src/state/scoreRules';

// The shared top 10 for Bottle Up at Lónyay.
//   GET  /scores          -> { scores: Entry[] }   (top 10, best first)
//   POST /scores          -> { rank: number | null, entry: Entry }
//   POST /scores/import   -> { added: number }     (the game's local scores, once)
// Light anti-cheat: the rules in src/state/scoreRules.ts (≤ 50 000 Ft, ≤ 50 Ft per item,
// names ≤ 16 characters and the blocklist, portraits ≤ 20 KB) and one post per minute per IP.

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}

interface Row { id: string; name: string; amount_ft: number; items: number; portrait: string; created_at: number; }
const TOP_N = 10;
const RATE_MS = 60_000;

const entry = (r: Row) => ({ id: r.id, name: r.name, amountFt: r.amount_ft, items: r.items, portrait: r.portrait, createdAt: r.created_at });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const cors: Record<string, string> = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'GET' && pathname === '/scores') {
        const { results } = await env.DB.prepare('SELECT id, name, amount_ft, items, portrait, created_at FROM scores ORDER BY amount_ft DESC, created_at ASC LIMIT ?')
          .bind(TOP_N).all<Row>();
        return json({ scores: results.map(entry) });
      }
      if (req.method === 'POST' && (pathname === '/scores' || pathname === '/scores/import')) {
        if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
        const body = await req.json<unknown>().catch(() => null);
        const many = pathname === '/scores/import';
        const list = (many ? (body as { scores?: unknown })?.scores : [body]) as (ScoreInput & { clientId?: string; createdAt?: number })[] | undefined;
        if (!Array.isArray(list) || list.length < 1 || list.length > (many ? IMPORT_MAX : 1)) return json({ error: 'Bad request' }, 400);
        for (const e of list) {
          const err = checkScore(e);
          if (err) return json({ error: err }, 400);
          if (e.clientId !== undefined && (typeof e.clientId !== 'string' || e.clientId.length > 40)) return json({ error: 'Bad id' }, 400);
        }
        // One post per minute per IP.
        const ipHash = await hashIp(req.headers.get('CF-Connecting-IP') ?? 'local');
        const now = Date.now();
        const last = await env.DB.prepare('SELECT last_at FROM rate WHERE ip_hash = ?').bind(ipHash).first<number>('last_at');
        if (last !== null && now - last < RATE_MS) {
          return json({ error: 'Too many posts, try again in a minute', retryAfter: Math.ceil((RATE_MS - (now - last)) / 1000) }, 429);
        }
        await env.DB.batch([
          env.DB.prepare('INSERT INTO rate (ip_hash, last_at) VALUES (?, ?) ON CONFLICT(ip_hash) DO UPDATE SET last_at = excluded.last_at').bind(ipHash, now),
          env.DB.prepare('DELETE FROM rate WHERE last_at < ?').bind(now - 3_600_000), // forget old IP hashes
        ]);

        const rows = list.map((e) => ({
          id: crypto.randomUUID(),
          clientId: e.clientId ?? null,
          name: e.name.trim(),
          amount: e.amountFt,
          items: e.items,
          portrait: e.portrait,
          // Imported local scores keep their date (never in the future); new runs are stamped now.
          createdAt: many && Number.isInteger(e.createdAt) ? Math.min(e.createdAt!, now) : now,
        }));
        const ins = env.DB.prepare('INSERT OR IGNORE INTO scores (id, client_id, name, amount_ft, items, portrait, created_at, imported) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const res = await env.DB.batch(rows.map((r) => ins.bind(r.id, r.clientId, r.name, r.amount, r.items, r.portrait, r.createdAt, many ? 1 : 0)));
        const added = res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
        if (many) return json({ added });

        // A single run: if this client id was already on the board, report that entry.
        const r = rows[0];
        const saved = added ? r : await env.DB.prepare('SELECT id, name, amount_ft AS amount, items, portrait, created_at AS createdAt FROM scores WHERE client_id = ?')
          .bind(r.clientId).first<typeof r>();
        if (!saved) return json({ error: 'Not saved' }, 500);
        const better = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE amount_ft > ? OR (amount_ft = ? AND created_at < ?)')
          .bind(saved.amount, saved.amount, saved.createdAt).first<number>('n');
        const rank = (better ?? 0) + 1;
        return json({ rank: rank <= TOP_N ? rank : null, entry: entry({ id: saved.id, name: saved.name, amount_ft: saved.amount, items: saved.items, portrait: saved.portrait, created_at: saved.createdAt }) });
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: 'Server error', detail: String(e) }, 500);
    }
  },
};

async function hashIp(ip: string) {
  const data = new TextEncoder().encode(`bottle-up:${ip}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
