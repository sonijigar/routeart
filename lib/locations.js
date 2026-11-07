/*
  Seattle neighborhoods offered in the app.
  Also used by scripts/fetch-fixtures.mjs and scripts/eval.mjs.
*/

export const LOCATIONS = {
  slu: {
    name: "South Lake Union",
    center: [47.6225, -122.3360],
  },
  capitolhill: {
    name: "Capitol Hill",
    center: [47.6250, -122.3220],
  },
  ballard: {
    name: "Ballard",
    center: [47.6685, -122.3850],
  },
  fremont: {
    name: "Fremont",
    center: [47.6510, -122.3500],
  },
};

// Road data radius fetched around each center
export const FETCH_RADIUS_KM = 2.5;

/**
 * The bundled neighborhood whose road data best covers a start point: the nearest
 * center, if the point is well inside its area. Null means no bundle covers it.
 */
export function bundleFor([lat, lng]) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.54;
  let best = null, bestKm = Infinity;
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    const km = Math.hypot((loc.center[1] - lng) * kx, (loc.center[0] - lat) * ky);
    if (km < bestKm) [best, bestKm] = [key, km];
  }
  return bestKm <= FETCH_RADIUS_KM * 0.6 ? best : null;
}
