/*
  Shape scoring — measures how well a candidate route matches a target shape.

  Metrics:
  1. Turning function distance — compares cumulative angle profiles
  2. Hausdorff distance — max deviation from route to target (normalized)
  3. Coverage — % of target outline covered by the route
  4. Reverse coverage — % of route that stays near the target outline

  Combined into a single score: 0.0 = perfect match, 1.0 = no resemblance.
  Also exports individual metrics for quality tracking.
*/

import { haversine, bearing } from "./graph.js";

const COVERAGE_THRESHOLD = 150; // meters — a target point is "covered" if route passes within this

/**
 * Compute all quality metrics for a candidate route vs target shape.
 *
 * @param {[number,number][]} candidateCoords - actual route [lat,lng] points
 * @param {[number,number][]} targetCoords - ideal shape [lat,lng] points
 * @param {number} radius - fitting radius in meters (for normalization)
 * @returns {{score: number, hausdorff: number, coverage: number, reverseCoverage: number, turnScore: number}}
 */
export function computeMetrics(candidateCoords, targetCoords, radius) {
  if (candidateCoords.length < 3 || targetCoords.length < 3) {
    return { score: 1.0, hausdorff: 1.0, coverage: 0, reverseCoverage: 0, turnScore: 1.0 };
  }

  const turnScore = turningFunctionDistance(candidateCoords, targetCoords);
  const { hausdorff, avgDev } = hausdorffMetrics(candidateCoords, targetCoords, radius);
  const coverage = computeCoverage(candidateCoords, targetCoords);
  const reverseCoverage = computeCoverage(targetCoords, candidateCoords);

  // Weighted score: coverage-heavy (what matters most for visual recognition)
  const score = Math.min(1.0,
    0.15 * turnScore +
    0.25 * hausdorff +
    0.30 * (1 - coverage) +
    0.30 * (1 - reverseCoverage)
  );

  return { score, hausdorff, coverage, reverseCoverage, turnScore };
}

/**
 * Score how well a candidate route matches a target shape.
 * Backward-compatible single-score API.
 */
export function scoreShape(candidateCoords, targetCoords, radius = 0) {
  const metrics = computeMetrics(candidateCoords, targetCoords, radius);
  return metrics.score;
}

// ─── Quality gate ───────────────────────────────────────────────────

const SCORE_REJECT = 0.50; // reject candidates scoring worse than this
const COVERAGE_REJECT = 0.40; // reject if less than 40% of target is covered

/**
 * Check if a candidate passes the quality gate.
 */
export function passesQualityGate(metrics) {
  if (metrics.score > SCORE_REJECT) return false;
  if (metrics.coverage < COVERAGE_REJECT) return false;
  return true;
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

/**
 * Compute normalized Hausdorff distance and average deviation.
 * Hausdorff = max distance from any route point to its nearest target point.
 */
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

  // Normalize by radius (or a reasonable default)
  const norm = radius > 0 ? radius : 1000;
  return {
    hausdorff: Math.min(1.0, maxDev / norm),
    avgDev: count > 0 ? totalDev / count : Infinity,
  };
}

// ─── Coverage metrics ───────────────────────────────────────────────

/**
 * Compute what fraction of sourceCoords has a point in referenceCoords within threshold.
 * Used bidirectionally:
 *   coverage = computeCoverage(route, target)       — does route cover the target shape?
 *   reverseCoverage = computeCoverage(target, route) — does route stay on the target shape?
 */
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
