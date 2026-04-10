/*
  Shape template library.

  Each shape is defined as a normalized point sequence in [-1, 1] range.
  The fitter overlays these on the road graph at various positions/scales/rotations
  and scores how well the graph can trace the shape.

  Shapes are closed loops — the last point connects back to the first.

  Design principles (learned from real Strava art):
  - Shapes must be BIG — spanning 20-40+ city blocks (1-2km radius)
  - Grid cities need pixel-art/staircase patterns (only H/V segments)
  - Hearts are the easiest and most popular GPS art shape
  - Simple, bold shapes with clear silhouettes work best
  - Distance ranges should be loose (2-15 miles)
*/

/**
 * Pixel Heart — large, high-res staircase heart.
 * Designed to span 20+ blocks on a grid street network.
 * Every segment is horizontal or vertical — no diagonals.
 * The shape IS the grid; distortion is impossible.
 *
 * Proportions: wide at top (~1.9 units), pointed at bottom.
 * Two clearly separated bumps with a center dip.
 */
const PIXEL_HEART = [
  // Start at top-center dip, go left (counterclockwise around left bump)
  [0.0, 0.35],
  [-0.15, 0.35], [-0.15, 0.6],
  [-0.3, 0.6],   [-0.3, 0.8],
  [-0.5, 0.8],   [-0.5, 0.9],
  [-0.7, 0.9],
  // Top of left bump → descend left side
  [-0.7, 0.7],
  [-0.85, 0.7],  [-0.85, 0.45],
  [-0.95, 0.45], [-0.95, 0.15],
  // Left side descending staircase
  [-0.85, 0.15], [-0.85, -0.1],
  [-0.7, -0.1],  [-0.7, -0.3],
  [-0.55, -0.3], [-0.55, -0.5],
  [-0.4, -0.5],  [-0.4, -0.65],
  [-0.25, -0.65],[-0.25, -0.8],
  [-0.12, -0.8], [-0.12, -0.92],
  // Bottom point
  [0.0, -0.92],
  // Right side ascending staircase (mirror)
  [0.12, -0.92], [0.12, -0.8],
  [0.25, -0.8],  [0.25, -0.65],
  [0.4, -0.65],  [0.4, -0.5],
  [0.55, -0.5],  [0.55, -0.3],
  [0.7, -0.3],   [0.7, -0.1],
  [0.85, -0.1],  [0.85, 0.15],
  // Right side → top of right bump
  [0.95, 0.15],  [0.95, 0.45],
  [0.85, 0.45],  [0.85, 0.7],
  [0.7, 0.7],
  // Top of right bump → descend to center dip
  [0.7, 0.9],
  [0.5, 0.9],    [0.5, 0.8],
  [0.3, 0.8],    [0.3, 0.6],
  [0.15, 0.6],   [0.15, 0.35],
  // Close
  [0.0, 0.35],
];

/**
 * Arrow pointing up — bold, recognizable, grid-native.
 * Wide arrowhead with staircase edges + straight shaft.
 */
const ARROW_UP = [
  // Start at shaft bottom-left, going up
  [-0.15, -0.95],
  [-0.15, -0.05],
  // Arrowhead left wing
  [-0.55, -0.05], [-0.55, 0.15],
  [-0.45, 0.15],  [-0.45, 0.35],
  [-0.35, 0.35],  [-0.35, 0.5],
  [-0.2, 0.5],    [-0.2, 0.7],
  [-0.1, 0.7],    [-0.1, 0.85],
  // Tip
  [0.0, 0.85],    [0.0, 0.95],
  // Arrowhead right wing (mirror)
  [0.1, 0.85],    [0.1, 0.7],
  [0.2, 0.7],     [0.2, 0.5],
  [0.35, 0.5],    [0.35, 0.35],
  [0.45, 0.35],   [0.45, 0.15],
  [0.55, 0.15],   [0.55, -0.05],
  // Shaft right side going down
  [0.15, -0.05],
  [0.15, -0.95],
  // Close (bottom of shaft)
  [-0.15, -0.95],
];

/**
 * Cross / Plus — the most grid-native shape possible.
 * Every single line segment is perfectly horizontal or vertical.
 * Impossible to distort on a grid.
 */
const CROSS = [
  // Start at top-left of vertical bar, going clockwise
  [-0.2, 0.95],
  [0.2, 0.95],
  // Top-right corner → right arm
  [0.2, 0.2],
  [0.95, 0.2],
  [0.95, -0.2],
  // Right arm → bottom of vertical bar
  [0.2, -0.2],
  [0.2, -0.95],
  [-0.2, -0.95],
  // Bottom → left arm
  [-0.2, -0.2],
  [-0.95, -0.2],
  [-0.95, 0.2],
  // Left arm → back to top
  [-0.2, 0.2],
  [-0.2, 0.95],
];

