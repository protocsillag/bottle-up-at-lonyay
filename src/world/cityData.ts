// Shape of public/data/city.json, baked by tools/osm/bake.mjs.
// All coordinates are local metres: x = east, z = south (Three.js ground plane).

export type Vec2 = [number, number];

export interface Building {
  id: string;
  h: number;
  outer: Vec2[];
  holes?: Vec2[][];
  name?: string;
  /** Outside the playable boundary: facade wall / skyline only. */
  scenery?: 1;
}

export interface Road {
  kind: 'road' | 'foot';
  hw: string;
  w: number;
  pts: Vec2[];
  name?: string;
  bridge?: 1;
  /** One-way (baked from OSM since M10): 1 along `pts`, −1 against. */
  oneway?: 1 | -1;
  /** No motor vehicles. */
  nocars?: 1;
}

export interface Area {
  kind: 'water' | 'park' | 'grass' | 'pitch' | 'plaza';
  outer: Vec2[];
  holes?: Vec2[][];
  name?: string;
}

export interface CityData {
  version: number;
  extent: { minX: number; maxX: number; minZ: number; maxZ: number };
  boundary: Vec2[];
  landmarks: Record<string, Vec2 | null>;
  buildings: Building[];
  roads: Road[];
  areas: Area[];
  trees: Vec2[];
  entrances: Vec2[];
  shops: { p: Vec2; shop: string; name?: string }[];
  bins: Vec2[];
  benches: Vec2[];
}

export async function loadCity(): Promise<CityData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/city.json`);
  if (!res.ok) throw new Error(`city.json: HTTP ${res.status}`);
  return res.json();
}
