"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Leaflet map with CARTO dark tiles + animated route overlay.
 * Uses vanilla Leaflet (not react-leaflet) for full control.
 *
 * This component dynamically imports Leaflet on the client side
 * because Next.js SSR doesn't have `window`.
 */
export default function RouteMap({ route, loading }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      // Fix Leaflet default icon paths in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([47.627, -122.335], 14);

      // CARTO dark tiles — these load fine outside the sandbox
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapRef.current = map;
      window._L = L; // Store for route updates
      setReady(true);
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
    if (!ready || !mapRef.current || !window._L) return;
    const map = mapRef.current;
    const L = window._L;

    // Clear old layers
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    if (!route) return;

    const coords = route.coords.map(([lat, lng]) => [lat, lng]);

    // Fit bounds with padding
    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

    // Glow layer (wide, semi-transparent)
    const glow = L.polyline(coords, {
      color: "#ff6b2b",
      weight: 14,
      opacity: 0.1,
      smoothFactor: 1.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    layersRef.current.push(glow);

    // Mid glow
    const midGlow = L.polyline(coords, {
      color: "#ff6b2b",
      weight: 7,
      opacity: 0.2,
      smoothFactor: 1.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    layersRef.current.push(midGlow);

    // Main route line
    const line = L.polyline(coords, {
      color: "#ff6b2b",
      weight: 3.5,
      opacity: 0.95,
      smoothFactor: 1.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    layersRef.current.push(line);

    // Start marker (green)
    const startIcon = L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:28px;height:28px">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(34,197,94,0.2);animation:pulse-ring 2s ease-in-out infinite"></div>
          <div style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:#22c55e;border:2.5px solid #fff;box-shadow:0 0 12px rgba(34,197,94,0.5)"></div>
        </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const startMarker = L.marker(coords[0], { icon: startIcon }).addTo(map);
    startMarker.bindTooltip(`<b>START</b><br/>${route.start}`, {
      permanent: false,
      className: "route-tooltip",
      direction: "right",
      offset: [12, 0],
    });
    layersRef.current.push(startMarker);

    // End marker (red) — only if different from start
    const end = coords[coords.length - 1];
    const endIcon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 0 12px rgba(239,68,68,0.5)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const endMarker = L.marker(end, { icon: endIcon }).addTo(map);
    endMarker.bindTooltip("<b>FINISH</b>", {
      permanent: false,
      className: "route-tooltip",
      direction: "right",
      offset: [12, 0],
    });
    layersRef.current.push(endMarker);
  }, [route, ready]);

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
          <div className="text-accent text-sm font-mono">Snapping to SLU streets...</div>
          <div className="text-white/25 text-xs font-mono mt-1">Finding optimal route</div>
        </div>
      )}

      {/* Empty state */}
      {!route && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-white/15 text-base font-mono">Seattle · South Lake Union</div>
            <div className="text-white/7 text-xs font-mono mt-2">Choose a shape below to generate a route</div>
          </div>
        </div>
      )}
    </div>
  );
}
