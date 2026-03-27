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
    dist: "3.3 mi",
    time: "~33 min",
    start: "Denny Way & Pontius Ave N",
    startCoord: [DENNY, PONTIUS],
    turns: [
      { icon: "▲", text: "Start at Denny Way & Pontius Ave N — head west on Denny Way" },
      { icon: "↱", text: "Turn right onto Terry Ave N heading north" },
      { icon: "↰", text: "Turn left onto John St heading west" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading north" },
      { icon: "↰", text: "Turn left onto Thomas St heading west" },
      { icon: "↱", text: "Turn right onto Westlake Ave N heading north" },
      { icon: "↰", text: "Turn left onto Harrison St heading west" },
      { icon: "↱", text: "Turn right onto 8th Ave N heading north" },
      { icon: "↰", text: "Turn left onto Republican St heading west" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north" },
      { icon: "↱", text: "Turn right onto Mercer St heading east" },
      { icon: "→", text: "Continue east past 8th Ave, Westlake to 9th Ave N" },
      { icon: "↱", text: "Turn right onto 9th Ave N heading south" },
      { icon: "→", text: "Continue south to Harrison St" },
      { icon: "↰", text: "Turn left onto Harrison St heading east" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading north" },
      { icon: "→", text: "Continue north to Mercer St" },
      { icon: "↱", text: "Turn right onto Mercer St heading east" },
      { icon: "→", text: "Continue east past Boren, Yale to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "→", text: "Continue south to Harrison St" },
      { icon: "↱", text: "Turn right onto Harrison St heading west" },
      { icon: "↰", text: "Turn left onto Yale Ave N heading south" },
      { icon: "↱", text: "Turn right onto Thomas St heading west" },
      { icon: "↰", text: "Turn left onto Boren Ave N heading south" },
      { icon: "↱", text: "Turn right onto John St heading west" },
      { icon: "↰", text: "Turn left onto Pontius Ave N heading south" },
      { icon: "■", text: "Arrive back at Denny Way & Pontius Ave N" },
    ],
    /*
      Heart outline — ALL ON LAND, lobes at Mercer St level.

      The top is at MERCER (not Valley) so we can use the full
      east-west grid including FAIRVIEW, YALE, BOREN which are
      all on land south of Mercer. This avoids Lake Union entirely.

      Left side staircase (bottom → top-left):
        TERRY → 9TH → WESTLAKE → 8TH → DEXTER
        Each step goes 1 block west + 1 block north.

      Left lobe top: DEXTER → 8TH → WESTLAKE → 9TH along Mercer St

      V-notch: drop from Mercer to Harrison (2 blocks),
               cross from 9TH → PONTIUS, rise back to Mercer

      Right lobe top: PONTIUS → BOREN → YALE → FAIRVIEW along Mercer St

      Right side staircase (top-right → bottom):
        FAIRVIEW → YALE → BOREN → PONTIUS
        Mirror of left side.

      Both lobes have ~equal width at Mercer St:
        Left:  DEXTER to 9TH   ≈ 375m
        Right: PONTIUS to FAIRVIEW ≈ 375m
    */
    coords: [
      // Bottom point
      [DENNY, PONTIUS],          // Start — bottom center

      // Left staircase (widening upward, 5 steps)
      [DENNY, TERRY],            // W on Denny
      [JOHN, TERRY],             // N on Terry
      [JOHN, NINTH],             // W on John
      [THOMAS, NINTH],           // N on 9th
      [THOMAS, WESTLAKE],        // W on Thomas
      [HARRISON, WESTLAKE],      // N on Westlake
      [HARRISON, EIGHTH],        // W on Harrison
      [REPUBLICAN, EIGHTH],      // N on 8th
      [REPUBLICAN, DEXTER],      // W on Republican

      // Left edge going up to lobe top
      [MERCER, DEXTER],          // N on Dexter — top-left corner

      // Left lobe top (along Mercer St)
      [MERCER, EIGHTH],          // E on Mercer
      [MERCER, WESTLAKE],        // E
      [MERCER, NINTH],           // E — inner left edge

      // V-notch between lobes (drops 2 blocks to Harrison)
      [HARRISON, NINTH],         // S on 9th (2 blocks: Mercer→Republican→Harrison)
      [HARRISON, PONTIUS],       // E on Harrison — cross V bottom

      // Right lobe (rises 2 blocks back to Mercer)
      [MERCER, PONTIUS],         // N on Pontius (2 blocks back up)
      [MERCER, BOREN],           // E on Mercer
      [MERCER, YALE],            // E
      [MERCER, FAIRVIEW],        // E — outer right edge (on land at Mercer level)

      // Right edge going down
      [HARRISON, FAIRVIEW],      // S on Fairview (2 blocks to Harrison)

      // Right staircase (narrowing downward, 3 steps)
      [HARRISON, YALE],          // W on Harrison
      [THOMAS, YALE],            // S on Yale
      [THOMAS, BOREN],           // W on Thomas
      [JOHN, BOREN],             // S on Boren
      [JOHN, PONTIUS],           // W on John

      // Close back to bottom point
      [DENNY, PONTIUS],          // S on Pontius — Finish
    ],
  },

  lightning: {
    name: "Lightning",
    dist: "4.9 mi",
    time: "~47 min",
    start: "Dexter Ave N & Aloha St",
    startCoord: [ALOHA, DEXTER],
    turns: [
      { icon: "▲", text: "Start at Dexter Ave N & Aloha St — head east on Aloha St" },
      { icon: "↱", text: "Turn right onto Westlake Ave N heading south" },
      { icon: "↱", text: "Turn right onto Valley St heading west" },
      { icon: "↰", text: "Turn left onto Dexter Ave N heading south" },
      { icon: "↰", text: "Turn left onto Roy St heading east" },
      { icon: "→", text: "Continue east to Pontius Ave N" },
      { icon: "↱", text: "Turn right onto Pontius Ave N heading south" },
      { icon: "↱", text: "Turn right onto Mercer St heading west" },
      { icon: "→", text: "Continue west to Dexter Ave N" },
      { icon: "↰", text: "Turn left onto Dexter Ave N heading south" },
      { icon: "↰", text: "Turn left onto Harrison St heading east" },
      { icon: "→", text: "Continue east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south" },
      { icon: "→", text: "Continue south to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west" },
      { icon: "→", text: "Continue west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north" },
      { icon: "→", text: "Continue north on Dexter to Aloha St" },
      { icon: "■", text: "Arrive back at Dexter Ave N & Aloha St" },
    ],
    /*
      Lightning bolt ⚡ — ALL ON LAND.

      Expanding zigzag from top to bottom:
        Narrow top at ALOHA (DEXTER ↔ WESTLAKE, ~300m, on land)
        Medium middle at ROY (DEXTER ↔ PONTIUS, ~690m, on land)
        Wide bottom at HARRISON (DEXTER ↔ FAIRVIEW, ~1050m, on land)

      The bolt gets wider as it descends, like real lightning.
      Only uses FAIRVIEW at HARRISON level and below (safely on land).
      Northern segments stay on DEXTER/WESTLAKE/PONTIUS (west of lake).

      Return path goes south on DEXTER to DENNY, east on DENNY
      to FAIRVIEW (on land), then north on DEXTER back to ALOHA.
    */
    coords: [
      // Narrow top bar (on land, west of lake)
      [ALOHA, DEXTER],           // Start — top-left
      [ALOHA, WESTLAKE],         // E on Aloha — top-right (narrow)

      // First zigzag down
      [VALLEY, WESTLAKE],        // S on Westlake
      [VALLEY, DEXTER],          // W on Valley — zag back left

      // Second zigzag (wider)
      [ROY, DEXTER],             // S on Dexter
      [ROY, PONTIUS],            // E on Roy — zag right (medium width)

      // Third zigzag
      [MERCER, PONTIUS],         // S on Pontius
      [MERCER, DEXTER],          // W on Mercer — zag back left

      // Fourth zigzag (widest, all on land at Harrison level)
      [HARRISON, DEXTER],        // S on Dexter
      [HARRISON, FAIRVIEW],      // E on Harrison — zag right (full width, on land)

      // Bottom stroke
      [DENNY, FAIRVIEW],         // S on Fairview (on land south of Mercer)

      // Bottom bar
      [DENNY, DEXTER],           // W on Denny — bottom-left

      // Return up left side
      [ALOHA, DEXTER],           // N on Dexter — back to start
    ],
  },
};
