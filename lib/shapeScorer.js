/*
  Shape scoring — measures how well a candidate route matches a target shape.

  Metrics:
  1. Hausdorff distance — max deviation from route to target (normalized)
  2. Coverage — % of target outline covered by the route
  3. Reverse coverage — % of route that stays near the target outline
  4. Turning function distance — compares cumulative angle profiles
  5. Direction fidelity — % of route segments going the right direction
  6. Self-intersections — number of times route crosses itself

  Combined into a single score: 0.0 = perfect match, 1.0 = no resemblance.
*/

import { haversine, bearing } from "./graph.js";

const COVERAGE_THRESHOLD = 150; // meters

/**
 * Compute all quality metrics for a candidate route vs target shape.
 *
 * @param {[number,number][]} candidateCoords - actual route [lat,lng] points
 * @param {[number,number][]} targetCoords - ideal shape [lat,lng] points
 * @param {number} radius - fitting radius in meters (for normalization)
 * @param {Array<{from: [number,number], to: [number,number]}>} segments - optional segment pairs for direction checking
 * @returns {object} metrics
 */
export function computeMetrics(candidateCoords, targetCoords, radius, segments) {
  if (candidateCoords.length < 3 || targetCoords.length < 3) {
    return { score: 1.0, hausdorff: 1.0, coverage: 0, reverseCoverage: 0, turnScore: 1.0, directionFidelity: 0, selfIntersections: 0 };
  }

  const turnScore = turningFunctionDistance(candidateCoords, targetCoords);
  const { hausdorff } = hausdorffMetrics(candidateCoords, targetCoords, radius);
  const coverage = computeCoverage(candidateCoords, targetCoords);
  const reverseCoverage = computeCoverage(targetCoords, candidateCoords);
  const directionFidelity = segments ? computeDirectionFidelity(candidateCoords, segments) : 1.0;
  const selfIntersections = countSelfIntersections(candidateCoords);

  // Intersection penalty: each crossing adds to the score
  const crossPenalty = Math.min(0.3, selfIntersections * 0.05);

  const score = Math.min(1.0,
    0.10 * turnScore +
    0.20 * hausdorff +
    0.25 * (1 - coverage) +
    0.25 * (1 - reverseCoverage) +
    0.20 * (1 - directionFidelity) +
    crossPenalty
  );

  return { score, hausdorff, coverage, reverseCoverage, turnScore, directionFidelity, selfIntersections };
}

/**
 * Backward-compatible single-score API.
 */
export function scoreShape(candidateCoords, targetCoords, radius = 0) {
  return computeMetrics(candidateCoords, targetCoords, radius).score;
}

// ─── Quality gate ───────────────────────────────────────────────────

const SCORE_REJECT = 0.50;
const COVERAGE_REJECT = 0.40;
const DIRECTION_REJECT = 0.35; // reject if <35% of segments go the right direction
const MAX_SELF_INTERSECTIONS = 8;

export function passesQualityGate(metrics) {
  if (metrics.score > SCORE_REJECT) return false;
  if (metrics.coverage < COVERAGE_REJECT) return false;
  if (metrics.directionFidelity < DIRECTION_REJECT) return false;
  if (metrics.selfIntersections > MAX_SELF_INTERSECTIONS) return false;
  return true;
}

// ─── Direction fidelity ─────────────────────────────────────────────

/**
 * Measure what fraction of route segments go in the expected direction.
 *
 * For each segment (defined by from/to GPS pairs from control points),
 * check if the actual routed path between them progresses in the expected
 * bearing (within ±60°).
 */
function computeDirectionFidelity(candidateCoords, segments) {
  if (!segments || segments.length === 0) return 1.0;

  let correct = 0;
  let total = 0;

  for (const seg of segments) {
    const expectedBear = bearing(seg.from, seg.to);
    const { startIdx, endIdx } = findClosestIndices(candidateCoords, seg.from, seg.to);

    if (startIdx === -1 || endIdx === -1 || startIdx === endIdx) continue;

    // Sample a few points along this segment of the route
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const sampleStep = Math.max(1, Math.floor((hi - lo) / 5));

    let segCorrect = 0;
    let segTotal = 0;

    for (let i = lo; i < hi; i += sampleStep) {
      const next = Math.min(i + sampleStep, hi);
      if (next >= candidateCoords.length) break;

      const actualBear = bearing(candidateCoords[i], candidateCoords[next]);
      let diff = Math.abs(actualBear - expectedBear);
      if (diff > 180) diff = 360 - diff;

      segTotal++;
      if (diff <= 60) segCorrect++;
    }

    total += segTotal;
    correct += segCorrect;
  }

  return total > 0 ? correct / total : 1.0;
}

/**
 * Find the indices in coords closest to two GPS points.
 */
function findClosestIndices(coords, from, to) {
  let bestFromIdx = -1, bestFromDist = Infinity;
  let bestToIdx = -1, bestToDist = Infinity;
  const step = Math.max(1, Math.floor(coords.length / 100));

  for (let i = 0; i < coords.length; i += step) {
    const dFrom = quickDist(coords[i], from);
    const dTo = quickDist(coords[i], to);
    if (dFrom < bestFromDist) { bestFromDist = dFrom; bestFromIdx = i; }
    if (dTo < bestToDist) { bestToDist = dTo; bestToIdx = i; }
  }

  return { startIdx: bestFromIdx, endIdx: bestToIdx };
}

