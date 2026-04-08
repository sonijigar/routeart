/*
  Overpass API fetcher.

  Fetches walkable roads from OpenStreetMap for a given bounding box.
  Caches results to avoid redundant API calls.
*/

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// In-memory cache keyed by quantized bbox string
const cache = new Map();

/**
 * Fetch all walkable roads in a bounding box around a center point.
 *
 * @param {[number, number]} center - [lat, lng]
 * @param {number} radiusKm - radius in km (default 1.0)
 * @returns {Promise<{elements: object[]}>} OSM elements (nodes + ways)
 */
export async function fetchRoadNetwork(center, radiusKm = 1.0) {
  const bbox = computeBbox(center, radiusKm);
  const key = bboxKey(bbox);

  if (cache.has(key)) {
    console.log(`[Overpass] Cache hit for ${key}`);
    return cache.get(key);
  }

  console.log(`[Overpass] Fetching roads for bbox ${key}...`);

  const query = buildQuery(bbox);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: HTTP ${res.status}`);
  }

  const data = await res.json();

  const nodes = data.elements.filter((e) => e.type === "node");
  const ways = data.elements.filter((e) => e.type === "way");
  console.log(
    `[Overpass] Received ${nodes.length} nodes, ${ways.length} ways`
  );

  cache.set(key, data);

  // Also cache in sessionStorage for page reloads
  try {
    sessionStorage.setItem(`overpass_${key}`, JSON.stringify(data));
  } catch {
    // sessionStorage full or unavailable — that's fine
  }

  return data;
}

/**
 * Build Overpass QL query for walkable roads in a bbox.
 */
function buildQuery(bbox) {
  const [south, west, north, east] = bbox;
  return `
[out:json][timeout:25];
(
  way["highway"~"^(residential|tertiary|secondary|primary|footway|pedestrian|path|living_street|service|unclassified|cycleway|track)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();
}

/**
 * Compute bounding box from center + radius.
 * Returns [south, west, north, east].
 */
function computeBbox([lat, lng], radiusKm) {
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  return [
    lat - latDelta, // south
    lng - lngDelta, // west
    lat + latDelta, // north
    lng + lngDelta, // east
  ];
}

/**
 * Quantize bbox to nearest 0.005° for cache stability.
 */
function bboxKey(bbox) {
  return bbox.map((v) => (Math.round(v / 0.005) * 0.005).toFixed(3)).join(",");
}

/**
 * Try to load cached data from sessionStorage.
 */
export function loadCachedNetwork(center, radiusKm = 1.0) {
  const bbox = computeBbox(center, radiusKm);
  const key = bboxKey(bbox);

  if (cache.has(key)) return cache.get(key);

  try {
    const stored = sessionStorage.getItem(`overpass_${key}`);
    if (stored) {
      const data = JSON.parse(stored);
      cache.set(key, data);
      console.log(`[Overpass] Loaded from sessionStorage: ${key}`);
      return data;
    }
  } catch {
    // sessionStorage unavailable
  }

  return null;
}
