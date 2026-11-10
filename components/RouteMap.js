"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre GL map with OpenFreeMap dark tiles + route overlays.
 *
 * - route: selected loop ({ coords, start }), drawn with a glow; leadIn: dashed path from the start to it
 * - previewRoutes: other candidates, drawn faintly
 * - startPoint: [lat, lng] pin where the user starts; onMapClick(lat, lng) lets them move it
 */
export default function RouteMap({ route, loading, previewRoutes = [], startPoint = null, leadIn = null, onMapClick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("maplibre-gl").then((maplibregl) => {
      const map = new maplibregl.Map({
        container: containerRef.current,
        // OpenFreeMap: free vector tiles, no API key (CARTO's raster tiles now require one)
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [-122.335, 47.627], // MapLibre uses [lng, lat]
        zoom: 12,
        attributionControl: true,
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );

      // If the tile style fails or is slow, fall back to a plain background so routes still draw
      let fellBack = false;
      const fallBack = (reason) => {
        if (mapRef.current || fellBack) return;
        fellBack = true;
        console.warn("[Map] Base map unavailable, drawing routes without it:", reason);
        map.setStyle({
          version: 8,
          sources: {},
          layers: [{ id: "background", type: "background", paint: { "background-color": "#141418" } }],
        });
      };
      map.on("error", (e) => fallBack(e?.error?.message || "error"));
      setTimeout(() => fallBack("timed out"), 8000);

      map.on("load", () => {
        mapRef.current = map;
        setReady(true);
      });

      map.on("click", (e) => onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng));
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
    ["route-glow", "route-mid", "route-line", "lead-in"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["route", "lead-in"].forEach((id) => map.getSource(id) && map.removeSource(id));

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

    // Dashed lead-in from the start point to where the loop begins
    const leadCoords = (leadIn || []).map(([lat, lng]) => [lng, lat]);
    if (leadCoords.length >= 2) {
      map.addSource("lead-in", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: leadCoords } },
      });
      map.addLayer({
        id: "lead-in",
        type: "line",
        source: "lead-in",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.5, "line-dasharray": [2, 2] },
      });
    }

    // Fit bounds to route and lead-in
    const lngs = [...coords, ...leadCoords].map((c) => c[0]);
    const lats = [...coords, ...leadCoords].map((c) => c[1]);
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
          new maplibregl.Popup({ offset: 12 }).setHTML(`<b>Loop starts and ends here</b>`)
        )
        .addTo(map);
      map._routeMarkers.push(startMarker);
    });
  }, [route, leadIn, ready]);

  // Start-point pin
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    map._startPin?.remove();
    map._startPin = null;
    if (!startPoint) return;

    const el = document.createElement("div");
    el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #3b82f6;box-shadow:0 0 10px rgba(59,130,246,0.6)"></div>`;
    import("maplibre-gl").then((maplibregl) => {
      map._startPin = new maplibregl.Marker({ element: el })
        .setLngLat([startPoint[1], startPoint[0]])
        .addTo(map);
    });
    if (!route) map.easeTo({ center: [startPoint[1], startPoint[0]], zoom: Math.max(map.getZoom(), 13) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPoint, ready]);

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
            <div className="text-white/7 text-xs font-mono mt-2">Tap the map to choose where you start</div>
          </div>
        </div>
      )}
    </div>
  );
}
