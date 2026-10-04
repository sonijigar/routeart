# RouteArt — GPS art routes for Seattle

Suggests runnable/walkable/rideable routes that draw recognizable shapes on real Seattle streets.

## Quick Start

```bash
npm install
npm run dev   # http://localhost:3000
```

## How it works

1. **Road data** — OpenStreetMap roads for each neighborhood are bundled in `public/roads/` (`lib/roadData.js`); the Overpass API (`lib/overpass.js`) is only a fallback.
2. **Graph** — intersections become nodes and street segments become edges; Dijkstra routes between them (`lib/graph.js`).
3. **Fitting** — shapes are pixel-art bitmaps (`lib/shapeLibrary.js`); each is laid square to the street grid at several cell sizes and positions, its corners are routed through the graph, and the loop is scored (`lib/shapeFitter.js`, `lib/shapeScorer.js`).
4. **Discovery** — the best candidate per shape is returned to the UI (`lib/discovery.js`), drawn on a MapLibre map (`components/RouteMap.js`) and exportable as GPX (`lib/gpx.js`).

## Evaluating shape quality

```bash
npm run fetch-fixtures   # refreshes Seattle road data in public/roads/ (committed)
npm run eval -- --png    # fits every shape, writes eval/out/{report.json,sheet.html,sheet.png}
npm run calibrate        # checks the shape score against hand labels (eval/labels.json)
```

`npm run eval` always includes a synthetic perfect 100 m grid, the best case: if a shape fails
there, the algorithm is at fault. Options: `--locations=grid,slu`, `--shapes=pixel-heart,star`,
`--activity=run|walk|ride`, `--verbose`.

The shape score (`lib/shapeScorer.js`) is checked against `eval/labels.json`: good / ok / bad
judgements of the frozen candidate routes in `eval/labelset-*.json.gz`, one file per batch. Edit a label and re-run
`npm run calibrate` to see how well the score agrees. `npm run make-labelset -- --batch=<name> --png`
adds a new batch to label (labels are keyed by candidate id).

## Project Structure

```
routeart/
├── app/
│   ├── globals.css
│   ├── layout.js
│   └── page.js              # Location picker, shape candidates, GPX export
├── components/
│   └── RouteMap.js          # MapLibre map with route + preview overlays
├── lib/
│   ├── roadData.js          # Bundled road data loader
│   ├── overpass.js          # OSM road fetch + cache (fallback)
│   ├── roadFilter.js        # Which roads each activity (run/walk/ride) may use
│   ├── locations.js         # Seattle neighborhoods
│   ├── graph.js             # Road graph, spatial index, Dijkstra, grid angle
│   ├── shapeLibrary.js      # Pixel-art shape templates + outline tracer
│   ├── shapeFitter.js       # Template fitting
│   ├── shapeScorer.js       # Shape score (calibrated) + reject gate
│   ├── discovery.js         # Orchestrator
│   └── gpx.js               # GPX generation + download
├── scripts/
│   ├── fetch-fixtures.mjs   # Save Seattle road data for evals
│   ├── fixtures.mjs         # Fixture format + synthetic grid
│   ├── eval.mjs             # Shape-quality eval harness
│   ├── make-labelset.mjs    # Freeze candidate routes for labeling
│   ├── calibrate.mjs        # Score vs hand labels
│   └── evalCommon.mjs       # Shared eval helpers
├── public/roads/            # Seattle road data (gzipped), served to the app
└── eval/                    # Label set + labels (eval/out/ is generated)
```

## Product goal

Given a start point, an activity (run / walk / ride) and a target distance, return 4–5 distinct,
recognizable shape loops within ±15% of that distance. Scope: Seattle.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Map | MapLibre GL + OpenFreeMap dark style |
| Roads | OpenStreetMap, bundled per neighborhood (Overpass API fallback) |
| Export | GPX |
