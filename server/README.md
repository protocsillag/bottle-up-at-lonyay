# Score server (M12)

The shared top 10: a Cloudflare Worker with a D1 database, on the free plan.

- `GET /scores`: the top 10, best first (ties go to the earlier run).
- `POST /scores`: adds one run and returns its rank (or `null` outside the top 10).
- `POST /scores/import`: up to 20 runs at once. The game uses it to move up the scores
  saved in the browser before M12, and runs that waited while the board was offline.

Light anti-cheat (rules in `../src/state/scoreRules.ts`, shared with the game): at most
50 000 Ft, at most 50 Ft per returned item, names of 1–16 characters with the same
blocklist as the creator, PNG/JPEG portraits under 20 KB, one post per minute per IP
(only a hash of the IP is stored, for an hour), and only the game's own origins
(`ALLOWED_ORIGINS` in `wrangler.toml`) may post.

## Deploy (once, on your Mac)

You need a free Cloudflare account. In a terminal:

```bash
export PATH=~/.local/node/bin:$PATH
cd server
npm install
npx wrangler login
npx wrangler d1 create bottle-up-scores
```

`d1 create` prints a `database_id`. Paste it into `wrangler.toml` in place of the
zeros, then:

```bash
npm run db:init
npm run deploy
```

`deploy` prints the Worker's URL, like `https://bottle-up-scores.<you>.workers.dev`.
Put it in `../.env.production` as `VITE_SCORES_URL=...`, commit `wrangler.toml` and
`.env.production`, and push. The next GitHub Pages build talks to the board. Anyone
who already has local scores will see them move up the first time the game reaches it.

Check it worked: open `https://bottle-up-scores.<you>.workers.dev/scores` in a browser
(it shows `{"scores":[...]}`).

## Local testing

```bash
npm run db:init:local
npm run dev                                  # Worker on http://127.0.0.1:8787
VITE_SCORES_URL=http://127.0.0.1:8787 npm run dev --prefix ..   # the game against it
```

To clear the rate limit while testing:
`npx wrangler d1 execute bottle-up-scores --local --command "DELETE FROM rate"`.
