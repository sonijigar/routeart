/*
  Template fitting — overlay shapes on the road graph and find the best fit.

  For each shape template, tries multiple positions/scales/rotations,
  routes between control points using direction-weighted Dijkstra,
  and scores the result.

  Key improvements:
  - Grid-aligned rotations: detects road grid angle and searches around it
  - Intermediate waypoints: splits long segments to keep route on-shape
  - Direction-weighted routing: penalizes edges going the wrong direction
*/

import { nearestNode, dijkstra, haversine, bearing } from "./graph.js";
import { transformOutline, pickControlPoints } from "./shapeLibrary.js";
import { computeMetrics, passesQualityGate } from "./shapeScorer.js";

// Search parameters
const RADII = [800, 1100, 1400, 1700, 2000]; // meters
const OFFSET_GRID = 3; // 3x3 grid of center offsets
const OFFSET_FRACTION = 0.2;

const MAX_SNAP_DIST = 200; // tight snap: control points must be close to intersections
const MAX_DETOUR_RATIO = 2.5; // route segments must be fairly direct
const DIRECTION_WEIGHT = 1.5; // how strongly Dijkstra penalizes wrong-direction edges
const MAX_SEGMENT_DIST = 400; // meters — split segments longer than this with intermediate waypoints

/**
 * Build grid-aligned rotation list from detected grid angle.
 * Instead of blind 0/30/45/60/90, search tightly around the actual grid.
 */
function buildRotations(gridAngle) {
  const rotations = new Set();
  // Search around grid-aligned angles (grid repeats every 90°)
  for (const base of [gridAngle, gridAngle + 45, gridAngle + 90]) {
    for (const delta of [-10, -5, 0, 5, 10]) {
      rotations.add(((base + delta) % 360 + 360) % 360);
    }
  }
  return [...rotations];
}

/**
 * Fit a single shape template to the graph.
 * Returns the top candidates sorted by score (best first).
 */
export function fitShape(graph, template, center, maxResults = 3) {
  const candidates = [];
  let tried = 0;
  let skippedSnap = 0;
  let skippedRoute = 0;
  let skippedQuality = 0;

  const rotations = buildRotations(graph.gridAngle || 0);

  for (const radius of RADII) {
    for (const rotation of rotations) {
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

  candidates.sort((a, b) => a.score - b.score);
  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(
      `[Metrics] ${template.key} best: score=${best.metrics.score.toFixed(3)} ` +
      `hausdorff=${best.metrics.hausdorff.toFixed(3)} ` +
      `coverage=${(best.metrics.coverage * 100).toFixed(0)}% ` +
      `revCoverage=${(best.metrics.reverseCoverage * 100).toFixed(0)}% ` +
      `turn=${best.metrics.turnScore.toFixed(3)} ` +
      `r=${best.config.radius}m rot=${best.config.rotation.toFixed(0)}°`
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
  const snappedPairs = []; // [{nodeId, gps: [lat, lng]}]
  for (let i = 0; i < controlGps.length; i++) {
    const [lat, lng] = controlGps[i];
    const { nodeId, dist } = nearestNode(graph, lat, lng);

    if (nodeId === null || dist > MAX_SNAP_DIST) {
      return { skipReason: "snap" };
    }

    if (snappedPairs.length > 0 && nodeId === snappedPairs[snappedPairs.length - 1].nodeId) {
      continue;
    }
    snappedPairs.push({ nodeId, gps: [lat, lng] });
  }

  if (snappedPairs.length < 3) {
    return { skipReason: "snap" };
  }

  // 4. Route between consecutive snapped nodes
  //    Split long segments with intermediate waypoints to keep route on-shape
  const allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < snappedPairs.length; i++) {
    const fromPair = snappedPairs[i];
    const toPair = snappedPairs[(i + 1) % snappedPairs.length];

    if (fromPair.nodeId === toPair.nodeId) continue;

    const segResult = routeSegmentWithWaypoints(graph, fromPair, toPair);
    if (!segResult) {
      return { skipReason: "route" };
    }

    if (allCoords.length === 0) {
      allCoords.push(...segResult.coords);
    } else {
      allCoords.push(...segResult.coords.slice(1));
    }
    totalDist += segResult.distance;
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
 * Route between two snapped pairs, adding intermediate waypoints on long segments.
 * This prevents Dijkstra from taking shortcuts when control points are far apart.
 */
function routeSegmentWithWaypoints(graph, fromPair, toPair) {
  const straight = haversine(fromPair.gps, toPair.gps);

  // Short segment — route directly
  if (straight <= MAX_SEGMENT_DIST) {
    return routeDirected(graph, fromPair, toPair);
  }

  // Long segment — add intermediate waypoints along the ideal line
  const numWaypoints = Math.min(4, Math.floor(straight / MAX_SEGMENT_DIST));
  const waypoints = [fromPair];

  for (let w = 1; w <= numWaypoints; w++) {
    const frac = w / (numWaypoints + 1);
    const midLat = fromPair.gps[0] + frac * (toPair.gps[0] - fromPair.gps[0]);
    const midLng = fromPair.gps[1] + frac * (toPair.gps[1] - fromPair.gps[1]);
    const { nodeId, dist } = nearestNode(graph, midLat, midLng);

    if (nodeId === null || dist > MAX_SNAP_DIST * 1.5) continue;

    const last = waypoints[waypoints.length - 1];
    if (nodeId !== last.nodeId) {
      waypoints.push({ nodeId, gps: [midLat, midLng] });
    }
  }

  waypoints.push(toPair);

  // Route through waypoint chain
  const allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const result = routeDirected(graph, waypoints[i], waypoints[i + 1]);
    if (!result) return null;

    if (allCoords.length === 0) {
      allCoords.push(...result.coords);
    } else {
      allCoords.push(...result.coords.slice(1));
    }
    totalDist += result.distance;
  }

  return { coords: allCoords, distance: totalDist };
}

/**
 * Route between two pairs using direction-weighted Dijkstra.
 */
function routeDirected(graph, fromPair, toPair) {
  if (fromPair.nodeId === toPair.nodeId) return { coords: [], distance: 0 };

  const desiredBearing = bearing(fromPair.gps, toPair.gps);

  const route = dijkstra(graph, fromPair.nodeId, toPair.nodeId, {
    desiredBearing,
    directionWeight: DIRECTION_WEIGHT,
  });

  if (!route || route.coords.length === 0) return null;

  // Check for excessive detour
  const fromNode = graph.nodes.get(fromPair.nodeId);
  const toNode = graph.nodes.get(toPair.nodeId);
  const straight = haversine([fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]);
  if (straight > 10 && route.distance / straight > MAX_DETOUR_RATIO) {
    return null;
  }

  return route;
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
