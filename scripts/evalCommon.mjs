/*
  Shared helpers for the eval scripts (eval, make-labelset, calibrate):
  locations, rendering, screenshots, CLI args.
*/

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { LOCATIONS } from "../lib/locations.js";
import { loadFixture, syntheticGrid } from "./fixtures.mjs";

export const EVAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "eval");
export const OUT_DIR = path.join(EVAL_DIR, "out");

/** The synthetic grid plus every neighborhood with a fixture, optionally filtered by key. */
export function loadLocations(keys) {
  const want = (key) => !keys || keys.includes(key);
  const locations = [];
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
  return locations;
}

export const SHEET_CSS = `
body{margin:0;background:#0b0b0d}
.row{fill:#ddd;font:600 14px system-ui}
.cell{fill:#141418}
.road{stroke:#2c2c34;stroke-width:1;fill:none}
.ideal{stroke:#4aa8ff;stroke-width:1.5;stroke-dasharray:4 3;fill:none}
.route{stroke:#ff6b2b;stroke-width:2.2;fill:none;stroke-linejoin:round}
.lbl{fill:#eee;font:12px ui-monospace,monospace}.sub{fill:#888;font:10px ui-monospace,monospace}
.big{fill:#fff;font:600 15px ui-monospace,monospace}
.ok{fill:#4ade80}.mid{fill:#facc15}.bad{fill:#f87171}`;

export function sheetHtml(title, svg, width, height) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${SHEET_CSS}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svg}</svg></body></html>`;
}

/** Equirectangular projection of [lat,lng] points into a w×h box with padding. */
export function projector(pts, w, h, pad) {
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

/** SVG path of every graph edge that falls inside the projected view. */
export function roadsPath(graph, proj) {
  let d = "";
  for (const e of graph.edges) {
    const xy = e.coords.map(proj.xy);
    if (!xy.some(proj.inView)) continue;
    d += "M" + xy.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
  }
  return d;
}

/** Screenshot an HTML file with headless Chrome. Returns false if no browser is found. */
export function screenshot(htmlPath, pngPath, width, height) {
  const chrome = findChrome();
  if (!chrome) {
    console.log("--png: no Chrome/Chromium found (set CHROME_PATH)");
    return false;
  }
  execFileSync(chrome, [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--screenshot=${pngPath}`, `--window-size=${width},${height + 120}`, // headless viewport is shorter than the window
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
  console.log(`Wrote ${path.relative(process.cwd(), pngPath)}`);
  return true;
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

/** Run fn with the library's console logging silenced unless verbose. */
export function quietly(fn, verbose = false) {
  if (verbose) return fn();
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

export function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}

export function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
