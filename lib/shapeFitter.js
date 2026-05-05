/*
  Template fitting — overlay shapes on the road graph and find the best fit.

  For each shape template, tries multiple positions/scales/rotations,
  routes between control points using direction-weighted Dijkstra,
  and scores the result.
*/

import { nearestNode, dijkstra, haversine, bearing } from "./graph.js";
import { transformOutline, pickControlPoints } from "./shapeLibrary.js";
import { computeMetrics, passesQualityGate } from "./shapeScorer.js";

// Search parameters — designed for large GPS art spanning 20-40+ blocks
const RADII = [800, 1100, 1400, 1700, 2000]; // meters
const ROTATIONS = [0, 30, 45, 60, 90]; // degrees
const OFFSET_GRID = 3; // 3x3 grid of center offsets
const OFFSET_FRACTION = 0.2; // offset = radius * this fraction

const MAX_SNAP_DIST = 200; // tight snap: control points must be close to intersections
const MAX_DETOUR_RATIO = 2.5; // route segments must be fairly direct
const DIRECTION_WEIGHT = 1.5; // how strongly Dijkstra penalizes wrong-direction edges

/**
 * Fit a single shape template to the graph.
 * Returns the top candidates sorted by score (best first).
 *
 * @param {Graph} graph
 * @param {ShapeTemplate} template
 * @param {[number,number]} center - [lat, lng]
 * @param {number} maxResults
 * @returns {Array<{shape: string, score: number, coords: [number,number][], distance: number, config: object}>}
 */
export function fitShape(graph, template, center, maxResults = 3) {
  const candidates = [];
  let tried = 0;
  let skippedSnap = 0;
  let skippedRoute = 0;
  let skippedQuality = 0;

  for (const radius of RADII) {
    for (const rotation of ROTATIONS) {
      const offsets = generateOffsets(center, radius * OFFSET_FRACTION, OFFSET_GRID);

      for (const offset of offsets) {
        tried++;
        const result = trySingleFit(graph, template, offset, radius, rotation);

        if (result === null) {
          continue;
        }
        if (result.skipReason === "snap") {
          skippedSnap++;
          continue;
        }
        if (result.skipReason === "route") {
          skippedRoute++;
          continue;
        }
        if (result.skipReason === "quality") {
          skippedQuality++;
          continue;
        }

        candidates.push(result);
      }
    }
  }

  console.log(
    `[Fitter] ${template.key}: tried ${tried}, snap ${skippedSnap}, ` +
    `route ${skippedRoute}, quality ${skippedQuality}, valid ${candidates.length}`
  );

  // Log best candidate metrics for progress tracking
  candidates.sort((a, b) => a.score - b.score);
  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(
      `[Metrics] ${template.key} best: score=${best.metrics.score.toFixed(3)} ` +
      `hausdorff=${best.metrics.hausdorff.toFixed(3)} ` +
      `coverage=${(best.metrics.coverage * 100).toFixed(0)}% ` +
      `revCoverage=${(best.metrics.reverseCoverage * 100).toFixed(0)}% ` +
      `turn=${best.metrics.turnScore.toFixed(3)} ` +
      `r=${best.config.radius}m rot=${best.config.rotation}°`
    );
  }

  return candidates.slice(0, maxResults);
}

/**
 * Try fitting a shape at a specific position/scale/rotation.
 */
function trySingleFit(graph, template, center, radius, rotation) {
  // 1. Transform the outline to GPS coordinates
  const gpsOutline = transformOutline(template.outline, center, radius, rotation);

  // 2. Pick control points (evenly spaced along the outline)
  const controlGps = pickControlPoints(gpsOutline, template.controlCount);

  // 3. Snap each control point to the nearest graph node
  //    Track both snapped node and original GPS for direction-aware routing
  const snappedPairs = []; // [{nodeId, gps: [lat, lng]}]
  for (let i = 0; i < controlGps.length; i++) {
    const [lat, lng] = controlGps[i];
    const { nodeId, dist } = nearestNode(graph, lat, lng);

    if (nodeId === null || dist > MAX_SNAP_DIST) {
      return { skipReason: "snap" };
    }

    // Avoid consecutive duplicate nodes
    if (snappedPairs.length > 0 && nodeId === snappedPairs[snappedPairs.length - 1].nodeId) {
      continue;
    }
    snappedPairs.push({ nodeId, gps: [lat, lng] });
  }

  if (snappedPairs.length < 3) {
    return { skipReason: "snap" };
  }

  // 4. Route between consecutive snapped nodes using direction-weighted Dijkstra
  const allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < snappedPairs.length; i++) {
    const fromPair = snappedPairs[i];
    const toPair = snappedPairs[(i + 1) % snappedPairs.length]; // close the loop

    if (fromPair.nodeId === toPair.nodeId) continue;

    // Compute desired bearing from the ideal shape control points
    const desiredBearing = bearing(fromPair.gps, toPair.gps);

    const route = dijkstra(graph, fromPair.nodeId, toPair.nodeId, {
      desiredBearing,
      directionWeight: DIRECTION_WEIGHT,
    });
    if (!route || route.coords.length === 0) {
      return { skipReason: "route" };
    }

    // Check for excessive detour
    const fromNode = graph.nodes.get(fromPair.nodeId);
    const toNode = graph.nodes.get(toPair.nodeId);
    const straight = haversine([fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]);
    if (straight > 10 && route.distance / straight > MAX_DETOUR_RATIO) {
      return { skipReason: "route" };
    }

    // Stitch coords
    if (allCoords.length === 0) {
      allCoords.push(...route.coords);
    } else {
      allCoords.push(...route.coords.slice(1));
    }
    totalDist += route.distance;
  }

  // 5. Validate total distance
  if (totalDist < template.distRange[0] || totalDist > template.distRange[1]) {
    return { skipReason: "route" };
  }

  // 6. Compute quality metrics and apply reject gate
  const metrics = computeMetrics(allCoords, gpsOutline, radius);

  if (!passesQualityGate(metrics)) {
    return { skipReason: "quality" };
  }

  return {
    shape: template.key,
    name: template.name,
    icon: template.icon,
    score: metrics.score,
    metrics,
    coords: allCoords,
    distance: totalDist,
    config: { center, radius, rotation },
  };
}

/**
 * Generate a grid of offset centers around a point.
 */
function generateOffsets(center, offsetMeters, gridSize) {
  if (gridSize <= 1) return [center];

  const offsets = [];
  const latOff = offsetMeters / 111000;
  const lngOff = offsetMeters / (111000 * Math.cos((center[0] * Math.PI) / 180));

  const half = Math.floor(gridSize / 2);
  for (let r = -half; r <= half; r++) {
    for (let c = -half; c <= half; c++) {
      offsets.push([
        center[0] + r * latOff,
        center[1] + c * lngOff,
      ]);
    }
  }

  return offsets;
}
