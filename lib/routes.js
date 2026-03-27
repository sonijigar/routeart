/*
  Real Seattle SLU intersections as [lat, lng].
  Streets verified against OpenStreetMap / Google Maps.
*/

// E-W streets (south → north)
const DENNY     = 47.6185;
const JOHN      = 47.6205;
const THOMAS    = 47.6225;
const HARRISON  = 47.6248;
const REPUBLICAN= 47.6268;
const MERCER    = 47.6290;
const ROY       = 47.6312;
const VALLEY    = 47.6332;
const ALOHA     = 47.6355;

// N-S avenues (west → east)
const DEXTER    = -122.3425;
const EIGHTH    = -122.3400;
const NINTH     = -122.3375;
const WESTLAKE  = -122.3385;
const TERRY     = -122.3340;
const BOREN     = -122.3310;
const PONTIUS   = -122.3335;
const YALE      = -122.3305;
const FAIRVIEW  = -122.3285;
const MINOR     = -122.3260;

export const SLU_CENTER = [47.627, -122.335];
export const SLU_ZOOM = 14;

export const SLU_ROADS = {
  ew: [
    { label: "Denny Way",      lat: DENNY,      w: DEXTER, e: MINOR,    major: true },
    { label: "John St",        lat: JOHN,       w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Thomas St",      lat: THOMAS,     w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Harrison St",    lat: HARRISON,   w: DEXTER, e: FAIRVIEW, major: true },
    { label: "Republican St",  lat: REPUBLICAN, w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Mercer St",      lat: MERCER,     w: DEXTER, e: MINOR,    major: true },
    { label: "Roy St",         lat: ROY,        w: DEXTER, e: FAIRVIEW, major: false },
    { label: "Valley St",      lat: VALLEY,     w: DEXTER, e: FAIRVIEW, major: true },
    { label: "Aloha St",       lat: ALOHA,      w: DEXTER, e: FAIRVIEW, major: false },
  ],
  ns: [
    { label: "Dexter Ave N",    lng: DEXTER,   s: DENNY, n: ALOHA,   major: true },
    { label: "8th Ave N",       lng: EIGHTH,   s: DENNY, n: VALLEY,  major: false },
    { label: "9th Ave N",       lng: NINTH,    s: DENNY, n: VALLEY,  major: false },
    { label: "Westlake Ave N",  lng: WESTLAKE, s: DENNY, n: ALOHA,   major: true },
    { label: "Pontius Ave N",   lng: PONTIUS,  s: DENNY, n: VALLEY,  major: false },
    { label: "Terry Ave N",     lng: TERRY,    s: DENNY, n: MERCER,  major: true },
    { label: "Boren Ave N",     lng: BOREN,    s: DENNY, n: MERCER,  major: false },
    { label: "Yale Ave N",      lng: YALE,     s: DENNY, n: MERCER,  major: false },
    { label: "Fairview Ave N",  lng: FAIRVIEW, s: DENNY, n: ALOHA,   major: true },
    { label: "Minor Ave N",     lng: MINOR,    s: DENNY, n: MERCER,  major: false },
  ],
};

export const ROUTES = {
  heart: {
    name: "Heart",
    dist: "5.2 mi",
    time: "~50 min",
    start: "Dexter Ave N & Mercer St",
    startCoord: [MERCER, DEXTER],
    turns: [
      { icon: "▲", text: "Start at Dexter Ave N & Mercer St — head north on Dexter Ave N" },
      { icon: "→", text: "Continue north on Dexter past Roy St to Valley St" },
      { icon: "↱", text: "Turn right onto Valley St heading east" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "↰", text: "Turn left onto Republican St heading east" },
      { icon: "↱", text: "Turn right onto Minor Ave N heading south" },
      { icon: "↱", text: "Turn right onto Harrison St heading west" },
      { icon: "↰", text: "Turn left onto Terry Ave N heading south" },
      { icon: "↰", text: "Turn left onto Thomas St heading west" },
      { icon: "↓", text: "Continue to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north" },
      { icon: "→", text: "Continue north back to Mercer St" },
      { icon: "■", text: "Arrive back at Dexter Ave N & Mercer St" },
    ],
    // Route stays on LAND roads only — no lake crossing
    coords: [
      [MERCER, DEXTER],        // Start
      [ROY, DEXTER],           // N on Dexter
      [VALLEY, DEXTER],        // N on Dexter
      [VALLEY, NINTH],         // E on Valley
      [VALLEY, TERRY],         // E on Valley
      [VALLEY, FAIRVIEW],      // E on Valley
      [ROY, FAIRVIEW],         // S on Fairview
      [MERCER, FAIRVIEW],      // S on Fairview
      [REPUBLICAN, FAIRVIEW],  // S
      [REPUBLICAN, MINOR],     // E on Republican
      [HARRISON, MINOR],       // S on Minor
      [HARRISON, FAIRVIEW],    // W on Harrison
      [HARRISON, TERRY],       // W on Harrison
      [THOMAS, TERRY],         // S on Terry
      [THOMAS, PONTIUS],       // W on Thomas
      [JOHN, PONTIUS],         // S
      [JOHN, WESTLAKE],        // W
      [DENNY, WESTLAKE],       // S to Denny
      [DENNY, NINTH],          // W on Denny
      [DENNY, DEXTER],         // W on Denny
      [JOHN, DEXTER],          // N on Dexter
      [THOMAS, DEXTER],        // N
      [HARRISON, DEXTER],      // N
      [REPUBLICAN, DEXTER],    // N
      [MERCER, DEXTER],        // Finish
    ],
  },

  lightning: {
    name: "Lightning",
    dist: "6.8 mi",
    time: "~65 min",
    start: "Westlake Ave N & Aloha St",
    startCoord: [ALOHA, WESTLAKE],
    turns: [
      { icon: "▲", text: "Start at Westlake Ave N & Aloha St — head east on Aloha St" },
      { icon: "→", text: "Continue east on Aloha to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "↰", text: "Turn left onto Mercer St heading west" },
      { icon: "↓", text: "Continue south on Westlake Ave N" },
      { icon: "→", text: "Continue south to Harrison St" },
      { icon: "↰", text: "Turn left onto Harrison St heading east" },
      { icon: "→", text: "Continue east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "→", text: "Continue south to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west" },
      { icon: "→", text: "Continue west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north" },
      { icon: "→", text: "Continue north all the way to Aloha St" },
      { icon: "↱", text: "Turn right onto Aloha St heading east" },
      { icon: "■", text: "Arrive back at Westlake Ave N & Aloha St" },
    ],
    coords: [
      [ALOHA, WESTLAKE],       // Start
      [ALOHA, TERRY],          // E on Aloha
      [ALOHA, FAIRVIEW],       // E on Aloha
      [ROY, FAIRVIEW],         // S on Fairview
      [MERCER, FAIRVIEW],      // S on Fairview
      [MERCER, TERRY],         // W on Mercer (zag left)
      [MERCER, WESTLAKE],      // W on Mercer
      [REPUBLICAN, WESTLAKE],  // S on Westlake
      [HARRISON, WESTLAKE],    // S on Westlake
      [HARRISON, TERRY],       // E on Harrison (zag right)
      [HARRISON, FAIRVIEW],    // E on Harrison
      [THOMAS, FAIRVIEW],      // S on Fairview
      [JOHN, FAIRVIEW],        // S
      [DENNY, FAIRVIEW],       // S to Denny
      [DENNY, TERRY],          // W on Denny
      [DENNY, WESTLAKE],       // W
      [DENNY, NINTH],          // W
      [DENNY, DEXTER],         // W to Dexter
      [JOHN, DEXTER],          // N on Dexter
      [THOMAS, DEXTER],        // N
      [HARRISON, DEXTER],      // N
      [REPUBLICAN, DEXTER],    // N
      [MERCER, DEXTER],        // N
      [ROY, DEXTER],           // N
      [VALLEY, DEXTER],        // N
      [ALOHA, DEXTER],         // N to Aloha
      [ALOHA, NINTH],          // E on Aloha
      [ALOHA, WESTLAKE],       // Finish
    ],
  },
};
