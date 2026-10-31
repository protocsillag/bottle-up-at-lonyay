# Changelog

## Tweaks after M14 (2026-10-31)

- Shorter queues at the bottle machines: each person ahead of you now takes 8–20 seconds (was 10–30), so you never wait more than 20 seconds.
- Room for music: put `menu.mp3` and `game.mp3` in `public/audio/music/` and they play (menus and high scores / during a run), looping and cross-fading. Without the files the game stays silent as before. An optional `fight.mp3` plays during Zsiga's fight (without it the run's music carries on). Settings has a Music volume and Music on / off.
- Ringing a bell now gets you buzzed in 4 times in 10 (was 1 in 10).
- The SPAR on the Lónyay utca corner is a real shop now: walk in through its green glass door (BEJÁRAT) to find a pair of bottle machines and a till with food and beer, like the SPAR on Kinizsi utca. It has its own red S on the map, so there are three places to return bottles.
- Tipsy makes you 1.5× faster, walking and running (was 1.2×).
- Bikes are 1.5× faster: 12 m/s instead of 8, and they pick up speed as quickly as before.

## M14 Phones (2026-10-31)

- The game now plays in phone browsers. Phones and tablets get touch controls and a compact layout; a laptop or desktop (even one with a touchscreen) looks and plays exactly as before.
- On the street: a joystick appears wherever your left thumb lands (push it a little to stroll, all the way to walk; it steers the bike too). Drag with the right thumb to look around, pinch to zoom. The prompt is the action button above your right thumb: tap it to pick things up, open doors, ring bells and get on bikes; press and hold it to search bins and courtyards or kick a bin over. Run (a toggle), Jump, Bike (only when a bike is in reach or you are riding) and Pee (only while tipsy and facing a wall) sit bottom right. ❚❚ pauses, Map opens the big map.
- At the till: big "Food 100 Ft", "Beer 200 Ft" and "Close" buttons. Zsiga's offer has tappable answers.
- At the bottle machine: hold the big Feed button; when an item is refused, Fix appears (tap it to pop a crushed can back, hold it to wipe a wet label), then ◀ ▶ to roll the item and Push once the ring is green. Walk away is at the top; Done takes the receipt.
- In the fight: the joystick walks, up jumps, down crouches, back blocks; Punch, Kick and Special sit in an arc on the right. ❚❚ pauses the fight.
- Compact HUD on phones: the countdown and the clock at the top centre, money, bags, stamina and hunger in a small panel under the ❚❚ / Map buttons, a smaller minimap top right, toasts and subtitles kept clear of your thumbs.
- Every menu (title, character creator, intro, pause, settings, end screen, top 10) fits a phone held sideways without scrolling. The creator is a two-column panel with the model beside it; swipe the model to turn it. Settings has "Look sensitivity" for the drag-to-look speed.
- Phones start on Medium graphics (a quality you saved still wins). If the game runs under 25 fps for 10 seconds, a tip offers to switch to Low.
- Fix (same day): the phone controls list was also showing, garbled, on the desktop intro and pause cards. Desktop shows only the keyboard controls again.
- Landscape is the main layout; portrait works too. Notches and home bars are respected, the page never scrolls, zooms or selects text, Android goes full screen on the first tap, and sound and Hungarian speech start with the first touch.

## M13 The fire barrel fight (2026-10-31)

- Have a beer and four street people turn up round a burning barrel on the Nehru part, by where Kinizsi utca reaches the river: flames, sparks, a column of smoke and a firelit glow you can see from far off at night, a crackle as you get close. They warm their hands and pass a bottle round. When you sober up they wander off toward the river. No minimap marker: finding them is the point.
- Their leader, Zsiga, a Bajnok (Zsiga the Champion, olive army parka, black beanie, fingerless gloves, scarred nose), offers one round per run: win and your haul doubles (up to what your bags hold), lose and they tip your bags into their trolley, a draw changes nothing. The offer shows the real numbers ("Now: 23 items · Win: 46 · Lose: 0"). Your money is never at stake. With an empty bag he won't fight, and once you've fought he just chats.
- The fight is a 2D side-view brawler on its own screen: your own character from the creator against Zsiga on the Nehru part at night, with the river, the lit green Szabadság híd, the fire barrel and the other three cheering behind. Health bars, a 3:00 timer, "HARC!" at the start and "K.O." or "DÖNTETLEN" at the end, stars, dust and cans flying out of the crowd.
- Controls: A / D walk, W jump, S crouch, J punch, K kick, J + K the bag swing ("Zsákos csapás", 18 damage, knocks him down, every 10 s), hold away from him to block. Zsiga mixes punches and kicks, blocks some attacks, and every 8–12 s winds up his belly punch ("Gyomros") with a tell.
- Being tipsy shows: the scene sways and your punches hit a little harder.
- The world stops during the fight: game clock, countdown, tipsy timer, hunger, traffic and people all wait. Esc pauses the fight itself.
- The end screen shows how it went ("Beat Zsiga the Champion", "Lost to Zsiga" or "Drew with Zsiga").

