/*
  OSRM routing integration.

  Pipeline:
  1. Snap sample points to nearest walkable roads (throttled)
  2. Route pairwise between consecutive snapped points (throttled)
  3. Stitch all road-following segments together
*/

const OSRM_BASE = "https://router.project-osrm.org";

const cache = new Map();

// Throttle concurrent requests to avoid rate-limiting
const CONCURRENCY = 3;
const DELAY_MS = 100;

/**
 * Snap shape points to roads, then route pairwise between them.
 */
export async function fetchRoutedShape(cacheKey, shapePoints) {
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Step 1: Snap all points to nearest walkable roads (throttled)
  const snapped = await throttledSnapAll(shapePoints);

  // Step 2: Deduplicate consecutive identical points
  const deduped = [snapped[0]];
  for (let i = 1; i < snapped.length; i++) {
    const prev = deduped[deduped.length - 1];
    const dist = haversine(prev, snapped[i]);
    if (dist > 20) {
      deduped.push(snapped[i]);
    }
  }

  // Step 3: Route pairwise between consecutive snapped points (throttled)
  const segments = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    segments.push([deduped[i], deduped[i + 1]]);
  }

  const routed = await throttledRouteAll(segments);

  // Step 4: Stitch
  let allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < routed.length; i++) {
    const seg = routed[i];
    if (i === 0) {
      allCoords.push(...seg.coords);
    } else {
      allCoords.push(...seg.coords.slice(1));
    }
    totalDist += seg.dist;
  }

  const entry = { coords: allCoords, dist: totalDist };
  cache.set(cacheKey, entry);
  return entry;
}

/**
 * Snap all points with throttling to avoid rate limits.
 */
async function throttledSnapAll(points) {
  const results = new Array(points.length);

  for (let i = 0; i < points.length; i += CONCURRENCY) {
    const batch = points.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((pt) => snapToRoad(pt))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const idx = i + j;
      if (r.status === "fulfilled" && r.value) {
        // Reject snap if it moved point too far
        if (haversine(points[idx], r.value) > 300) {
          results[idx] = points[idx];
        } else {
          results[idx] = r.value;
        }
      } else {
        results[idx] = points[idx];
      }
    }

    if (i + CONCURRENCY < points.length) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}

/**
 * Route all segment pairs with throttling.
 */
async function throttledRouteAll(segments) {
  const results = new Array(segments.length);

  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    const batch = segments.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(([a, b]) => fetchSegment(a, b))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const idx = i + j;
      const [a, b] = segments[idx];

      if (r.status === "fulfilled" && r.value) {
        results[idx] = r.value;
      } else {
        // Fallback: straight line
        results[idx] = { coords: [a, b], dist: haversine(a, b) };
      }
    }

    if (i + CONCURRENCY < segments.length) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}

async function snapToRoad([lat, lng]) {
  const res = await fetch(
    `${OSRM_BASE}/nearest/v1/foot/${lng},${lat}?number=1`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.waypoints?.[0]) return null;
  const [sLng, sLat] = data.waypoints[0].location;
  return [sLat, sLng];
}

async function fetchSegment(a, b) {
  const url = `${OSRM_BASE}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) return null;

  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return { coords, dist: route.distance };
}

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatDist(meters) {
  const mi = meters / 1609.34;
  return `${mi.toFixed(1)} mi`;
}

export function formatTime(meters) {
  const mins = Math.round((meters / 1609.34) * 10);
  return `~${mins} min`;
}
