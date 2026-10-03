#!/usr/bin/env node
/*
  Eval harness: run shape fitting on fixed road data and report how it did.

  Locations: "grid" (synthetic perfect grid, always available) plus every
  Seattle neighborhood with a fixture in fixtures/osm/ (see fetch-fixtures.mjs).

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
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { buildGraph } from "../lib/graph.js";
import { SHAPE_LIBRARY, transformOutline } from "../lib/shapeLibrary.js";
import { fitShape } from "../lib/shapeFitter.js";
import { passesQualityGate } from "../lib/shapeScorer.js";
import { LOCATIONS } from "../lib/locations.js";
import { loadFixture, syntheticGrid } from "./fixtures.mjs";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "eval", "out");
const args = parseArgs(process.argv.slice(2));
const activity = args.activity || "run";
const shapeFilter = args.shapes?.split(",");
const templates = SHAPE_LIBRARY.filter((t) => !shapeFilter || shapeFilter.includes(t.key));

// ─── Collect locations ───────────────────────────────────────────────

const locations = [];
const wanted = args.locations?.split(",");
const want = (key) => !wanted || wanted.includes(key);

if (want("grid")) {
  const center = LOCATIONS.slu.center;
  locations.push({ key: "grid", name: "Synthetic 100 m grid", center, osmData: syntheticGrid(center) });
}
const missing = [];
for (const [key, loc] of Object.entries(LOCATIONS)) {
  if (!want(key)) continue;
  const fx = loadFixture(key);
  if (fx) locations.push({ key, name: loc.name, center: loc.center, osmData: fx.osmData });
  else missing.push(key);
}
if (missing.length) {
  console.log(`No fixture for: ${missing.join(", ")} — run \`npm run fetch-fixtures\` to add them.`);
}
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

if (args.png) {
  const chrome = findChrome();
  if (!chrome) {
    console.log("--png: no Chrome/Chromium found (set CHROME_PATH)");
  } else {
    const pngPath = path.join(OUT_DIR, "sheet.png");
    execFileSync(chrome, [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      `--screenshot=${pngPath}`, `--window-size=${sheet.width},${sheet.height + 120}`, // headless viewport is shorter than the window
      `file://${sheetPath}`,
    ], { stdio: "ignore" });
    console.log(`Wrote ${path.relative(process.cwd(), pngPath)}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function summaryLine(r) {
  if (!r.found) return `${r.shape.padEnd(12)} NOT FOUND (${r.ms}ms)`;
  const m = r.metrics;
  return (
    `${r.shape.padEnd(12)} ${r.passesGate ? "pass" : "FAIL"} score=${m.score.toFixed(2)} ` +
    `cov=${pct(m.coverage)} rev=${pct(m.reverseCoverage)} dir=${pct(m.directionFidelity)} ` +
    `cross=${m.selfIntersections} ${(r.distanceM / 1000).toFixed(1)}km ` +
    `r=${r.config.radius} rot=${r.config.rotation} (${r.ms}ms)`
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
        svg += `<text x="6" y="${H + 22}" class="sub">${(r.distanceM / 1000).toFixed(1)}km r=${r.config.radius} rot=${r.config.rotation} cov=${pct(m.coverage)} ${r.ms}ms</text>`;
      } else {
        svg += `<text x="6" y="${H + 8}" class="lbl">${t.key} <tspan class="bad">NOT FOUND</tspan></text>`;
      }
      svg += `</g>`;
    });
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>RouteArt eval</title><style>
body{margin:0;background:#0b0b0d}
.row{fill:#ddd;font:600 14px system-ui}
.cell{fill:#141418}
.road{stroke:#2c2c34;stroke-width:1;fill:none}
.ideal{stroke:#4aa8ff;stroke-width:1.5;stroke-dasharray:4 3;fill:none}
.route{stroke:#ff6b2b;stroke-width:2.2;fill:none;stroke-linejoin:round}
.lbl{fill:#eee;font:12px ui-monospace,monospace}.sub{fill:#888;font:10px ui-monospace,monospace}
.ok{fill:#4ade80}.bad{fill:#f87171}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svg}</svg></body></html>`;
  return { html, width, height };
}

/** Equirectangular projection of [lat,lng] points into a w×h box with padding. */
function projector(pts, w, h, pad) {
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const s = Math.min((w - 2 * pad) / ((maxLng - minLng) * k || 1e-9), (h - 2 * pad) / (maxLat - minLat || 1e-9));
  const ox = (w - (maxLng - minLng) * k * s) / 2, oy = (h - (maxLat - minLat) * s) / 2;
  const xy = ([lat, lng]) => [ox + (lng - minLng) * k * s, oy + (maxLat - lat) * s];
  return {
    xy,
    inView: ([x, y]) => x >= 0 && y >= 0 && x <= w && y <= h,
    points: (ps) => ps.map((p) => xy(p).map((v) => v.toFixed(1)).join(",")).join(" "),
  };
}

function roadsPath(graph, proj) {
  let d = "";
  for (const e of graph.edges) {
    const xy = e.coords.map(proj.xy);
    if (!xy.some(proj.inView)) continue;
    d += "M" + xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
  }
  return d;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  const pw = "/opt/pw-browsers";
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw)) {
      if (d.startsWith("chromium-")) candidates.push(path.join(pw, d, "chrome-linux", "chrome"));
    }
  }
  return candidates.find((p) => p && fs.existsSync(p));
}

/** Run fn with the library's console logging silenced (use --verbose to keep it). */
function quietly(fn) {
  if (args.verbose) return fn();
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

function roundAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(4) : v]));
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}
