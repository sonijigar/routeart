"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre GL map with CARTO dark tiles + animated route overlay.
 * Replaces Leaflet for better Next.js compatibility and WebGL rendering.
 */
export default function RouteMap({ route, loading, previewRoutes = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("maplibre-gl").then((maplibregl) => {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: "carto-tiles",
              type: "raster",
              source: "carto",
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [-122.335, 47.627], // MapLibre uses [lng, lat]
        zoom: 13,
        attributionControl: true,
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );

      map.on("load", () => {
        mapRef.current = map;
        setReady(true);
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update route on map
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // Clear old route layers and sources
    ["route-glow", "route-mid", "route-line"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("route")) map.removeSource("route");

    // Clear old markers
    if (map._routeMarkers) {
      map._routeMarkers.forEach((m) => m.remove());
    }
    map._routeMarkers = [];

    if (!route) return;

    // MapLibre uses [lng, lat] — our data is [lat, lng]
    const coords = route.coords.map(([lat, lng]) => [lng, lat]);

    // Add route source
    map.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
      },
    });

    // Outer glow layer
    map.addLayer({
      id: "route-glow",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ff6b2b",
        "line-width": 14,
        "line-opacity": 0.1,
      },
    });

    // Mid glow layer
    map.addLayer({
      id: "route-mid",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ff6b2b",
        "line-width": 7,
        "line-opacity": 0.2,
      },
    });

    // Main route line
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ff6b2b",
        "line-width": 3.5,
        "line-opacity": 0.95,
      },
    });

    // Fit bounds to route
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 50, maxZoom: 15 }
    );

    // Start marker (green pulsing dot)
    const startEl = document.createElement("div");
    startEl.innerHTML = `
      <div style="position:relative;width:28px;height:28px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(34,197,94,0.2);animation:pulse-ring 2s ease-in-out infinite"></div>
        <div style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;box-shadow:0 0 12px rgba(34,197,94,0.5)"></div>
      </div>`;

    import("maplibre-gl").then((maplibregl) => {
      const startMarker = new maplibregl.Marker({ element: startEl })
        .setLngLat(coords[0])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(
            `<b>START</b><br/>${route.start}`
          )
        )
        .addTo(map);
      map._routeMarkers.push(startMarker);

      // End marker (red dot)
      const endEl = document.createElement("div");
      endEl.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 0 12px rgba(239,68,68,0.5)"></div>`;

      const endMarker = new maplibregl.Marker({ element: endEl })
        .setLngLat(coords[coords.length - 1])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(`<b>FINISH</b>`)
        )
        .addTo(map);
      map._routeMarkers.push(endMarker);
    });
  }, [route, ready]);

  // Update preview routes (unselected candidates shown as faint lines)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // Clear old preview layers
    for (let i = 0; i < 10; i++) {
      const id = `preview-${i}`;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }

    previewRoutes.forEach((coords, i) => {
      if (!coords || coords.length < 2) return;
      const id = `preview-${i}`;
      const lngLat = coords.map(([lat, lng]) => [lng, lat]);

      map.addSource(id, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: lngLat },
        },
      });

      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ff6b2b",
          "line-width": 2,
          "line-opacity": 0.15,
        },
      });
    });
  }, [previewRoutes, ready]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/5">
      <div
        ref={containerRef}
        style={{ width: "100%", height: "480px" }}
        className="bg-dark-800"
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[1000]">
          <div className="w-9 h-9 border-[3px] border-accent/20 border-t-accent rounded-full mb-3 animate-spin" />
          <div className="text-accent text-sm font-mono">Discovering shapes...</div>
          <div className="text-white/25 text-xs font-mono mt-1">Analyzing road network</div>
        </div>
      )}

      {/* Empty state */}
      {!route && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-white/15 text-base font-mono">Seattle</div>
            <div className="text-white/7 text-xs font-mono mt-2">Discovering shapes for your area...</div>
          </div>
        </div>
      )}
    </div>
  );
}
