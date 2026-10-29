// Shared constants for the OSM pipeline.

// Fetch box [south, west, north, east] — a little larger than the playable area so the
// facade walls across the edge streets and the Danube are included.
export const BBOX = [47.4755, 19.0525, 47.4930, 19.0760];

// Local origin for the metre conversion: Lónyay utca, roughly mid-street (the spawn area).
export const ORIGIN = { lat: 47.4855, lon: 19.0625 };
