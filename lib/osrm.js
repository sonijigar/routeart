/*
  OSRM foot-routing integration.

  Pipeline for each route:
  1. SNAP — each control point → OSRM nearest walkable road
  2. ROUTE — between each consecutive pair of snapped points
  3. VALIDATE — if routed distance > 3× straight-line, reject that
     segment and fall back to straight line
  4. STITCH — concatenate all segment geometries
*/

const OSRM_BASE = "https://router.project-osrm.org";

// In-memory cache: routeKey → { coords, dist }
const cache = new Map();

// Max ratio of routed distance to straight-line distance.
// If OSRM routes 3× farther than the crow flies, it detoured badly.
const MAX_DETOUR_RATIO = 3.0;

/**
 * Full pipeline: snap → route → validate → stitch.
 */
export async function fetchRoutedPath(routeKey, controlPoints) {
  if (cache.has(routeKey)) return cache.get(routeKey);

  // Step 1: Snap all control points to nearest walkable roads
  const snapped = await snapAllPoints(controlPoints);

  // Step 2 + 3: Route between consecutive snapped points with validation
  const segments = [];
  for (let i = 0; i < snapped.length - 1; i++) {
    segments.push([snapped[i], snapped[i + 1]]);
  }

  const results = await Promise.allSettled(
    segments.map(([a, b]) => fetchAndValidateSegment(a, b))
  );

  // Step 4: Stitch together
  let allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    let segCoords, segDist;

    if (result.status === "fulfilled" && result.value) {
      segCoords = result.value.coords;
      segDist = result.value.dist;
    } else {
      // Final fallback: straight line
      segCoords = [segments[i][0], segments[i][1]];
      segDist = haversine(segments[i][0], segments[i][1]);
    }

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
 * Snap all control points to nearest walkable roads using OSRM nearest API.
 * Falls back to original coordinate if snap fails.
 */
async function snapAllPoints(points) {
  const results = await Promise.allSettled(
    points.map((pt) => snapToRoad(pt))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      const snappedPt = r.value;
      // Reject snap if it moved the point more than 150m
      // (probably snapped to wrong street)
      if (haversine(points[i], snappedPt) > 150) {
        console.warn(
          `Snap moved point ${i} by ${haversine(points[i], snappedPt).toFixed(0)}m — keeping original`
        );
        return points[i];
      }
      return snappedPt;
    }
    return points[i]; // keep original if snap failed
  });
}

/**
 * Snap a single point to nearest walkable road.
 * @param {[number,number]} pt - [lat, lng]
 * @returns {Promise<[number,number]|null>}
 */
async function snapToRoad([lat, lng]) {
  const url = `${OSRM_BASE}/nearest/v1/foot/${lng},${lat}?number=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== "Ok" || !data.waypoints?.[0]) return null;

  const [snapLng, snapLat] = data.waypoints[0].location;
  return [snapLat, snapLng];
}

/**
 * Route between two points and validate the result.
 * If the route detours too far, returns null (caller uses straight line).
 */
async function fetchAndValidateSegment(a, b) {
  const straightDist = haversine(a, b);

  // For very short segments (<30m), don't bother routing
  if (straightDist < 30) {
    return { coords: [a, b], dist: straightDist };
  }

  const result = await fetchSegment(a, b);
  if (!result) return null;

  // Validate: reject if OSRM detoured too far
  const ratio = result.dist / straightDist;
  if (ratio > MAX_DETOUR_RATIO) {
    console.warn(
      `Segment detour: ${result.dist.toFixed(0)}m routed vs ${straightDist.toFixed(0)}m straight (${ratio.toFixed(1)}×) — using straight line`
    );
    return null; // caller falls back to straight line
  }

  return result;
}

/**
 * Fetch a single routed segment from OSRM.
 */
async function fetchSegment(a, b) {
  const url = `${OSRM_BASE}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?geometries=geojson&overview=full`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) return null;

  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const dist = route.distance;

  return { coords, dist };
}

/**
 * Haversine distance in meters.
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

export function formatDist(meters) {
  const mi = meters / 1609.34;
  return `${mi.toFixed(1)} mi`;
}

export function formatTime(meters) {
  const mins = Math.round((meters / 1609.34) * 10); // ~10 min/mile
  return `~${mins} min`;
}
