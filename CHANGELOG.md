# Changelog

## M9 Polish (2026-10-29)

- Sound: every effect is synthesised in code, with no audio files: scan beeps, reject buzz, printer rattle, clinks when you pick things up, rustling while you search a bin, smashing glass, creaking and slamming gates, the door buzzer, intercom crackle, the squelch of dog mess, a bike bell, the receipt "ching", footsteps, a quiet city hum and birds by day.
- Voice lines: subtitles always show. The game plays generated Hungarian recordings once they exist (`tools/voice/` has the Piper script; run it locally), otherwise your browser's Hungarian voice, with a higher, slower voice for the intercom granny and a gruff one for the házmester.
- Settings screen from the title and the pause card: volume, effects, voices, voice mode, mouse sensitivity and graphics quality (low / medium / high).
- Title screen tagline; pause card with Settings and Quit to title.
- Performance: no shader recompiles when entering shops or at dusk; all shaders are compiled at startup; lighter night glints; shorter far plane.
- Balance: the world now spawns about 1 400 items per run. Sources thin out once most of that is used, keeping the best possible run near 50 000 Ft.
- Debug keys (G, T) and the fps line now need `?debug` in the URL.
- At the machine, pressing S while a bottle is in flight now walks away as soon as it lands.

## M8 Looking like Budapest (2026-10-29)

- Procedural tenement facades on every building: plaster in cream, ochre, grey, brick red, salmon, pale green and yellow; a tall rusticated ground floor with a shop row; framed windows with sills and pediments; storey bands; a projecting cornice under the roof; terracotta and grey roofs. Palaces, churches and the university get bigger arched windows. At night about half the windows glow warm.
- Granite kerbs along the streets; nicer plane trees.
- Central Market Hall rebuilt by hand: red-brown brick, a tall gabled roof of glazed Zsolnay tiles in a diamond pattern, rose windows in the gables, and the Fővám tér front with its three-arched stone portal and two tile-capped towers.
- SPAR and the market hall are now walk-in: SPAR has bright aisles, a white floor, red and green signage, fruit and veg up front and self-checkouts; the market hall has orange-brown steel trusses, a skylight, galleries with stalls on both sides, paprika strings and the Aldi corner. The REpont machines stand inside, by the entrance. Both open 06:00–24:00.
- Ráday utca: red café awnings, terrace tables and chairs, potted plants, stone ball bollards and a little green book kiosk (with a stash behind it).
- Lónyay utca: young trees along the kerb.
- Nehru part: a riverside railing, rows of plane trees, turquoise and orange concrete loungers, kiosks (the big blue bag sometimes hides behind them), a playground and basketball hoops.
- Bakáts tér church with its tall tower and tiled spire; the Museum of Applied Arts' green and yellow Zsolnay roof and dome; the Kálvin tér church tower and portico and a metro sign.
- Across the river: Gellért Hill with the Liberty Statue and the citadel, the Buda bank, and the green steel towers and chords of Szabadság híd.

## M7 Character creator and local scores (2026-10-29)

- Title screen over a slowly orbiting view of the neighbourhood, with Play and High scores.
- Character creator: four presets (The Punk "Tüske", The Old Timer "Feri bácsi", The Hobo Romantic "Bandi", The Festival Survivor "Csabi"), slots for hat, hair, face, top, bottoms, shoes and accessory (sunglasses, earring, chain, backpack, dog on a string), colour swatches for hair, garment and skin, a Randomise button and a name (1–16 characters, accents allowed, short blocklist). The model turns on a yellow turntable; drag to spin it.
- On confirm a 128 × 128 head-and-shoulders portrait is rendered against Mohu yellow. Your character is remembered for next time.
- Intro card ("Friday, 08:00. Lónyay utca. 48 hours. Every bottle and can is 50 Ft.") with the controls; the pause card can quit to the title.
- End screen shows your portrait and total; runs that make the top 10 are saved locally (behind a `ScoreStore` interface, ready for the online board) and the table highlights your row. Amounts use the Hungarian format (`12 350 Ft`).

## M6 Living city (2026-10-29)

- Day and night: the sun crosses the sky with the game clock, dawn and dusk glow orange, nights are dark blue with moonlight. A full day lasts 15 real minutes.
- Curly street lamps along every street switch on at dusk with pools of light on the pavement; shop windows light up warm at night. Benches from OSM.
- Pedestrians: commuters, tourists with phones (who stop for photos), students with backpacks, pensioners with shopping trolleys, dog walkers with dogs, bar crowds outside Ráday utca at night, picnickers on the Nehru part lawn in the evening, and street people pushing trolleys or sitting on benches, who say "Szia, haver!". Density follows the time of day (busy mornings and evenings, near-empty from 02:00), capped at 60. People pause in front of you and occasionally drop a bottle.
- Dog mess: step in it and you slow to 70% for a minute, leaving brown footprints. Dogs add more during the day.
- Bikes: 6–10 unlocked bikes per run. F to get on and off; 8 m/s, no running, no bin searching, no going through gates. Crash into a wall or a person and you fall off for a few seconds.
- A street sweeper truck drives the streets from 02:00 to 07:00 and brushes away loose items.
- Loose items glint faintly at night.

## M5 Mohu mini-game (2026-10-29)

