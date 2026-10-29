// Fetches the Belső-Ferencváros area from the Overpass API once and stores the raw
// response in tools/osm/raw/area.json. Run: npm run osm:fetch
// If Overpass is unreachable, export the area from openstreetmap.org instead and
// drop the .osm file into tools/osm/raw/ (see README.md in this folder).
import { writeFile, mkdir } from 'node:fs/promises';
import { BBOX } from './area.mjs';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const [s, w, n, e] = BBOX;
const bb = `${s},${w},${n},${e}`;
const query = `
[out:json][timeout:120];
(
  way["building"](${bb});
  relation["building"](${bb});
  way["highway"](${bb});
  way["place"="square"](${bb});
  way["leisure"~"park|playground|pitch"](${bb});
  way["landuse"~"grass"](${bb});
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["waterway"="riverbank"](${bb});
  node["natural"="tree"](${bb});
  node["shop"](${bb});
  node["entrance"](${bb});
  node["amenity"~"waste_basket|bench|recycling"](${bb});
);
out body;
>;
out skel qt;
`;

const raw = new URL('./raw/', import.meta.url);
await mkdir(raw, { recursive: true });

for (const url of ENDPOINTS) {
  try {
    console.log(`Querying ${url} ...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'bottle-up-at-lonyay/0.1 (hobby browser game; github.com/protocsillag/bottle-up-at-lonyay)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    await writeFile(new URL('area.json', raw), text);
    console.log(`Saved ${json.elements.length} elements to tools/osm/raw/area.json`);
    process.exit(0);
  } catch (err) {
    console.warn(`  failed: ${err.message}`);
  }
}
console.error('All Overpass endpoints failed. Export the area from openstreetmap.org into tools/osm/raw/ instead.');
process.exit(1);
