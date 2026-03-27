# RouteArt — AI-Powered Strava Art

Generate GPS art routes on real streets. Seattle SLU proof of concept.

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

That's it. The map loads CARTO dark tiles — real streets, real map.
Click "Heart" or "Lightning" to see routes on real SLU streets.
Click "Export GPX" to download a file you can load on any GPS device.

## What This Includes

- **Real map** — CARTO dark tiles via Leaflet (actual street-level detail)
- **Real routes** — Following actual SLU streets (Dexter, Mercer, Westlake, Fairview, etc.)
- **Turn-by-turn directions** — Every turn listed with street names
- **GPX export** — Downloads a real GPX file you can import into Strava, Garmin, Apple Watch
- **Start point** — Links to Google Maps for navigation to the starting intersection

## Project Structure

```
routeart/
├── app/
│   ├── globals.css          # Tailwind + Leaflet dark theme
│   ├── layout.js            # Root layout
│   └── page.js              # Main page (assembles everything)
├── components/
│   ├── RouteMap.js          # Leaflet map with route overlay
│   └── Directions.js        # Turn-by-turn panel
├── lib/
│   ├── routes.js            # SLU street data + route definitions
│   └── gpx.js               # GPX generation + download
├── package.json
├── tailwind.config.js
└── next.config.js
```

## Next Steps to Build the Real Product

1. **Road snapping engine** — Replace hardcoded routes with OSMnx:
   ```bash
   pip install osmnx networkx
   ```
   Build a Python FastAPI backend that takes a shape + location and returns a road-snapped route.

2. **AI shape generation** — Add Claude API to turn "Draw an Apple logo" into SVG coordinates:
   ```bash
   pip install anthropic
   ```

3. **More cities** — Download OSM graphs for SF, Portland, NYC, London.

4. **Strava OAuth** — Add real Strava integration for direct route push.

5. **Deploy** — `npx vercel` for frontend, Railway/Fly.io for Python backend.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Map | Leaflet + CARTO dark tiles |
| Export | GPX XML generation |
| Future backend | Python + FastAPI + OSMnx |
| Future AI | Claude API (Sonnet) |
