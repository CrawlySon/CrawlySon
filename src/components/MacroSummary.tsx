"use client";

import { round } from "@/lib/nutrition";
import type { Totals, Profile } from "@/lib/types";

function Ring({ value, goal, color }: { value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className="transition-all duration-500"
      />
    </svg>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-slate-500">
          {round(value)} / {goal} g
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function healthText(h: number): string {
  if (h >= 7) return "text-brand-700";
  if (h >= 4) return "text-amber-600";
  return "text-red-600";
}

export default function MacroSummary({
  totals,
  profile,
  healthScore,
}: {
  totals: Totals;
  profile: Profile;
  healthScore?: number | null;
}) {
  const calLeft = profile.goalCalories - totals.calories;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <Ring value={totals.calories} goal={profile.goalCalories} color="#16a34a" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-800">{round(totals.calories)}</span>
            <span className="text-xs text-slate-400">/ {profile.goalCalories} kcal</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <MacroBar label="Bielkoviny" value={totals.protein} goal={profile.goalProtein} color="#3b82f6" />
          <MacroBar label="Sacharidy" value={totals.carbs} goal={profile.goalCarbs} color="#f59e0b" />
          <MacroBar label="Tuky" value={totals.fat} goal={profile.goalFat} color="#ef4444" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
        <span className="text-slate-600">
          {calLeft >= 0 ? (
            <>
              Môžeš zjesť ešte <b className="text-brand-700">{round(calLeft)} kcal</b> do limitu
            </>
          ) : (
            <>
              Prekročil si limit o <b className="text-red-600">{round(-calLeft)} kcal</b>
            </>
          )}
        </span>
        {healthScore != null && (
          <span className="shrink-0 whitespace-nowrap text-slate-500">
            zdravosť <b className={healthText(healthScore)}>♥ {healthScore}/10</b>
          </span>
        )}
      </div>
    </div>
  );
}
