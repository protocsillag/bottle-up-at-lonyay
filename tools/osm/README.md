# OSM pipeline

The game never calls OpenStreetMap at runtime. These scripts bake `public/data/city.json` once.

```bash
npm run osm:fetch   # Overpass API -> tools/osm/raw/area.json (git-ignored, ~6 MB)
npm run osm:bake    # raw -> public/data/city.json (committed)
```

- `area.mjs`: fetch bounding box and the local origin (Lónyay utca).
- `fetch.mjs`: one Overpass query for buildings, roads, footways, squares, parks, water, trees, shops, entrances, bins and benches.
- `bake.mjs`: projects to local metres (x = east, z = south), assembles multipolygon buildings with their courtyards, sets heights (`height`, else `building:levels` × 3.6 m, else 5 storeys), builds the playable boundary and finds landmarks by name.

**Fallback:** if Overpass is unreachable, export the same area from openstreetmap.org (Export → Manually select a different area) and drop the `.osm` file into `tools/osm/raw/`. `bake.mjs` reads `area.json` first and any `*.osm` file otherwise.

**Boundary:** hand-set corners in `bake.mjs` (`BOUNDARY`): Fővám tér bank, Kálvin tér, Üllői út × Ferenc körút, Boráros tér, Petőfi híd bank. Street edges are pushed outward so the whole edge street is walkable; the Danube edge is not.

Map data © OpenStreetMap contributors, ODbL.
