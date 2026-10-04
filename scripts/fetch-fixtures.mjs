#!/usr/bin/env node
/*
  Fetch OpenStreetMap road data for the app's Seattle neighborhoods and save it
  to public/roads/<key>.json.gz — served to the app and used by the eval harness.

  Usage:
    npm run fetch-fixtures                 # all neighborhoods
    npm run fetch-fixtures -- slu ballard  # just these

  Set OVERPASS_URL to use a different Overpass instance.
  Uses the same query as the app (lib/overpass.js), so fixtures match production.
*/

import { buildQuery, computeBbox, OVERPASS_URL } from "../lib/overpass.js";
import { LOCATIONS, FETCH_RADIUS_KM } from "../lib/locations.js";
import { ACTIVITIES, usableFor } from "../lib/roadFilter.js";
import { compactOverpass, writeFixture, fixturePath } from "./fixtures.mjs";

const url = process.env.OVERPASS_URL || OVERPASS_URL;
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOCATIONS);

for (const key of keys) {
  if (!LOCATIONS[key]) {
    console.error(`Unknown location "${key}". Known: ${Object.keys(LOCATIONS).join(", ")}`);
    process.exit(1);
  }
}

for (const [i, key] of keys.entries()) {
  if (i > 0) await sleep(5000); // be polite to the shared Overpass servers

  const loc = LOCATIONS[key];
  const bbox = computeBbox(loc.center, FETCH_RADIUS_KM);
  const query = buildQuery(bbox, 120);
  console.log(`\n${loc.name} (${key}) — fetching ${FETCH_RADIUS_KM} km around [${loc.center}]...`);

  const raw = await fetchWithRetry(query);
  const fixture = compactOverpass(raw, {
    key,
    name: loc.name,
    center: loc.center,
    radiusKm: FETCH_RADIUS_KM,
    bbox,
    source: url,
    fetchedAt: new Date().toISOString(),
  });
  const bytes = writeFixture(key, fixture);

  const usable = ACTIVITIES.map(
    (a) => `${a} ${fixture.ways.filter(([, tags]) => usableFor(tags, a)).length}`
  ).join(", ");
  console.log(
    `  ${fixture.nodes.length} nodes, ${fixture.ways.length} ways (usable: ${usable})\n` +
    `  wrote ${fixturePath(key)} (${(bytes / 1024).toFixed(0)} KB)`
  );
}

console.log("\nDone. Commit public/roads/*.json.gz, then run: npm run eval");

async function fetchWithRetry(query, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "routeart-fixtures (https://github.com/sonijigar/routeart)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (err) {
      if (attempt >= attempts) throw err;
      const wait = 10000 * attempt;
      console.log(`  attempt ${attempt} failed (${err.message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
