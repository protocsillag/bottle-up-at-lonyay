# Bottle Up at Lónyay

Who will become the most successful bottle collector in Belső-Ferencváros?

A 3D third-person browser game set in Budapest's IX district at real scale. See `BRIEF.md` for the design and `CLAUDE.md` for working notes.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

## How to play

You have 48 hours (30 real minutes) and an empty bag. Collect bottles and cans from the
streets, planters, bins, party leftovers and courtyards, and feed them to the bottle
machines in SPAR (Kinizsi utca) or the Central Market Hall (Aldi). Open 06:00–24:00.
Every item is 50 Ft, but only once it goes through a machine.

WASD move · mouse look · Shift run · Space jump · E interact (hold for bins) · F bike ·
M map · Esc pause. At the machine: hold Space to feed, fix refused items with E, roll
them with A / D.

Add `?debug` to the URL for the debug keys (G fast walk, T time ×30) and an fps line.

Hungarian voice lines are generated with Piper TTS: see `tools/voice/README.md`.

Map data © OpenStreetMap contributors (ODbL).
