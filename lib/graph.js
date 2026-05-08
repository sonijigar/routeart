/*
  Road graph builder + pathfinding.

  Builds an adjacency graph from OSM data where:
  - Nodes = intersections (OSM nodes shared by 2+ ways, or way endpoints)
  - Edges = road segments between intersections (with full geometry for rendering)

  Provides Dijkstra pathfinding and spatial index for nearest-node lookups.
*/

// ─── Graph building ──────────────────────────────────────────────────

/**
 * Build a walkable graph from Overpass API response.
 *
 * @param {{ elements: object[] }} osmData - Overpass JSON response
 * @returns {Graph}
 */
export function buildGraph(osmData) {
  const nodeMap = new Map(); // nodeId → {lat, lng}
  const wayNodes = new Map(); // nodeId → count of ways referencing it
  const ways = [];

  // Pass 1: index all nodes, count way references
  for (const el of osmData.elements) {
    if (el.type === "node") {
      nodeMap.set(el.id, { lat: el.lat, lng: el.lon });
    } else if (el.type === "way" && el.nodes) {
      ways.push(el);
      for (const nid of el.nodes) {
        wayNodes.set(nid, (wayNodes.get(nid) || 0) + 1);
      }
    }
  }

  // An intersection is a node referenced by 2+ ways, or a way endpoint
  const isIntersection = (nid, isEndpoint) =>
    isEndpoint || (wayNodes.get(nid) || 0) >= 2;

  // Pass 2: build edges between consecutive intersections
  const nodes = new Map(); // nodeId → {id, lat, lng}
  const edges = [];
  const adjacency = new Map(); // nodeId → [{neighborId, edgeIdx, weight}]

  function ensureNode(nid) {
    if (!nodes.has(nid)) {
      const pos = nodeMap.get(nid);
      if (!pos) return false;
      nodes.set(nid, { id: nid, lat: pos.lat, lng: pos.lng });
      adjacency.set(nid, []);
    }
    return true;
  }

  function addEdge(fromId, toId, wayId, name, highway, coords) {
    if (!ensureNode(fromId) || !ensureNode(toId)) return;
    if (fromId === toId) return;

    // Compute distance along the geometry
    let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      dist += haversine(coords[i], coords[i + 1]);
    }
    if (dist < 1) return; // skip degenerate edges

    // Weight: distance with road-type adjustments
    let weight = dist;
    if (highway === "footway" || highway === "pedestrian" || highway === "path") {
      weight *= 0.8; // prefer pedestrian roads
    } else if (highway === "primary" || highway === "secondary") {
      weight *= 1.3; // penalize busy roads
    }

    const edgeIdx = edges.length;
    edges.push({
      from: fromId,
      to: toId,
      wayId,
      name: name || "",
      highway,
      distance: dist,
      weight,
      coords, // full geometry for rendering
    });

    adjacency.get(fromId).push({ neighborId: toId, edgeIdx, weight });
    adjacency.get(toId).push({ neighborId: fromId, edgeIdx, weight });
  }

  for (const way of ways) {
    const name = way.tags?.name || "";
    const highway = way.tags?.highway || "";
    const oneway = way.tags?.oneway === "yes";
    const nids = way.nodes;

    // Walk through the way's nodes, splitting at intersections
    let segStart = 0;
    for (let i = 0; i < nids.length; i++) {
      const isEnd = i === 0 || i === nids.length - 1;
      if (isIntersection(nids[i], isEnd) && i > segStart) {
        // Build edge from segStart to i
        const coords = [];
        for (let j = segStart; j <= i; j++) {
          const pos = nodeMap.get(nids[j]);
          if (pos) coords.push([pos.lat, pos.lng]);
        }
        if (coords.length >= 2) {
          addEdge(nids[segStart], nids[i], way.id, name, highway, coords);
        }
        segStart = i;
      }
    }
  }

  // Build spatial index
  const spatialIndex = buildSpatialIndex(nodes);

  // Detect dominant grid orientation
  const gridAngle = detectGridAngle(edges, nodes);

  console.log(
    `[Graph] Built: ${nodes.size} nodes, ${edges.length} edges, grid angle: ${gridAngle.toFixed(1)}°`
  );

  return { nodes, edges, adjacency, spatialIndex, gridAngle };
}

