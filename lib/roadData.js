/*
  Bundled Seattle road data.

  public/roads/<location>.json.gz holds a trimmed Overpass response for each
  neighborhood in lib/locations.js (written by scripts/fetch-fixtures.mjs):
    { meta, nodes: [[id, lat, lon], ...], ways: [[id, tags, [nodeIds]], ...] }

  Serving it as a static file avoids calling the shared Overpass servers from
  every visitor's browser, which is slow and often fails.
*/

/** Expand the compact format back into Overpass `{ elements }` form for buildGraph(). */
export function expandRoadData({ nodes, ways }) {
  const elements = [];
  for (const [id, lat, lon] of nodes) elements.push({ type: "node", id, lat, lon });
  for (const [id, tags, nds] of ways) elements.push({ type: "way", id, tags, nodes: nds });
  return { elements };
}

/**
 * Load bundled road data for a location in the browser.
 * Returns null when there is no bundle (caller falls back to Overpass).
 */
export async function loadRoadData(key) {
  const res = await fetch(`/roads/${key}.json.gz`);
  if (!res.ok) return null;

  let bytes = new Uint8Array(await res.arrayBuffer());
  // Hosts differ: some serve the raw gzip bytes, some decompress on the way (Content-Encoding)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return expandRoadData(JSON.parse(new TextDecoder().decode(bytes)));
}
