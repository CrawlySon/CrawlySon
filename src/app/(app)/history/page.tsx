"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";
import type { Profile } from "@/lib/types";

type Day = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
  healthScore: number | null;
  catCalories: number;
  catCount: number;
  waterMl: number;
};
type Category = { name: string; calories: number; count: number };

function healthColor(h: number): string {
  if (h >= 7) return "bg-brand-500";
  if (h >= 4) return "bg-amber-400";
  return "bg-red-400";
}
function healthText(h: number): string {
  if (h >= 7) return "text-brand-700";
  if (h >= 4) return "text-amber-600";
  return "text-red-600";
}

export default function HistoryPage() {
  const [days, setDays] = useState<Day[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [range, setRange] = useState(14);
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    api.history(range, category || undefined).then((d) => {
      setDays(d.days);
      if (!category) setCategories(d.categories);
    });
    api.getProfile().then((p) => setProfile(p.profile));
  }, [range, category]);

  const goal = profile?.goalCalories || 2000;
  const max = Math.max(goal, ...days.map((d) => d.calories), 1);
  const avg = days.length ? days.reduce((s, d) => s + d.calories, 0) / days.length : 0;

  const healthDays = days.filter((d) => d.healthScore != null);
  const avgHealth = healthDays.length
    ? healthDays.reduce((s, d) => s + (d.healthScore || 0), 0) / healthDays.length
    : null;
  const avgWater = days.length ? days.reduce((s, d) => s + (d.waterMl || 0), 0) / days.length : 0;

  const catMax = Math.max(...days.map((d) => d.catCalories), 1);

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold text-slate-800">História</h1>

      <div className="mb-3 flex gap-2">
        {[7, 14, 30].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-sm ${range === r ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {r} dní
          </button>
        ))}
      </div>

      {/* Filter podľa kategórie */}
      {categories.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory("")}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${category === "" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            Všetko
          </button>
          {categories.map((c) => (
            <button
              key={c.name}
              onClick={() => setCategory(c.name)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${category === c.name ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
            >
              {c.name} <span className="opacity-60">{c.calories} kcal</span>
            </button>
          ))}
        </div>
      )}

      {/* Súhrny */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs text-slate-500">Priemer kcal</p>
          <p className="text-xl font-bold text-slate-800">{round(avg)}</p>
          <p className="text-[11px] text-slate-400">cieľ {goal}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">Zdravosť</p>
          <p className={`text-xl font-bold ${avgHealth != null ? healthText(avgHealth) : "text-slate-300"}`}>
            {avgHealth != null ? `${round(avgHealth, 1)}` : "—"}
          </p>
          <p className="text-[11px] text-slate-400">z 10</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">💧 Voda</p>
          <p className="text-xl font-bold text-sky-600">{(avgWater / 1000).toFixed(1)} l</p>
          <p className="text-[11px] text-slate-400">priemer/deň</p>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">Zatiaľ žiadne záznamy v tomto období.</p>
      ) : (
        <div className="card divide-y divide-slate-50">
          {days.map((d) => {
            const showCat = category !== "";
            const value = showCat ? d.catCalories : d.calories;
            const pct = showCat ? Math.min(100, (d.catCalories / catMax) * 100) : Math.min(100, (d.calories / max) * 100);
            const over = !showCat && d.calories > goal;
            return (
              <div key={d.date} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-slate-700">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("sk-SK", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    {!showCat && d.healthScore != null && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthText(d.healthScore)} bg-slate-100`}>
                        ♥ {d.healthScore}
                      </span>
                    )}
                    <span className={over ? "text-red-500" : "text-slate-600"}>{round(value)} kcal</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      showCat ? "bg-slate-700" : over ? "bg-red-400" : d.healthScore != null ? healthColor(d.healthScore) : "bg-brand-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {showCat
                    ? `${d.catCount}× v kategórii „${category}"`
                    : `B ${round(d.protein)} g · S ${round(d.carbs)} g · T ${round(d.fat)} g${d.waterMl ? ` · 💧 ${(d.waterMl / 1000).toFixed(1)} l` : ""}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!category && (
        <p className="mt-3 px-1 text-xs text-slate-400">
          Farba pruhu = zdravosť dňa (zelená = zdravé, červená = menej zdravé). Klikni na kategóriu hore pre filter.
        </p>
      )}
    </div>
  );
}
