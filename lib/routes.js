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
    dist: "3.6 mi",
    time: "~35 min",
    start: "Denny Way & Terry Ave N",
    startCoord: [DENNY, TERRY],
    turns: [
      { icon: "▲", text: "Start at Denny Way & Terry Ave N — head west on Denny Way" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading north" },
      { icon: "↰", text: "Turn left onto John St heading west" },
      { icon: "↱", text: "Turn right onto Westlake Ave N heading north" },
      { icon: "↰", text: "Turn left onto Thomas St heading west" },
      { icon: "↱", text: "Turn right onto 8th Ave N heading north" },
      { icon: "↰", text: "Turn left onto Harrison St heading west" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north" },
      { icon: "→", text: "Continue north on Dexter to Valley St" },
      { icon: "↱", text: "Turn right onto Valley St heading east" },
      { icon: "→", text: "Continue east past 8th Ave, Westlake to 9th Ave N" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading south" },
      { icon: "↰", text: "Turn left onto Roy St heading east" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading north" },
      { icon: "↱", text: "Turn right onto Valley St heading east" },
      { icon: "→", text: "Continue east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "→", text: "Continue south to Harrison St" },
      { icon: "↱", text: "Turn right onto Harrison St heading west" },
      { icon: "↰", text: "Turn left onto Yale Ave N heading south" },
      { icon: "↱", text: "Turn right onto Thomas St heading west" },
      { icon: "↰", text: "Turn left onto Boren Ave N heading south" },
      { icon: "↱", text: "Turn right onto John St heading west" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading south" },
      { icon: "→", text: "Continue south to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west" },
      { icon: "■", text: "Arrive back at Denny Way & Terry Ave N" },
    ],
    /*
      Heart outline traced counterclockwise from bottom point.

      Left side staircase (bottom → top-left):
        TERRY → 9TH → WESTLAKE → 8TH → DEXTER
        Each step goes 1 block west + 1 block north.

      Left lobe top: DEXTER → 8TH → WESTLAKE → 9TH along Valley St

      V-notch: drop from Valley to Roy, cross from 9TH → PONTIUS

      Right lobe top: PONTIUS → FAIRVIEW along Valley St

      Right side staircase (top-right → bottom):
        FAIRVIEW → YALE → BOREN → PONTIUS → TERRY
        Mirror of left side.

      Both lobes have ~equal width at Valley St:
        Left:  DEXTER to 9TH  ≈ 380m
        Right: PONTIUS to FAIRVIEW ≈ 380m
    */
    coords: [
      // Bottom point
      [DENNY, TERRY],          // Start — bottom center

      // Left staircase (widening upward)
      [DENNY, NINTH],          // W on Denny
      [JOHN, NINTH],           // N on 9th
      [JOHN, WESTLAKE],        // W on John
      [THOMAS, WESTLAKE],      // N on Westlake
      [THOMAS, EIGHTH],        // W on Thomas
      [HARRISON, EIGHTH],      // N on 8th
      [HARRISON, DEXTER],      // W on Harrison

      // Left edge going up to top
      [VALLEY, DEXTER],        // N on Dexter (4 blocks to Valley)

      // Left lobe top
      [VALLEY, EIGHTH],        // E on Valley
      [VALLEY, WESTLAKE],      // E on Valley
      [VALLEY, NINTH],         // E on Valley — inner left

      // V-notch between lobes
      [ROY, NINTH],            // S on 9th — drop into V
      [ROY, PONTIUS],          // E on Roy — cross V bottom

      // Right lobe
      [VALLEY, PONTIUS],       // N on Pontius — back up
      [VALLEY, FAIRVIEW],      // E on Valley — top right

      // Right edge going down
      [HARRISON, FAIRVIEW],    // S on Fairview (4 blocks to Harrison)

      // Right staircase (narrowing downward)
      [HARRISON, YALE],        // W on Harrison
      [THOMAS, YALE],          // S on Yale
      [THOMAS, BOREN],         // W on Thomas
      [JOHN, BOREN],           // S on Boren
      [JOHN, PONTIUS],         // W on John
      [DENNY, PONTIUS],        // S on Pontius

      // Close back to bottom point
      [DENNY, TERRY],          // W on Denny — Finish
    ],
  },

  lightning: {
    name: "Lightning",
    dist: "5.0 mi",
    time: "~48 min",
    start: "Dexter Ave N & Aloha St",
    startCoord: [ALOHA, DEXTER],
    turns: [
      { icon: "▲", text: "Start at Dexter Ave N & Aloha St — head east on Aloha St" },
      { icon: "→", text: "Continue east on Aloha to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "↰", text: "Turn left onto Valley St heading west" },
      { icon: "→", text: "Continue west to 9th Ave N" },
      { icon: "↰", text: "Turn left onto 9th Ave N heading south" },
      { icon: "↱", text: "Turn right onto Roy St heading west" },
      { icon: "→", text: "Continue west to Dexter Ave N" },
      { icon: "↰", text: "Turn left onto Dexter Ave N heading south" },
      { icon: "→", text: "Continue south on Dexter to Denny Way" },
      { icon: "↰", text: "Turn left onto Denny Way heading east" },
      { icon: "→", text: "Continue east on Denny to Fairview Ave N" },
      { icon: "↰", text: "Turn left onto Fairview Ave N heading north" },
      { icon: "→", text: "Continue north on Fairview to Aloha St" },
      { icon: "↰", text: "Turn left onto Aloha St heading west" },
      { icon: "→", text: "Continue west on Aloha to Dexter Ave N" },
      { icon: "■", text: "Arrive back at Dexter Ave N & Aloha St" },
    ],
    /*
      Lightning bolt as a Z-shape with staircase diagonal.

      Top bar:     DEXTER → FAIRVIEW along Aloha (full width)
      Diagonal:    Staircase from (ALOHA, FAIRVIEW) down to (ROY, DEXTER)
                   FAI → PONTIUS → 9TH → DEXTER, stepping 1 block south each
      Left edge:   Straight south on DEXTER from ROY to DENNY
      Bottom bar:  DEXTER → FAIRVIEW along Denny
      Return:      North on FAIRVIEW from DENNY to ALOHA
      Close:       West on ALOHA from FAIRVIEW back to DEXTER

      The diagonal staircase makes the Z look like a lightning bolt ⚡
    */
    coords: [
      // Top bar
      [ALOHA, DEXTER],         // Start — top-left
      [ALOHA, FAIRVIEW],       // E on Aloha — top-right

      // Diagonal staircase (upper-right → lower-left)
      [VALLEY, FAIRVIEW],      // S on Fairview
      [VALLEY, PONTIUS],       // W on Valley — zag left
      [ROY, PONTIUS],          // S on Pontius
      [ROY, NINTH],            // W on Roy — zag left
      [MERCER, NINTH],         // S on 9th
      [MERCER, DEXTER],        // W on Mercer — arrive at left edge

      // Left edge going down
      [REPUBLICAN, DEXTER],    // S on Dexter
      [HARRISON, DEXTER],      // S
      [THOMAS, DEXTER],        // S
      [JOHN, DEXTER],          // S
      [DENNY, DEXTER],         // S — bottom-left

      // Bottom bar
      [DENNY, FAIRVIEW],       // E on Denny — bottom-right

      // Return up right side
      [ALOHA, FAIRVIEW],       // N on Fairview — back to top-right

      // Close loop across top
      [ALOHA, DEXTER],         // W on Aloha — Finish
    ],
  },
};
