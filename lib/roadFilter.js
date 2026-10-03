/*
  Which OSM ways each activity may use.

  Overpass fetches a superset (HIGHWAY_TYPES); usableFor() decides per activity.
  Explicit mode tags (foot=* / bicycle=*) win over the generic access=* tag,
  matching OSM tagging semantics.
*/

export const ACTIVITIES = ["run", "walk", "ride"];

export const HIGHWAY_TYPES = [
  "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "unclassified", "residential",
  "living_street", "service", "pedestrian", "footway", "path",
  "cycleway", "track", "steps",
];

const HIGHWAY_SET = new Set(HIGHWAY_TYPES);
const ALLOWED = new Set(["yes", "designated", "permissive"]);
const FORBIDDEN = new Set(["no", "private"]);

// Parking aisles and driveways add noise without being useful route segments
const SKIP_SERVICE = new Set(["parking_aisle", "driveway", "drive-through", "emergency_access"]);

// Separately mapped sidewalks/crossings run parallel to the street centerline,
// which is already in the graph — they only create duplicate near-parallel paths
const SKIP_FOOTWAY = new Set(["sidewalk", "crossing"]);

/**
 * Can this way be used for the given activity?
 *
 * @param {object} tags - OSM way tags
 * @param {"run"|"walk"|"ride"} activity
 */
export function usableFor(tags = {}, activity = "run") {
  const hw = tags.highway;
  if (!HIGHWAY_SET.has(hw)) return false;
  if (tags.area === "yes") return false;
  if (hw === "service" && SKIP_SERVICE.has(tags.service)) return false;
  if (hw === "footway" && SKIP_FOOTWAY.has(tags.footway)) return false;

  const ride = activity === "ride";
  const modeTag = ride ? tags.bicycle : tags.foot;
  if (ALLOWED.has(modeTag)) return true;
  if (FORBIDDEN.has(modeTag)) return false;
  if (FORBIDDEN.has(tags.access)) return false;

  if (ride) {
    if (modeTag === "dismount") return false;
    // Footways, pedestrian streets and stairs need an explicit bicycle=yes (handled above)
    if (hw === "steps" || hw === "footway" || hw === "pedestrian") return false;
  }
  return true;
}

/**
 * One-way direction for this activity: 1 = along node order, -1 = against, 0 = both ways.
 * Only riders are bound by one-way streets.
 */
export function onewayFor(tags = {}, activity = "run") {
  if (activity !== "ride") return 0;
  if (tags["oneway:bicycle"] === "no") return 0;
  if (tags.oneway === "yes" || tags.oneway === "true" || tags.oneway === "1") return 1;
  if (tags.oneway === "-1") return -1;
  return 0;
}
