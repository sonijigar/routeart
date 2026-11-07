/*
  Template fitting — lay pixel-art shapes on the road graph and find the best fit.

  Each template's cells are laid square to the street grid at a few cell sizes and
  half-cell offsets. The outline's corners snap to nearby intersections, and each
  side is routed along the streets closest to its ideal line (corridor routing).
  Out-and-back spurs are trimmed and the loop is scored.
*/

import { nearestNode, dijkstra, haversine } from "./graph.js";
import { transformOutline } from "./shapeLibrary.js";
import { computeMetrics, passesQualityGate } from "./shapeScorer.js";

// Search parameters
const CELL_SIZES = [110, 140, 170, 200, 240]; // meters per pixel cell, when no target distance is given
const ROUTE_STRETCH = 1.12; // real routes run ~12% longer than the ideal outline (median on Seattle streets)
const CELL_FACTORS = [0.88, 0.96, 1.04, 1.12]; // cell sizes tried around the one that hits the target distance
const MIN_CELL = 80; // meters — smaller cells than a city block don't draw anything
const MAX_CELL = 400;
const MAX_DISTANCE_ERROR = 0.3; // reject routes more than 30% off the target distance
const DISTANCE_SLACK = 0.1; // within 10% of the target is free; beyond, rank = score + 2 × excess
const OFFSET_STEPS = 4; // shift the shape -4..4 half-cells along each grid axis
const SNAP_FRACTION = 0.6; // a corner may snap at most this fraction of a cell away
const MIN_DISTANCE = 2000; // meters — sanity range for a whole route
const MAX_DISTANCE = 30000;

const MAX_SNAP_DIST = 200; // meters — hard cap on corner snapping
const CORRIDOR_FRACTION = 0.5; // a street half a cell off the ideal line costs 2x, a full cell 5x

/**
 * Rotation that lays the template's cells along the street grid.
 * gridAngle is a compass bearing in [0, 90); rotation is counter-clockwise.
 */
function gridRotation(gridAngle = 0) {
  const tilt = gridAngle > 45 ? gridAngle - 90 : gridAngle;
  return -tilt;
}

/**
 * Cell sizes to try: around the size that makes the route about targetDistance long,
 * or the default sizes when there is no target.
 */
function cellSizesFor(template, targetDistance) {
  if (!targetDistance) return CELL_SIZES;
  const ideal = targetDistance / (template.perimeter * ROUTE_STRETCH);
  const sizes = CELL_FACTORS.map((f) => Math.round(Math.min(MAX_CELL, Math.max(MIN_CELL, ideal * f))));
  return [...new Set(sizes)];
}

/**
 * Fit a single shape template to the graph.
 * Returns the top candidates, best first: by score, and with a target distance also by
 * how close the route comes to it.
 *
 * @param {object} options
 * @param {boolean} options.applyGate - drop candidates that fail the quality gate (default true)
 * @param {number} options.targetDistance - desired route length in meters (optional)
 */
export function fitShape(graph, template, center, maxResults = 3, { applyGate = true, targetDistance = null } = {}) {
  const candidates = [];
  let tried = 0;
  let skippedSnap = 0;
  let skippedRoute = 0;
  let skippedQuality = 0;
  let skippedDistance = 0;

  const rotation = gridRotation(graph.gridAngle);

  for (const cell of cellSizesFor(template, targetDistance)) {
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

      result.rank = result.score;
      if (targetDistance) {
        result.distanceError = result.distance / targetDistance - 1;
        const off = Math.abs(result.distanceError);
        if (off > MAX_DISTANCE_ERROR) {
          skippedDistance++;
          continue;
        }
        result.rank += 2 * Math.max(0, off - DISTANCE_SLACK);
      }
      candidates.push(result);
    }
  }

  console.log(
    `[Fitter] ${template.key}: tried ${tried}, snap ${skippedSnap}, ` +
    `route ${skippedRoute}, quality ${skippedQuality}, distance ${skippedDistance}, valid ${candidates.length}`
  );

  candidates.sort((a, b) => a.rank - b.rank);
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

  // 3. Route each side along the streets closest to its ideal line
  const corridorWidth = CORRIDOR_FRACTION * cell;
  let loop = [];
  for (let i = 0; i < snappedPairs.length; i++) {
    const from = snappedPairs[i];
    const to = snappedPairs[(i + 1) % snappedPairs.length];
    if (from.nodeId === to.nodeId) continue;

    const route = dijkstra(graph, from.nodeId, to.nodeId, {
      corridor: { from: from.gps, to: to.gps, width: corridorWidth },
    });
    if (!route) {
      return { skipReason: "route" };
    }
    loop.push(...(loop.length ? route.coords.slice(1) : route.coords));
  }

  // 4. Trim out-and-back spurs (e.g. to a corner that snapped onto a side street)
  loop = removeSpurs(loop);
  const totalDist = pathLength(loop);
  if (totalDist < MIN_DISTANCE || totalDist > MAX_DISTANCE) {
    return { skipReason: "route" };
  }

  // 5. Score against the ideal outline and apply the reject gate
  const metrics = computeMetrics(loop, gpsOutline, radius);

  if (applyGate && !passesQualityGate(metrics)) {
    return { skipReason: "quality" };
  }

  return {
    shape: template.key,
    name: template.name,
    icon: template.icon,
    score: metrics.score,
    metrics,
    coords: loop,
    distance: totalDist,
    config: { center, radius, rotation, cell },
  };
}

/**
 * Remove out-and-back spurs from a closed loop: wherever the path immediately
 * retraces itself (… a b a …), drop the excursion. Works for spurs of any length
 * and for one that straddles the loop's start/end.
 */
export function removeSpurs(loop) {
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  const out = [];
  for (const p of loop) {
    if (out.length >= 2 && same(out[out.length - 2], p)) {
      out.pop(); // p is back where we were before the last point: undo the excursion
    } else if (!(out.length && same(out[out.length - 1], p))) {
      out.push(p);
    }
  }
  // A spur across the seam: the loop leaves its start point and returns the same way
  while (out.length >= 4 && same(out[0], out[out.length - 1]) && same(out[1], out[out.length - 2])) {
    out.shift();
    out.pop();
  }
  return out;
}

function pathLength(coords) {
  let d = 0;
  for (let i = 0; i < coords.length - 1; i++) d += haversine(coords[i], coords[i + 1]);
  return d;
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
