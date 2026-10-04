#!/usr/bin/env node
/*
  Build a frozen set of candidate routes for labeling, used to check whether a
  shape score agrees with human judgement (see calibrate.mjs).

  For every location × shape it keeps the best, a mid-ranked and a low-ranked
  candidate under the current fitter, so the set holds clear good and clear bad
  examples. Geometry is stored, so labels stay valid when the fitter changes.

  Usage:
    npm run make-labelset            # writes eval/labelset.json.gz + blind label sheets
    npm run make-labelset -- --png   # also screenshots the sheets

  Output:
    eval/labelset.json.gz            candidates (committed)
    eval/out/labelset-<page>.html    route-only panels, shuffled, numbered — no scores shown
*/

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { buildGraph } from "../lib/graph.js";
import { SHAPE_LIBRARY, transformOutline } from "../lib/shapeLibrary.js";
import { fitShape } from "../lib/shapeFitter.js";
import {
  EVAL_DIR, OUT_DIR, loadLocations, sheetHtml, projector, roadsPath, screenshot,
  quietly, parseArgs, esc,
} from "./evalCommon.mjs";

export const LABELSET_PATH = path.join(EVAL_DIR, "labelset.json.gz");

const RANK_FRACTIONS = [0, 0.3, 0.65]; // best, mid, low under the current score
const PER_PAGE = 24;
const COLS = 6;

const args = parseArgs(process.argv.slice(2));
const activity = "run";
const locations = loadLocations();
const candidates = [];

for (const loc of locations) {
  const graph = quietly(() => buildGraph(loc.osmData, { activity }));
  loc.graph = graph;
  for (const template of SHAPE_LIBRARY) {
    const fits = quietly(() => fitShape(graph, template, loc.center, Infinity, { applyGate: false }));
    const ranks = [...new Set(RANK_FRACTIONS.map((f) => Math.floor(f * fits.length)))].filter((r) => r < fits.length);
    for (const rank of ranks) {
      const f = fits[rank];
      const { center, radius, rotation } = f.config;
      candidates.push({
        id: `${loc.key}:${template.key}:r${radius}:rot${rotation}:${center[0].toFixed(5)},${center[1].toFixed(5)}`,
        location: loc.key,
        shape: template.key,
        shapeName: template.name,
        activity,
        rank,
        of: fits.length,
        config: { center, radius, rotation },
        distance: Math.round(f.distance),
        coords: round6(f.coords),
        outline: round6(transformOutline(template.outline, center, radius, rotation)),
      });
    }
    console.log(`${loc.key.padEnd(12)} ${template.key.padEnd(12)} ${fits.length} fits → ranks ${ranks.join(", ") || "none"}`);
  }
}

// Shuffle with a fixed seed so panel numbers don't reveal location or rank
const rand = mulberry32(42);
for (let i = candidates.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
}
candidates.forEach((c, i) => (c.n = i + 1));

fs.writeFileSync(LABELSET_PATH, zlib.gzipSync(JSON.stringify({ createdAt: new Date().toISOString(), candidates })));
console.log(`\nWrote ${path.relative(process.cwd(), LABELSET_PATH)} (${candidates.length} candidates)`);

// ─── Blind label sheets ──────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });
const graphs = Object.fromEntries(locations.map((l) => [l.key, l.graph]));
const W = 240, H = 240, LABEL = 26;
for (let page = 0; page * PER_PAGE < candidates.length; page++) {
  const items = candidates.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const rows = Math.ceil(items.length / COLS);
  let svg = "";
  items.forEach((c, i) => {
    const x0 = (i % COLS) * W, y0 = Math.floor(i / COLS) * (H + LABEL);
    const proj = projector(c.coords, W - 4, H - 4, 12);
    svg += `<g transform="translate(${x0},${y0})"><rect width="${W - 4}" height="${H + LABEL - 4}" class="cell"/>`;
    svg += `<path d="${roadsPath(graphs[c.location], proj)}" class="road"/>`;
    svg += `<polyline points="${proj.points(c.coords)}" class="route"/>`;
    svg += `<text x="6" y="${H + 12}" class="big">#${c.n} ${esc(c.shapeName)}?</text></g>`;
  });
  const width = COLS * W, height = rows * (H + LABEL);
  const htmlPath = path.join(OUT_DIR, `labelset-${page + 1}.html`);
  fs.writeFileSync(htmlPath, sheetHtml(`Label set page ${page + 1}`, svg, width, height));
  if (args.png) screenshot(htmlPath, htmlPath.replace(/\.html$/, ".png"), width, height);
}

function round6(pts) {
  return pts.map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6]);
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
