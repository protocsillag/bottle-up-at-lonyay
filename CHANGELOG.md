# Changelog

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
