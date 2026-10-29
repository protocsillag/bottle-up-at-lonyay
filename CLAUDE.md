# CLAUDE.md — running notes

Read `BRIEF.md` first. One milestone per session; each ends playable with `npm run build` passing, a `CHANGELOG.md` entry and a commit.

## Status

- **M1 Setup and city: done** (2026-10-29).
- **M2 Player and camera: done** (2026-10-29).
- Next: **M3 Core loop in grey boxes**: game clock, items and sources, bags, shop hours, HUD, placeholder machines, end screen. First playtest.

## Commands

```bash
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run osm:fetch  # Overpass -> tools/osm/raw/area.json (git-ignored)
npm run osm:bake   # -> public/data/city.json (committed)
```

Node is not installed system-wide on Alex's Mac; it lives at `~/.local/node/bin` (Node 24 LTS). Use `export PATH=~/.local/node/bin:$PATH`.

## Controls (current)

WASD move (relative to camera) · mouse look (click to lock pointer) · Shift run · Space jump · M large map · wheel zoom · G 20 m/s debug walk · Esc pause (releases the mouse). The list lives in the start/pause card in `index.html`.

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

## File map

| Path | What |
| --- | --- |
| `src/main.ts` | Renderer, scene, lights, game loop, HUD updates |
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