function quickDist([lat1, lng1], [lat2, lng2]) {
  const dlat = lat1 - lat2;
  const dlng = (lng1 - lng2) * Math.cos(lat1 * Math.PI / 180);
  return dlat * dlat + dlng * dlng;
}

// ─── Self-intersection detection ────────────────────────────────────

/**
 * Count how many times the route crosses itself.
 * Samples the route into ~200 segments and checks pairwise.
 * Skips adjacent segments (they share a point, not a real crossing).
 */
function countSelfIntersections(coords) {
  // Downsample for performance
  const step = Math.max(1, Math.floor(coords.length / 200));
  const sampled = [];
  for (let i = 0; i < coords.length; i += step) {
    sampled.push(coords[i]);
  }

  let crossings = 0;
  for (let i = 0; i < sampled.length - 1; i++) {
    // Only check segments that are at least 3 apart (skip adjacent)
    for (let j = i + 3; j < sampled.length - 1; j++) {
      if (segmentsIntersect(
        sampled[i], sampled[i + 1],
        sampled[j], sampled[j + 1]
      )) {
        crossings++;
      }
    }
    // Early exit — if there are many crossings, no need to count all
    if (crossings > 15) return crossings;
  }

  return crossings;
}

function segmentsIntersect([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// ─── Turning function distance ───────────────────────────────────────

function turningFunctionDistance(coords1, coords2) {
  const tf1 = turningFunction(coords1);
  const tf2 = turningFunction(coords2);

  const n = 64;
  const s1 = resampleTF(tf1, n);
  const s2 = resampleTF(tf2, n);

  let bestDist = Infinity;
  for (let shift = 0; shift < n; shift++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const diff = s1[i] - s2[(i + shift) % n];
      sumSq += diff * diff;
    }
    const dist = Math.sqrt(sumSq / n);
    if (dist < bestDist) bestDist = dist;
  }

  return Math.min(1.0, bestDist / Math.PI);
}

function turningFunction(coords) {
  const n = coords.length;
  const result = [];
  let cumLen = 0;
  let cumAngle = 0;
  let prevAngle = 0;

  for (let i = 0; i < n - 1; i++) {
    const dx = coords[(i + 1) % n][1] - coords[i][1];
    const dy = coords[(i + 1) % n][0] - coords[i][0];
    const angle = Math.atan2(dy, dx);

    if (i > 0) {
      let delta = angle - prevAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      cumAngle += delta;
    }

    prevAngle = angle;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    result.push({ arcLen: cumLen, angle: cumAngle });
    cumLen += segLen;
  }

  if (cumLen > 0) {
    for (const r of result) {
      r.arcLen /= cumLen;
    }
  }

  return result;
}

function resampleTF(tf, n) {
  if (tf.length === 0) return new Array(n).fill(0);

  const result = new Array(n);
  let j = 0;

  for (let i = 0; i < n; i++) {
    const target = i / n;
    while (j < tf.length - 1 && tf[j + 1].arcLen <= target) j++;

    if (j >= tf.length - 1) {
      result[i] = tf[tf.length - 1].angle;
    } else {
      const t =
        tf[j + 1].arcLen === tf[j].arcLen
          ? 0
          : (target - tf[j].arcLen) / (tf[j + 1].arcLen - tf[j].arcLen);
      result[i] = tf[j].angle + t * (tf[j + 1].angle - tf[j].angle);
    }
  }

  return result;
}

// ─── Hausdorff metrics ──────────────────────────────────────────────

function hausdorffMetrics(candidateCoords, targetCoords, radius) {
  const sampleCount = 48;
  const cStep = Math.max(1, Math.floor(candidateCoords.length / sampleCount));
  const tStep = Math.max(1, Math.floor(targetCoords.length / 64));

  let maxDev = 0;
  let totalDev = 0;
  let count = 0;

  for (let i = 0; i < candidateCoords.length; i += cStep) {
    const cp = candidateCoords[i];
    let minDist = Infinity;

    for (let j = 0; j < targetCoords.length; j += tStep) {
      const d = haversine(cp, targetCoords[j]);
      if (d < minDist) minDist = d;
    }

    if (minDist > maxDev) maxDev = minDist;
    totalDev += minDist;
    count++;
  }

  const norm = radius > 0 ? radius : 1000;
  return {
    hausdorff: Math.min(1.0, maxDev / norm),
    avgDev: count > 0 ? totalDev / count : Infinity,
  };
}

// ─── Coverage metrics ───────────────────────────────────────────────

function computeCoverage(sourceCoords, referenceCoords) {
  const sampleCount = 48;
  const sStep = Math.max(1, Math.floor(sourceCoords.length / sampleCount));
  const rStep = Math.max(1, Math.floor(referenceCoords.length / 64));

  let covered = 0;
  let total = 0;

  for (let i = 0; i < sourceCoords.length; i += sStep) {
    const sp = sourceCoords[i];
    let minDist = Infinity;

    for (let j = 0; j < referenceCoords.length; j += rStep) {
      const d = haversine(sp, referenceCoords[j]);
      if (d < minDist) minDist = d;
    }

    if (minDist <= COVERAGE_THRESHOLD) covered++;
    total++;
  }

  return total > 0 ? covered / total : 0;
}
