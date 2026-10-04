/*
  Shape template library.

  Shapes are drawn as pixel art: each template is a small bitmap ("X" = filled)
  whose outline becomes the route. This is how GPS artists draw on city grids —
  every edge is horizontal or vertical and every corner sits on a whole cell, so
  when a cell spans a block or two the outline runs along real streets.

  traceOutline() turns a bitmap into its corner-only outline polygon; the fitter
  uses those corners as waypoints and lays the cells square to the street grid.

  To add a shape: draw a bitmap below. It must be one 4-connected blob with no
  holes and no cells touching only at a corner (traceOutline throws otherwise).
*/

const HEART = [
  ".XX...XX.",
  "XXXX.XXXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  ".XXXXXXX.",
  "..XXXXX..",
  "...XXX...",
  "....X....",
];

const STAR = [
  "....X....",
  "....X....",
  "...XXX...",
  "XXXXXXXXX",
  ".XXXXXXX.",
  "..XXXXX..",
  "..XX.XX..",
  ".XX...XX.",
  ".X.....X.",
];

const ARROW = [
  "...X...",
  "..XXX..",
  ".XXXXX.",
  "XXXXXXX",
  "..XXX..",
  "..XXX..",
  "..XXX..",
  "..XXX..",
  "..XXX..",
];

const CROSS = [
  "...XXX...",
  "...XXX...",
  "...XXX...",
  "XXXXXXXXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  "...XXX...",
  "...XXX...",
  "...XXX...",
];

const LIGHTNING = [
  "...XXXX",
  "..XXXX.",
  "..XXX..",
  ".XXX...",
  "XXXXXXX",
  "...XXX.",
  "..XXX..",
  "..XX...",
  ".XX....",
  ".X.....",
];

const HOUSE = [
  "....X....",
  "...XXX...",
  "..XXXXX..",
  ".XXXXXXX.",
  "XXXXXXXXX",
  ".XXXXXXX.",
  ".XXXXXXX.",
  ".XXXXXXX.",
  ".XXX.XXX.",
];

const LOOP = [
  "...XXX...",
  ".XXXXXXX.",
  ".XXXXXXX.",
  "XXXXXXXXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  ".XXXXXXX.",
  ".XXXXXXX.",
  "...XXX...",
];

// ─── Shape library ───────────────────────────────────────────────────

export const SHAPE_LIBRARY = [
  makeTemplate("heart", "Heart", "♥", HEART),
  makeTemplate("star", "Star", "⭐", STAR),
  makeTemplate("arrow", "Arrow", "↑", ARROW),
  makeTemplate("cross", "Cross", "✚", CROSS),
  makeTemplate("lightning", "Lightning", "⚡", LIGHTNING),
  makeTemplate("house", "House", "🏠", HOUSE),
  makeTemplate("loop", "Loop", "⭕", LOOP),
];

/**
 * Build a template from a bitmap.
 * outline: corner polygon normalized so the longer side spans [-1, 1], y up, closed.
 * cells: width/height of the bitmap in cells (cell size = 2 * radius / max(cells)).
 */
function makeTemplate(key, name, icon, pixels) {
  const width = pixels[0].length, height = pixels.length;
  const half = Math.max(width, height) / 2;
  const corners = traceOutline(pixels);
  const outline = corners.map(([x, y]) => [(x - width / 2) / half, (y - height / 2) / half]);
  outline.push(outline[0]);
  return { key, name, icon, pixels, cells: Math.max(width, height), outline };
}

/**
 * Trace the outline of a pixel bitmap as a counter-clockwise polygon of cell corners
 * (x right, y up), keeping only the corners where the direction changes.
 */
export function traceOutline(pixels) {
  const height = pixels.length;
  const filled = (c, r) => r >= 0 && r < height && pixels[r][c] === "X";

  // Directed boundary edges with the filled cell on the left
  const next = new Map(); // "x,y" → [x, y] of the next corner
  const add = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`;
    if (next.has(k)) throw new Error(`Shape bitmap pinches at corner (${x1}, ${y1})`);
    next.set(k, [x2, y2]);
  };
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < pixels[r].length; c++) {
      if (!filled(c, r)) continue;
      const x = c, y = height - 1 - r; // cell occupies [x, x+1] × [y, y+1]
      if (!filled(c, r + 1)) add(x, y, x + 1, y); // bottom
      if (!filled(c + 1, r)) add(x + 1, y, x + 1, y + 1); // right
      if (!filled(c, r - 1)) add(x + 1, y + 1, x, y + 1); // top
      if (!filled(c - 1, r)) add(x, y + 1, x, y); // left
    }
  }

  // Walk the loop from the lowest, leftmost corner
  const start = [...next.keys()].map((k) => k.split(",").map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  const loop = [start];
  let cur = next.get(`${start[0]},${start[1]}`);
  while (cur[0] !== start[0] || cur[1] !== start[1]) {
    loop.push(cur);
    cur = next.get(`${cur[0]},${cur[1]}`);
  }
  if (loop.length !== next.size) throw new Error("Shape bitmap must be one blob without holes");

  // Keep only corners where the direction changes
  return loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/**
 * Transform a shape outline from normalized [-1,1] to GPS coordinates.
 *
 * @param {[number,number][]} outline - normalized [x, y] points
 * @param {[number,number]} center - [lat, lng]
 * @param {number} radiusMeters - scale
 * @param {number} rotationDeg - rotation in degrees
 * @returns {[number,number][]} - [lat, lng] points
 */
export function transformOutline(outline, center, radiusMeters, rotationDeg = 0) {
  const latRadius = radiusMeters / 111000;
  const lngRadius = radiusMeters / (111000 * Math.cos((center[0] * Math.PI) / 180));
  const rotRad = (rotationDeg * Math.PI) / 180;

  return outline.map(([x, y]) => {
    // Apply rotation
    const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
    const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
    return [
      center[0] + ry * latRadius,  // y → latitude
      center[1] + rx * lngRadius,  // x → longitude
    ];
  });
}
