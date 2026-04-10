/*
  Shape discovery orchestrator.

  Given a map center, fetches the road graph, runs template fitting
  for all shapes, and returns ranked candidates.
*/

import { fetchRoadNetwork, loadCachedNetwork } from "./overpass.js";
import { buildGraph } from "./graph.js";
import { SHAPE_LIBRARY } from "./shapeLibrary.js";
import { fitShape } from "./shapeFitter.js";

// Cache the built graph to avoid rebuilding on each call
let cachedGraph = null;
let cachedGraphKey = null;

/**
 * Discover the best shape routes for a given location.
 *
 * @param {[number, number]} center - [lat, lng]
 * @param {object} options
 * @param {number} options.radiusKm - area to fetch (default 1.0)
 * @param {number} options.maxResults - max candidates to return (default 5)
 * @param {function} options.onProgress - callback for UI updates
 * @returns {Promise<Array<{shape, name, icon, score, coords, distance, config}>>}
 */
export async function discoverShapes(center, options = {}) {
  const {
    radiusKm = 2.5,
    maxResults = 7,
    onProgress = () => {},
  } = options;

  const startTime = performance.now();

  // Step 1: Fetch road network
  onProgress("fetching");
  console.log(`[Discovery] Starting for center [${center}], radius ${radiusKm}km`);

  // Try cached first
  let osmData = loadCachedNetwork(center, radiusKm);
  if (!osmData) {
    osmData = await fetchRoadNetwork(center, radiusKm);
  }

  // Step 2: Build graph
  onProgress("building");
  const graphKey = `${center[0].toFixed(4)},${center[1].toFixed(4)},${radiusKm}`;

  let graph;
  if (cachedGraphKey === graphKey && cachedGraph) {
    console.log(`[Discovery] Reusing cached graph`);
    graph = cachedGraph;
  } else {
    graph = buildGraph(osmData);
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
  for (const r of results) {
    console.log(
      `  ${r.icon} ${r.name}: score ${r.score.toFixed(3)}, ${r.coords.length} pts, ` +
      `${(r.distance / 1609.34).toFixed(1)} mi, radius ${r.config.radius}m, rot ${r.config.rotation}°`
    );
  }

  onProgress("done");
  return results;
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
