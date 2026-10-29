# CLAUDE.md — running notes

Read `BRIEF.md` first. One milestone per session; each ends playable with `npm run build` passing, a `CHANGELOG.md` entry and a commit.

## Status

- **M1 Setup and city: done** (2026-10-29).
- **M2 Player and camera: done** (2026-10-29).
- **M3 Core loop in grey boxes: done** (2026-10-29, built unattended overnight).
- Next: **M4 Buildings**.

## Commands

```bash
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run osm:fetch  # Overpass -> tools/osm/raw/area.json (git-ignored)
npm run osm:bake   # -> public/data/city.json (committed)
```

Node is not installed system-wide on Alex's Mac; it lives at `~/.local/node/bin` (Node 24 LTS). Use `export PATH=~/.local/node/bin:$PATH`.

## Controls (current)

WASD move (relative to camera) · mouse look (click to lock pointer) · Shift run · Space jump · E interact (press, or hold for bins and party leftovers) · M large map · wheel zoom · G 20 m/s debug walk · T time ×30 (debug) · Esc pause (releases the mouse; the clock stops). The list lives in the start/pause card in `index.html`.

## Conventions and decisions

- World units are metres. `x` = east, `z` = south, `y` = up. Local origin is Lónyay utca at 47.4855 N, 19.0625 E (`tools/osm/area.mjs`).
- `city.json` is the only map input at runtime. Re-bake after changing anything in `tools/osm/`.
- Missing building heights: 5 storeys × 3.6 m + 1.2 m ledge. `building=roof` canopies are skipped.
- Buildings outside the boundary are baked as `scenery: 1` (far-side facades up to 220 m out); they still get colliders but the boundary stops you first.
- Collision is 2D: player circle (r = 0.35 m) against building wall segments and the boundary polygon in a 16 m grid (`src/world/collision.ts`). Movement is substepped so you cannot tunnel at debug speed. Courtyard rings (multipolygon inners) are walls too; M4 will open gates into them.
- Camera pull-in uses a 2D raycast against the same wall segments (no mesh raycasts).
- Ground layers use small y offsets plus `polygonOffset` to avoid z-fighting: areas < footpaths < roads. Pavements are the base ground colour; OSM `footway=sidewalk` lines are dropped.
- Buildings are merged per 200 m tile (one draw call each) for culling. Trees are instanced.
- Dev builds expose `window.game` (renderer, scene, camera, player, follow, city, world, minimap) for debugging in the browser console.
- Testing in the hidden Claude browser pane: `requestAnimationFrame` is paused, so fps readings are meaningless there. Drive `game.player.update(dt, fakeInput, yaw)` in a loop and call `game.renderer.render(...)` by hand instead.
- Player tuning (`src/player/Player.ts`): walk 2.5, run 5 m/s; jump 5 m/s up with gravity 16 (≈0.8 m); stamina 100, run drains 10/s, jump costs 8, regen 20/s after 0.8 s; exhaustion lockout until 30% and a fresh Shift press.
- Character facing: the model faces −z; `heading` 0 = north. Limb pivots: positive `rotation.x` swings a limb forward; knees bend with negative x, elbows with positive x.
- Minimap: city pre-rendered once at 1 px/m into an offscreen canvas; each frame copies a 320 m window. Canvas backing store is resized to its CSS size × DPR. Markers come from `city.landmarks.spar` / `marketHall`.
- Landmark positions found by name at bake time live in `city.landmarks` (spawn, spar, marketHall, corvinus, museum, radayUtca, bakatsTer, kalvinTer, nehruPart).
- GitHub Pages: `.github/workflows/deploy.yml` builds on push to `main`. Vite `base: './'`, so asset paths are relative. Repo Settings → Pages → Source must be "GitHub Actions".
- Game state lives in `src/state/GameState.ts` (one instance, `state`): clock in game minutes since Friday 00:00 (run = 08:00 Fri → 08:00 Sun, 1.6 game min per real second), money, bag (array of `{kind, cond}`), big-bag flag, stats, toasts. `state.rng` is a seeded `Rng` reset per run.
- All tuning numbers live in `src/state/balance.ts`. Change numbers there, not in the systems.
- Item condition (fine / crushed / wet / nodeposit) is rolled at pickup per source (`CONDITION` table). Street items keep the kind you saw lying there.
- Interaction: systems register `Interactable` providers with `Interaction`; nearest in reach wins, things in front of the player are preferred. `hold > 0` means hold E. `blocked()` replaces the prompt with a reason (bag full, closed, searched).
- Spots (`src/world/placement.ts`): pavement points every 10 m both sides of each road (half width + 1.6 m), beside footpaths, plus a 14 m grid in parks and squares; each tagged with a zone (raday, nehru, corvinus, market, kalvin, bakats, museum, lonyay, street). Street items, party leftovers and the big bag sample from them; zone × time weights are in `zoneWeight()` in `ItemSystem.ts`.
- Public bins: OSM `waste_basket`/`recycling` inside the boundary (snapped off buildings, at least 8 m apart) plus top-ups in hot zones: 98 bins. Hidden spots: 48 fixed planters (Nehru-heavy), 44 stocked per run, restock at the next 06:00. Party leftovers: 4 per night between 22:00 and 04:00, cleared at 09:00.
- Return points (`src/world/ReturnPoints.ts`): machines on the pavement outside City Spar (Kinizsi utca) and outside the market hall's north-west (Fővám tér) facade. Open 06:00–24:00. M3 placeholder feeds 3 items/s while you stand within 3 m.
- `CollisionWorld.addBox()` adds solid props (machines now; kiosks and gates later).
- Headless testing: `scratchpad/shot.cjs`-style Playwright scripts fake pointer lock by overriding `Document.prototype.pointerLockElement`; launch Chromium with `--use-angle=swiftshader`. `window.game` exposes state, items, returns, placement and interaction in dev.

