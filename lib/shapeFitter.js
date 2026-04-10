/*
  Template fitting — overlay shapes on the road graph and find the best fit.

  For each shape template, tries multiple positions/scales/rotations,
  routes between control points using Dijkstra on the local graph,
  and scores the result.
*/

import { nearestNode, dijkstra, haversine } from "./graph.js";
import { transformOutline, pickControlPoints } from "./shapeLibrary.js";
import { scoreShape } from "./shapeScorer.js";

// Search parameters — designed for large GPS art spanning 20-40+ blocks
const RADII = [800, 1100, 1400, 1700, 2000]; // meters (much bigger for real GPS art scale)
const ROTATIONS = [0, 30, 45, 60, 90]; // degrees
const OFFSET_GRID = 3; // 3x3 grid of center offsets
const OFFSET_FRACTION = 0.2; // offset = radius * this fraction

const MAX_SNAP_DIST = 500; // max distance from ideal point to nearest intersection
const MAX_DETOUR_RATIO = 5.0; // max route dist / straight-line dist per segment

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

  for (const radius of RADII) {
    for (const rotation of ROTATIONS) {
      // Generate offset grid around center
      const offsets = generateOffsets(center, radius * OFFSET_FRACTION, OFFSET_GRID);

      for (const offset of offsets) {
        tried++;
        const result = trySingleFit(graph, template, offset, radius, rotation);

        if (result === null) {
          // Track why it failed (for logging)
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

        candidates.push(result);
      }
    }
  }

  console.log(
    `[Fitter] ${template.key}: tried ${tried}, skipped snap ${skippedSnap}, ` +
    `skipped route ${skippedRoute}, valid ${candidates.length}`
  );

  // Sort by score (lower = better) and return top results
  candidates.sort((a, b) => a.score - b.score);
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
  const snappedNodes = [];
  for (let i = 0; i < controlGps.length; i++) {
    const [lat, lng] = controlGps[i];
    const { nodeId, dist } = nearestNode(graph, lat, lng);

    if (nodeId === null || dist > MAX_SNAP_DIST) {
      return { skipReason: "snap" };
    }

    // Avoid consecutive duplicate nodes
    if (snappedNodes.length > 0 && nodeId === snappedNodes[snappedNodes.length - 1]) {
      continue;
    }
    snappedNodes.push(nodeId);
  }

  if (snappedNodes.length < 3) {
    return { skipReason: "snap" };
  }

  // 4. Route between consecutive snapped nodes using Dijkstra
  const allCoords = [];
  let totalDist = 0;

  for (let i = 0; i < snappedNodes.length; i++) {
    const from = snappedNodes[i];
    const to = snappedNodes[(i + 1) % snappedNodes.length]; // close the loop

    if (from === to) continue;

    const route = dijkstra(graph, from, to);
    if (!route || route.coords.length === 0) {
      return { skipReason: "route" };
    }

    // Check for excessive detour
    const fromNode = graph.nodes.get(from);
    const toNode = graph.nodes.get(to);
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

  // 6. Score the candidate
  const score = scoreShape(allCoords, gpsOutline);

  return {
    shape: template.key,
    name: template.name,
    icon: template.icon,
    score,
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
