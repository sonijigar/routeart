/*
  OSRM routing integration.

  Pipeline:
  1. Receive sample points from a parametric shape curve
  2. Snap each point to the nearest walkable road
  3. Send all snapped points as waypoints in ONE OSRM route request
  4. Get back a road-following path through all waypoints
*/

const OSRM_BASE = "https://router.project-osrm.org";

// Cache: shapeKey → { coords, dist }
const cache = new Map();

/**
 * Full pipeline: snap points → multi-waypoint route → return path.
 *
 * @param {string} cacheKey
 * @param {[number,number][]} shapePoints - [lat, lng] from shape sampler
 * @returns {Promise<{ coords: [number,number][], dist: number }>}
 */
export async function fetchRoutedShape(cacheKey, shapePoints) {
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Step 1: Snap all points to nearest walkable roads
  const snapped = await snapAllPoints(shapePoints);

  // Step 2: Deduplicate consecutive identical snapped points
  const deduped = [snapped[0]];
  for (let i = 1; i < snapped.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (prev[0] !== snapped[i][0] || prev[1] !== snapped[i][1]) {
      deduped.push(snapped[i]);
    }
  }

  // Step 3: Route through all snapped points
  // OSRM supports up to ~100 waypoints in one request
  // If we have more, batch them
  let allCoords = [];
  let totalDist = 0;

  const BATCH_SIZE = 25; // safe limit per request
  for (let i = 0; i < deduped.length - 1; i += BATCH_SIZE - 1) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    if (batch.length < 2) break;

    const result = await fetchMultiWaypointRoute(batch);
    if (result) {
      if (allCoords.length > 0) {
        // Skip first point to avoid duplicate at junction
        allCoords.push(...result.coords.slice(1));
      } else {
        allCoords.push(...result.coords);
      }
      totalDist += result.dist;
    } else {
      // Fallback: straight lines for this batch
      if (allCoords.length > 0) {
        allCoords.push(...batch.slice(1));
      } else {
        allCoords.push(...batch);
      }
      for (let j = 0; j < batch.length - 1; j++) {
        totalDist += haversine(batch[j], batch[j + 1]);
      }
    }
  }

  const entry = { coords: allCoords, dist: totalDist };
  cache.set(cacheKey, entry);
  return entry;
}

/**
 * Snap all points to nearest walkable roads in parallel.
 */
async function snapAllPoints(points) {
  const results = await Promise.allSettled(points.map(snapToRoad));

  return results.map((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      // If snap moved point too far (>200m), keep original
      if (haversine(points[i], r.value) > 200) return points[i];
      return r.value;
    }
    return points[i];
  });
}

/**
 * Snap one point to nearest walkable road.
 */
async function snapToRoad([lat, lng]) {
  try {
    const res = await fetch(
      `${OSRM_BASE}/nearest/v1/foot/${lng},${lat}?number=1`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.waypoints?.[0]) return null;
    const [sLng, sLat] = data.waypoints[0].location;
    return [sLat, sLng];
  } catch {
    return null;
  }
}

/**
 * Route through multiple waypoints in one OSRM call.
 */
async function fetchMultiWaypointRoute(points) {
  // Build coordinate string: lng,lat;lng,lat;...
  const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/foot/${coordStr}?geometries=geojson&overview=full`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    return { coords, dist: route.distance };
  } catch {
    return null;
  }
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
  const mins = Math.round((meters / 1609.34) * 10);
  return `~${mins} min`;
}
