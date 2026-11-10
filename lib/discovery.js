/*
  Shape discovery orchestrator.

  Given a start point, an activity and a target distance: loads the road graph
  around the start, fits every shape near it, and returns ranked candidates.
  Each loop begins at its point nearest the start, with a routed lead-in from the
  start to that point.
*/

import { loadRoadData } from "./roadData.js";
import { fetchRoadNetwork, loadCachedNetwork } from "./overpass.js";
import { buildGraph, nearestNode, dijkstra, haversine } from "./graph.js";
import { SHAPE_LIBRARY } from "./shapeLibrary.js";
import { fitShape } from "./shapeFitter.js";
import { SCORE_GATE } from "./shapeScorer.js";
import { bundleFor, FETCH_RADIUS_KM, LOCATIONS } from "./locations.js";

// Recently built graphs, so switching activity or neighborhood back and forth is instant
const GRAPH_CACHE_SIZE = 4;
const graphCache = new Map(); // key → graph, oldest first

// Minutes per mile, for time estimates
const PACE = { walk: 20, run: 10, ride: 5 };

/**
 * Discover the best shape routes around a start point.
 *
 * @param {[number, number]} start - [lat, lng] where the user starts
 * @param {object} options
 * @param {"run"|"walk"|"ride"} options.activity - which roads are usable (default "run")
 * @param {number} options.targetDistance - desired loop length in meters (optional)
 * @param {number} options.maxResults - max candidates to return (default 7)
 * @param {function} options.onProgress - callback for UI updates
 * @returns {Promise<Array<{shape, name, icon, score, coords, distance, distanceError, leadIn, config}>>}
 */
export async function discoverShapes(start, options = {}) {
  const { activity = "run", targetDistance = null, maxResults = 7, onProgress = () => {} } = options;
  const startTime = performance.now();

  // Step 1: Road data + graph — the bundled neighborhood covering the start, else Overpass
  const bundle = bundleFor(start);
  const graphKey = `${bundle ?? `${start[0].toFixed(3)},${start[1].toFixed(3)}`},${activity}`;
  console.log(`[Discovery] Starting at [${start}] — roads: ${bundle ?? "Overpass"} (${activity})`);

  let graph = graphCache.get(graphKey);
  if (graph) {
    graphCache.delete(graphKey); // re-insert below as most recent
  } else {
    onProgress("fetching");
    const osmData = await loadRoads(bundle, start);
    onProgress("building");
    graph = buildGraph(osmData, { activity });
  }
  graphCache.set(graphKey, graph);
  if (graphCache.size > GRAPH_CACHE_SIZE) graphCache.delete(graphCache.keys().next().value);

  // Step 2: Fit every shape around the start
  onProgress("fitting");
  await new Promise((r) => setTimeout(r, 0)); // let the progress label paint before the busy loop
  const results = [];
  for (const template of SHAPE_LIBRARY) {
    const [best] = fitShape(graph, template, start, 1, { targetDistance });
    if (best) results.push(beginNearStart(graph, best, start));
  }
  results.sort((a, b) => a.rank - b.rank);
  const shown = results.slice(0, maxResults);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`[Discovery] Done in ${elapsed}s — ${results.length} shapes found, returning ${shown.length}`);
  for (const r of shown) {
    const m = r.metrics;
    console.log(
      `  ${r.icon} ${r.name}: score=${r.score.toFixed(3)} iou=${m.iou.toFixed(2)} gap=${m.outlineGap90.toFixed(2)} ` +
      `dbl=${m.doubledBack.toFixed(2)} ${formatDist(r.distance)}` +
      (r.distanceError != null ? ` (${r.distanceError >= 0 ? "+" : ""}${Math.round(r.distanceError * 100)}% vs target)` : "") +
      ` lead-in ${Math.round(r.leadIn.distance)}m`
    );
  }
  console.log(`[Discovery] ─── Pass: score <= ${SCORE_GATE} (lower is better) ───`);

  onProgress("done");
  return shown;
}

/**
 * Rotate a closed loop so it begins at its point nearest the start,
 * and route a lead-in from the start to that point.
 */
function beginNearStart(graph, candidate, start) {
  const loop = candidate.coords;
  let nearest = 0, nearestDist = Infinity;
  for (let i = 0; i < loop.length - 1; i++) {
    const d = haversine(start, loop[i]);
    if (d < nearestDist) [nearest, nearestDist] = [i, d];
  }
  const coords = [...loop.slice(nearest, -1), ...loop.slice(0, nearest), loop[nearest]];

  let leadIn = { coords: [], distance: 0 };
  const from = nearestNode(graph, start[0], start[1]).nodeId;
  const to = nearestNode(graph, coords[0][0], coords[0][1]).nodeId;
  if (from !== null && to !== null && from !== to) {
    const path = dijkstra(graph, from, to);
    if (path) leadIn = { coords: [start, ...path.coords, coords[0]], distance: path.distance };
  }
  return { ...candidate, coords, leadIn };
}

/**
 * Bundled road data when a neighborhood covers the start; otherwise the Overpass API.
 */
async function loadRoads(bundle, start) {
  if (bundle) {
    try {
      const data = await loadRoadData(bundle);
      if (data) return data;
    } catch (err) {
      console.warn(`[Discovery] Bundled road data for ${bundle} unavailable, using Overpass`, err);
    }
  }
  const cached = loadCachedNetwork(start, FETCH_RADIUS_KM);
  if (cached) return cached;
  try {
    return await fetchRoadNetwork(start, FETCH_RADIUS_KM);
  } catch (err) {
    const areas = Object.values(LOCATIONS).map((l) => l.name);
    throw new Error(
      `Couldn't load map data for this spot right now (the public map servers are busy). ` +
        `Try again in a minute, or start in ${areas.slice(0, -1).join(", ")} or ${areas[areas.length - 1]}.`,
      { cause: err }
    );
  }
}

/**
 * Format distance in miles.
 */
export function formatDist(meters) {
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

/**
 * Format estimated time for an activity.
 */
export function formatTime(meters, activity = "walk") {
  const mins = Math.round((meters / 1609.34) * (PACE[activity] ?? PACE.walk));
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h ${m}m`;
}
