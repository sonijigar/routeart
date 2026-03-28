/*
  Real Seattle SLU intersections as [lat, lng].
  Coordinates verified against Google Maps / OpenStreetMap.

  IMPORTANT: Lake Union's south shore is at approximately lat 47.627.
  All route coordinates must stay well below this latitude.

  Control points are placed ONLY at real street intersections.
  OSRM snaps each point to the nearest walkable road, then routes
  between consecutive points. Every segment should be ≤2 blocks
  to prevent OSRM from taking long detours.
*/

// ── E-W streets (south → north) ─────────────────────────────
const DENNY      = 47.6185;
const JOHN       = 47.6195;
const THOMAS     = 47.6205;
const HARRISON   = 47.6218;
const REPUBLICAN = 47.6228;
const MERCER     = 47.6245;
const ROY        = 47.6255;

// ── N-S avenues (west → east) ───────────────────────────────
const DEXTER   = -122.3435;
const EIGHTH   = -122.3405;
const NINTH    = -122.3370;
const TERRY    = -122.3345;
const PONTIUS  = -122.3330;
const BOREN    = -122.3315;
const YALE     = -122.3300;
const FAIRVIEW = -122.3285;
const MINOR    = -122.3265;

export const SLU_CENTER = [47.623, -122.336];
export const SLU_ZOOM = 15;

