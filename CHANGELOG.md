# Changelog

## M1 Setup and city (2026-10-29)

- Vite + TypeScript + Three.js scaffold; GitHub Pages deploy workflow.
- OSM pipeline in `tools/osm/`: Overpass fetch and bake to `public/data/city.json` (730 buildings, 300 inside the playable area, 221 with courtyards; streets, footpaths, squares, parks, the Danube, 597 trees, plus shops, bins, benches and entrances for later milestones).
- Grey extruded buildings merged per 200 m tile, asphalt streets, footpaths, parks, river and simple bridge decks, instanced trees, sun shadows following the player.
- Playable boundary: Kiskörút, Üllői út, Ferenc körút and the Danube bank, with an invisible barrier.
- Yellow capsule player at real scale: walk 2.5 m/s, run 5 m/s (Shift), collision against building walls and the boundary; third-person mouse camera that pulls in at walls.
- HUD shows the current street name from OSM, fps and position. G toggles a 20 m/s debug walk.
