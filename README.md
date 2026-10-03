# RouteArt — GPS art routes for Seattle

Suggests runnable/walkable/rideable routes that draw recognizable shapes on real Seattle streets.

## Quick Start

```bash
npm install
npm run dev   # http://localhost:3000
```

## How it works

1. **Road data** — walkable ways for the selected area are fetched from the OpenStreetMap Overpass API (`lib/overpass.js`).
2. **Graph** — intersections become nodes and street segments become edges; Dijkstra routes between them (`lib/graph.js`).
3. **Fitting** — shape templates (`lib/shapeLibrary.js`) are overlaid at several positions, sizes and rotations, routed through the graph, and scored (`lib/shapeFitter.js`, `lib/shapeScorer.js`).
4. **Discovery** — the best candidate per shape is returned to the UI (`lib/discovery.js`), drawn on a MapLibre map (`components/RouteMap.js`) and exportable as GPX (`lib/gpx.js`).

## Project Structure

```
routeart/
├── app/
│   ├── globals.css
│   ├── layout.js
│   └── page.js              # Location picker, shape candidates, GPX export
├── components/
│   └── RouteMap.js          # MapLibre map with route + preview overlays
└── lib/
    ├── overpass.js          # OSM road fetch + cache
    ├── graph.js             # Road graph, spatial index, Dijkstra, grid angle
    ├── shapeLibrary.js      # Shape templates
    ├── shapeFitter.js       # Template fitting
    ├── shapeScorer.js       # Quality metrics + reject gate
    ├── discovery.js         # Orchestrator
    └── gpx.js               # GPX generation + download
```

## Product goal

Given a start point, an activity (run / walk / ride) and a target distance, return 4–5 distinct,
recognizable shape loops within ±15% of that distance. Scope: Seattle.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Map | MapLibre GL + CARTO dark tiles |
| Roads | OpenStreetMap via Overpass API |
| Export | GPX |
