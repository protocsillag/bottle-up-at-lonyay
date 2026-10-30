# CLAUDE.md — running notes

Read `BRIEF.md` first. One milestone per session; each ends playable with `npm run build` passing, a `CHANGELOG.md` entry and a commit.

## Status

- **M1 Setup and city: done** (2026-10-29).
- **M2 Player and camera: done** (2026-10-29).
- **M3 Core loop in grey boxes: done** (2026-10-29, built unattended overnight).
- **M4 Buildings: done** (2026-10-29, unattended).
- **M5 Mohu mini-game: done** (2026-10-29, unattended).
- **M6 Living city: done** (2026-10-29, unattended).
- **M7 Character creator and local scores: done** (2026-10-29, unattended).
- **M8 Looking like Budapest: done** (2026-10-29, unattended).
- **M9 Polish: done** (2026-10-29, unattended), except the Piper voice files (generate locally, see `tools/voice/README.md`) and the playtest with friends.
- **M10 Gameplay round 2: done** (2026-10-30).
- **M11 Real streets from Alex's photos: done** (2026-10-30). Reference folders done: `bins/`, `lonyay-utca/`, `matyas-utca/`, `raday-utca/`, `erkel-torok-pal-utca/`, `kalvin-ter/`, `bakats-ter/` (status column in `reference/README.md`).
- Next: **M12 Shared high scores** (needs Alex's Cloudflare account). Milestones re-planned by Alex on 2026-10-30; see the Build plan in `BRIEF.md`.

## Commands

```bash
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run osm:fetch  # Overpass -> tools/osm/raw/area.json (git-ignored)
npm run osm:bake   # -> public/data/city.json (committed)
```

Node is not installed system-wide on Alex's Mac; it lives at `~/.local/node/bin` (Node 24 LTS). Use `export PATH=~/.local/node/bin:$PATH`.

## Controls (current)

At the bottle machine: hold Space to feed · E mash / hold to fix a refused item · A / D roll it · Space push it in · E (between items) or S walk away.

WASD move (relative to camera) · mouse look (click to lock pointer) · Shift run · Space jump · E interact (press, or hold for bins and party leftovers) · F get on / off a bike · at a till: 1 food, 2 beer, E closes · P pee on a wall (tipsy) · hold E 1 s on a public bin to kick it over (tipsy) · M large map · wheel zoom · G 20 m/s debug walk and T time ×30 (only with `?debug` or in dev) · Esc pause (releases the mouse; the clock stops). The list lives in the start/pause card in `index.html`.

## Conventions and decisions

- World units are metres. `x` = east, `z` = south, `y` = up. Local origin is Lónyay utca at 47.4855 N, 19.0625 E (`tools/osm/area.mjs`).
- `city.json` is the only map input at runtime. Re-bake after changing anything in `tools/osm/`.
- Missing building heights: 5 storeys × 3.6 m + 1.2 m ledge. `building=roof` canopies are skipped.
- Buildings outside the boundary are baked as `scenery: 1` (far-side facades up to 220 m out); they still get colliders but the boundary stops you first.
- Collision is 2D: player circle (r = 0.35 m) against building wall segments and the boundary polygon in a 16 m grid (`src/world/collision.ts`). Movement is substepped so you cannot tunnel at debug speed. Courtyard rings (multipolygon inners) stay walls; courtyards are reached through the gate teleport, not by opening the street geometry.
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
- Return points (`src/world/ReturnPoints.ts`): a pair of REpont machines plus a bin, on the pavement outside City Spar (Kinizsi utca) and outside the market hall's north-west (Fővám tér) facade. Open 06:00–24:00. Arriving within 30 m rolls the queue (0/1/2 people at 50/35/15%, 10–30 s each) and a 10% "Megtelt" machine; walking 80 m away clears it so the next visit rolls again. Each person occupies one machine; you wait only when no working machine is free.
- Mohu mini-game (`src/minigames/mohu/`): `MachineModel` draws the machine from canvas textures (header with a lookalike wordmark, panel with ALU/ÜVEG/PET pictograms and the two rule panels, strip with the printer slot) and a live screen canvas. `MohuGame` takes over the camera (1.25 m in front of the opening) and input. Phases: ready → flying (0.26 s) → accept, or returning → fix (crushed: mash E ×7; wet: hold E 1.2 s) → align (A/D roll, ±0.26 rad is green) → pushing; hiccup goes straight to align and can repeat (35%); no-deposit is lost into the bin. Money is paid with the receipt (`state.payout`), on an empty bag, on walking away, at closing time or at the end of the run. `acceptItem()` only counts the item.
- Reject odds: crushed, wet and no-deposit items are always refused; fine items hiccup 3.5%. Condition odds per source in `CONDITION` (about 10%) give roughly 1 in 8 refused overall.
- Gates (`src/world/buildings/gates.ts`): one per residential building (266), on the longest outer edge that faces free pavement (probes 1.5, 2 and 4 m out and across the gate width); an OSM `entrance` on an edge wins. Non-residential names are skipped by regex. Frames and leaves are two `InstancedMesh`es; leaves swing outward to the street (reads better than inward, which would clip into the extruded block). Only gates within 80 m animate; timers tick everywhere.
- Residents: each gate's timer fires every 30–90 real s (×0.45 at 07–09 and 17–19, ×2 at 22–24, ×6 at 00–06). If the player is within 80 m a resident (random-coloured `CharacterModel`) walks out and the gate holds 1.4 s, then swings shut over 4 s, accelerating. Walking within 0.95 m of an open gate (open > 0.3) or pressing E enters. A gate that clicks shut with you within 2.5 m counts as a slammed door.
- Bell: intercom panel right of the gate (as seen from the street); 1 in 10 buzzes it open for 3 s; otherwise a random intercom line, never twice in a row, night-only lines between 22:00 and 06:00. 4 s cooldown.
- Interiors (`src/world/buildings/interior.ts`): built on entry at world (6000, 6000) with their own `CollisionWorld`; the player's and camera's `world` are swapped, and the street groups are hidden. Courtyard size from the largest OSM courtyard ring (or 18% of the footprint), clamped 9–30 × 9–28 m; storeys from the building height. Walking back to the gate (z > exitZ) leaves. Interior meshes are disposed on leave.
- Courtyard contents roll on first entry per run (`BuildingSystem.court`): 1–3 wheelie bins (5–20, hold 4 s, refill 12 h; the first has a yellow recycling lid), 3–4 jackpot courtyards per run (renovation skip or party-flat recycling, 40–80, hold 6 s, once), the big bag in a courtyard 60% of runs (else on the Nehru part lawn).
- Házmester (`src/npc/Hazmester.ts`): 25% of courtyards, 70% of jackpots. Patrols a 4-point loop, spots you within 8 m in a ±55° cone, within 1.6 m any direction, or within 12 m while you hold E. Then a 5 s "Get out!" countdown and a walking-speed chase; caught = half the bag (rounded down) and out. 22:00–06:00 he is asleep 70% of visits (snore subtitle).
- Voice lines (`src/audio/lines.ts`) and `say()` (`src/audio/voice.ts`) show Hungarian text with English subtitles; `setVoicePlayer()` is the hook for M9 audio.
- `CharacterModel` takes `CharacterOptions` (hat, prop, width, scale) for NPCs until the M7 creator generalises it. NPC colour sets in `src/npc/looks.ts`.
- Day and night (`src/world/DayNight.ts`): sunrise ~06:00, sunset ~19:00 with twilight glow; the directional light becomes a dim blue moon at night; sky, fog and hemisphere light lerp to dark blue. Returns `{ night, lamps }` (lamps switch on before full dark).
- Lamps (`src/world/lamps.ts`): a lamp every 30 m along every road, alternating sides, instanced, in four styles (M11): curly posts by default; candelabra posts (two bell lanterns) on roads ≥ 14 m wide; Ráday posts (copper shade, flower basket) every 20 m at the edge of the Ráday drive strip and on the Bakáts tér paths (`extraRaday` constructor argument); and dish lamps hung on a wire across the street where facades stand within 6.5 m on both sides (no post, no collider); emissive heads, additive light-pool decals, and 5 real point lights that hop to the lamps nearest the player. Lit shop windows: one warm quad on the facade nearest each OSM shop. OSM benches are drawn here too. Lamp posts are colliders.
- Crowd (`src/npc/Crowd.ts`): up to 60 NPCs drawn with one `InstancedMesh` per body part (11) and per prop (7), animated on the CPU. Walkers follow `RoadGraph` (pavement offset per edge, pulled in on narrow streets). Targets by hour (40 commuter morning … 5 at 02–05); bar groups on Ráday 18–03, picnic groups on the Nehru lawn 16–23, street people on benches. They pause in front of you, push you softly, greet you (street people), drop bottles (`items.drop`) and their dogs leave mess. Spawn 45–115 m away, despawn past 150 m.
- Dog mess (`src/world/DogMess.ts`): 28 fixed piles per run plus dog walkers'. Stepping in one: 70% speed for 60 real seconds, brown footprints that fade after 40 s. Bikes are safe.
- Bikes (`src/world/Bikes.ts`): 6–10 per run on pavement spots; F to mount (interactable with `key: 'KeyF'`) and F anywhere to get off. 8 m/s, turns at 3.2 rad/s, no run/jump; hold-E actions and entering gates are blocked while riding. Losing >55% of speed against a wall at >4.5 m/s, or touching a pedestrian at that speed, is a crash: 2.5 s on the ground, bike left lying there.
- Sweeper (`src/npc/Sweeper.ts`): 02:00–07:00, starts 60–140 m from the player and drives the road graph (biased toward the player) at 3.5 m/s, clearing loose street items within 6 m. Solid.
- Items get faint night glints (24 sprites on the nearest loose items within 30 m).
- Screens (`main.ts` `show()`): title (orbiting city camera) → creator → intro card → run → end (with top 10) → creator again; title → scores. Pause card has Resume and Quit to title. `body.in-menu` hides the HUD (do not name a body class `menu`: it collides with `.menu button`).
- Character pieces (`CharacterModel` + `CharacterOptions`): hat (none, beanie, flat cap, bucket, cap), hair (short, long, mohawk, bald), face (clean, stubble, moustache, beard), top (parka, studded leather, tweed, long coat with scarf and gloves, band T-shirt with the invented band "Zúzmara", hoodie), bottoms (jeans, ripped, trousers, cargo shorts, tracksuit), shoes (boots, sneakers, sandals with socks, slippers), accessory (none, sunglasses, earring, chain, backpack, dog on a string). NPCs pass only a few options; the defaults keep the old look.
- `src/player/look.ts`: four presets (Tüske, Feri bácsi, Bandi, Csabi), slot option lists, swatches (hair, garment, skin), `checkName` (1–16 chars, letters incl. accents, numbers, spaces and `.'-_!?`, short folded blocklist), last look saved in `localStorage` `bual.character.v1`.
- Creator (`src/ui/Creator.ts`) renders its own scene with the main renderer while open (the game loop skips the world). Portrait: separate scene with a Mohu-yellow background rendered into a 128 × 128 render target, flipped, PNG data URL (JPEG fallback if over 20 KB; PNGs are ~2–6 KB).
- Scores (`src/state/scores.ts`): `ScoreStore` interface (`top`, `add` → rank or null, `offline`); `LocalScoreStore` keeps the best 20 in `localStorage` `bual.scores.v1`, sorted by amount then earlier date. Runs with 0 Ft are not saved. `src/ui/Scores.ts` renders the table with the current run highlighted.
- Facades (`src/world/facade.ts`): one `MeshLambertMaterial` with `onBeforeCompile` draws windows in the fragment shader from per-vertex `aFacade` (u along the edge, height, edge length) and `aStyle` (seed, kind). Kinds: 1 street tenement (tall rusticated ground floor with a shop row, framed windows with sills, pediments on half the buildings), 2 courtyard ring, 3 palace/church (bigger arched windows), 0 plain, −1 no pattern (roofs, cornices). `fwidth` fades the pattern in the distance to avoid moiré. `facadeUniforms.uNight` (set from `lighting.lamps`) lights ~45% of windows warm. Cornices are real geometry along outer edges of buildings taller than 8 m. Palette and kind per building in `buildingLook()` (`buildCity.ts`).
- Kerbs: 0.28 m granite ribbons along both edges of every road. Trees: plane trees with a pale trunk and four leafy clumps, colour-varied per instance (`buildTrees`, exported).
- Landmarks (`src/world/landmarks/`): the market hall replaces its extruded block (skipped via `buildCity(city, { skip })`): brick facade-shader walls, a gabled Zsolnay roof over the footprint's oriented box (`obb()`), gable rose windows, and the Fővám tér front (portal with three arches and a VÁSÁRCSARNOK band, two towers with tiled pyramid caps) at the box end nearest the square. `dressing.ts`: the green KÖNYV book kiosk on Ráday with a stash behind it, Lónyay utca kerb trees, Nehru part (railing on the river edge, plane-tree rows, turquoise and orange loungers, three kiosks where the big bag can hide, playground and hoops), the Bakáts tér church's tiled nave roof, the museum's green-yellow roof and dome, Kálvin tér church tower and portico plus a metro sign, and across the river Gellért Hill with the Liberty Statue and citadel, a row of Buda bank buildings, and the green steel of Szabadság híd over the existing deck.
- Shops (`src/world/shops/`): SPAR and the market hall are walk-in interiors at (7000, 7000) and (8000, 8000), built once and toggled visible. Doors: SPAR on the facade nearest the City Spar node (with a green/red shopfront), the hall at its portal. Closed 00:00–06:00 (at midnight you are shown out). The REpont pairs now stand inside: SPAR just right of the entrance, the hall in front of the Aldi corner. Street gates are not placed within 9 m of shop doors. The minimap markers point at the doors.
- Audio (`src/audio/Sfx.ts`, singleton `sound`): every effect is synthesised with WebAudio (scan beep, reject buzz, printer, clunk, pop, wipe, pickup clinks, bag rustle, search rustle while holding E, glass smash, gate creak and slam with distance falloff, door buzzer, intercom crackle, dog-mess squelch, bike bell, receipt ching, footsteps, UI clicks) plus a low-passed brown-noise city hum and birds by day. The `AudioContext` starts on the first pointerdown. Voices: `say()` shows subtitles and calls `sound.speak()`: MP3 from `public/audio/voice/` if `manifest.json` lists the id (intercom lines get a band-pass/overdrive filter at runtime), else the browser's `hu-HU` speech voice with per-speaker pitch/rate, else nothing.
- Piper could not run here: huggingface.co is blocked by this sandbox's network policy. `tools/voice/generate.mjs` parses `src/audio/lines.ts`, runs Piper per speaker (Anna for the old lady, Imre for men, Berta spare) and ffmpeg (pitch/tempo, loudnorm, 48 kbps mono MP3), and writes `manifest.json`. The committed manifest is `[]`.
- Settings (`src/state/settings.ts`, `localStorage` `bual.settings.v1`): master/effects/voice volume, voice mode (auto/speech/off), mouse sensitivity (×0.3–2.5), graphics quality (low: pixel ratio 1, no shadows, 30 NPCs; medium: ≤1.5, 1024 shadow map, 45; high: ≤2, 2048, 60). Reachable from the title and the pause card.
- Debug: `DEBUG` in `main.ts` is dev builds or `?debug`; it enables G, T and the fps/position/spawned line.
- Performance: the scene light count never changes (lamp pool lights and shop interior lights stay "visible" at intensity 0) because a changed light count recompiles every shader; `renderer.compile()` runs once at startup with hidden groups temporarily shown, plus the close-up item meshes. Camera far plane 2400. Night glints refresh every 0.25 s. A typical street view is ~160 draw calls and ~315k triangles including the shadow pass.
- Balance (`SUPPLY` in `balance.ts`): every source rolls its contents through `state.supply(n)`. Full amounts until 35% of the 1 400-item budget is left, then thinning to 12% (minimum 1 item, street spawns skip proportionally). At run start ~245 items are already out (street items plus stocked stashes). This keeps a perfect run near the 50 000 Ft ceiling even with 266 courtyards. Estimates: a courtyard gives ~20 items for 30–90 s of waiting, a bin 2–8 for 2 s, a party heap 15–30; the machine takes 3/s; machines are shut 7.5 of the 30 real minutes. First runs that learn the bins and a few courtyards should land near 10 000 Ft; a planned route with the big bag early 25 000–35 000 Ft. Unverified without real playtests.
- Bags (M10): `state.bags` 1–3 × `BAG_SIZE` 50; `state.takeBag()` refuses a 4th ("Can't carry more bags"). Each run hides `EXTRA_BAGS.count` 3–5 extra bags, a third on the street (`items.placeBags`: Nehru kiosks, the Ráday book kiosk, else a lawn), the rest in random courtyards (`buildings.reset(n)`). `CharacterModel.setBags(n)` shows bags in the right hand, left hand, then over the shoulder.
- Countdown (M10): `Hud` shows "Ends in m:ss" (real time) and "Ends Sunday 08:00 · N h left"; orange with a toast at 5 minutes, red, pulsing and ticking (`hud.onTick`) in the last 60 s.
- Hunger (M10): `state.hunger` 1 → 0 over `HUNGER.lasts` (14 game h). Warning toast at 25%; starving = ×0.6 speed, no running, and `Interaction.collectBlockedReason` blocks every collecting interactable (item sources are registered with `collect = true`; courtyard bins, jackpots and bags carry `collect: true`). Machines, shop doors and the till still work.
- Till (M10): `ShopInterior.till` in both interiors (SPAR counter with a cashier; Aldi counter by the corner). E opens a small panel; 1 buys a bread roll with párizsi (100 Ft, full hunger), 2 a beer (200 Ft). `state.spend()` fails with the cashier line "Nincs elég pénze, kérem." Walking 2.6 m away or E closes it. Score = money left at the end.
- Tipsy (M10): `state.drinkBeer()` sets 2–6 game hours; another beer restarts it and raises `tipsyLevel` (max 3). ×1.2 speed, steering drift (yaw offset), camera roll and bob (`FollowCamera.roll/bob`), a CSS vignette with edge blur (`#tipsy-fx`, blur off on low quality, sway halved). P in front of a wall (2D raycast 1.6 m) freezes you 3 s, leaves a fading puddle (`Puddles`), a sigh, "Nem szégyelli magát?!" from any pedestrian within 10 m, and in a courtyard an awake házmester starts his chase (`buildings.peed()`). Public bins switch to "Kick the bin over" (hold 1 s): everything spills, the bin lies on its side and never refills that run.
- Traffic (`src/npc/Traffic.ts`, M10): its own graph from road ways (skips pedestrian/service/footways, `nocars`), drives on the right a quarter road width out (centre on one-ways), 8 m/s, slows into junctions, keeps 6 m gaps, honks (3 s cooldown) and brakes for the player in its lane up to 18 m ahead; within 2.6 m at >2.5 m/s it hits: 2 s down, 1–5 items smashed, a driver shout, off the bike. ~22 cars by day, 12 at night, 6 at 02–06, up to 32 instanced; 18% are yellow taxis with a roof sign; headlights brighten at night. Cars are solid (three circles each). One-way rules need a re-bake: `bake.mjs` now writes `oneway` and `nocars`, but Overpass is blocked from the sandbox, so the committed `city.json` has none and cars drive both ways everywhere.
- `CollisionWorld.addBox()` adds solid props; `addToggleBox()` returns a handle to switch a box on and off (switched-off segments are skipped by `resolve` and `raycast`).
- M11 photo passes live in `src/world/landmarks/`, one file per place, built from `main.ts` in this order: `prepareRaday` (before anything reads the map: sets Ráday `nocars`/`oneway`, removes the empty-lot building, picks the Art Nouveau house) → colours (`lonyayColors` + `matyasColors` + the Art Nouveau white) → `prepareErkel` (palace, the old low house dropped to 4.4 m so it gets no gate, the ochre block) → `buildCity` (`skip`, `brick`, `palace`, `noKerb`) → dressing, lot, Kálvin, Erkel, Ráday, wear, road works, Bakáts. `brick`/`palace` override the name rules in `buildingLook()`.
- Bins (M11, `reference/bins/`): public bins are hoop bins (dark green perforated basket, mint bag) in side streets and lime-green post bins on squares and main streets (`BIN_TYPES`); wheelie groups put out at dawn and emptied by the garbage truck (a `Sweeper` with a hopper, 08–10, targeting `items.wheelieTarget`); renovation sites from `scaffoldSite()` with a skip (one-off jackpot); courtyard bins by lid (`COURTYARD.binKinds`: recycling holds bottles, mixed little, paper nothing plus a gag line).
- Lónyay utca (M11, `lonyay.ts`, `parking.ts`, `shops/sparFront.ts`): `findGimnazium` picks the school (brick facade kind 4, stepped gable and spire); `streetFacades(city, street)` gives facades along a named street with outward normals; dense parked cars (instanced per 250 m tile, solid, none on Ráday or main roads); parking wardens (`warden` crowd type); `buildSparFront()` is the SPAR shopfront style (fascia, neon, grilles closed 00–06) used on the City Spar and a decorative Lónyay corner; the kapualj in `interior.ts` has terrazzo, tiles, mailboxes and inner doors.
- Mátyás utca (M11, `matyas.ts`, `streetSigns.ts`, `gates.ts`): enamel street plates at junction corners (one atlas, one mesh, invented house-number ranges); gate variants 0–2 by `hashId(b.id) % 3`; `buildWear()` paints plinths (all Mátyás buildings, a third elsewhere) and graffiti tags (one atlas, 15 invented words, ≤ 2.5 m, mirrored UVs fixed per wall) on every street wall, keeping clear of gates and shop doors; `RoadWorks` builds 14 sites once and shows 2–3 per run with `CollisionWorld.addToggleBox()` colliders; MOSODA blade sign at a Mátyás corner.
- Ráday utca (M11, `raday.ts`): north of z = −290 is car-free, the rest one-way along the way's direction; paving ribbons with world-UV canvas textures; green bollards every 1.5 m (every fifth left out) at ±2.75 m on the car stretch; terraces every 7.5 m where the pavement is ≥ 1.5 m deep, with `open`/`closed` furniture meshes swapped by `raday.update(hour)` (open 15:00–03:00) and festoon bulbs lit at night; colliders for table sets; the empty lot is fenced 2.6 m in from the street, its hidden spot is added to `dressing.hiddenSpots` (always stocked) and `excludeGateAreas()` keeps gates off its firewalls.
- Erkel / Török Pál (M11, `erkel.ts`): bike-and-chevron decals each way, ball bollards in short rows, palace dressing, the hand-built low house with mirrored-UV-safe graffiti walls and firewalls above it, the octagonal sign, the KIADÓ shop.
- Kálvin tér (M11, `kalvin.ts`; church parts in `dressing.ts`): paving over the plaza areas within 70 m of the landmark, stone balls on a jittered 3.6 m grid inside them (solid), props kept apart through a `taken` list, the metro dome first; billboard on the largest nearby roof.
- Bakáts tér (M11, `bakats.ts`): the church is in the `brick` set; tower, spires, portal and railing are hand-built; plaza, paths, benches (pushed into `city.benches` after `Lamps` draws the OSM ones, so street people use them), lamps (`extraRaday`), and 18 pigeons updated in `bakats.update()` that scatter when you come within 5 m running (1.6 m walking) and glide back after ~14 s.
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
| `src/world/ReturnPoints.ts` | The two return points: machine pairs, queue NPCs, Megtelt |
| `src/world/buildings/BuildingSystem.ts` | Enter/leave, bell, courtyard contents, házmester, escape countdown |
| `src/world/buildings/gates.ts` | Gate placement, instanced gates, resident exits |
| `src/world/buildings/interior.ts` | Courtyard template, wheelie bins, jackpot meshes |
| `src/npc/Hazmester.ts` | Caretaker patrol, detection, chase |
| `src/npc/looks.ts` | NPC colour palettes |
| `src/audio/lines.ts`, `voice.ts` | Voice line catalogue, subtitles |
| `src/minigames/mohu/MachineModel.ts` | REpont-style machine, canvas textures, live screen, receipt strip |
| `src/minigames/mohu/MohuGame.ts` | Close-up feeding mini-game, rejects, fixes, receipt |
| `src/world/DayNight.ts` | Sun/moon, sky, fog by clock |
| `src/world/lamps.ts` | Street lamps, light pools, shop windows, benches |
| `src/world/DogMess.ts` | Dog mess piles, slowdown, footprints |
| `src/world/Bikes.ts` | Bike models, placement, mount/drop |
| `src/npc/RoadGraph.ts` | Walking graph from OSM ways |
| `src/npc/Crowd.ts` | Instanced pedestrians, groups, behaviour |
| `src/npc/Sweeper.ts` | Night street sweeper |
| `src/player/look.ts` | Presets, slots, swatches, name check, saved look |
| `src/ui/Creator.ts` | Character creator, turntable, portrait capture |
| `src/state/scores.ts` | `ScoreStore` interface, `LocalScoreStore` |
| `src/ui/Scores.ts` | Top 10 table |
| `src/world/facade.ts` | Procedural facade shader |
| `src/world/landmarks/common.ts` | `obb`, Zsolnay tile texture, sign texture, pyramid |
| `src/world/landmarks/marketHall.ts` | Central Market Hall exterior |
| `src/world/landmarks/dressing.ts` | Ráday, Lónyay, Nehru part, churches, museum, Kálvin tér, far bank, Szabadság híd |
| `src/world/landmarks/lonyay.ts` | `streetFacades`, the gimnázium, Lónyay palette |
| `src/world/landmarks/parking.ts` | Parked cars |
| `src/world/landmarks/streetSigns.ts` | Enamel street-name plates |
| `src/world/landmarks/matyas.ts` | Mátyás palette, plinths and graffiti (`buildWear`), MOSODA, `RoadWorks` |
| `src/world/landmarks/raday.ts` | Ráday paving, bollards, terraces, signs, Art Nouveau house, empty lot |
| `src/world/landmarks/erkel.ts` | Erkel / Török Pál markings, bollards, palace, low graffiti house |
| `src/world/landmarks/kalvin.ts` | Kálvin tér paving, stone balls, beds, metro dome, billboard |
| `src/world/landmarks/bakats.ts` | Bakáts tér church tower and spires, plaza, benches, pigeons |
| `src/world/shops/sparFront.ts` | SPAR shopfront style |
| `src/world/shops/Shops.ts` | Shop doors, enter/leave, opening hours |
| `src/world/shops/interiors.ts` | SPAR and market hall interiors |
| `src/audio/Sfx.ts` | Synthesised SFX, ambience, voice playback |
| `src/state/settings.ts` | Settings load/save |
| `tools/voice/` | Piper voice generation script and README |
| `src/npc/Traffic.ts` | Moving cars, honking, hits |
| `src/world/Puddles.ts` | Fading puddles (tipsy) |
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

- OSM has only 16 `entrance` nodes in the area: gates use the longest street-facing edge per building (one gate per building, not per facade).
- Központi Vásárcsarnok is tagged low (8.4 m) in OSM; the hand-built hall ignores that height.
- Bridges are flat decks at 7 m with no ramps; scenery only.
- Roads use one fixed width per OSM class. Kerbs follow the road ribbon edges, so they also run across junctions (Ráday has none since M11).
- Draw calls and triangles grew with M11: about 175–475 draw calls and 1.0–1.3 M triangles per frame including the shadow pass (spawn on Lónyay is the heaviest view). Fine on a desktop GPU; on weak machines use Low quality. Candidates if it needs trimming: merge Ráday signs and flags, tile the gates per area, drop shadows from small props.

## Questions for Alex

Open questions and assumptions made while building unattended (M3–M9). Answer any of these and I'll adjust.

- **M3 debug keys.** Since M9, G (fast walk) and T (time ×30) only work with `?debug` in the URL (or in dev builds).
- **M3 item budget.** Street items: 45 at start + ~5 spots per game hour (×2 from 18:00–02:00, ×0.3 from 02:00–07:00), 1–2 items each; 44 hidden spots of 2–6 items, restocked daily; 98 bins of 2–8 every 6 game hours; 8 party heaps of 15–30. Rough total over a run is well over 1 400 if you search everything; the M9 balance pass tunes it.
- **M3 machine placement.** The Aldi machine stands outside the market hall's Fővám tér entrance, not in the basement Aldi, until the interior exists in M8. OK?
- **M4 one gate per building.** The brief says one gate per facade; I placed one per building (266 gates) on its longest street-facing side, to keep the street readable and the gate count manageable. More gates per corner building is easy if you want it.
- **M4 gate leaves swing outward** toward the street (real Pest gates swing inward) because the extruded building blocks have no hollow behind the facade. M8 could recess the gateway.
- **M4 interiors are teleports** to a template courtyard rather than the real courtyard footprint in the street geometry. Courtyard size follows the OSM courtyard area, but its shape is always a rectangle.
- **M4 escape rule.** Once the házmester spots you, you are caught if he reaches you *or* the 5 s run out while you are still inside. Is that the intended reading?
- **M5 queue reading.** I read "0–2 people already at the machines" as each person using one of the two machines, so you only wait when both are taken (or one is "Megtelt" and the other is busy). If you meant one shared line in front of the pair, it is a small change in `ReturnPoints.roll()`.
- **M5 payout timing.** Money is added when the receipt prints (bag empty, walking away, closing time or end of run), with +50 Ft ticking up on the machine screen meanwhile.
- **M5 walking away.** Releasing Space only pauses feeding; E (between items) or S walks away. Esc pauses the game as usual.
- **M6 sun times.** Sunrise ~06:00 and sunset ~19:00 (late spring) so there is a long light evening. Real late October would be 06:30/16:45. Say if you want a specific season.
- **M6 sweeper.** The brief says the sweeper clears street items on its route. To make it noticeable I start it near the player each night and bias its route toward you. That makes it a bit of a nemesis; it can roam freely instead.
- **M6 NPC drops** add roughly 1–3 bottles per real minute in the evening near the player.
- **M7 creator before every run.** "Play again" goes back to the creator, pre-filled with your last character, as the brief says. If that gets tedious in playtests, a "Same again" button is a one-liner.
- **M7 name blocklist** is a short folded list of slurs and swear words (Hungarian and English). Send me any words you want added.
- **M8 interiors are teleports.** SPAR and the market hall are walk-in interiors reached through their doors, like the courtyards, rather than hollowed-out real footprints. The hall interior is about 90 × 34 m (the real one is longer) and the Aldi corner is on the ground floor near the entrance (the real Aldi is in the basement).
- **M8 SPAR and Aldi signs** use the plain words "SPAR" and "ALDI" in the game font on flat colour boards, no logo files, like the REpont lookalike. If you would rather avoid the brand names entirely, they are easy to swap for generic "ABC" signs.
- **M8 time cap.** Each landmark got a short pass (well under 20 minutes each). Not done: corner towers and balconies on Lónyay tenements, the brick Református gimnázium, a passing yellow tram (left out because the brief says no moving traffic in v1), and Corvinus beyond the palace-style facade.
- **M9 voices need you.** The sandbox could not reach huggingface.co, so no Piper MP3s are committed. Run the four commands in `tools/voice/README.md` on your Mac and commit `public/audio/voice/`. Until then the game uses your browser's Hungarian voice if it has one (Safari and Chrome on macOS usually ship "Mariska"), and subtitles always show.
- **M9 playtest.** The "playtest with friends" step is yours. Things to watch: is ~10 000 Ft a fair first run, does the supply budget feel stingy late in a run (`SUPPLY` in `balance.ts`), are the 30–90 s resident waits too long, and is the 5 s házmester escape fair?
- **M10 one-way streets.** Overpass is blocked in the sandbox, so I could not re-bake. Run `npm run osm:fetch && npm run osm:bake` on your Mac and commit `public/data/city.json`: cars then follow OSM one-way rules and avoid `motor_vehicle=no` roads.
- **M10 Ráday cars.** Done in M11: see below.
- **M10 tram.** Still not added (optional); see the M11 time cap note.
- **M10 balance.** Bigger carrying capacity (up to 150) makes trips shorter, but the 1 400-item supply budget still caps the ceiling; food (~300 Ft a run) and beer come off the score. I kept the supply numbers; playtests should tell whether strong runs drift above 35 000 Ft.
- **M9 balance budget.** The brief says ~1 400 items spawn per run. With a courtyard in every building the raw supply was far higher, so I added the soft supply budget instead of cutting courtyards. Late in a run, bins and courtyards that you open for the first time hold less. Tell me if you would rather have fewer, richer courtyards.
- **M11 time cap.** Each artifact got about 20 minutes. Left out: the tram on the körút (still optional; no tracks or wires yet), bus stops and buses, Kálvin tér's modern glass offices and the hotel mansard, Ráday's bike-share docks and string lights across the street, enclosed wooden loggias and bay windows on Mátyás utca, the hanging mailboxes and taped notices on gates, and a "Closed" prompt on the metro stairs (the dome is just solid).
- **M11 Ráday car-free part.** OSM in the baked map has no `highway=pedestrian` on Ráday, so I made the stretch from Kálvin tér to about Török Pál utca (z < −290) car-free and the rest one-way in the way's own direction. Tell me the real extent and direction and I'll match them (or re-bake with OSM data on your Mac).
- **M11 empty lot.** The lot replaces the smallest mid-block Ráday building south of the car-free part (it ends up near the Bakáts end). If you know which gap you photographed, I can pin it by building id.
- **M11 Art Nouveau house, palace, old low house.** Picked automatically from the map by size and street (the low house is the smallest single-front building on Erkel or Török Pál utca). Their real addresses would let me pin them.
- **M11 graffiti everywhere.** Plinths and tags are applied to street walls all over the district, not just Mátyás utca, since the notes say "almost every ground floor". Say if you want it calmer.
- **M11 hung lamps.** Every street narrower than ~13 m between facades now has dish lamps on wires instead of posts (the notes say "roughly under 12 m"). Ráday and roads ≥ 14 m keep posts.
- **M11 street plates.** House-number ranges on the plates are invented; OSM has almost no address data here.