export const SLU_ROADS = {
  ew: [
    { label: "Denny Way",      lat: DENNY,      w: DEXTER, e: MINOR,    major: true },
    { label: "John St",        lat: JOHN,       w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Thomas St",      lat: THOMAS,     w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Harrison St",    lat: HARRISON,   w: DEXTER, e: FAIRVIEW, major: true },
    { label: "Republican St",  lat: REPUBLICAN, w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Mercer St",      lat: MERCER,     w: DEXTER, e: MINOR,    major: true },
    { label: "Roy St",         lat: ROY,        w: DEXTER, e: FAIRVIEW, major: false },
  ],
  ns: [
    { label: "Dexter Ave N",    lng: DEXTER,   s: DENNY, n: ROY,    major: true },
    { label: "8th Ave N",       lng: EIGHTH,   s: DENNY, n: ROY,    major: false },
    { label: "9th Ave N",       lng: NINTH,    s: DENNY, n: ROY,    major: false },
    { label: "Terry Ave N",     lng: TERRY,    s: DENNY, n: MERCER, major: true },
    { label: "Pontius Ave N",   lng: PONTIUS,  s: DENNY, n: ROY,    major: false },
    { label: "Boren Ave N",     lng: BOREN,    s: DENNY, n: MERCER, major: false },
    { label: "Yale Ave N",      lng: YALE,     s: DENNY, n: MERCER, major: false },
    { label: "Fairview Ave N",  lng: FAIRVIEW, s: DENNY, n: ROY,    major: true },
    { label: "Minor Ave N",     lng: MINOR,    s: DENNY, n: MERCER, major: false },
  ],
};

export const ROUTES = {
  heart: {
    name: "Heart",
    dist: "2.5 mi",
    time: "~25 min",
    start: "Denny Way & Terry Ave N",
    startCoord: [DENNY, TERRY],
    turns: [
      { icon: "▲", text: "Start at Denny Way & Terry Ave N — head west on Denny Way" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading north" },
      { icon: "↰", text: "Turn left onto John St heading west to 8th Ave N" },
      { icon: "↱", text: "Turn right onto 8th Ave N heading north" },
      { icon: "↰", text: "Turn left onto Thomas St heading west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north to Roy St" },
      { icon: "↱", text: "Turn right onto Roy St heading east past 8th to 9th Ave N" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading south to Mercer St" },
      { icon: "↰", text: "Turn left onto Mercer St heading east to Pontius Ave N" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading north to Roy St" },
      { icon: "↱", text: "Turn right onto Roy St heading east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south to Mercer St" },
      { icon: "↱", text: "Turn right onto Mercer St heading west to Yale Ave N" },
      { icon: "↰", text: "Turn left onto Yale Ave N heading south to Harrison St" },
      { icon: "↱", text: "Turn right onto Harrison St heading west to Boren Ave N" },
      { icon: "↰", text: "Turn left onto Boren Ave N heading south to Thomas St" },
      { icon: "↱", text: "Turn right onto Thomas St heading west to Pontius Ave N" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading south to John St" },
      { icon: "↱", text: "Turn right onto John St heading west to Terry Ave N" },
      { icon: "↰", text: "Turn left onto Terry Ave N heading south to Denny Way" },
      { icon: "■", text: "Arrive back at Denny Way & Terry Ave N" },
    ],
    /*
      Heart outline — ALL ON LAND, lobes at Roy St level.

      Every segment is ≤2 blocks to prevent OSRM detours.
      Intermediate waypoints added on long runs.

      Left lobe:  DEXTER → 9TH at Roy
      Right lobe: PONTIUS → FAIRVIEW at Roy
      V-notch:    drops from Roy → Mercer at center
    */
    coords: [
      // ── Bottom point ──
      [DENNY, TERRY],

      // ── Left staircase up (each segment = 1 block) ──
      [DENNY, NINTH],             // W on Denny: Terry → 9th
      [JOHN, NINTH],              // N on 9th: Denny → John
      [JOHN, EIGHTH],             // W on John: 9th → 8th
      [THOMAS, EIGHTH],           // N on 8th: John → Thomas
      [THOMAS, DEXTER],           // W on Thomas: 8th → Dexter
      [HARRISON, DEXTER],         // N on Dexter: Thomas → Harrison (1 block)
      [MERCER, DEXTER],           // N on Dexter: Harrison → Mercer (2 blocks via Republican)
      [ROY, DEXTER],              // N on Dexter: Mercer → Roy (1 block)

      // ── Left lobe top (1 block per hop) ──
      [ROY, EIGHTH],              // E on Roy: Dexter → 8th
      [ROY, NINTH],               // E on Roy: 8th → 9th

      // ── V-notch ──
      [MERCER, NINTH],            // S on 9th: Roy → Mercer
      [MERCER, TERRY],            // E on Mercer: 9th → Terry (intermediate)
      [MERCER, PONTIUS],          // E on Mercer: Terry → Pontius

      // ── Right lobe (1 block per hop) ──
      [ROY, PONTIUS],             // N on Pontius: Mercer → Roy
      [ROY, FAIRVIEW],            // E on Roy: Pontius → Fairview

      // ── Right staircase down (1 block per hop) ──
      [MERCER, FAIRVIEW],         // S on Fairview: Roy → Mercer
      [MERCER, YALE],             // W on Mercer: Fairview → Yale
      [REPUBLICAN, YALE],         // S on Yale: Mercer → Republican (intermediate)
      [HARRISON, YALE],           // S on Yale: Republican → Harrison
      [HARRISON, BOREN],          // W on Harrison: Yale → Boren
      [THOMAS, BOREN],            // S on Boren: Harrison → Thomas
      [THOMAS, PONTIUS],          // W on Thomas: Boren → Pontius
      [JOHN, PONTIUS],            // S on Pontius: Thomas → John
      [JOHN, TERRY],              // W on John: Pontius → Terry

      // ── Close loop ──
      [DENNY, TERRY],             // S on Terry: John → Denny
    ],
  },

  lightning: {
    name: "Lightning",
    dist: "2.7 mi",
    time: "~27 min",
    start: "Dexter Ave N & Roy St",
    startCoord: [ROY, DEXTER],
    turns: [
      { icon: "▲", text: "Start at Dexter Ave N & Roy St — head east on Roy St" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading south to Mercer St" },
      { icon: "↱", text: "Turn right onto Mercer St heading west to Dexter Ave N" },
      { icon: "↰", text: "Turn left onto Dexter Ave N heading south to Harrison St" },
      { icon: "↰", text: "Turn left onto Harrison St heading east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north back to Roy St" },
      { icon: "■", text: "Arrive back at Dexter Ave N & Roy St" },
    ],
    /*
      Lightning bolt ⚡ — expanding zigzag.

      Every segment ≤2 blocks with intermediate waypoints
      on long E-W and N-S runs to constrain OSRM routing.
    */
    coords: [
      // ── Narrow top bar (1 block per hop) ──
      [ROY, DEXTER],
      [ROY, EIGHTH],              // E on Roy: Dexter → 8th
      [ROY, NINTH],               // E on Roy: 8th → 9th

      // ── Down to Mercer (1 block) ──
      [MERCER, NINTH],            // S on 9th: Roy → Mercer

      // ── Zag left on Mercer (1 block per hop) ──
      [MERCER, EIGHTH],           // W on Mercer: 9th → 8th
      [MERCER, DEXTER],           // W on Mercer: 8th → Dexter

      // ── Down to Harrison (with intermediate) ──
      [REPUBLICAN, DEXTER],       // S on Dexter: Mercer → Republican
      [HARRISON, DEXTER],         // S on Dexter: Republican → Harrison

      // ── Wide zag right on Harrison (1 block per hop) ──
      [HARRISON, EIGHTH],         // E on Harrison: Dexter → 8th
      [HARRISON, NINTH],          // E on Harrison: 8th → 9th
      [HARRISON, TERRY],          // E on Harrison: 9th → Terry
      [HARRISON, PONTIUS],        // E on Harrison: Terry → Pontius
      [HARRISON, BOREN],          // E on Harrison: Pontius → Boren
      [HARRISON, YALE],           // E on Harrison: Boren → Yale
      [HARRISON, FAIRVIEW],       // E on Harrison: Yale → Fairview

      // ── Down to Denny (with intermediates) ──
      [THOMAS, FAIRVIEW],         // S on Fairview: Harrison → Thomas
      [JOHN, FAIRVIEW],           // S on Fairview: Thomas → John
      [DENNY, FAIRVIEW],          // S on Fairview: John → Denny

      // ── Bottom bar west (1 block per hop) ──
      [DENNY, YALE],              // W on Denny: Fairview → Yale
      [DENNY, BOREN],             // W on Denny: Yale → Boren
      [DENNY, PONTIUS],           // W on Denny: Boren → Pontius
      [DENNY, TERRY],             // W on Denny: Pontius → Terry
      [DENNY, NINTH],             // W on Denny: Terry → 9th
      [DENNY, EIGHTH],            // W on Denny: 9th → 8th
      [DENNY, DEXTER],            // W on Denny: 8th → Dexter

      // ── Return up left edge (with intermediates) ──
      [JOHN, DEXTER],             // N on Dexter: Denny → John
      [THOMAS, DEXTER],           // N on Dexter: John → Thomas
      [HARRISON, DEXTER],         // N on Dexter: Thomas → Harrison
      [REPUBLICAN, DEXTER],       // N on Dexter: Harrison → Republican
      [MERCER, DEXTER],           // N on Dexter: Republican → Mercer
      [ROY, DEXTER],              // N on Dexter: Mercer → Roy (finish)
    ],
  },
};
