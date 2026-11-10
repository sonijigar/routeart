"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { discoverShapes, formatDist, formatTime } from "../lib/discovery";
import { downloadGPX } from "../lib/gpx";
import { LOCATIONS } from "../lib/locations";

const RouteMap = dynamic(() => import("../components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[480px] rounded-xl bg-dark-800 border border-white/5 flex items-center justify-center">
      <div className="text-white/20 text-sm font-mono">Loading map...</div>
    </div>
  ),
});

const ACTIVITIES = [
  { key: "run", label: "Run", icon: "🏃" },
  { key: "walk", label: "Walk", icon: "🚶" },
  { key: "ride", label: "Ride", icon: "🚴" },
];

// Target loop distances in km, per activity (first is the default)
const DISTANCES = {
  run: [8, 5, 10, 13],
  walk: [5, 3, 8],
  ride: [15, 10, 20],
};

const DEFAULT_START = { point: LOCATIONS.slu.center, label: LOCATIONS.slu.name };

export default function Home() {
  const [activity, setActivity] = useState("run");
  const [distanceKm, setDistanceKm] = useState(DISTANCES.run[0]);
  const [start, setStart] = useState(DEFAULT_START);
  const [candidates, setCandidates] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | fetching | building | fitting | done | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [locating, setLocating] = useState(false);
  const runRef = useRef(0); // latest discovery run; older runs' results are dropped

  const discover = useCallback(async (startPoint, act, km) => {
    const runId = ++runRef.current;
    const current = () => runRef.current === runId;
    setPhase("fetching");
    setCandidates([]);
    setSelectedIdx(null);
    setErrorMsg(null);

    try {
      const results = await discoverShapes(startPoint, {
        activity: act,
        targetDistance: km * 1000,
        maxResults: 7,
        onProgress: (p) => current() && setPhase(p),
      });
      if (!current()) return;

      if (results.length === 0) {
        setPhase("error");
        setErrorMsg("No shapes fit here at this distance. Try another distance or move your start.");
        return;
      }
      setCandidates(results);
      setSelectedIdx(0); // best match
      setPhase("done");
    } catch (err) {
      if (!current()) return;
      console.error("Discovery failed:", err);
      setPhase("error");
      setErrorMsg(err.message || "Failed to discover shapes");
    }
  }, []);

  // Re-discover whenever the inputs change (also runs on first load)
  useEffect(() => {
    discover(start.point, activity, distanceKm);
  }, [start, activity, distanceKm, discover]);

  const chooseActivity = (key) => {
    setActivity(key);
    if (!DISTANCES[key].includes(distanceKm)) setDistanceKm(DISTANCES[key][0]);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setPhase("error");
      setErrorMsg("Your browser can't share its location. Tap the map to choose a start instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setStart({ point: [pos.coords.latitude, pos.coords.longitude], label: "Your location" });
      },
      () => {
        setLocating(false);
        setPhase("error");
        setErrorMsg("Couldn't get your location. Tap the map to choose a start instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const isLoading = phase === "fetching" || phase === "building" || phase === "fitting";
  const selectedCandidate = selectedIdx !== null ? candidates[selectedIdx] : null;

  // Route object for the map and GPX export
  const route = selectedCandidate
    ? {
        name: selectedCandidate.name,
        coords: selectedCandidate.coords,
        dist: formatDist(selectedCandidate.distance),
        time: formatTime(selectedCandidate.distance, activity),
        activity,
        start: start.label,
        startCoord: selectedCandidate.coords[0],
      }
    : null;
  const leadIn = selectedCandidate?.leadIn;

  const previewRoutes = candidates.filter((_, i) => i !== selectedIdx).map((c) => c.coords);

  const phaseLabel = {
    fetching: "Loading roads...",
    building: "Building graph...",
    fitting: "Finding shapes...",
  };

  const chip = (active) =>
    `rounded-xl text-xs font-semibold transition-all ${
      active
        ? "border-2 border-accent bg-accent/10 text-accent"
        : "border border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-white/15 hover:text-white/60"
    }`;

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
              <span className="text-[10px] text-white/25 font-mono font-normal">v0.5.0</span>
            </div>
            <div className="text-[9px] text-white/25 font-mono tracking-widest">SEATTLE</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 px-4 py-3 pb-8">
        {/* Controls: activity, distance, start */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex gap-2">
            {ACTIVITIES.map((a) => (
              <button key={a.key} onClick={() => chooseActivity(a.key)} className={`flex-1 py-2.5 ${chip(activity === a.key)}`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[...DISTANCES[activity]].sort((a, b) => a - b).map((km) => (
              <button key={km} onClick={() => setDistanceKm(km)} className={`flex-1 py-2 ${chip(distanceKm === km)}`}>
                <div>{km} km</div>
                <div className="text-[9px] font-mono opacity-60">{(km / 1.60934).toFixed(1)} mi</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={useMyLocation} disabled={locating} className={`shrink-0 px-3 py-2 ${chip(start.label === "Your location")}`}>
              {locating ? "Locating..." : "📍 My location"}
            </button>
            {Object.values(LOCATIONS).map((loc) => (
              <button
                key={loc.name}
                onClick={() => setStart({ point: loc.center, label: loc.name })}
                className={`shrink-0 px-3 py-2 ${chip(start.label === loc.name)}`}
              >
                {loc.name}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-white/30 font-mono">
            Start: {start.label} · tap the map to move it
          </div>
        </div>

        {/* Map */}
        <RouteMap
          route={route}
          loading={isLoading}
          previewRoutes={previewRoutes}
          startPoint={start.point}
          leadIn={leadIn?.coords}
          onMapClick={(lat, lng) => setStart({ point: [lat, lng], label: "Dropped pin" })}
        />

        {/* Loading status */}
        {isLoading && (
          <div className="relative z-20 -mt-9 ml-3 mb-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-900/95 border border-accent/30">
            <span className="text-accent text-sm animate-pulse">{phaseLabel[phase]}</span>
          </div>
        )}

        {/* Route badge */}
        {route && !isLoading && (
          <div className="relative z-20 -mt-9 ml-3 mb-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-dark-900/95 border border-accent/30">
            <span className="text-accent font-semibold text-sm">
              {selectedCandidate.icon} &ldquo;{route.name}&rdquo;
            </span>
            <span className="text-white/35 text-xs font-mono">{route.dist}</span>
            <span className="text-white/20 text-[10px] font-mono">
              overlap:{(selectedCandidate.metrics.iou * 100).toFixed(0)}% score:{selectedCandidate.score.toFixed(2)}
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
                  <div className="text-[9px] text-white/20 font-mono mt-0.5">{formatDist(c.distance)}</div>
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
                    {leadIn?.distance > 30
                      ? `Loop starts ${formatDist(leadIn.distance)} from ${start.label.toLowerCase() === "your location" ? "you" : start.label}`
                      : `Loop starts at ${start.label}`}
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${route.startCoord[0]},${route.startCoord[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-500/60 hover:text-green-500 underline"
                  >
                    Open loop start in Google Maps
                  </a>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Loop", route.dist],
                  ["Est. time", route.time],
                  ["Target", `${distanceKm} km`],
                ].map(([label, value]) => (
                  <div key={label} className="py-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <div className="text-lg font-bold text-accent font-mono">{value}</div>
                    <div className="text-[9px] text-white/25 font-mono mt-0.5">{label}</div>
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
