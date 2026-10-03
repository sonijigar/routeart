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
