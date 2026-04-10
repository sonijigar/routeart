"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { discoverShapes, formatDist, formatTime } from "../lib/discovery";
import { downloadGPX } from "../lib/gpx";

const RouteMap = dynamic(() => import("../components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[480px] rounded-xl bg-dark-800 border border-white/5 flex items-center justify-center">
      <div className="text-white/20 text-sm font-mono">Loading map...</div>
    </div>
  ),
});

// Seattle neighborhoods with tight grids — good for GPS art
const LOCATIONS = {
  slu: {
    name: "South Lake Union",
    center: [47.6225, -122.3360],
  },
  capitolhill: {
    name: "Capitol Hill",
    center: [47.6250, -122.3220],
  },
  ballard: {
    name: "Ballard",
    center: [47.6685, -122.3850],
  },
  fremont: {
    name: "Fremont",
    center: [47.6510, -122.3500],
  },
};

export default function Home() {
  const [location, setLocation] = useState("slu");
  const [candidates, setCandidates] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | fetching | building | fitting | done | error
  const [errorMsg, setErrorMsg] = useState(null);

  const discover = useCallback(
    async (locKey) => {
      if (phase === "fetching" || phase === "building" || phase === "fitting") return;

      setPhase("fetching");
      setCandidates([]);
      setSelectedIdx(null);
      setErrorMsg(null);
      setLocation(locKey);

      const loc = LOCATIONS[locKey];

      try {
        const results = await discoverShapes(loc.center, {
          radiusKm: 2.5,
          maxResults: 7,
          onProgress: (p) => setPhase(p),
        });

        if (results.length === 0) {
          setPhase("error");
          setErrorMsg("No shapes found for this area. Try a different location.");
          return;
        }

        setCandidates(results);
        setSelectedIdx(0); // auto-select best match
        setPhase("done");
      } catch (err) {
        console.error("Discovery failed:", err);
        setPhase("error");
        setErrorMsg(err.message || "Failed to discover shapes");
      }
    },
    [phase]
  );

  // Auto-discover on first load
  useEffect(() => {
    discover("slu");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = phase === "fetching" || phase === "building" || phase === "fitting";
  const selectedCandidate = selectedIdx !== null ? candidates[selectedIdx] : null;

  // Build route object for the selected candidate (matches existing data contract)
  const route = selectedCandidate
    ? {
        name: selectedCandidate.name,
        coords: selectedCandidate.coords,
        dist: formatDist(selectedCandidate.distance),
        time: formatTime(selectedCandidate.distance),
        start: LOCATIONS[location].name,
        startCoord: selectedCandidate.coords[0],
        turns: [],
      }
    : null;

  // Build preview routes for unselected candidates
  const previewRoutes = candidates
    .filter((_, i) => i !== selectedIdx)
    .map((c) => c.coords);

  const phaseLabel = {
    idle: "",
    fetching: "Fetching roads...",
    building: "Building graph...",
    fitting: "Finding shapes...",
    done: "",
    error: "",
  };

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
            <div className="text-[15px] font-bold">
              RouteArt{" "}
              <span className="text-[10px] text-white/25 font-mono font-normal">
                v0.4.0
              </span>
            </div>
            <div className="text-[9px] text-white/25 font-mono tracking-widest">
              SEATTLE
            </div>
          </div>
        </div>
        <div className="text-xs text-white/20 font-mono">🏃 Running</div>
      </header>

      {/* Content */}
      <main className="relative z-10 px-4 py-3 pb-8">
        {/* Map */}
        <RouteMap route={route} loading={isLoading} previewRoutes={previewRoutes} />

        {/* Loading status */}
        {isLoading && (
          <div className="relative z-20 -mt-9 ml-3 mb-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-900/95 border border-accent/30">
            <span className="text-accent text-sm animate-pulse">
              {phaseLabel[phase]}
            </span>
          </div>
        )}

        {/* Route badge */}
        {route && !isLoading && (
          <div className="relative z-20 -mt-9 ml-3 mb-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-900/95 border border-accent/30">
            <span className="text-accent font-semibold text-sm">
              {selectedCandidate.icon} &ldquo;{route.name}&rdquo;
            </span>
            <span className="text-white/35 text-xs font-mono">
              {route.dist}
            </span>
            <span className="text-white/20 text-[10px] font-mono">
              score: {selectedCandidate.score.toFixed(2)}
            </span>
          </div>
        )}

        {/* Error message */}
        {phase === "error" && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {/* Location selector */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(LOCATIONS).map(([key, loc]) => (
              <button
                key={key}
                onClick={() => discover(key)}
                disabled={isLoading}
                className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  location === key
                    ? "border-2 border-white/20 bg-white/[0.05] text-white/70"
                    : "border border-white/[0.07] bg-white/[0.02] text-white/30 hover:border-white/15 hover:text-white/50"
                } ${isLoading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
              >
                {loc.name}
              </button>
            ))}
          </div>

          {/* Shape candidates */}
          {candidates.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {candidates.map((c, i) => (
                <button
                  key={`${c.shape}-${i}`}
                  onClick={() => setSelectedIdx(i)}
                  className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    selectedIdx === i
                      ? "border-2 border-accent bg-accent/10 text-accent"
                      : "border border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-accent/30 hover:text-white/60"
                  }`}
                >
                  <div className="text-lg">{c.icon}</div>
                  <div className="text-[11px] mt-0.5">{c.name}</div>
                  <div className="text-[9px] text-white/20 font-mono mt-0.5">
                    {formatDist(c.distance)}
                  </div>
                </button>
              ))}
            </div>
          )}

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
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Distance", route.dist],
                  ["Est. time", route.time],
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