- Both return points now have a pair of REpont-style machines in flat shapes (black body, yellow header and front panel with ALU / ÜVEG / PET icons, "1 dl és 3 l között" and "Ne nyomd össze!" panels, printer slot), plus a bin for refused items. Lookalike wordmark only, no logo files.
- E at the machines cuts to a close-up. Hold Space: items fly from the bag into the round opening at 3 per second, each scan adding 50 Ft on the machine screen.
- About 1 in 8 items is refused, with the screen turning red: "Ne nyomd össze!" (mash E to pop it back), "Nem olvasható vonalkód" (hold E to wipe the label), "Próbálja újra" (just retry; can happen again) or "Nem visszaváltható termék" (lost into the bin). Then roll the item with A / D until the ring around the opening turns green and push it in with Space.
- Item condition is rolled at pickup: bin items are more often crushed, street items more often wet.
- On arrival 0, 1 or 2 people (pensioner with a trolley, student with a crate, collector with a sack) may be using the machines for 10–30 s; rarely one machine shows "Megtelt".
- When the bag is empty the printer pushes out a receipt and the money goes into the total. Walking away, closing time or the end of the run also print what you fed.

## M4 Buildings (2026-10-29)

- 266 residential buildings get a big wooden street gate with a stone surround and an intercom panel.
- Residents leave at random (every 30–90 s, more often at 07–09 and 17–19, rarely after midnight). The heavy gate swings shut over 4 seconds: walk in before it clicks. Slammed doors are counted.
- Ring the bell (E at the intercom): 1 in 10 buzzes the door open; the rest get a grumpy intercom line in Hungarian with an English subtitle, never the same twice in a row, with a night-only line.
- Courtyard interiors from one reusable Pest template scaled to each building: gateway passage with mailboxes, courtyard, staircase door, open corridors (gang) on every floor. Leave through the gate, which opens freely from inside.
- Courtyard bins: 1–3 wheelie bins with 5–20 items each (hold E 4 s, refill after 12 game hours).
- 3–4 jackpot courtyards per run: a renovation skip full of cans or a party flat's recycling, 40–80 items (hold E 6 s).
- The big blue bag now hides in a random courtyard in most runs.
- The házmester: in about one courtyard in four (and most jackpots), grey work coat and broom, patrolling a loop. He spots you within 8 m in his view cone or hears you searching a bin; you then have 5 seconds to get out before he takes half your bag and marches you out. Asleep most nights (you hear the snoring).

## M3 Core loop in grey boxes (2026-10-29)

- Game clock: Friday 08:00 to Sunday 08:00 in 30 real minutes, shown top-left with the day. The clock stops while paused.
- Money only counts at the machine: wallet and bag (0 / 40) top-right, the bag bar turns red when full.
- Item sources: loose street items (bottles, cans, glass) that keep spawning, busier on Ráday utca at night, Nehru part in the evening and Corvinus on Friday; 44 hidden stashes behind planters with a glint up close, restocked each morning; 98 public bins (hold E for 2 s, refill after 6 game hours, fuller in hot zones); party leftovers on Ráday utca and the Nehru part lawn between 22:00 and 04:00 (hold E for 3 s, 15–30 items).
- One big blue bag hidden per run on the Nehru part lawn: picking it up raises the bag to 100.
- Each item gets a condition when picked up (fine, crushed, wet, no deposit) for the M5 machine.
- Running with a nearly full bag can break a glass bottle (clink).
- Placeholder bottle machines outside SPAR (Kinizsi utca) and the market hall (Fővám tér), open 06:00–24:00; E feeds 3 items per second for 50 Ft each.
- Interaction prompt with hold progress, toasts for pickups, bag full and closing time.
- End screen at Sunday 08:00 with money, items returned, items left in the bag, and the funniest stat. Play again starts a fresh random run.
- Debug: T toggles time ×30.

## M2 Player and camera (2026-10-29)

- Low-poly street character built in code (parka, jeans, red beanie) replaces the capsule, with procedural walk, run (forward lean, pumping arms), jump (knee tuck, arms up) and idle breathing.
- Jump on Space: about 0.8 m high, 0.6 s in the air, reduced air control, costs a little stamina.
- Stamina: 10 s of running from full, refills in about 5 s after a short delay. Emptying the bar blocks running until it is back to 30% and Shift is pressed again. Stamina bar bottom-left, red while exhausted.
- North-up round minimap bottom-right, pre-rendered from `city.json`: buildings, streets, parks, the Danube and the dashed playable boundary. The two return points (S = SPAR at Kinizsi/Ráday, A = Aldi in the market hall) stay pinned to the rim when off-screen. M opens a large map of the whole area.
- Follow camera only half-follows jumps so the view does not bounce.
- Controls list moved into the start/pause card.

## M1 Setup and city (2026-10-29)

- Vite + TypeScript + Three.js scaffold; GitHub Pages deploy workflow.
- OSM pipeline in `tools/osm/`: Overpass fetch and bake to `public/data/city.json` (730 buildings, 300 inside the playable area, 221 with courtyards; streets, footpaths, squares, parks, the Danube, 597 trees, plus shops, bins, benches and entrances for later milestones).
- Grey extruded buildings merged per 200 m tile, asphalt streets, footpaths, parks, river and simple bridge decks, instanced trees, sun shadows following the player.
- Playable boundary: Kiskörút, Üllői út, Ferenc körút and the Danube bank, with an invisible barrier.
- Yellow capsule player at real scale: walk 2.5 m/s, run 5 m/s (Shift), collision against building walls and the boundary; third-person mouse camera that pulls in at walls.
- HUD shows the current street name from OSM, fps and position. G toggles a 20 m/s debug walk.
