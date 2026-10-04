/*
  Template fitting — lay pixel-art shapes on the road graph and find the best fit.

  Each template's cells are laid square to the street grid at a few cell sizes and
  half-cell offsets. The outline's corners snap to nearby intersections and are
  joined with direction-weighted Dijkstra; the routed loop is then scored.
*/

import { nearestNode, dijkstra, haversine, bearing } from "./graph.js";
import { transformOutline } from "./shapeLibrary.js";
import { computeMetrics, passesQualityGate } from "./shapeScorer.js";

// Search parameters
const CELL_SIZES = [110, 140, 170, 200, 240]; // meters per pixel cell
const OFFSET_STEPS = 4; // shift the shape -4..4 half-cells along each grid axis
const SNAP_FRACTION = 0.6; // a corner may snap at most this fraction of a cell away
const MIN_DISTANCE = 2000; // meters — sanity range for a whole route
const MAX_DISTANCE = 30000;

const MAX_SNAP_DIST = 200; // meters — hard cap on corner and waypoint snapping
const MAX_DETOUR_RATIO = 2.5; // route segments must be fairly direct
const DIRECTION_WEIGHT = 1.5; // how strongly Dijkstra penalizes wrong-direction edges
const MAX_SEGMENT_DIST = 400; // meters — split segments longer than this with intermediate waypoints

/**
 * Rotation that lays the template's cells along the street grid.
 * gridAngle is a compass bearing in [0, 90); rotation is counter-clockwise.
 */
function gridRotation(gridAngle = 0) {
  const tilt = gridAngle > 45 ? gridAngle - 90 : gridAngle;
  return -tilt;
}

/**
 * Fit a single shape template to the graph.
 * Returns the top candidates sorted by score (best first).
 */
export function fitShape(graph, template, center, maxResults = 3, { applyGate = true } = {}) {
  const candidates = [];
  let tried = 0;
  let skippedSnap = 0;
  let skippedRoute = 0;
  let skippedQuality = 0;

  const rotation = gridRotation(graph.gridAngle);

  for (const cell of CELL_SIZES) {
    for (const offset of generateOffsets(center, cell / 2, OFFSET_STEPS, rotation)) {
      tried++;
      const result = trySingleFit(graph, template, offset, cell, rotation, applyGate);

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

  console.log(
    `[Fitter] ${template.key}: tried ${tried}, snap ${skippedSnap}, ` +
    `route ${skippedRoute}, quality ${skippedQuality}, valid ${candidates.length}`
  );

  candidates.sort((a, b) => a.score - b.score);
  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(
      `[Metrics] ${template.key} best: score=${best.metrics.score.toFixed(3)} ` +
      `iou=${best.metrics.iou.toFixed(2)} gap=${best.metrics.outlineGap90.toFixed(2)} ` +
      `dbl=${best.metrics.doubledBack.toFixed(2)} ` +
      `cell=${best.config.cell}m rot=${best.config.rotation.toFixed(0)}°`
    );
  }

  return candidates.slice(0, maxResults);
}

/**
 * Try fitting a shape at a specific position and cell size.
 */
function trySingleFit(graph, template, center, cell, rotation, applyGate) {
  // 1. Lay the outline on the map: the bitmap's longer side spans template.cells cells
  const radius = (cell * template.cells) / 2;
  const gpsOutline = transformOutline(template.outline, center, radius, rotation);

  // 2. Snap every corner to the nearest intersection
  const maxSnap = Math.min(MAX_SNAP_DIST, SNAP_FRACTION * cell);
  const snappedPairs = []; // [{nodeId, gps: [lat, lng]}]
  for (const [lat, lng] of gpsOutline.slice(0, -1)) {
    const { nodeId, dist } = nearestNode(graph, lat, lng);

    if (nodeId === null || dist > maxSnap) {
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

  // 3. Route corner to corner
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

  // 4. Validate total distance
  if (totalDist < MIN_DISTANCE || totalDist > MAX_DISTANCE) {
    return { skipReason: "route" };
  }

  // 5. Score against the ideal outline and apply the reject gate
  const metrics = computeMetrics(allCoords, gpsOutline, radius);

  if (applyGate && !passesQualityGate(metrics)) {
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
    config: { center, radius, rotation, cell },
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
 * Centers shifted by -steps..steps × stepMeters along the two grid axes.
 */
function generateOffsets(center, stepMeters, steps, rotationDeg) {
  const rot = (rotationDeg * Math.PI) / 180;
  const latPerM = 1 / 111000;
  const lngPerM = 1 / (111000 * Math.cos((center[0] * Math.PI) / 180));

  const offsets = [];
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const dx = i * stepMeters, dy = j * stepMeters;
      const ex = dx * Math.cos(rot) - dy * Math.sin(rot);
      const ny = dx * Math.sin(rot) + dy * Math.cos(rot);
      offsets.push([center[0] + ny * latPerM, center[1] + ex * lngPerM]);
    }
  }
  return offsets;
}
