# Bottle Up at Lónyay — Design Brief

Version: 2026-10-29 · Owner: Alex · Repo: [protocsillag/bottle-up-at-lonyay](https://github.com/protocsillag/bottle-up-at-lonyay)

> **For Claude Code:** read this whole file before writing any code. Work through the Build plan one milestone per session, in order. Anything marked as a decision is settled; ask Alex before changing it. Keep `CLAUDE.md` as your running notes.

## Vision and pillars

**Pitch:** You are a street character in Belső-Ferencváros with 48 hours and an empty bag. Dig through bins, slip into stairwells behind closing doors, and feed every bottle and can into the Mohu machine at 50 Ft each. The richest collector makes the wall of fame.

One run is 30 real minutes, which is 48 hours of game time. The game is a 3D, third-person, GTA-style walkable browser game built from scratch in this repo.

- **The real neighbourhood.** Streets, blocks and distances come from map data, so a local recognises Ráday utca, Lónyay utca and Bakáts tér on sight.
- **Laugh with the hero, not at them.** The character is resourceful and stubborn. The jokes come from the city: the grumpy intercom granny, the picky Mohu machine, the házmester, the dog mess.
- **Every bottle is a small decision.** Quick street pickings versus a slow, risky building that may hold a jackpot. The best runs plan a route.
- **Short and replayable.** One 30-minute run, a score, a top 10. Random item, bag and door placement keeps runs different.

## Tech and how to work

A browser game in TypeScript with Three.js and Vite, deployed to GitHub Pages. No engine install, plays from a link on a laptop.

| Area | Choice |
| --- | --- |
| Rendering | Three.js, third-person follow camera, low-poly stylised look |
| Physics and collision | Simple capsule vs. box colliders from building footprints; no physics engine unless needed |
| Map data | OpenStreetMap, pre-baked into `public/data/city.json` by a script in `tools/osm/` |
| State | One `GameState` module: clock, money, bag, character, run status |
| Save | Last character in localStorage; high scores local first (`ScoreStore` interface), moved online to Cloudflare D1 in the last milestone |
| Audio | In `public/audio/`: SFX synthesised in code; Hungarian voice lines generated offline with Piper TTS |
| Controls | Laptop only for now: WASD + mouse look, Shift run, Space jump, E interact, F mount/dismount bike |

Proposed layout: `src/world/` (city build, doors, bins), `src/player/`, `src/npc/`, `src/minigames/mohu/`, `src/ui/` (HUD, creator, scores), `src/state/`, `tools/osm/`, `server/` (score Worker, last milestone), `reference/` (images from Alex).

Rules for every session:

1. Read this brief and `CLAUDE.md` first. Keep `CLAUDE.md` updated with decisions, controls and file map.
2. One milestone per session (Build plan below). Each milestone ends playable, with `npm run build` passing.
3. Commit at the end of each milestone with a short changelog entry in `CHANGELOG.md`.
4. Keep 60 fps on a mid-range laptop: instanced meshes for repeated windows, bins and trees; merge static geometry per block; cull interiors you are not in.
5. No copyrighted photos, logos or music in the game. The Mohu and REpont look is recreated in flat colours and generic shapes, not the real logo files. Images in `reference/` are for shapes, colours and mood only, never textures.
6. Never use Google Maps or Street View data or images.

## The map: Belső-Ferencváros at real scale

The playable area is Belső-Ferencváros at 1 game metre = 1 real metre, built from OpenStreetMap.

**Boundary:** the Kiskörút (Vámház körút, Kálvin tér) on the north-west, Üllői út on the north-east, Ferenc körút on the south-east, and the Danube embankment on the south-west. Edge streets are walkable but the far side is a facade wall with an invisible barrier. The Danube, Szabadság híd's first span and the far bank are scenery only.

**Data pipeline (`tools/osm/`):**

1. Fetch the area once from the Overpass API: buildings, `building:levels`, `height`, roads, footways, squares, parks, trees, shops and entrances.
2. If the sandbox cannot reach Overpass, ask Alex to export the area from openstreetmap.org and drop the `.osm` file into `tools/osm/raw/`.
3. Convert to local metres and bake `public/data/city.json`. The game never calls OSM at runtime.
4. Missing heights default to 5 storeys at 3.6 m, the typical Pest tenement.

**How it looks:** buildings are extruded footprints with procedural eclectic facades: plaster colours, window grids, a ground-floor shop row, a big wooden gate per house, a roof ledge. Pavements with kerbs, street lamps, trees from OSM, parked cars as static blocks.

**Hand-built landmarks (simplified, recognisable):**

| Landmark | Why it matters |
| --- | --- |
| Központi Vásárcsarnok (Nagycsarnok), Fővám tér | Return point 2: Aldi inside |
| SPAR, corner of Kinizsi utca and Ráday utca | Return point 1 |
| Ráday utca | Busy café street, rich bins, crowds at night |
| Bakáts tér and its church | Open square, bench sleepers, pigeons |
| Iparművészeti Múzeum, Üllői út | Zsolnay roof, tourist crowd |
| Corvinus main building, Fővám tér | Students, bins full of bottles |
| Lónyay utca | The title street; the starting point |
| Kálvin tér | Metro exit crowds, edge of the map |
| Nehru part, Danube bank by Boráros tér | Riverside park full of picnickers: bins and lawns rich in bottles, especially in the evening |

**Visual references** (Alex puts these in `reference/`):

| Place | What to capture |
| --- | --- |
| Ráday utca | Narrow street, 3–5 storey cream and ochre tenements, café terraces with red awnings and potted plants down both sides, stone ball bollards, curly street lamps, a small green book kiosk |
| Lónyay utca | Long, straight street of eclectic tenements in ochre, grey and brick red; big wooden gates, corner towers and balconies; the brick Református gimnázium; small trees and planters at the kerb |
| Central Market Hall, outside | Red-brown brick with stone trim, Gothic-revival gable and towers, glazed Zsolnay roof tiles in a diamond pattern, yellow tram passing on the körút |
| Central Market Hall, inside | Huge single hall, orange-brown steel roof trusses, skylights, two levels of stalls with a gallery, paprika strings and busy aisles |
| SPAR, inside | Bright aisles, white floor, red and green signage, fruit and veg up front, self-checkouts; the REpont pair stands by the entrance |
| Nehru part | Wide riverside promenade, metal railing, rows of plane trees, lawn, turquoise and orange concrete loungers, a playground and basketball court, Gellért Hill and Szabadság híd in the distance |

**Scale and speed:** the area is roughly 1.5 km by 1 km. At realistic walking speed (1.4 m/s) crossing it takes about 15 real minutes, half a run. So the character walks at 2.5 m/s, runs at 5 m/s with a stamina bar, and a bike does about 8 m/s. Crossing at a run is then around 3 to 5 real minutes, which keeps the two return points a real route decision.

## Game flow and core loop

1. **Title screen:** Play, High scores, Settings (volume, mouse sensitivity, graphics quality).
2. **Character creator:** pick a preset, customise, type a name (max 16 characters). A portrait is captured for the score table.
3. **Intro card:** "Friday, 08:00. Lónyay utca. 48 hours. Every bottle and can is 50 Ft." The player spawns with an empty bag.
4. **The run:** collect, carry, return, repeat until the clock hits Sunday 08:00.
5. **End screen:** money earned, items returned, items still in the bag (worth nothing), funniest stat (doors slammed, dog incidents, házmester catches).
6. **High scores:** if the total is in the top 10, the entry is saved with name, portrait and amount.

**Time:** 30 real minutes = 48 game hours, so 1 real minute = 1 hour 36 minutes of game time. A full day-night cycle lasts 15 real minutes.

**Money only counts at the machine.** Items in the bag are worth 0 Ft until they go through a Mohu machine. A full bag at closing time is a race to the counter.

**The bag.** The character starts with a plastic bag holding 40 items (plastic bottles, cans and glass count the same). At the limit the prompt changes to "Bag full — go to a Mohu machine". One **IKEA-style big blue bag** is hidden per run, in a random courtyard or behind the Nehru part kiosks; picking it up raises the limit to 100 for the rest of the run. Its look is a generic blue woven bag with yellow handles, no logo.

**Score ceiling: 50 000 Ft (1 000 items).** The world spawns about 1 400 items across the run, so a near-perfect route with the big bag found early can approach 50 000 Ft. A strong run lands around 25 000–35 000 Ft, a first run around 10 000 Ft.

**HUD:** game clock and day, money in Ft, items in bag / capacity, stamina, a small north-up minimap with the two return points, status icons (slowed, on bike).

**Shop hours.** Both return points are open 06:00–24:00 every day of the run, Sunday included. Between midnight and 06:00 the doors are shut, so a full bag at 23:50 is a sprint, and the night is for filling up and waiting for the morning.

## Character creator

The run starts here: pick one of four presets, swap pieces, name the character. The model rotates on a turntable while the player edits. All pieces are low-poly meshes built in code, so each is a few lines to add.

| Preset | Look | Default name idea |
| --- | --- | --- |
| The Punk | Green mohawk, leather jacket with studs, ripped jeans, boots | Tüske |
| The Old Timer | Grey beard, flat cap, tweed jacket, plastic sandals with socks | Feri bácsi |
| The Hobo Romantic | Long coat, scarf, fingerless gloves, beanie | Bandi |
| The Festival Survivor | Bucket hat, faded band-style T-shirt with an invented band, cargo shorts | Csabi |

**Customise slots (4–6 options each):** hat, top, bottoms, shoes, accessory (sunglasses, earring, chain, backpack, dog on a string as a cosmetic), and colour swatches for hair and the main garment.

**Name:** free text, 1–16 characters, Hungarian accents allowed, a short blocklist for slurs.

**Portrait:** on confirm, render the head and shoulders against a yellow Mohu-style background into a 128 × 128 PNG and keep it with the run. This is the picture on the high-score table.

Accessories are cosmetic only in the first version. Stretch idea: a headlamp that shows items in bins at night.

## Bottle sources and getting into buildings

Plastic bottles, aluminium cans and glass bottles all count, each worth 50 Ft at the machine. Glass sometimes breaks when you run with a full bag (lose one, with a clink).

| Source | Items | Time to take | Refills | Notes |
| --- | --- | --- | --- | --- |
| Street item | 1–2 | Instant (E) | Several new ones every game hour | Benches, tram stops, café fronts, kerbs |
| Hidden spot | 2–6 | Instant (E) | Once per game day | Behind planters, under benches, in bushes at Nehru part, behind the Ráday book kiosk; a faint glint only up close |
| Public bin | 2–8 | Hold E for 2 s | 6 game hours after searching | Fuller near Ráday utca at night, Corvinus on weekdays, Nehru part in the evening |
| Party leftovers | 15–30 | Hold E for 3 s | A few per night, 22:00–04:00 | Crates and heaps of cans outside Ráday bars and on the Nehru part lawn |
| Courtyard bins inside a building | 5–20 per bin, 1–3 bins | Hold E for 4 s per bin | 12 game hours | The main source of volume |
| Jackpot courtyard | 40–80 | Hold E for 6 s | Once per run each | 3–4 random buildings per run: a renovation skip full of cans, a party flat's recycling. Often guarded by a házmester |

**Entering a building.** Every residential block on the map gets a street gate (from OSM entrances where present, otherwise one per facade). The player can enter two ways:

1. **Wait for a resident.** Each gate has a resident leave at a random moment, roughly every 30–90 real seconds, more often at 07:00–09:00 and 17:00–19:00, rarely after midnight. The resident walks out and the heavy gate swings shut over about 4 seconds. Get through before it clicks.
2. **Ring the bell.** E at the intercom panel. 1 in 10 rings buzzes the door open. The other 9 play a voice line from a grumpy old lady (or occasionally an old man) and the door stays shut. A short cooldown stops bell spam.

**Intercom lines (Hungarian audio, English subtitles), drawn randomly, never twice in a row:**

- "Nem kérünk semmit!" — We don't want anything!
- "Reklámot a postaládába!" — Ads go in the mailbox!
- "Menjen innen, mert hívom a rendőrséget!" — Go away or I'm calling the police!
- "Ki az? Nem várok senkit." — Who is it? I'm not expecting anyone.
- "A Józsi nincs itthon!" — Józsi isn't home!
- "Megint a gázórás? Múlt héten volt itt!" — The gas man again? He was here last week!
- "Fiatalember, éjjel kettő van!" — Young man, it's two in the morning! (night only)
- "Tanúi vagyunk, köszönjük!" — We're Witnesses already, thank you!
- "Hallóóó? ... Hallóóó?" — Hellooo? (then silence)

**Voice lines are generated, not recorded.** Install Piper TTS locally, synthesise every Hungarian line with a Hungarian voice, pitch and slow it for the old lady, add a crackly intercom filter, and commit the MP3s to `public/audio/voice/`. Check each voice's licence; the Anna voice is personal and non-commercial, which fits this free hobby game. Fallback if Piper fails: the browser's speech engine with a `hu-HU` voice. Until audio exists, show subtitles only.

**Inside:** one reusable Pest courtyard template, scaled to the building's footprint: gateway passage, mailboxes, courtyard with the bin corner, a staircase, open corridors (gang) on each floor. Upper floors are scenery in v1. The player leaves through the same gate, which opens freely from the inside.

**The házmester (caretaker).** About one building in four has one: a stocky man in a grey work coat and slippers, broom in hand, patrolling the courtyard on a loop.

- He spots you within about 8 metres in his view cone, or if you search a bin noisily nearby.
- He shouts ("Hé! Maga meg mit keres itt?!" — Hey! What are you doing here?!) and gives chase at walking speed.
- You have 5 seconds to get out through the gate. If he catches you, he takes half the bag (rounded down) and marches you out.
- At night he is asleep 70% of the time; you hear him snoring through a window.

## Mohu machine mini-game

At either return point the player walks up to a pair of REpont machines and presses E. The camera cuts to a close-up and the bag empties into the machine. Most items go in automatically at about 3 per second; the player only acts when the machine rejects one. A full 100-item bag takes about 45 seconds including rejects, which keeps a 1 000-item run possible.

![Two REpont machines side by side](reference/mohu-repont-machines.png)

**Look:** recreate the machine from the photo in flat shapes: black upper body with the round opening and a small screen, yellow front panel with the ALU / ÜVEG / PET icons, the "1 dl és 3 l között" and "Ne nyomd össze!" panels as generic text, and a printer slot. No real logo files; a lookalike wordmark in the game's font is fine.

**How it plays:**

1. Hold Space to feed: items fly from the bag into the round opening one after another, each with a scan beep and +50 Ft ticking up on the screen.
2. About 1 in 8 items is rejected (red screen, the item slides back out) and feeding pauses.
3. Fix the reject with a small action (below), then rotate it with A / D until the ring around the opening turns green and press Space to push it in.
4. Release Space anytime to stop and walk away with what is left in the bag.

**Why an item gets rejected, and what you can do:**

| Screen message | Cause | Fix |
| --- | --- | --- |
| Ne nyomd össze! | Item is crushed | Mash E to pop it back into shape, then retry |
| Nem olvasható vonalkód | Label is wet or twisted | Hold E to wipe and straighten it, then retry |
| Próbálja újra | Machine hiccup | Just retry; sometimes it happens three times in a row |
| Nem visszaváltható termék | No deposit label | Lost: it goes in the bin next to the machine |

Each item's condition (fine, crushed, wet, no deposit) is rolled when it is picked up. Bin items are more often crushed, street items more often wet.

**The queue.** When you arrive, each return point rolls 0, 1 or 2 people already at the machines (about 50 / 35 / 15 %). They are pensioners with a trolley, a student with a crate of cans, or a fellow street collector with a giant sack. Each takes 10–30 real seconds; you wait in line behind them, or walk to the other shop. Rarely one of the two machines shows "Megtelt" (full) and only the other works.

**Payout:** when the bag is empty, the printer spits out a receipt and the money goes straight into the HUD total.

## Time, NPCs, hazards and bikes

**Day and night.** The sun moves with the game clock; street lamps and shop windows switch on at dusk. Night is darker but not black: items get a faint glint so they stay findable.

| Time | Street life | Effect on items |
| --- | --- | --- |
| 07:00–10:00 | Commuters, gates open often | Good time to slip into buildings |
| 10:00–18:00 | Shoppers at the market hall, students at Corvinus, tourists | Steady bin refills |
| 18:00–02:00 | Ráday utca crowds outside bars, picnickers at Nehru part | Most street items and party leftovers appear |
| 02:00–07:00 | Nearly empty, a street sweeper truck | Sweeper clears street items on its route; gates almost never open |

**NPCs.** Pedestrians walk the pavements on paths baked from OSM footways, with simple avoidance. Types: commuter, tourist with a phone, student, pensioner with a shopping trolley, dog walker, bar crowd, and fellow street people pushing trolleys or sitting on benches. Street people are atmosphere only, not rivals: they never take items, but one may nod or say "Szia, haver" as you pass. Density follows the table above, capped at about 60 visible. NPCs occasionally finish a drink and drop the bottle.

**Dog mess.** Dog walkers leave piles on the pavement, plus a few fixed ones per run. Stepping in one slows the player to 70% speed for 1 real minute, leaves brown footprints, and plays a sound. Bikes ride over them safely.

**Bikes.** 6–10 unlocked bikes are scattered at random each run, leaning on railings or lamp posts. F to mount, F to dismount. Riding is about 8 m/s, no running, no bin searching while mounted. Crash into a pedestrian or wall and you fall off and lose a few seconds. A bike left behind stays where you dropped it. No moving traffic in v1; roads are crossable anywhere.

**No death.** The only fail state is running out of time with items still in the bag.

## High scores

The top 10 table shows rank, portrait (128 × 128), name and amount in Ft, sorted by amount, ties broken by earlier date. A run that makes the top 10 lands on the table straight from the end screen with its row highlighted. Format amounts the Hungarian way: `12 350 Ft`.

**Two steps.** Milestone 7 builds the top 10 in localStorage behind a `ScoreStore` interface, so the game is complete on one laptop. The shared online board comes last, in milestone 10.

**Online backend (milestone 10): a Cloudflare Worker with a D1 database, on the free plan.** Free, no credit card, never pauses, and a top 10 board uses a tiny fraction of the daily limits.

- Table `scores`: id, name, amount_ft, items, portrait (128 × 128 PNG as base64, under 20 KB), created_at.
- `GET /scores` returns the top 10. `POST /scores` adds a run and returns its rank.
- GitHub Pages hosts the game; the game calls the Worker.
- Light anti-cheat: reject amounts above 50 000 Ft, names over 16 characters and portraits over 20 KB; allow 1 post per minute per IP.
- If the Worker is unreachable, save locally and show "offline" on the table.
- Alex creates a free Cloudflare account and runs `npx wrangler login` when asked; Claude Code writes the Worker in `server/`, creates the D1 database and deploys it.

## Build plan

Ten milestones, one per Claude Code session, each ending in something Alex can open and play. M3 is the first real playtest: if collecting and returning is not fun with grey boxes, fix that before adding polish.

1. **M1 Setup and city.** Vite + TypeScript + Three.js scaffold, `CLAUDE.md`, GitHub Pages deploy. OSM import script, baked `city.json`, extruded grey buildings, streets, the map boundary. A capsule you can walk around at real scale.
2. **M2 Player and camera.** Third-person character with walk, run, jump, stamina, collisions against buildings, follow camera, minimap.
3. **M3 Core loop in grey boxes.** Game clock (30 min = 48 h), street items (bottles, cans, glass), hidden spots, public bins, party leftovers, the 40-item bag and the hidden 100-item IKEA-style bag, shop hours 06:00–24:00, HUD, a placeholder machine at both return points that accepts everything, end screen. First playtest.
4. **M4 Buildings.** Gates, random resident exits with the slow-closing door, the bell with 1-in-10 odds and subtitled lines, the courtyard interior template, courtyard bins, jackpot courtyards, the házmester and his chase.
5. **M5 Mohu mini-game.** The machine model, close-up camera, hold-to-feed at 3 items per second, rejection reasons and fixes, the 0–2 person queue, "Megtelt", receipt.
6. **M6 Living city.** NPC pedestrians with time-of-day density, including street-people NPCs, day-night lighting, street lamps, dog mess and the slow effect, bikes, street sweeper.
7. **M7 Character creator and local scores.** Four presets, accessory slots, name, portrait capture, the top 10 screen with scores saved locally behind `ScoreStore`.
8. **M8 Looking like Budapest.** Procedural tenement facades, the hand-built landmarks, SPAR and the market hall entrance and interiors, Nehru part, trees and lamps, colour pass from `reference/`.
9. **M9 Polish.** Synthesised SFX and Piper-generated Hungarian voice lines, title screen, settings, performance pass, balance pass (ceiling about 50 000 Ft, strong run 25 000–35 000 Ft), playtest with friends.
10. **M10 Shared high scores.** Cloudflare Worker + D1 in `server/`, anti-cheat checks, swap the local `ScoreStore` for the online one, keep local as the offline fallback, move existing local scores up.

Risks: M1, because patchy OSM data or a heavy scene hurts everything later; and M8, where "recognisable" can eat unlimited time, so cap each landmark at about an hour of work.

## Decisions

Settled by Alex:

- 3D third-person, GTA-style, walkable Belső-Ferencváros at realistic distances, in the browser, laptop only for now.
- English UI with Hungarian words and voice lines; audio is generated, not recorded.
- Character creator with presets, accessories and a name before every run.
- Plastic bottles, cans and glass all count, 50 Ft each, paid only at the machine.
- The bag holds 40 items, or 100 after finding the hidden IKEA-style bag. Score ceiling about 50 000 Ft.
- Items from streets, hidden spots, bins, party leftovers and building courtyards; doors by waiting for a resident or ringing (1 in 10 opens).
- A házmester guards some courtyards.
- Return points: SPAR at Kinizsi and Ráday utca, Aldi in the Central Market Hall at Fővám tér, both open 06:00–24:00, each with 0–2 people queuing at random.
- 48 game hours in 30 real minutes, then a top 10 with name, portrait and amount: local first, shared online (Cloudflare Worker + D1, free) as the very last milestone.
- Dog mess slows for a minute; bikes make you faster; NPCs fill the streets, including street people; no rivals.

Defaults (change only if Alex asks):

- Three.js on GitHub Pages; WASD and mouse.
- Walk 2.5 m/s, run 5 m/s, bike 8 m/s.
- The run starts Friday 08:00 at Lónyay utca.
- Item condition (crushed, wet, no deposit) drives machine rejections; glass can break when running.
- About 1 400 items spawn per run; the machine auto-feeds so the player only handles rejects.

Before you start, check with Alex that these exist:

- [ ] `reference/mohu-repont-machines.png` and the place reference images in `reference/`.
- [ ] A free Cloudflare account (needed only for M10).