## File map

| Path | What |
| --- | --- |
| `src/main.ts` | Renderer, scene, lights, run start/end, game loop |
| `src/state/GameState.ts` | Clock, money, bag, stats, toasts, run status |
| `src/state/balance.ts` | All tuning numbers |
| `src/state/time.ts` | Game-time constants and helpers, `formatFt` |
| `src/state/rng.ts` | Seeded RNG |
| `src/world/placement.ts` | `BuildingIndex`, walkable spot generation, zones |
| `src/world/items/ItemSystem.ts` | Street items, hidden spots, bins, party leftovers, big bag |
| `src/world/items/models.ts` | Item, bin, planter, party heap and big-bag meshes |
| `src/world/ReturnPoints.ts` | The two return points (M3 placeholder machines) |
| `src/player/Interaction.ts` | Nearest interactable, press/hold E |
| `src/ui/Hud.ts` | Clock, money, bag, prompt, toasts, status chips, funniest stat |
| `src/world/cityData.ts` | `city.json` types and loader |
| `src/world/buildCity.ts` | Static city meshes (ground, areas, roads, buildings, trees) |
| `src/world/collision.ts` | `CollisionWorld`: wall segments, circle push-out, 2D raycast, boundary test |
| `src/world/streets.ts` | `StreetIndex`: nearest named street for the HUD |
| `src/player/Player.ts` | Player: walk/run/jump, stamina, movement + collision |
| `src/player/CharacterModel.ts` | Low-poly character from boxes + procedural animation (M7 creator will feed colours/pieces) |
| `src/player/FollowCamera.ts` | Third-person orbit camera with wall pull-in |
| `src/player/input.ts` | Keyboard + pointer-lock mouse |
| `src/ui/Minimap.ts` | North-up minimap and large map (M) with return-point markers |
| `src/ui/style.css` | HUD, stamina bar, minimap and overlay styles |
| `tools/osm/` | `area.mjs` (bbox, origin), `fetch.mjs`, `bake.mjs`, README |
| `public/data/city.json` | Baked map (~330 KB) |

## Known gaps / notes for later milestones

- OSM has only 16 `entrance` nodes in the area: M4 gate placement will mostly use "one gate per street facade".
- Központi Vásárcsarnok is tagged low (8.4 m); M8 replaces it with a hand-built landmark anyway.
- Bridges are flat decks at 7 m with no ramps; scenery only.
- Roads use one fixed width per OSM class; Ráday utca looks all-asphalt. Kerbs and real pavement widths are M8.

## Questions for Alex

Open questions and assumptions made while building unattended (M3–M9). Answer any of these and I'll adjust.

- **M3 debug keys.** G (fast walk) and T (time ×30) are on for everyone so playtesters can skip ahead. Should they be hidden behind `?debug` for the friends playtest?
- **M3 item budget.** Street items: 45 at start + ~5 spots per game hour (×2 from 18:00–02:00, ×0.3 from 02:00–07:00), 1–2 items each; 44 hidden spots of 2–6 items, restocked daily; 98 bins of 2–8 every 6 game hours; 8 party heaps of 15–30. Rough total over a run is well over 1 400 if you search everything; the M9 balance pass tunes it.
- **M3 machine placement.** The Aldi machine stands outside the market hall's Fővám tér entrance, not in the basement Aldi, until the interior exists in M8. OK?
