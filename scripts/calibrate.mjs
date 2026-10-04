#!/usr/bin/env node
/*
  Check the shape score (lib/shapeScorer.js) against hand labels.

  Inputs (both committed):
    eval/labelset.json.gz   frozen candidate routes (npm run make-labelset)
    eval/labels.json        good / ok / bad per candidate id — edit to override labels

  Usage:
    npm run calibrate            # agreement report + threshold table
    npm run calibrate -- --png   # also eval/out/calibrate.png, candidates sorted by score

  Agreement = share of differently-labeled pairs that the score orders correctly
  (0.5 = coin flip, 1.0 = perfect).
*/

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { computeMetrics, SCORE_GATE } from "../lib/shapeScorer.js";
import { EVAL_DIR, OUT_DIR, sheetHtml, projector, screenshot, parseArgs, esc } from "./evalCommon.mjs";

const args = parseArgs(process.argv.slice(2));
const { candidates } = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(EVAL_DIR, "labelset.json.gz"))));
const { labels } = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, "labels.json")));
const RANK = { good: 2, ok: 1, bad: 0 };

const t0 = performance.now();
const rows = candidates
  .filter((c) => labels[c.id])
  .map((c) => ({ ...c, label: labels[c.id].label, m: computeMetrics(c.coords, c.outline, c.config.radius) }));
const msPer = (performance.now() - t0) / rows.length;

const unlabeled = candidates.length - rows.length;
console.log(`${rows.length} labeled candidates${unlabeled ? ` (${unlabeled} unlabeled skipped)` : ""}, ${msPer.toFixed(1)} ms/score\n`);

const seattle = rows.filter((r) => r.location !== "grid");
const grid = rows.filter((r) => r.location === "grid");
console.log("Agreement with labels           all    seattle  grid");
line("all label pairs", (set) => agreement(set));
line("good+ok vs bad", (set) => agreement(set, (a, b) => RANK[a.label] >= 1 && b.label === "bad"));
line("good vs ok+bad", (set) => agreement(set, (a, b) => a.label === "good" && b.label !== "good"));

console.log(`\nGate thresholds (score <= t passes)     good   ok    bad`);
const total = (l) => rows.filter((r) => r.label === l).length;
for (const t of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
  const pass = (l) => rows.filter((r) => r.label === l && r.m.score <= t).length;
  console.log(
    `  t=${t.toFixed(1)}${t === SCORE_GATE ? " (current gate)" : "               "}           ` +
    `${pass("good")}/${total("good")}   ${pass("ok")}/${total("ok")}  ${pass("bad")}/${total("bad")}`
  );
}

const sorted = [...rows].sort((a, b) => a.m.score - b.m.score);
const worstMisses = [
  ...sorted.filter((r) => r.label === "bad" && r.m.score <= SCORE_GATE).map((r) => `bad but passes:  #${r.n} ${r.id}`),
  ...sorted.filter((r) => r.label !== "bad" && r.m.score > SCORE_GATE).map((r) => `${r.label} but fails:  #${r.n} ${r.id}`),
];
if (worstMisses.length) console.log(`\nGate disagreements at ${SCORE_GATE}:\n  ` + worstMisses.join("\n  "));

if (args.png) {
  const W = 200, H = 200, LABEL = 36, COLS = 8;
  let svg = "";
  sorted.forEach((r, i) => {
    const x0 = (i % COLS) * W, y0 = Math.floor(i / COLS) * (H + LABEL);
    const proj = projector([...r.coords, ...r.outline], W - 4, H - 4, 10);
    const cls = r.label === "good" ? "ok" : r.label === "ok" ? "mid" : "bad";
    svg += `<g transform="translate(${x0},${y0})"><rect width="${W - 4}" height="${H + LABEL - 4}" class="cell"/>`;
    svg += `<polyline points="${proj.points(r.outline)}" class="ideal"/><polyline points="${proj.points(r.coords)}" class="route"/>`;
    svg += `<text x="6" y="${H + 8}" class="lbl">#${r.n} <tspan class="${cls}">${r.label}</tspan> ${r.m.score.toFixed(2)}${r.m.score <= SCORE_GATE ? " ✓" : ""}</text>`;
    svg += `<text x="6" y="${H + 22}" class="sub">${esc(r.shape)} iou=${r.m.iou.toFixed(2)} gap=${r.m.outlineGap90.toFixed(2)} dbl=${r.m.doubledBack.toFixed(2)}</text></g>`;
  });
  const width = COLS * W, height = Math.ceil(sorted.length / COLS) * (H + LABEL);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, "calibrate.html");
  fs.writeFileSync(htmlPath, sheetHtml("Score calibration", svg, width, height));
  screenshot(htmlPath, path.join(OUT_DIR, "calibrate.png"), width, height);
}

function line(name, fn) {
  const fmt = (set) => (set.length ? fn(set).toFixed(2) : "  - ");
  console.log(`  ${name.padEnd(28)} ${fmt(rows)}   ${fmt(seattle)}     ${fmt(grid)}`);
}

/** Share of (better, worse) pairs where the better-labeled route has the lower score. */
function agreement(set, isPair = (a, b) => RANK[a.label] > RANK[b.label]) {
  let right = 0, n = 0;
  for (const a of set) {
    for (const b of set) {
      if (!isPair(a, b)) continue;
      n++;
      right += a.m.score < b.m.score ? 1 : a.m.score === b.m.score ? 0.5 : 0;
    }
  }
  return n ? right / n : NaN;
}