## Playtest tweaks (2026-10-30)

- The intro card is wider and every control sits on one line.
- A run now starts on the pavement of Lónyay utca, not in the middle of the road.
- Bins that start a run already empty now say "Someone got here first — refills in …" instead of "Searched", so it no longer looks as if kicking one bin used up another.
- Pavements are never blocked: parked cars leave a gap at every lamp post, bin, planter and kerb tree, so you can always step round.
- The City Spar on Kinizsi utca is SPAR from every side: a white building with the green-and-red SPAR band, boards and blade signs on every street side, and a big sign on the roof. No residential gate on it any more.
- Beer: tipsy for 3 real minutes, a second beer while tipsy makes it 4, a third 5; more beers just restart the 5.
- Starving: you can still pick up loose bottles and cans from the street (and take blue bags), but you are too weak to search bins, stashes and party leftovers or to go into courtyards. Shops stay open to you, so you can go and eat.
- The time left in the run now has its own box at the top centre, "Game time remaining: 17:51", so it is no longer mixed up with the game clock (Saturday 03:26) in the top-left panel. The "Ends Sunday 08:00 · N h left" line is gone.
- The end screen's "Title" button is now "Home" (and the pause card says "Quit to home").

## World fixes from Alex's walk-through (2026-10-30)

- **Missing streets.** The map export dropped streets tagged as under construction, so a stretch of Lónyay utca, Mátyás utca's continuation from Lónyay to Ráday, and Kinizsi utca across Ráday showed as bare grey ground. They are now proper streets with road, pavement, parked cars and lamps, with junctions that walkers and cars can use. The map script now keeps such streets for the next re-bake.
- **The empty lot on Ráday** is now where it really is, at the Török Pál utca corner (from the reference photo): bare brick firewalls with chimneys, a fence of green posts and red-white tape, gravel, loose paving stones and weeds inside, the real substation covered in posters and tags, big green planters and lime bike-share bikes on the pavement. The hidden spot moved there too, tucked beside the substation. The building that had been removed for the old lot is back.
- **The old graffiti house** is the right building now: the long single-storey house that wraps around the little park at the Ráday corner. Peeling yellow plaster with brick showing through, white-framed windows, an arched door with a lantern, a grey plinth, big colourful graffiti pieces and tags, and a steep tiled roof that follows the L-shaped footprint, with chimneys and gutters. No more giant wedge.
- **Bálna** on the riverbank: two yellow-brick warehouse wings with a curving glass-and-steel whale arching between them, glowing at night with a lit shop row inside.
- **Riverside pubs** by Bálna: five bar pavilions (KIKÖTŐ, SÖRKERT, HAJÓ PUB, DUNAPART, PARTI BÁR) with beer tables, parasols and festoon lights. In the evening drinkers gather there, the bins fill up and party leftovers can turn up, like on Ráday.

## Bags easier to find (2026-10-30)

- Every run now has a blue bag behind one of the Nehru part kiosks and one on Ráday utca (behind the book kiosk or in the empty lot), plus a bag in about one courtyard in ten. Before, there were 3–5 bags in total, mostly in a handful of random courtyards.

## M12 Shared high scores (2026-10-30)

- A shared top 10 for everyone: a small Cloudflare Worker with a D1 database (free plan) in `server/`. The game posts each run at the end screen and shows the shared table on the title and end screens.
- Light anti-cheat on the server, with the same rules the game uses: at most 50 000 Ft, no more than 50 Ft per returned item, names of up to 16 characters (same blocklist as the creator), portraits under 20 KB, one post per minute per player, and only the game's own web address may post.
- Every run is still saved in the browser too. If the board can't be reached, the table says "Offline", shows the last board seen plus your new runs, and uploads them when it's back. Scores saved before M12 move up to the shared board the first time the game reaches it.
- Live at `https://bottle-up-scores.protocsillag.workers.dev`, deployed from Alex's Cloudflare account (`server/README.md`).

## M11 follow-up: Alex's tweaks (2026-10-30)

- Ráday utca is paved the whole way: the map data was missing its middle stretch (Köztelek utca to Biblia utca, about 230 m), which showed as plain grey. It is now filled in at load time, with the beige tiles from wall to wall, the grey drive strip, bollards, Ráday lamps and terraces. Cars still drive it one way.
- The házmester is visible in the courtyard: he was being drawn 6 km away by mistake, so only his shouting showed. He now patrols with his broom, and you see him coming when he chases you out.
- Peeing (tipsy, P) now shows it: your character stands with hands to the front and head back, a yellow arc runs to the wall, a wet streak spreads down it and a puddle grows at its foot.
- The City Spar on Kinizsi utca has a proper entrance: green-framed glass doors in the middle arch, a lit "BEJÁRAT" sign, opening hours on the glass, a doormat and a step, with no bollard in the way.
- Inside SPAR the till has room in front of it (shelf rows moved back, self-checkouts along the right wall) and a shelf of bread, párizsi and beer behind the cashier under an "Étel és ital itt" sign.

