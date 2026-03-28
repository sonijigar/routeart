/*
  Shape definitions as parametric curves.

  Each shape is a function that takes parameter t ∈ [0, 1]
  and returns [x, y] in normalized coordinates (-1 to 1 range).
  The curve is then scaled and positioned on the map.
*/

/**
 * Parametric heart curve.
 * Classic heart equation scaled to [-1, 1] range.
 */
function heartCurve(t) {
  const angle = t * 2 * Math.PI;
  // Standard heart parametric equations
  const x = 16 * Math.sin(angle) ** 3;
  const y =
    13 * Math.cos(angle) -
    5 * Math.cos(2 * angle) -
    2 * Math.cos(3 * angle) -
    Math.cos(4 * angle);
  // Normalize to ~[-1, 1] range (max x=16, max y~17)
  return [x / 17, y / 17];
}

/**
 * Lightning bolt as a piecewise linear path.
 * Zigzag from top to bottom, getting wider.
 */
function lightningCurve(t) {
  // Define lightning as waypoints in normalized space
  // Top-center to bottom, zigzagging wider
  const pts = [
    [0.0, 1.0],    // top center
    [0.3, 0.6],    // right jag
    [-0.15, 0.3],  // left jag
    [0.5, -0.2],   // wider right jag
    [-0.1, -0.2],  // arrow left
    [0.15, -1.0],  // bottom point
    [-0.3, -0.2],  // arrow right (return start)
    [-0.5, 0.2],   // wider left going up
    [0.15, 0.3],   // cross back right
    [-0.3, 0.6],   // left jag up
    [0.0, 1.0],    // close at top
  ];

  // Interpolate along the piecewise path
  const totalPts = pts.length - 1;
  const idx = t * totalPts;
  const i = Math.min(Math.floor(idx), totalPts - 1);
  const frac = idx - i;
  const a = pts[i];
  const b = pts[i + 1];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

const SHAPE_CURVES = {
  heart: heartCurve,
  lightning: lightningCurve,
};

/**
 * Sample a shape curve into GPS coordinates.
 *
 * @param {string} shapeKey - "heart" or "lightning"
 * @param {[number,number]} center - [lat, lng] center point
 * @param {number} radiusMeters - approximate radius in meters
 * @param {number} numPoints - number of sample points along the curve
 * @returns {{ coords: [number,number][], name: string }}
 */
export function sampleShape(shapeKey, center, radiusMeters = 500, numPoints = 30) {
  const curveFn = SHAPE_CURVES[shapeKey];
  if (!curveFn) throw new Error(`Unknown shape: ${shapeKey}`);

  // Convert radius from meters to degrees
  // lat: 1° ≈ 111,000m
  // lng: 1° ≈ 111,000m * cos(lat)
  const latRadius = radiusMeters / 111000;
  const lngRadius = radiusMeters / (111000 * Math.cos((center[0] * Math.PI) / 180));

  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const [x, y] = curveFn(t);
    coords.push([
      center[0] + y * latRadius,  // y maps to latitude (north-south)
      center[1] + x * lngRadius,  // x maps to longitude (east-west)
    ]);
  }

  return coords;
}

export const SHAPES = {
  heart: {
    name: "Heart",
    icon: "♥",
    // Center of SLU, slightly south to keep away from lake
    center: [47.6215, -122.3360],
    radius: 450,
    numPoints: 36,
  },
  lightning: {
    name: "Lightning",
    icon: "⚡",
    center: [47.6220, -122.3360],
    radius: 450,
    numPoints: 30,
  },
};