/**
 * Lightning bolt — redesigned as grid-native staircase zigzag.
 * Bold zigzag pattern, all horizontal/vertical segments.
 */
const PIXEL_LIGHTNING = [
  // Top section
  [-0.3, 0.95],
  [0.5, 0.95],
  [0.5, 0.7],
  [0.15, 0.7],
  [0.15, 0.45],
  // Middle section
  [0.55, 0.45],
  [0.55, 0.2],
  [0.2, 0.2],
  [0.2, -0.05],
  // Lower section
  [0.45, -0.05],
  [0.45, -0.3],
  [0.1, -0.3],
  [0.1, -0.55],
  // Bolt point
  [0.3, -0.55],
  [0.3, -0.8],
  [0.0, -0.8],
  [0.0, -0.95],
  [-0.15, -0.95],
  // Ascending back (left side)
  [-0.15, -0.7],
  [-0.4, -0.7],
  [-0.4, -0.45],
  [-0.05, -0.45],
  [-0.05, -0.2],
  [-0.4, -0.2],
  [-0.4, 0.05],
  [-0.05, 0.05],
  [-0.05, 0.3],
  [-0.45, 0.3],
  [-0.45, 0.55],
  [-0.1, 0.55],
  [-0.1, 0.75],
  [-0.3, 0.75],
  [-0.3, 0.95],
];

/**
 * 5-pointed star with deeper insets for more recognizable silhouette.
 */
const STAR_OUTLINE = (() => {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    // Outer point
    const outerAngle = (i * 72 - 90) * (Math.PI / 180);
    pts.push([Math.cos(outerAngle), Math.sin(outerAngle)]);
    // Inner point (deeper inset for more recognizable star)
    const innerAngle = ((i * 72 + 36) - 90) * (Math.PI / 180);
    pts.push([0.35 * Math.cos(innerAngle), 0.35 * Math.sin(innerAngle)]);
  }
  pts.push(pts[0]); // close
  return pts;
})();

/**
 * House — square base with staircase triangle roof.
 * The quintessential "draw a house" shape, extremely grid-friendly.
 */
const HOUSE = [
  // Start at bottom-left, going clockwise
  [-0.7, -0.9],
  // Bottom edge
  [0.7, -0.9],
  // Right wall
  [0.7, 0.1],
  // Roof right eave
  [0.9, 0.1],
  // Roof right slope (staircase)
  [0.9, 0.25],
  [0.7, 0.25], [0.7, 0.4],
  [0.5, 0.4],  [0.5, 0.55],
  [0.3, 0.55], [0.3, 0.7],
  [0.15, 0.7], [0.15, 0.85],
  // Peak
  [0.0, 0.85], [0.0, 0.95],
  // Roof left slope (mirror)
  [-0.15, 0.85], [-0.15, 0.7],
  [-0.3, 0.7],   [-0.3, 0.55],
  [-0.5, 0.55],  [-0.5, 0.4],
  [-0.7, 0.4],   [-0.7, 0.25],
  [-0.9, 0.25],
  // Roof left eave
  [-0.9, 0.1],
  // Left wall
  [-0.7, 0.1],
  [-0.7, -0.9],
];

/**
 * Smiley face — circular outline (popular GPS art shape).
 */
const SMILEY = (() => {
  const pts = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI;
    pts.push([Math.cos(angle) * 0.95, Math.sin(angle) * 0.95]);
  }
  pts.push(pts[0]); // close
  return pts;
})();

// ─── Shape library ───────────────────────────────────────────────────

export const SHAPE_LIBRARY = [
  {
    key: "pixel-heart",
    name: "Heart",
    icon: "♥",
    outline: PIXEL_HEART,
    controlCount: 24,  // many control points for accurate tracing
    distRange: [3000, 25000], // ~2-15 miles — loose range
  },
  {
    key: "arrow",
    name: "Arrow",
    icon: "↑",
    outline: ARROW_UP,
    controlCount: 18,
    distRange: [2500, 20000],
  },
  {
    key: "cross",
    name: "Cross",
    icon: "✚",
    outline: CROSS,
    controlCount: 12,
    distRange: [3000, 22000],
  },
  {
    key: "star",
    name: "Star",
    icon: "⭐",
    outline: STAR_OUTLINE,
    controlCount: 10,
    distRange: [3000, 22000],
  },
  {
    key: "lightning",
    name: "Lightning",
    icon: "⚡",
    outline: PIXEL_LIGHTNING,
    controlCount: 20,
    distRange: [3000, 25000],
  },
  {
    key: "house",
    name: "House",
    icon: "🏠",
    outline: HOUSE,
    controlCount: 16,
    distRange: [3000, 22000],
  },
  {
    key: "smiley",
    name: "Loop",
    icon: "⭕",
    outline: SMILEY,
    controlCount: 14,
    distRange: [2500, 20000],
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
