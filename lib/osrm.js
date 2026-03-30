/*
  OSRM routing integration.

  Pipeline:
  1. Get multiple snap candidates per point (throttled)
  2. Neighbor-aware selection — choose snaps that maintain street continuity
  3. Loop detection — remove points that would create small loops
  4. Route pairwise between selected points (throttled)
  5. Stitch all road-following segments together

  DEBUG: All steps logged to console — open browser devtools to see.
*/

const OSRM_BASE = "https://router.project-osrm.org";

const cache = new Map();

// Throttle concurrent requests to avoid rate-limiting
const CONCURRENCY = 2;
const DELAY_MS = 300;
const MAX_RETRIES = 3;
const SNAP_CANDIDATES = 3; // number of nearest-road candidates per point

/**
 * Fetch with retry and exponential backoff.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = DELAY_MS * Math.pow(2, attempt);
        console.warn(`[OSRM] HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      console.warn(`[OSRM] HTTP ${res.status} for ${url}`);
      return res;
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

  // Step 1: Get multiple snap candidates per point
  console.log(`[OSRM] Step 1: Getting ${SNAP_CANDIDATES} snap candidates per point...`);
  const allCandidates = await throttledSnapCandidates(shapePoints);

  // Step 2: Neighbor-aware selection — choose snaps for street continuity
  console.log(`[OSRM] Step 2: Selecting best snaps for street continuity...`);
  const selected = selectSmoothedSnaps(shapePoints, allCandidates);

  // Step 3: Loop detection — remove points creating small loops
  const cleaned = removeLoopPoints(selected);
  console.log(`[OSRM] Step 3: Loop removal: ${selected.length} → ${cleaned.length} points`);

  // Step 4: Deduplicate consecutive close points
  const deduped = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i++) {
    const prev = deduped[deduped.length - 1];
    const dist = haversine(prev.coord, cleaned[i].coord);
    if (dist > 80) {
      deduped.push(cleaned[i]);
    }
  }
  console.log(`[OSRM] Step 4: Deduped ${cleaned.length} → ${deduped.length} points`);

  // Step 5: Route pairwise between consecutive snapped points
  const segments = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    segments.push([deduped[i].coord, deduped[i + 1].coord]);
  }

  console.log(`[OSRM] Step 5: Routing ${segments.length} segments...`);
  const routed = await throttledRouteAll(segments);

  // Step 6: Stitch
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

  console.log(`[OSRM] Step 6: Stitched ${routed.length} segments → ${allCoords.length} total coords`);
  console.log(`[OSRM]   ✓ OSRM-routed: ${routedCount} segments`);
  console.log(`[OSRM]   ✗ Straight-line fallback: ${fallbackCount} segments`);
  console.log(`[OSRM]   Total distance: ${(totalDist / 1609.34).toFixed(2)} mi (${totalDist.toFixed(0)} m)`);

  const entry = { coords: allCoords, dist: totalDist };
  cache.set(cacheKey, entry);
  return entry;
}

// ─── Step 1: Multi-candidate snapping ────────────────────────────────

/**
 * Get multiple snap candidates per point with throttling.
 * Returns array of arrays: candidates[i] = [{ coord, name, dist }, ...]
 */
async function throttledSnapCandidates(points) {
  const results = new Array(points.length);

  for (let i = 0; i < points.length; i += CONCURRENCY) {
    const batch = points.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((pt) => snapCandidates(pt))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const idx = i + j;
      if (r.status === "fulfilled" && r.value && r.value.length > 0) {
        // Filter out candidates that moved too far
        const valid = r.value.filter(
          (c) => haversine(points[idx], c.coord) <= 300
        );
        results[idx] = valid.length > 0 ? valid : [{ coord: points[idx], name: "", dist: 0 }];
      } else {
        results[idx] = [{ coord: points[idx], name: "", dist: 0 }];
      }
    }

    if (i + CONCURRENCY < points.length) {
      await sleep(DELAY_MS);
    }
  }

  const withCandidates = results.filter((r) => r.length > 1).length;
  console.log(`[OSRM] Snap candidates: ${withCandidates}/${points.length} points have multiple options`);
  return results;
}

/**
 * Get top N nearest road candidates for a point.
 * Returns [{ coord: [lat, lng], name: string, dist: number }, ...]
 */
