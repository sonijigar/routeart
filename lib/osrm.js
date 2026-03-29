/*
  OSRM routing integration.

  Pipeline:
  1. Snap sample points to nearest walkable roads (throttled)
  2. Route pairwise between consecutive snapped points (throttled)
  3. Stitch all road-following segments together

  DEBUG: All steps logged to console — open browser devtools to see.
*/

const OSRM_BASE = "https://router.project-osrm.org";

const cache = new Map();

// Throttle concurrent requests to avoid rate-limiting
const CONCURRENCY = 2;
const DELAY_MS = 300;
const MAX_RETRIES = 3;

/**
 * Fetch with retry and exponential backoff.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      // Rate limited or server error — retry
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = DELAY_MS * Math.pow(2, attempt);
        console.warn(`[OSRM] HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      console.warn(`[OSRM] HTTP ${res.status} for ${url}`);
      return res; // Return non-ok response for caller to handle
    } catch (err) {
      if (attempt < retries) {
        const wait = DELAY_MS * Math.pow(2, attempt);
        console.warn(`[OSRM] Network error: ${err.message}, retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Snap shape points to roads, then route pairwise between them.
 */
export async function fetchRoutedShape(cacheKey, shapePoints) {
  if (cache.has(cacheKey)) {
    console.log(`[OSRM] Cache hit for "${cacheKey}"`);
    return cache.get(cacheKey);
  }

  console.log(`[OSRM] Starting pipeline for "${cacheKey}" with ${shapePoints.length} shape points`);
  console.log(`[OSRM] First point: [${shapePoints[0]}], Last point: [${shapePoints[shapePoints.length - 1]}]`);

  // Step 1: Snap all points to nearest walkable roads (throttled)
  console.log(`[OSRM] Step 1: Snapping ${shapePoints.length} points to roads...`);
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
  console.log(`[OSRM] Step 2: Deduped ${snapped.length} → ${deduped.length} points`);

  // Step 3: Route pairwise between consecutive snapped points (throttled)
  const segments = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    segments.push([deduped[i], deduped[i + 1]]);
  }

  console.log(`[OSRM] Step 3: Routing ${segments.length} segments...`);
  const routed = await throttledRouteAll(segments);

  // Step 4: Stitch
  let allCoords = [];
  let totalDist = 0;
  let routedCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < routed.length; i++) {
    const seg = routed[i];
    if (seg.coords.length > 2) routedCount++;
    else fallbackCount++;

    if (i === 0) {
      allCoords.push(...seg.coords);
    } else {
      allCoords.push(...seg.coords.slice(1));
    }
    totalDist += seg.dist;
  }

  console.log(`[OSRM] Step 4: Stitched ${routed.length} segments → ${allCoords.length} total coords`);
  console.log(`[OSRM]   ✓ OSRM-routed: ${routedCount} segments`);
  console.log(`[OSRM]   ✗ Straight-line fallback: ${fallbackCount} segments`);
  console.log(`[OSRM]   Total distance: ${(totalDist / 1609.34).toFixed(2)} mi (${totalDist.toFixed(0)} m)`);

  const entry = { coords: allCoords, dist: totalDist };
  cache.set(cacheKey, entry);
  return entry;
}

/**
 * Snap all points with throttling to avoid rate limits.
 */
async function throttledSnapAll(points) {
  const results = new Array(points.length);
  let snapOk = 0, snapFail = 0, snapTooFar = 0;

  for (let i = 0; i < points.length; i += CONCURRENCY) {
    const batch = points.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((pt) => snapToRoad(pt))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const idx = i + j;
      if (r.status === "fulfilled" && r.value) {
        const snapDist = haversine(points[idx], r.value);
        if (snapDist > 300) {
          console.warn(`[OSRM] Snap ${idx}: moved ${snapDist.toFixed(0)}m — TOO FAR, keeping original`);
          results[idx] = points[idx];
          snapTooFar++;
        } else {
          results[idx] = r.value;
          snapOk++;
        }
      } else {
        const reason = r.status === "rejected" ? r.reason?.message || r.reason : "null response";
        console.warn(`[OSRM] Snap ${idx}: FAILED (${reason}) — keeping original [${points[idx]}]`);
        results[idx] = points[idx];
        snapFail++;
      }
    }

    if (i + CONCURRENCY < points.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`[OSRM] Snap results: ${snapOk} OK, ${snapFail} failed, ${snapTooFar} too far`);
  return results;
}

/**
 * Route all segment pairs with throttling.
 */
async function throttledRouteAll(segments) {
  const results = new Array(segments.length);
  let routeOk = 0, routeFail = 0;

  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    const batch = segments.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(([a, b]) => fetchSegment(a, b))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const idx = i + j;
      const [a, b] = segments[idx];
      const straightDist = haversine(a, b);

      if (r.status === "fulfilled" && r.value) {
        const ratio = straightDist > 0 ? r.value.dist / straightDist : 1;
        console.log(`[OSRM] Route ${idx}: ${r.value.coords.length} pts, ${r.value.dist.toFixed(0)}m (straight: ${straightDist.toFixed(0)}m, ratio: ${ratio.toFixed(1)}x)`);
        if (ratio > 3.0) {
          // Detour detected — OSRM is double-tracking via parallel streets
          console.warn(`[OSRM] Route ${idx}: detour ratio ${ratio.toFixed(1)}x > 3.0 — using snap points only`);
          results[idx] = { coords: [a, b], dist: straightDist };
          routeFail++;
        } else {
          results[idx] = r.value;
          routeOk++;
        }
      } else {
        const reason = r.status === "rejected" ? r.reason?.message || r.reason : "null response";
        console.warn(`[OSRM] Route ${idx}: FAILED (${reason}) — using straight line [${a}] → [${b}] (${straightDist.toFixed(0)}m)`);
        results[idx] = { coords: [a, b], dist: straightDist };
        routeFail++;
      }
    }

    if (i + CONCURRENCY < segments.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`[OSRM] Route results: ${routeOk} OK, ${routeFail} failed`);
  return results;
}

async function snapToRoad([lat, lng]) {
  const url = `${OSRM_BASE}/nearest/v1/foot/${lng},${lat}?number=1`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    console.warn(`[OSRM] /nearest HTTP ${res.status} for [${lat}, ${lng}]`);
    return null;
  }
  const data = await res.json();
  if (data.code !== "Ok" || !data.waypoints?.[0]) {
    console.warn(`[OSRM] /nearest bad response for [${lat}, ${lng}]:`, data.code);
    return null;
  }
  const [sLng, sLat] = data.waypoints[0].location;
  return [sLat, sLng];
}

async function fetchSegment(a, b) {
  const url = `${OSRM_BASE}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?geometries=geojson&overview=full`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    console.warn(`[OSRM] /route HTTP ${res.status} for [${a}] → [${b}]`);
    return null;
  }
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    console.warn(`[OSRM] /route bad response for [${a}] → [${b}]:`, data.code);
    return null;
  }

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
