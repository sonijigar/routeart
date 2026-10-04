/*
  Shape scoring — how recognizable is a routed loop as its intended shape?

  Calibrated against hand-labeled routes (eval/labels.json, `npm run calibrate`).
  Three terms, lower is better:

    score = (1 - iou) + 0.5 * doubledBack + outlineGap90

  - iou          overlap of the filled route and filled ideal outline (area-level likeness)
  - doubledBack  fraction of route length run twice — out-and-back spurs that clutter the drawing
  - outlineGap90 90th-percentile distance from the ideal outline to the route, divided by the
                 shape radius — catches missing features (a heart's dip, a star's point)

  Both curves are rasterized onto one grid, so scoring stays cheap inside the fitting loop.
*/

const RASTER = 128; // grid cells along the longer side of the bounding box
const OUTLINE_SAMPLES = 200;

// Calibrated on eval/labels.json: passes every route labeled good or ok, rejects ~2/3 of bad ones
export const SCORE_GATE = 0.5;

/**
 * @param {[number,number][]} routeCoords - routed loop, [lat,lng]
 * @param {[number,number][]} outlineCoords - ideal shape, [lat,lng]
 * @param {number} radius - shape radius in meters (normalizes outlineGap90)
 * @returns {{score: number, iou: number, doubledBack: number, outlineGap90: number}}
 */
export function computeMetrics(routeCoords, outlineCoords, radius) {
  if (routeCoords.length < 3 || outlineCoords.length < 3) {
    return { score: Infinity, iou: 0, doubledBack: 1, outlineGap90: 1 };
  }

  // Project to local meters
  const lat0 = outlineCoords[0][0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const toXY = ([lat, lng]) => [lng * kx, lat * ky];
  const route = routeCoords.map(toXY);
  const outline = outlineCoords.map(toXY);

  const grid = makeGrid([...route, ...outline]);
  const routeFill = fillPolygon(route, grid);
  const outlineFill = fillPolygon(outline, grid);
  let inter = 0, union = 0;
  for (let i = 0; i < routeFill.length; i++) {
    inter += routeFill[i] & outlineFill[i];
    union += routeFill[i] | outlineFill[i];
  }
  const iou = union ? inter / union : 0;

  const dist = distanceToPath(route, grid);
  const gaps = samplePath(outline, OUTLINE_SAMPLES).map(([x, y]) => dist[cellOf(grid, x, y)] * grid.cell);
  gaps.sort((a, b) => a - b);
  const outlineGap90 = gaps[Math.floor(0.9 * (gaps.length - 1))] / radius;

  const doubledBack = doubledBackFraction(routeCoords);

  return {
    score: 1 - iou + 0.5 * doubledBack + outlineGap90,
    iou,
    doubledBack,
    outlineGap90,
  };
}

export function passesQualityGate(metrics) {
  return metrics.score <= SCORE_GATE;
}

// ─── Raster helpers ──────────────────────────────────────────────────

function makeGrid(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const cell = Math.max(x1 - x0, y1 - y0, 1) / RASTER;
  // one cell of margin so paths on the boundary stay inside
  x0 -= cell; y0 -= cell;
  const nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2;
  return { x0, y0, cell, nx, ny };
}

function cellOf(g, x, y) {
  const c = Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)));
  const r = Math.min(g.ny - 1, Math.max(0, Math.floor((y - g.y0) / g.cell)));
  return r * g.nx + c;
}

/** Even-odd scanline fill of a closed polygon; doubled-back stretches cancel out. */
function fillPolygon(poly, g) {
  const rows = Array.from({ length: g.ny }, () => []);
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    if (ay === by) continue;
    const lo = Math.min(ay, by), hi = Math.max(ay, by);
    const rStart = Math.max(0, Math.ceil((lo - g.y0) / g.cell - 0.5));
    const rEnd = Math.min(g.ny - 1, Math.floor((hi - g.y0) / g.cell - 0.5));
    for (let r = rStart; r <= rEnd; r++) {
      const y = g.y0 + (r + 0.5) * g.cell;
      if (y < lo || y >= hi) continue;
      rows[r].push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
  }
  const fill = new Uint8Array(g.nx * g.ny);
  rows.forEach((xs, r) => {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cStart = Math.max(0, Math.ceil((xs[k] - g.x0) / g.cell - 0.5));
      const cEnd = Math.min(g.nx - 1, Math.floor((xs[k + 1] - g.x0) / g.cell - 0.5));
      for (let c = cStart; c <= cEnd; c++) fill[r * g.nx + c] = 1;
    }
  });
  return fill;
}

/** Distance (in cells) from every cell to the nearest point of the path — two-pass chamfer transform. */
function distanceToPath(path, g) {
  const INF = 1e9;
  const d = new Float64Array(g.nx * g.ny).fill(INF);
  for (const [x, y] of samplePath(path, Math.max(4, Math.ceil(pathLength(path) / (g.cell / 2))))) {
    d[cellOf(g, x, y)] = 0;
  }
  const D = Math.SQRT2;
  for (let r = 0; r < g.ny; r++) {
    for (let c = 0; c < g.nx; c++) {
      const i = r * g.nx + c;
      if (c > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (r > 0) {
        d[i] = Math.min(d[i], d[i - g.nx] + 1);
        if (c > 0) d[i] = Math.min(d[i], d[i - g.nx - 1] + D);
        if (c < g.nx - 1) d[i] = Math.min(d[i], d[i - g.nx + 1] + D);
      }
    }
  }
  for (let r = g.ny - 1; r >= 0; r--) {
    for (let c = g.nx - 1; c >= 0; c--) {
      const i = r * g.nx + c;
      if (c < g.nx - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (r < g.ny - 1) {
        d[i] = Math.min(d[i], d[i + g.nx] + 1);
        if (c < g.nx - 1) d[i] = Math.min(d[i], d[i + g.nx + 1] + D);
        if (c > 0) d[i] = Math.min(d[i], d[i + g.nx - 1] + D);
      }
    }
  }
  return d;
}

function pathLength(path) {
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const [ax, ay] = path[i], [bx, by] = path[(i + 1) % path.length];
    s += Math.hypot(bx - ax, by - ay);
  }
  return s;
}

/** n points evenly spaced by arc length around a closed path. */
function samplePath(path, n) {
  const total = pathLength(path);
  const step = total / n;
  const out = [];
  let target = 0, acc = 0;
  for (let i = 0; i < path.length && out.length < n; i++) {
    const [ax, ay] = path[i], [bx, by] = path[(i + 1) % path.length];
    const L = Math.hypot(bx - ax, by - ay);
    while (target <= acc + L && out.length < n) {
      const t = L ? (target - acc) / L : 0;
      out.push([ax + t * (bx - ax), ay + t * (by - ay)]);
      target += step;
    }
    acc += L;
  }
  return out;
}

// ─── Doubled-back length ─────────────────────────────────────────────

/** Fraction of route length on segments traversed more than once (either direction). */
function doubledBackFraction(coords) {
  const seen = new Set();
  let total = 0, doubled = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const L = segmentMeters(a, b);
    total += L;
    if (seen.has(key)) doubled += 2 * L;
    else seen.add(key);
  }
  return total ? Math.min(1, doubled / total) : 0;
}

function segmentMeters([lat1, lng1], [lat2, lng2]) {
  const kx = 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * 110540);
}
