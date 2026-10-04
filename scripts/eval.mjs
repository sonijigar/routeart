#!/usr/bin/env node
/*
  Eval harness: run shape fitting on fixed road data and report how it did.

  Locations: "grid" (synthetic perfect grid, always available) plus every
  Seattle neighborhood with road data in public/roads/ (see fetch-fixtures.mjs).

  Usage:
    npm run eval
    npm run eval -- --locations=grid,slu --shapes=pixel-heart,star --activity=ride --png

  Output (eval/out/):
    report.json  metrics + config for every location × shape
    sheet.html   ideal shape (blue dashes) vs fitted route (orange) on the street network
    sheet.png    screenshot of sheet.html (with --png; needs Chrome/Chromium)
*/

import fs from "fs";
import path from "path";
import { buildGraph } from "../lib/graph.js";
import { SHAPE_LIBRARY, transformOutline } from "../lib/shapeLibrary.js";
import { fitShape } from "../lib/shapeFitter.js";
import { passesQualityGate } from "../lib/shapeScorer.js";
import {
  OUT_DIR, loadLocations, sheetHtml, projector, roadsPath, screenshot,
  quietly as quietlyIf, parseArgs, esc,
} from "./evalCommon.mjs";

const args = parseArgs(process.argv.slice(2));
const activity = args.activity || "run";
const shapeFilter = args.shapes?.split(",");
const templates = SHAPE_LIBRARY.filter((t) => !shapeFilter || shapeFilter.includes(t.key));

// ─── Collect locations ───────────────────────────────────────────────

const locations = loadLocations(args.locations?.split(","));
if (!locations.length || !templates.length) {
  console.error("Nothing to evaluate.");
  process.exit(1);
}

// ─── Run ─────────────────────────────────────────────────────────────

const results = [];
const t0 = performance.now();

for (const loc of locations) {
  const graph = quietly(() => buildGraph(loc.osmData, { activity }));
  console.log(
    `\n${loc.name} [${activity}] — ${graph.nodes.size} nodes, ${graph.edges.length} edges, ` +
    `grid angle ${graph.gridAngle.toFixed(0)}°`
  );

  for (const template of templates) {
    const start = performance.now();
    const [best] = quietly(() => fitShape(graph, template, loc.center, 1, { applyGate: false }));
    const ms = Math.round(performance.now() - start);

    const row = { location: loc.key, shape: template.key, ms, found: !!best };
    if (best) {
      const { center, radius, rotation } = best.config;
      Object.assign(row, {
        id: `${loc.key}:${template.key}:r${radius}:rot${rotation}:${center[0].toFixed(5)},${center[1].toFixed(5)}`,
        passesGate: passesQualityGate(best.metrics),
        distanceM: Math.round(best.distance),
        config: best.config,
        metrics: roundAll(best.metrics),
        coords: best.coords,
        outline: transformOutline(template.outline, center, radius, rotation),
      });
    }
    results.push(row);
    console.log("  " + summaryLine(row));
  }
  loc.graph = graph;
}

const totalSec = ((performance.now() - t0) / 1000).toFixed(1);

// ─── Summary ─────────────────────────────────────────────────────────

console.log("\n─── Summary ───");
for (const loc of locations) {
  const rows = results.filter((r) => r.location === loc.key);
  const passing = rows.filter((r) => r.passesGate).length;
  const ms = rows.reduce((s, r) => s + r.ms, 0);
  console.log(`  ${loc.key.padEnd(12)} ${passing}/${rows.length} pass gate, fitting ${(ms / 1000).toFixed(1)}s`);
}
console.log(`  total ${totalSec}s`);

// ─── Write outputs ───────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "report.json"),
  JSON.stringify({ activity, createdAt: new Date().toISOString(), totalSec: +totalSec, results }, null, 1)
);
const sheetPath = path.join(OUT_DIR, "sheet.html");
const sheet = renderSheet(locations, results, templates);
fs.writeFileSync(sheetPath, sheet.html);
console.log(`\nWrote ${path.relative(process.cwd(), OUT_DIR)}/report.json and sheet.html`);

if (args.png) screenshot(sheetPath, path.join(OUT_DIR, "sheet.png"), sheet.width, sheet.height);

// ─── Helpers ─────────────────────────────────────────────────────────

function summaryLine(r) {
  if (!r.found) return `${r.shape.padEnd(12)} NOT FOUND (${r.ms}ms)`;
  const m = r.metrics;
  return (
    `${r.shape.padEnd(12)} ${r.passesGate ? "pass" : "FAIL"} score=${m.score.toFixed(2)} ` +
    `iou=${m.iou.toFixed(2)} gap=${m.outlineGap90.toFixed(2)} dbl=${m.doubledBack.toFixed(2)} ` +
    `${(r.distanceM / 1000).toFixed(1)}km r=${r.config.radius} rot=${r.config.rotation} (${r.ms}ms)`
  );
}

function renderSheet(locations, results, templates) {
  const W = 260, H = 260, LABEL = 34, ROW_HEAD = 22;
  const width = W * templates.length;
  const height = locations.length * (H + LABEL + ROW_HEAD);
  let svg = "";

  locations.forEach((loc, row) => {
    const y0 = row * (H + LABEL + ROW_HEAD);
    svg += `<text x="6" y="${y0 + 16}" class="row">${esc(loc.name)}</text>`;

    templates.forEach((t, col) => {
      const r = results.find((x) => x.location === loc.key && x.shape === t.key);
      const x0 = col * W, y = y0 + ROW_HEAD;
      svg += `<g transform="translate(${x0},${y})"><rect width="${W - 4}" height="${H + LABEL - 4}" class="cell"/>`;
      if (r?.found) {
        const proj = projector([...r.coords, ...r.outline], W - 4, H - 4, 14);
        svg += `<path d="${roadsPath(loc.graph, proj)}" class="road"/>`;
        svg += `<polyline points="${proj.points(r.outline)}" class="ideal"/>`;
        svg += `<polyline points="${proj.points(r.coords)}" class="route"/>`;
        const m = r.metrics;
        svg += `<text x="6" y="${H + 8}" class="lbl">${t.key} <tspan class="${r.passesGate ? "ok" : "bad"}">${r.passesGate ? "pass" : "FAIL"}</tspan> s=${m.score.toFixed(2)}</text>`;
        svg += `<text x="6" y="${H + 22}" class="sub">${(r.distanceM / 1000).toFixed(1)}km r=${r.config.radius} rot=${r.config.rotation} iou=${m.iou.toFixed(2)} ${r.ms}ms</text>`;
      } else {
        svg += `<text x="6" y="${H + 8}" class="lbl">${t.key} <tspan class="bad">NOT FOUND</tspan></text>`;
      }
      svg += `</g>`;
    });
  });

  const html = sheetHtml("RouteArt eval", svg, width, height);
  return { html, width, height };
}





function quietly(fn) {
  return quietlyIf(fn, args.verbose);
}

function roundAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(4) : v]));
}
