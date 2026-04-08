/*
  Shape template library.

  Each shape is defined as a normalized point sequence in [-1, 1] range.
  The fitter overlays these on the road graph at various positions/scales/rotations
  and scores how well the graph can trace the shape.

  Shapes are closed loops — the last point connects back to the first.
*/

/**
 * Generate points along a parametric function.
 */
function sampleParametric(fn, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push(fn(i / n));
  }
  return pts;
}

/**
 * Lego Heart — blocky/pixelated heart that embraces the street grid.
 * Only horizontal and vertical segments, no diagonals.
 * Looks intentional on a grid, not distorted.
 */
const LEGO_HEART = [
  // Top-left hump
  [0.0, 0.2],
  [-0.2, 0.2],
  [-0.2, 0.6],
  [-0.4, 0.6],
  [-0.4, 0.9],
  [-0.7, 0.9],
  [-0.7, 0.6],
  [-0.9, 0.6],
  [-0.9, 0.2],
  [-0.7, 0.2],
  [-0.7, -0.1],
  // Left side going down
  [-0.5, -0.1],
  [-0.5, -0.4],
  [-0.3, -0.4],
  [-0.3, -0.7],
  [-0.15, -0.7],
  [-0.15, -0.9],
  // Bottom point
  [0.0, -0.9],
  // Right side going up (mirror)
  [0.15, -0.9],
  [0.15, -0.7],
  [0.3, -0.7],
  [0.3, -0.4],
  [0.5, -0.4],
  [0.5, -0.1],
  [0.7, -0.1],
  // Top-right hump
  [0.7, 0.2],
  [0.9, 0.2],
  [0.9, 0.6],
  [0.7, 0.6],
  [0.7, 0.9],
  [0.4, 0.9],
  [0.4, 0.6],
  [0.2, 0.6],
  [0.2, 0.2],
  // Close back to start
  [0.0, 0.2],
];

/**
 * Lightning bolt — zigzag from top to bottom.
 */
const LIGHTNING = [
  [0.0, 1.0],
  [0.3, 0.5],
  [-0.1, 0.3],
  [0.4, -0.3],
  [-0.05, -0.1],
  [0.15, -1.0],
  [-0.25, -0.15],
  [-0.45, 0.3],
  [0.1, 0.35],
  [-0.25, 0.55],
  [0.0, 1.0],
];

/**
 * 5-pointed star.
 */
const STAR = sampleParametric((t) => {
  const angle = t * 2 * Math.PI - Math.PI / 2; // start from top
  // Alternate between outer and inner radius
  const n = Math.floor(t * 10) % 2;
  const r = n === 0 ? 1.0 : 0.4;
  const a = ((Math.floor(t * 10) + 0.5 * n) / 10) * 2 * Math.PI - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}, 10);

// Actually, let's define star as explicit points for clarity
const STAR_POINTS = (() => {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    // Outer point
    const outerAngle = (i * 72 - 90) * (Math.PI / 180);
    pts.push([Math.cos(outerAngle), Math.sin(outerAngle)]);
    // Inner point
    const innerAngle = ((i * 72 + 36) - 90) * (Math.PI / 180);
    pts.push([0.38 * Math.cos(innerAngle), 0.38 * Math.sin(innerAngle)]);
  }
  pts.push(pts[0]); // close
  return pts;
})();

/**
 * Circle — simplest shape, good baseline.
 */
const CIRCLE = sampleParametric((t) => {
  const angle = t * 2 * Math.PI;
  return [Math.cos(angle), Math.sin(angle)];
}, 24);

/**
 * Diamond — 45° rotated square. Clean on grid streets.
 */
const DIAMOND = [
  [0, 1],    // top
  [1, 0],    // right
  [0, -1],   // bottom
  [-1, 0],   // left
  [0, 1],    // close
];

// ─── Shape library ───────────────────────────────────────────────────

export const SHAPE_LIBRARY = [
  {
    key: "lego-heart",
    name: "Heart",
    icon: "♥",
    outline: LEGO_HEART,
    controlCount: 16, // number of control points for fitting
    distRange: [1500, 6000], // min/max total route distance in meters
  },
  {
    key: "lightning",
    name: "Lightning",
    icon: "⚡",
    outline: LIGHTNING,
    controlCount: 10,
    distRange: [1000, 5000],
  },
  {
    key: "star",
    name: "Star",
    icon: "⭐",
    outline: STAR_POINTS,
    controlCount: 10,
    distRange: [1500, 6000],
  },
  {
    key: "circle",
    name: "Loop",
    icon: "⭕",
    outline: CIRCLE,
    controlCount: 12,
    distRange: [1000, 5000],
  },
  {
    key: "diamond",
    name: "Diamond",
    icon: "◆",
    outline: DIAMOND,
    controlCount: 4,
    distRange: [800, 4000],
  },
];

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

/**
 * Pick evenly-spaced control points from an outline.
 */
export function pickControlPoints(outline, count) {
  if (outline.length <= count) return outline;

  const step = outline.length / count;
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push(outline[Math.floor(i * step)]);
  }
  return pts;
}