// ─── Spatial index ───────────────────────────────────────────────────

const GRID_SIZE = 20;

function buildSpatialIndex(nodes) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const n of nodes.values()) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lng < minLng) minLng = n.lng;
    if (n.lng > maxLng) maxLng = n.lng;
  }

  // Add small padding
  const pad = 0.001;
  minLat -= pad; maxLat += pad;
  minLng -= pad; maxLng += pad;

  const latStep = (maxLat - minLat) / GRID_SIZE;
  const lngStep = (maxLng - minLng) / GRID_SIZE;
  const cells = new Array(GRID_SIZE * GRID_SIZE).fill(null).map(() => []);

  for (const n of nodes.values()) {
    const r = Math.min(Math.floor((n.lat - minLat) / latStep), GRID_SIZE - 1);
    const c = Math.min(Math.floor((n.lng - minLng) / lngStep), GRID_SIZE - 1);
    cells[r * GRID_SIZE + c].push(n.id);
  }

  return { cells, minLat, minLng, latStep, lngStep };
}

// ─── Grid orientation detection ─────────────────────────────────────

/**
 * Detect the dominant grid angle of the road network.
 * Returns the angle in degrees (0-90) that most road segments align to.
 *
 * Method: histogram of edge bearings mod 90° (grids have 4-fold symmetry),
 * weighted by edge distance. The peak bin is the dominant grid direction.
 */
function detectGridAngle(edges, nodes) {
  const BINS = 90; // 1° resolution
  const histogram = new Float64Array(BINS);

  for (const edge of edges) {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const bear = bearing([fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]);
    // Reduce to 0-90° range (grid symmetry: 0°≡90°≡180°≡270°)
    const reduced = ((bear % 90) + 90) % 90;
    const bin = Math.min(Math.floor(reduced), BINS - 1);
    histogram[bin] += edge.distance; // weight by road length
  }

  // Smooth histogram with a 5° window to handle noise
  const smoothed = new Float64Array(BINS);
  for (let i = 0; i < BINS; i++) {
    for (let d = -2; d <= 2; d++) {
      smoothed[i] += histogram[((i + d) % BINS + BINS) % BINS];
    }
  }

  // Find peak
  let peakBin = 0;
  let peakVal = 0;
  for (let i = 0; i < BINS; i++) {
    if (smoothed[i] > peakVal) {
      peakVal = smoothed[i];
      peakBin = i;
    }
  }

  return peakBin;
}

/**
 * Find the nearest graph node to a given point.
 */
export function nearestNode(graph, lat, lng) {
  const { spatialIndex, nodes } = graph;
  const { cells, minLat, minLng, latStep, lngStep } = spatialIndex;

  const r = Math.floor((lat - minLat) / latStep);
  const c = Math.floor((lng - minLng) / lngStep);

  let bestId = null;
  let bestDist = Infinity;

  // Search expanding rings of cells
  for (let radius = 0; radius <= GRID_SIZE; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // only ring
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) continue;

        for (const nid of cells[rr * GRID_SIZE + cc]) {
          const n = nodes.get(nid);
          const d = haversine([lat, lng], [n.lat, n.lng]);
          if (d < bestDist) {
            bestDist = d;
            bestId = nid;
          }
        }
      }
    }
    // If we found something within this ring, no need to expand further
    // (unless the ring is tiny and might miss closer nodes in adjacent cells)
    if (bestId !== null && radius >= 1) break;
  }

  return { nodeId: bestId, dist: bestDist };
}

/**
 * Find the K nearest graph nodes to a given point.
 */
export function nearestNodes(graph, lat, lng, k = 3) {
  const { nodes } = graph;
  const results = [];

  for (const n of nodes.values()) {
    const d = haversine([lat, lng], [n.lat, n.lng]);
    results.push({ nodeId: n.id, dist: d });
  }

  results.sort((a, b) => a.dist - b.dist);
  return results.slice(0, k);
}

