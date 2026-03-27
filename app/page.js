"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Directions from "../components/Directions";
import { ROUTES } from "../lib/routes";
import { downloadGPX } from "../lib/gpx";

// Dynamic import to avoid SSR issues with Leaflet
const RouteMap = dynamic(() => import("../components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[480px] rounded-xl bg-dark-800 border border-white/5 flex items-center justify-center">
      <div className="text-white/20 text-sm font-mono">Loading map...</div>
    </div>
  ),
});

export default function Home() {
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState(null);

  const generate = useCallback(
    async (key) => {
      if (loading) return;
      setLoading(true);
      setSel(key);
      setRoute(null);

      // Simulate AI processing time
      await new Promise((r) => setTimeout(r, 1200));

      setRoute(ROUTES[key]);
      setLoading(false);
    },
    [loading]
  );

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,107,43,0.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,43,0.01) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-sm font-extrabold">
            R
          </div>
          <div>
            <div className="text-[15px] font-bold">RouteArt</div>
            <div className="text-[9px] text-white/25 font-mono tracking-widest">
              SEATTLE · SOUTH LAKE UNION
            </div>
          </div>
        </div>
        <div className="text-xs text-white/20 font-mono">
          🏃 Running · 5–7 mi
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 px-4 py-3 pb-8">
        {/* Map */}
        <RouteMap route={route} loading={loading} />

        {/* Route badge */}
        {route && (
          <div className="relative z-20 -mt-9 ml-3 mb-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-900/95 border border-accent/30">
            <span className="text-accent font-semibold text-sm">
              &ldquo;{route.name}&rdquo;
            </span>
            <span className="text-white/35 text-xs font-mono">
              {route.dist}
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {/* Shape buttons */}
          <div className="flex gap-2">
            {[
              ["heart", "Heart ♥"],
              ["lightning", "Lightning ⚡"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => generate(key)}
                disabled={loading}
                className={`flex-1 py-3.5 rounded-xl text-[15px] font-semibold transition-all ${
                  sel === key
                    ? "border-2 border-accent bg-accent/10 text-accent"
                    : "border border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-accent/30 hover:text-white/70"
                } ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {route && (
            <>
              {/* Start point */}
              <div className="px-4 py-3 rounded-xl bg-green-500/[0.06] border border-green-500/15 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <div>
                  <div className="text-sm text-white/70 font-semibold">
                    Start: {route.start}
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${route.startCoord[0]},${route.startCoord[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-500/60 hover:text-green-500 underline"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Distance", route.dist],
                  ["Est. time", route.time],
                  ["Turns", `${route.turns.length}`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="py-3 rounded-xl bg-white/[0.02] border border-white/5 text-center"
                  >
                    <div className="text-lg font-bold text-accent font-mono">
                      {value}
                    </div>
                    <div className="text-[9px] text-white/25 font-mono mt-0.5">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Directions */}
              <Directions route={route} />

              {/* Export buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => downloadGPX(route)}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-accent to-accent-dark text-white font-semibold text-sm border-none cursor-pointer hover:opacity-90 transition"
                >
                  Export GPX ↓
                </button>
                <button className="flex-1 py-3 rounded-xl bg-[#fc5200]/[0.07] text-[#fc5200] font-semibold text-sm border border-[#fc5200]/20 cursor-pointer hover:bg-[#fc5200]/15 transition">
                  Push to Strava
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
