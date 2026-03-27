"use client";

export default function Directions({ route }) {
  if (!route) return null;

  return (
    <div className="p-4 rounded-xl bg-white/[0.015] border border-white/5 max-h-64 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-widest text-accent/50 font-mono mb-3">
        Turn-by-turn directions
      </div>
      <div className="flex flex-col gap-1">
        {route.turns.map((t, i) => {
          const isStart = i === 0;
          const isEnd = i === route.turns.length - 1;
          const iconColor = isStart
            ? "text-green-500"
            : isEnd
            ? "text-red-500"
            : "text-accent";

          return (
            <div
              key={i}
              className={`flex gap-3 items-start py-2 ${
                i < route.turns.length - 1
                  ? "border-b border-white/[0.03]"
                  : ""
              }`}
            >
              <span
                className={`text-sm min-w-[20px] text-center ${iconColor}`}
              >
                {t.icon}
              </span>
              <span className="text-xs text-white/55 leading-relaxed">
                {t.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
