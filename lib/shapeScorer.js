/*
  Shape scoring — measures how well a candidate route matches a target shape.

  Two complementary metrics:
  1. Turning function distance — compares the cumulative angle profile
  2. Hausdorff-like deviation — measures max/avg distance between curves

  Combined into a single score: 0.0 = perfect match, 1.0 = no resemblance.
*/

import { haversine } from "./graph.js";

/**
 * Score how well a candidate route matches a target shape.
 *
 * @param {[number,number][]} candidateCoords - actual route [lat,lng] points
 * @param {[number,number][]} targetCoords - ideal shape [lat,lng] points
 * @returns {number} score 0.0 (perfect) to 1.0 (no match)
 */
export function scoreShape(candidateCoords, targetCoords) {
  if (candidateCoords.length < 3 || targetCoords.length < 3) return 1.0;

  const turnScore = turningFunctionDistance(candidateCoords, targetCoords);
  const devScore = normalizedDeviation(candidateCoords, targetCoords);

  // Weighted combination
  return Math.min(1.0, 0.5 * turnScore + 0.5 * devScore);
}

// ─── Turning function distance ───────────────────────────────────────

/**
 * Compute turning function distance between two closed curves.
 * The turning function maps arc length → cumulative turning angle.
 * Lower = more similar shape.
 */
function turningFunctionDistance(coords1, coords2) {
  const tf1 = turningFunction(coords1);
  const tf2 = turningFunction(coords2);

  // Resample both to same length
  const n = 64;
  const s1 = resampleTF(tf1, n);
  const s2 = resampleTF(tf2, n);

  // Find best cyclic shift (handles different starting points)
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

  // Normalize: a distance of ~PI means completely different shapes
  return Math.min(1.0, bestDist / Math.PI);
}

/**
 * Compute turning function for a closed polyline.
 * Returns array of { arcLen, angle } pairs.
 */
function turningFunction(coords) {
  const n = coords.length;
  const result = [];
  let cumLen = 0;
  let cumAngle = 0;

  for (let i = 0; i < n - 1; i++) {
    const dx = coords[(i + 1) % n][1] - coords[i][1]; // lng diff
    const dy = coords[(i + 1) % n][0] - coords[i][0]; // lat diff
    const angle = Math.atan2(dy, dx);

    if (i > 0) {
      let delta = angle - prevAngle;
      // Normalize to [-PI, PI]
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      cumAngle += delta;
    }

    var prevAngle = angle;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    result.push({ arcLen: cumLen, angle: cumAngle });
    cumLen += segLen;
  }

  // Normalize arc length to [0, 1]
  if (cumLen > 0) {
    for (const r of result) {
      r.arcLen /= cumLen;
    }
  }

  return result;
}

/**
 * Resample a turning function to n evenly-spaced points.
 */
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

// ─── Deviation scoring ───────────────────────────────────────────────

/**
 * Compute normalized average deviation between candidate and target.
 * For each point on the candidate, find the closest point on the target.
 * Returns 0.0-1.0 where 0 = perfect overlap.
 */
function normalizedDeviation(candidateCoords, targetCoords) {
  // Compute the "size" of the target for normalization
  let targetSize = 0;
  for (let i = 0; i < targetCoords.length - 1; i++) {
    targetSize += haversine(targetCoords[i], targetCoords[i + 1]);
  }
  if (targetSize < 10) return 1.0;

  // Sample candidate at ~32 evenly-spaced points
  const sampleCount = 32;
  const step = Math.max(1, Math.floor(candidateCoords.length / sampleCount));
  let totalDev = 0;
  let count = 0;

  for (let i = 0; i < candidateCoords.length; i += step) {
    const cp = candidateCoords[i];
    let minDist = Infinity;

    // Find closest target point (sample target too for speed)
    const tStep = Math.max(1, Math.floor(targetCoords.length / 48));
    for (let j = 0; j < targetCoords.length; j += tStep) {
      const d = haversine(cp, targetCoords[j]);
      if (d < minDist) minDist = d;
    }

    totalDev += minDist;
    count++;
  }

  const avgDev = totalDev / count;
  // Normalize: avgDev of ~targetSize/4 means very distorted
  return Math.min(1.0, avgDev / (targetSize / 8));
}
