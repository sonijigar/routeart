/*
  OSRM foot-routing integration.
  Snaps control-point pairs to real walkable roads using the
  public OSRM demo API, then stitches segments into one path.
*/

const OSRM_BASE = "https://router.project-osrm.org/route/v1/foot";

// In-memory cache: routeKey → { coords: [lat,lng][], dist: number (meters) }
const cache = new Map();

/**
 * For each consecutive pair of control points, fetch the real
 * road-following path from OSRM and stitch into one route.
 *
 * @param {string} routeKey - cache key (e.g. "heart")
 * @param {[number,number][]} controlPoints - [lat, lng] pairs
 * @returns {Promise<{ coords: [number,number][], dist: number }>}
 *   coords in [lat, lng] order, dist in meters
 */
export async function fetchRoutedPath(routeKey, controlPoints) {
  if (cache.has(routeKey)) return cache.get(routeKey);

  // Build segment pairs
  const segments = [];
  for (let i = 0; i < controlPoints.length - 1; i++) {
    segments.push([controlPoints[i], controlPoints[i + 1]]);
  }

  // Fetch all segments in parallel
  const results = await Promise.allSettled(
    segments.map(([a, b]) => fetchSegment(a, b))
  );

  // Stitch together
  let allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    let segCoords;
    let segDist = 0;

    if (result.status === "fulfilled" && result.value) {
      segCoords = result.value.coords;
      segDist = result.value.dist;
    } else {
      // Fallback: straight line between control points
      segCoords = [segments[i][0], segments[i][1]];
      segDist = haversine(segments[i][0], segments[i][1]);
    }

    // Skip first point of subsequent segments to avoid duplicates
    if (i === 0) {
      allCoords.push(...segCoords);
    } else {
      allCoords.push(...segCoords.slice(1));
    }
    totalDist += segDist;
  }

  const entry = { coords: allCoords, dist: totalDist };
  cache.set(routeKey, entry);
  return entry;
}

/**
 * Fetch a single segment from OSRM.
 * @param {[number,number]} a - [lat, lng]
 * @param {[number,number]} b - [lat, lng]
 * @returns {Promise<{ coords: [number,number][], dist: number } | null>}
 */
async function fetchSegment(a, b) {
  // OSRM expects lng,lat order
  const url = `${OSRM_BASE}/${a[1]},${a[0]};${b[1]},${b[0]}?geometries=geojson&overview=full`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) return null;

  const route = data.routes[0];
  // GeoJSON coordinates are [lng, lat] — convert to [lat, lng]
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const dist = route.distance; // meters

  return { coords, dist };
}

/**
 * Haversine distance in meters between two [lat, lng] points.
 * Used as fallback distance when OSRM fails.
 */
function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format meters as a human-readable distance string.
 */
export function formatDist(meters) {
  const mi = meters / 1609.34;
  return `${mi.toFixed(1)} mi`;
}

/**
 * Estimate running time from distance.
 */
export function formatTime(meters) {
  const mins = Math.round(meters / 1609.34 * 10); // ~10 min/mile pace
  return `~${mins} min`;
}