async function snapCandidates([lat, lng]) {
  const url = `${OSRM_BASE}/nearest/v1/foot/${lng},${lat}?number=${SNAP_CANDIDATES}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.waypoints) return null;

  return data.waypoints.map((wp) => ({
    coord: [wp.location[1], wp.location[0]], // [lat, lng]
    name: wp.name || "",
    dist: wp.distance, // meters from query point
  }));
}

// ─── Step 2: Neighbor-aware snap selection ───────────────────────────

/**
 * Choose the best snap for each point considering neighbors.
 * Prefers candidates that maintain street continuity (same road name)
 * and follow the expected curve direction.
 *
 * Returns array of { coord, name }
 */
function selectSmoothedSnaps(shapePoints, allCandidates) {
  const selected = new Array(shapePoints.length);

  // First point: pick closest
  selected[0] = allCandidates[0][0];
  console.log(`[OSRM] Snap 0: "${selected[0].name}" (closest)`);

  for (let i = 1; i < shapePoints.length; i++) {
    const candidates = allCandidates[i];
    const prev = selected[i - 1];

    if (candidates.length === 1) {
      selected[i] = candidates[0];
      continue;
    }

    // Expected direction: from previous ideal point to this ideal point
    const expectedDir = bearing(shapePoints[i - 1], shapePoints[i]);

    let bestScore = Infinity;
    let bestCandidate = candidates[0];

    for (const cand of candidates) {
      // Score components (lower is better):

      // 1. Snap distance from ideal point (how far from the curve)
      const snapDist = haversine(shapePoints[i], cand.coord);

      // 2. Street continuity bonus — reward staying on same street
      const sameStreet = cand.name && cand.name === prev.name ? -80 : 0;

      // 3. Direction consistency — penalize if snap-to-snap direction
      //    deviates from the expected curve direction
      const actualDir = bearing(prev.coord, cand.coord);
      const dirDiff = angleDiff(expectedDir, actualDir);
      const dirPenalty = dirDiff * 0.5; // 0-90 range

      const score = snapDist + sameStreet + dirPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    selected[i] = bestCandidate;

    // Log when we chose a non-closest candidate for continuity
    if (bestCandidate !== candidates[0]) {
      console.log(
        `[OSRM] Snap ${i}: chose "${bestCandidate.name}" over closer "${candidates[0].name}" (continuity)`
      );
    }
  }

  return selected;
}

// ─── Step 3: Loop detection ──────────────────────────────────────────

/**
 * Remove points that would create small loops.
 * A loop is detected when a later point is very close to an earlier point,
 * meaning the intermediate points form an unnecessary detour.
 */
function removeLoopPoints(points) {
  const keep = new Array(points.length).fill(true);

  for (let i = 0; i < points.length; i++) {
    if (!keep[i]) continue;

    // Look ahead 3-6 points — if any is close to current point, the
    // intermediate points create a loop
    for (let j = i + 3; j < Math.min(i + 7, points.length); j++) {
      if (!keep[j]) continue;

      const loopDist = haversine(points[i].coord, points[j].coord);
      if (loopDist < 60) {
        // Mark intermediate points for removal
        for (let k = i + 1; k < j; k++) {
          keep[k] = false;
        }
        console.log(
          `[OSRM] Loop detected: points ${i + 1}–${j - 1} removed (${loopDist.toFixed(0)}m loop)`
        );
        break;
      }
    }
  }

  return points.filter((_, i) => keep[i]);
}

// ─── Step 5: Routing ─────────────────────────────────────────────────

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
        console.log(`[OSRM] Route ${idx}: ${r.value.coords.length} pts, ${r.value.dist.toFixed(0)}m (ratio: ${ratio.toFixed(1)}x)`);
        if (ratio > 3.0) {
          console.warn(`[OSRM] Route ${idx}: high detour ratio ${ratio.toFixed(1)}x`);
        }
        results[idx] = r.value;
        routeOk++;
      } else {
        const reason = r.status === "rejected" ? r.reason?.message || r.reason : "null response";
        console.warn(`[OSRM] Route ${idx}: FAILED (${reason}) — using straight line`);
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

async function fetchSegment(a, b) {
  const url = `${OSRM_BASE}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?geometries=geojson&overview=full`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) return null;

  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return { coords, dist: route.distance };
}

// ─── Geometry helpers ────────────────────────────────────────────────

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
 * Bearing from point A to point B in degrees [0, 360).
 */
function bearing([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Absolute angular difference between two bearings [0, 180].
 */
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
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