## M11 Real streets from Alex's photos (2026-10-30)

Every folder in `reference/` reworked, each artifact capped at about 20 minutes.

- **Bins:** public bins are now the dark green perforated basket in a hoop with a mint bag over the rim (side streets) or the lime-green bin on a post (squares and main streets). Wheelie bins are put out on the pavement at dawn and a garbage truck empties them 08:00–10:00. Renovation sites with scaffolding, green netting and a skip (a one-off street jackpot). Courtyard bins by lid colour: yellow recycling lids hold the bottles, plain and paper bins little or nothing.
- **Lónyay utca:** the red-brick Református gimnázium with its stepped gable and grey spire; the street's cream, sand, ochre and mint palette; rusticated stone ground floors with barred windows; dense parked cars (angled on Lónyay); crate planters, double yellow lines and bike symbols; parking wardens in hi-vis pairs; the SPAR corner style (black fascia, lattice grilles that come down at night, red "Élelmiszer" neon) on every SPAR front, plus a decorative SPAR corner; courtyard gateways with terrazzo floors, white tiles, mailboxes and half-glazed inner doors.
- **Mátyás utca:** white enamel street-name plates on every junction corner; three gate designs (carved brown with a fanlight, brown with oval windows and urn finials, green panelled with a transom and keypad) with house-number plates; painted plinths and invented graffiti tags on ground floors all over the district; the street's ochre, grey-green, apricot and olive palette; a MOSODA laundry corner; 2–3 pavement road works per run (plywood over a hole, striped posts, tape) that you have to walk around.
- **Ráday utca:** paved at one level (beige diagonal tiles, a grey block drive strip, steel channels), no kerbs; the Kálvin tér end is car-free and the rest one-way; green cast-iron bollards; green lamps with copper shades and hanging flower baskets; wooden terraces under brown, black, cream and white awnings (festoon bulbs at night) that are packed under green tarps in the morning and open from 15:00; a wall of colourful hexagon boxes; AUTOMATA 0–24, KOREAI BÜFÉ, BOROK and KÁVÉ shop signs with steps, A-boards and flags; the white Art Nouveau house with wavy bays, tile stripes and ceramic fruit; an empty lot between bare firewalls, fenced off, with a poster-covered substation box and a hidden spot behind it that is stocked every run.
- **Erkel utca and Török Pál utca:** in narrow side streets the lamps now hang on wires across the street; yellow shared-lane bike symbols with chevrons; black ball-top bollards; the long grey neo-Renaissance palace; the old single-storey graffiti house with its steep roof, chimney and checked-tablecloth terrace; an ochre block with an octagonal PÖRKÖLT bisztró sign; a KIADÓ shopfront.
- **Kálvin tér:** zigzag slab paving with a tactile strip; dozens of white stone balls you weave between; raised granite planting beds, tree tubs, bike racks with a locked blue bike, a green market barrow; the ribbed glass metro dome and green glass ventilation towers; the Reformed church gets its green onion spire, clock faces, iron fence and statue; tall candelabra lamps on the körút and other main roads; a rooftop billboard: "Mohu · minden üveg számít".
- **Bakáts tér:** the parish church in orange-red brick with grey stone, a portal with steps and a niche statue, belfry with louvres and clocks, pinnacled gables, a tall slim dark spire and a smaller side spire with a gold cross, an iron railing and hedge; the square gets a round paved plaza ringed by benches, curving pale paths, young trees, ornamental grasses, Ráday-style lamps and pigeons that scatter when you run through.
- Parked cars are split into tiles so the ones out of view are culled.

## M10 Gameplay round 2 (2026-10-30)

- Bags hold 50 items each. You start with one and can carry three (150 items); about four extra blue bags are hidden each run, mostly in courtyards, some behind the Nehru part kiosks or the Ráday book kiosk. A fourth says "Can't carry more bags". Your character carries them in hand and on the shoulder. HUD: "73 / 100 · 2 bags".
- A clear countdown: "Ends in 23:41" with "Ends Sunday 08:00 · 37 h left" under it. Orange and a warning at 5 minutes, red, pulsing and ticking in the last minute. The intro card says when the run ends.
- Tills in SPAR and the Aldi corner: a bread roll with párizsi (100 Ft) or a beer (200 Ft). The score is the money you have left.
- Hunger: a bar under stamina that empties about three times a run. Starving means slow, no running and no collecting until you eat.
- Beer makes you tipsy for 2–6 game hours: faster, a swaying view, slightly wobbly steering. P pees on a wall (people nearby are not impressed, and a házmester gives chase); hold E on a public bin to kick it over and grab everything at once, but it never refills.
- Moving traffic: cars (and yellow taxis) drive the streets, slow at junctions, honk and brake if you stand in the road, and knock you down if you step out right in front: 1–5 items smashed and an angry driver.
- New end-screen stats: spent on food and beer, walls watered, bins kicked over, hit by cars.

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
