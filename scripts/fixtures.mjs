/*
  Road-data fixtures for the eval harness.

  Each fixture is fixtures/osm/<location>.json.gz holding a trimmed Overpass response:
    { meta, nodes: [[id, lat, lon], ...], ways: [[id, tags, [nodeIds]], ...] }
  Only the tags the graph builder and road filter read are kept.
*/

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "osm");

const KEEP_TAGS = [
  "highway", "name", "footway", "service", "access", "foot", "bicycle",
  "oneway", "oneway:bicycle", "area",
];

export function fixturePath(key) {
  return path.join(FIXTURE_DIR, `${key}.json.gz`);
}

/** Trim a raw Overpass JSON response into the compact fixture format. */
export function compactOverpass(raw, meta) {
  const nodes = [];
  const ways = [];
  for (const el of raw.elements) {
    if (el.type === "node") {
      nodes.push([el.id, round7(el.lat), round7(el.lon)]);
    } else if (el.type === "way") {
      const tags = {};
      for (const k of KEEP_TAGS) if (el.tags?.[k] !== undefined) tags[k] = el.tags[k];
      ways.push([el.id, tags, el.nodes]);
    }
  }
  return { meta, nodes, ways };
}

export function writeFixture(key, fixture) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const buf = zlib.gzipSync(JSON.stringify(fixture), { level: 9 });
  fs.writeFileSync(fixturePath(key), buf);
  return buf.length;
}

/** Load a fixture and expand it back into Overpass `{ elements }` form for buildGraph(). */
export function loadFixture(key) {
  const p = fixturePath(key);
  if (!fs.existsSync(p)) return null;
  const { meta, nodes, ways } = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
  const elements = [];
  for (const [id, lat, lon] of nodes) elements.push({ type: "node", id, lat, lon });
  for (const [id, tags, nds] of ways) elements.push({ type: "way", id, tags, nodes: nds });
  return { meta, osmData: { elements } };
}

/**
 * A perfect square street grid in Overpass `{ elements }` form — the best case
 * for grid-native shapes. If a shape fails here, the algorithm is at fault.
 */
export function syntheticGrid(center, { blocks = 50, blockMeters = 100 } = {}) {
  const n = blocks + 1;
  const dLat = blockMeters / 111000;
  const dLng = blockMeters / (111000 * Math.cos((center[0] * Math.PI) / 180));
  const id = (r, c) => r * n + c + 1;
  const half = blocks / 2;
  const elements = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      elements.push({ type: "node", id: id(r, c), lat: center[0] + (r - half) * dLat, lon: center[1] + (c - half) * dLng });
    }
  }
  let wayId = 1e9;
  const tags = { highway: "residential" };
  for (let r = 0; r < n; r++) elements.push({ type: "way", id: wayId++, tags, nodes: [...Array(n)].map((_, c) => id(r, c)) });
  for (let c = 0; c < n; c++) elements.push({ type: "way", id: wayId++, tags, nodes: [...Array(n)].map((_, r) => id(r, c)) });
  return { elements };
}

function round7(v) {
  return Math.round(v * 1e7) / 1e7;
}