// ─── Dijkstra ────────────────────────────────────────────────────────

/**
 * Find shortest path between two nodes.
 *
 * @param {Graph} graph
 * @param {number} startId
 * @param {number} endId
 * @param {object} options
 * @param {number|null} options.desiredBearing - target bearing in degrees (0-360). When set, edges going the wrong direction are penalized.
 * @param {number} options.directionWeight - how strongly to penalize wrong-direction edges (0 = disabled, 1.5 = strong)
 * @returns {{ path: object[], distance: number, coords: [number,number][] } | null}
 */
export function dijkstra(graph, startId, endId, options = {}) {
  const { desiredBearing = null, directionWeight = 0 } = options;

  if (startId === endId) {
    const n = graph.nodes.get(startId);
    return { path: [], distance: 0, coords: n ? [[n.lat, n.lng]] : [] };
  }

  const { adjacency, edges, nodes } = graph;
  const dist = new Map();
  const prev = new Map();
  const heap = new MinHeap();

  dist.set(startId, 0);
  heap.push(0, startId);

  while (heap.size > 0) {
    const { priority: d, value: u } = heap.pop();

    if (u === endId) break;
    if (d > (dist.get(u) ?? Infinity)) continue;

    const neighbors = adjacency.get(u);
    if (!neighbors) continue;

    for (const { neighborId, edgeIdx, weight } of neighbors) {
      let effectiveWeight = weight;

      if (desiredBearing !== null && directionWeight > 0) {
        const uNode = nodes.get(u);
        const vNode = nodes.get(neighborId);
        const edgeBear = bearing([uNode.lat, uNode.lng], [vNode.lat, vNode.lng]);
        let bearDiff = Math.abs(edgeBear - desiredBearing);
        if (bearDiff > 180) bearDiff = 360 - bearDiff;
        // 0 when aligned, directionWeight * distance when opposite
        const penalty = directionWeight * (1 - Math.cos(bearDiff * Math.PI / 180)) / 2;
        effectiveWeight += edges[edgeIdx].distance * penalty;
      }

      const alt = d + effectiveWeight;
      if (alt < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, alt);
        prev.set(neighborId, { node: u, edgeIdx });
        heap.push(alt, neighborId);
      }
    }
  }

  if (!prev.has(endId) && startId !== endId) return null; // no path

  // Reconstruct path with full geometry
  const pathEdges = [];
  let current = endId;
  while (current !== startId) {
    const p = prev.get(current);
    if (!p) return null;
    pathEdges.unshift({ edgeIdx: p.edgeIdx, to: current, from: p.node });
    current = p.node;
  }

  // Build coords from edge geometries
  const coords = [];
  let totalDist = 0;

  for (let i = 0; i < pathEdges.length; i++) {
    const edge = edges[pathEdges[i].edgeIdx];
    totalDist += edge.distance;

    // Edge coords might be in either direction — orient them correctly
    let edgeCoords = edge.coords;
    const from = pathEdges[i].from;
    const firstNode = nodes.get(edge.from);

    // If edge.from doesn't match our traversal direction, reverse
    if (firstNode && edge.from !== from) {
      edgeCoords = [...edgeCoords].reverse();
    }

    if (i === 0) {
      coords.push(...edgeCoords);
    } else {
      coords.push(...edgeCoords.slice(1)); // skip duplicate junction point
    }
  }

  return { path: pathEdges, distance: totalDist, coords };
}

// ─── Min-Heap ────────────────────────────────────────────────────────

class MinHeap {
  constructor() {
    this.data = [];
  }

  get size() {
    return this.data.length;
  }

  push(priority, value) {
    this.data.push({ priority, value });
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].priority >= this.data[parent].priority) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].priority < this.data[smallest].priority)
        smallest = left;
      if (right < n && this.data[right].priority < this.data[smallest].priority)
        smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

// ─── Geometry ────────────────────────────────────────────────────────

export function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearing([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
