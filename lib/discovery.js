/*
  Shape discovery orchestrator.

  Given a location, loads its road graph, runs template fitting
  for all shapes, and returns ranked candidates.
*/

import { loadRoadData } from "./roadData.js";
import { fetchRoadNetwork, loadCachedNetwork } from "./overpass.js";
import { buildGraph } from "./graph.js";
import { SHAPE_LIBRARY } from "./shapeLibrary.js";
import { fitShape } from "./shapeFitter.js";
import { SCORE_GATE } from "./shapeScorer.js";

// Cache the built graph to avoid rebuilding on each call
let cachedGraph = null;
let cachedGraphKey = null;

/**
 * Discover the best shape routes for a given location.
 *
 * @param {[number, number]} center - [lat, lng]
 * @param {object} options
 * @param {string} options.roadDataKey - location key of bundled road data (public/roads/<key>.json.gz)
 * @param {number} options.radiusKm - area to fetch from Overpass when there is no bundle (default 2.5)
 * @param {"run"|"walk"|"ride"} options.activity - which roads are usable (default "run")
 * @param {number} options.maxResults - max candidates to return (default 7)
 * @param {function} options.onProgress - callback for UI updates
 * @returns {Promise<Array<{shape, name, icon, score, coords, distance, config}>>}
 */
export async function discoverShapes(center, options = {}) {
  const {
    roadDataKey = null,
    radiusKm = 2.5,
    activity = "run",
    maxResults = 7,
    onProgress = () => {},
  } = options;

  const startTime = performance.now();

  // Step 1: Road data + graph (reused across calls for the same place and activity)
  const graphKey = `${roadDataKey ?? `${center[0].toFixed(4)},${center[1].toFixed(4)},${radiusKm}`},${activity}`;
  console.log(`[Discovery] Starting for ${roadDataKey ?? `[${center}]`} (${activity})`);

  let graph;
  if (cachedGraphKey === graphKey && cachedGraph) {
    console.log(`[Discovery] Reusing cached graph`);
    graph = cachedGraph;
  } else {
    onProgress("fetching");
    const osmData = await loadRoads(roadDataKey, center, radiusKm);
    onProgress("building");
    graph = buildGraph(osmData, { activity });
    cachedGraph = graph;
    cachedGraphKey = graphKey;
  }

  console.log(
    `[Discovery] Graph ready: ${graph.nodes.size} intersections, ${graph.edges.length} road segments`
  );

  // Step 3: Fit all shapes
  onProgress("fitting");
  const bestPerShape = new Map(); // shape key → best candidate

  for (const template of SHAPE_LIBRARY) {
    console.log(`[Discovery] Fitting "${template.name}"...`);
    const fits = fitShape(graph, template, center, 1); // just the best per shape
    if (fits.length > 0) {
      bestPerShape.set(template.key, fits[0]);
    }
  }

  // Step 4: Collect one candidate per shape, sorted by score
  const results = [...bestPerShape.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, maxResults);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[Discovery] Done in ${elapsed}s — ${bestPerShape.size} shapes found, returning top ${results.length}`
  );
  // Detailed metrics summary for progress tracking
  console.log(`[Discovery] ─── Quality Report ───`);
  for (const r of results) {
    const m = r.metrics || {};
    console.log(
      `  ${r.icon} ${r.name}: score=${r.score.toFixed(3)} ` +
      `iou=${(m.iou ?? 0).toFixed(2)} gap=${(m.outlineGap90 ?? 0).toFixed(2)} dbl=${(m.doubledBack ?? 0).toFixed(2)} ` +
      `${(r.distance / 1609.34).toFixed(1)}mi r=${r.config.radius}m`
    );
  }
  console.log(`[Discovery] ─── Pass: score <= ${SCORE_GATE} (lower is better) ───`);

  onProgress("done");
  return results;
}

/**
 * Bundled road data when available; otherwise the Overpass API (cached per session).
 */
async function loadRoads(roadDataKey, center, radiusKm) {
  if (roadDataKey) {
    try {
      const data = await loadRoadData(roadDataKey);
      if (data) return data;
    } catch (err) {
      console.warn(`[Discovery] Bundled road data for ${roadDataKey} unavailable, using Overpass`, err);
    }
  }
  const cached = loadCachedNetwork(center, radiusKm);
  if (cached) return cached;
  try {
    return await fetchRoadNetwork(center, radiusKm);
  } catch (err) {
    throw new Error("Couldn't load map data for this area. Please try again in a minute.", { cause: err });
  }
}

/**
 * Format distance in miles.
 */
export function formatDist(meters) {
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

/**
 * Format estimated walking time.
 */
export function formatTime(meters) {
  const mins = Math.round((meters / 1609.34) * 20); // ~20 min/mile walking
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h ${m}m`;
}
