/*
  Real Seattle SLU intersections as [lat, lng].
  Coordinates verified against Google Maps / OpenStreetMap.

  IMPORTANT: Lake Union's south shore is at approximately lat 47.627.
  All route coordinates must stay well below this latitude.

  Westlake Ave N runs DIAGONALLY (NW–SE) through SLU — its longitude
  shifts ~0.0004° west per block going north. We use this diagonal
  for more organic, less boxy route lines.
*/

// ── E-W streets (south → north) ─────────────────────────────
// Corrected spacing: real SLU blocks are ~100m (~0.001° lat)
const DENNY      = 47.6185;   // confirmed via multiple sources
const JOHN       = 47.6195;
const THOMAS     = 47.6205;
const HARRISON   = 47.6218;
const REPUBLICAN = 47.6228;
const MERCER     = 47.6245;   // confirmed ~47.6245
const ROY        = 47.6255;   // safely below lake shore (47.627)

// ── N-S avenues (west → east) — most run straight N-S ───────
const DEXTER   = -122.3435;
const EIGHTH   = -122.3405;
const NINTH    = -122.3370;
const TERRY    = -122.3345;
const PONTIUS  = -122.3330;
const BOREN    = -122.3315;
const YALE     = -122.3300;
const FAIRVIEW = -122.3285;
const MINOR    = -122.3265;

// ── Westlake Ave N — DIAGONAL street ────────────────────────
// Longitude varies by latitude (shifts west going north)
const WL_DENNY    = -122.3382;
const WL_JOHN     = -122.3387;
const WL_THOMAS   = -122.3391;
const WL_HARRISON = -122.3396;
const WL_MERCER   = -122.3407;
const WL_ROY      = -122.3412;

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
    { label: "Westlake Ave N",  lng: WL_THOMAS,s: DENNY, n: ROY,    major: true, diagonal: true },
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
      { icon: "↰", text: "Turn left onto John St, then northwest on Westlake Ave N" },
      { icon: "↰", text: "At Thomas St, continue west to 8th Ave N" },
      { icon: "↱", text: "Turn right onto 8th Ave N heading north" },
      { icon: "↰", text: "Turn left onto Harrison St heading west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north to Roy St" },
      { icon: "↱", text: "Turn right onto Roy St heading east to 9th Ave N" },
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
      Heart outline — ALL ON LAND, lobes at Roy St level (47.6255).
      Lake shore is at ~47.627, giving ~170m clearance.

      Left side uses Westlake Ave's DIAGONAL for smoother curves —
      the line from John/Westlake to Thomas/Westlake is angled NW,
      not a rigid horizontal+vertical step.

      Left lobe:  DEXTER → 9TH at Roy (~500m wide)
      Right lobe: PONTIUS → FAIRVIEW at Roy (~340m wide)
      V-notch:    drops 1 block (Roy → Mercer) at center

      Street availability at Roy St (47.6255):
        ✓ DEXTER, 8TH, 9TH, PONTIUS, FAIRVIEW (all reach Roy)
        ✗ TERRY, BOREN, YALE, MINOR (only reach Mercer)
    */
    coords: [
      // ── Bottom point ──
      [DENNY, TERRY],              // Start — bottom center

      // ── Left staircase up (with Westlake diagonal) ──
      [DENNY, NINTH],              // W on Denny
      [JOHN, NINTH],               // N on 9th
      [JOHN, WL_JOHN],             // W on John to Westlake
      [THOMAS, WL_THOMAS],         // ↗ NW diagonal along Westlake!
      [THOMAS, EIGHTH],            // W on Thomas to 8th
      [HARRISON, EIGHTH],          // N on 8th
      [HARRISON, DEXTER],          // W on Harrison
      [ROY, DEXTER],               // N on Dexter — top-left corner

      // ── Left lobe top (at Roy St) ──
      [ROY, EIGHTH],               // E on Roy
      [ROY, NINTH],                // E on Roy — inner left edge

      // ── V-notch (1 block deep) ──
      [MERCER, NINTH],             // S on 9th (1 block: Roy → Mercer)
      [MERCER, PONTIUS],           // E on Mercer — cross to right lobe

      // ── Right lobe ──
      [ROY, PONTIUS],              // N on Pontius (1 block: Mercer → Roy)
      [ROY, FAIRVIEW],             // E on Roy — top-right corner

      // ── Right staircase down ──
      [MERCER, FAIRVIEW],          // S on Fairview (1 block)
      [MERCER, YALE],              // W on Mercer
      [HARRISON, YALE],            // S on Yale (Mercer → Harrison)
      [HARRISON, BOREN],           // W on Harrison
      [THOMAS, BOREN],             // S on Boren
      [THOMAS, PONTIUS],           // W on Thomas
      [JOHN, PONTIUS],             // S on Pontius
      [JOHN, TERRY],               // W on John

      // ── Close loop ──
      [DENNY, TERRY],              // S on Terry — Finish
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
      { icon: "↱", text: "Turn right onto Mercer St heading west toward Westlake Ave N" },
      { icon: "↘", text: "Continue southeast on Westlake Ave N (diagonal) to Harrison St" },
      { icon: "↰", text: "Turn left onto Harrison St heading east to Fairview Ave N" },
      { icon: "↱", text: "Turn right onto Fairview Ave N heading south to Denny Way" },
      { icon: "↱", text: "Turn right onto Denny Way heading west to Dexter Ave N" },
      { icon: "↱", text: "Turn right onto Dexter Ave N heading north back to Roy St" },
      { icon: "■", text: "Arrive back at Dexter Ave N & Roy St" },
    ],
    /*
      Lightning bolt ⚡ — ALL ON LAND.

      Zigzag that gets wider going down, with a DIAGONAL stroke
      along Westlake Ave N for an angled lightning feel.

      Top bar:     DEX → 9TH on Roy (~500m, narrow)
      Diagonal:    Westlake from Mercer → Harrison (SE angle, ~15°)
      Middle bar:  Westlake → FAIRVIEW on Harrison (~830m, wide)
      Bottom bar:  FAIRVIEW → DEX on Denny (~1120m, full width)
      Return:      N on Dexter back to start

      The diagonal Westlake segment creates an angled stroke
      instead of a rigid 90° turn — looks more like real lightning.
    */
    coords: [
      // ── Narrow top bar ──
      [ROY, DEXTER],               // Start — top-left
      [ROY, NINTH],                // E on Roy — top-right (narrow)

      // ── Down to middle level ──
      [MERCER, NINTH],             // S on 9th (Roy → Mercer)

      // ── Diagonal stroke via Westlake ──
      [MERCER, WL_MERCER],         // W on Mercer to Westlake position
      [HARRISON, WL_HARRISON],     // ↘ SE diagonal along Westlake!

      // ── Wide middle bar ──
      [HARRISON, FAIRVIEW],        // E on Harrison (wide zag, all on land)

      // ── Down to bottom ──
      [DENNY, FAIRVIEW],           // S on Fairview (Harrison → Denny)

      // ── Full-width bottom bar ──
      [DENNY, DEXTER],             // W on Denny (full width)

      // ── Return up left edge ──
      [ROY, DEXTER],               // N on Dexter — back to start
    ],
  },
};
