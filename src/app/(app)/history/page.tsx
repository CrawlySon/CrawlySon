"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";
import type { Profile } from "@/lib/types";

type Day = { date: string; calories: number; protein: number; carbs: number; fat: number; count: number };

export default function HistoryPage() {
  const [days, setDays] = useState<Day[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [range, setRange] = useState(14);

  useEffect(() => {
    api.history(range).then((d) => setDays(d.days));
    api.getProfile().then((p) => setProfile(p.profile));
  }, [range]);

  const goal = profile?.goalCalories || 2000;
  const max = Math.max(goal, ...days.map((d) => d.calories), 1);
  const avg = days.length ? days.reduce((s, d) => s + d.calories, 0) / days.length : 0;

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold text-slate-800">História</h1>

      <div className="mb-4 flex gap-2">
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

      <div className="card mb-4 p-4">
        <p className="text-sm text-slate-500">Priemerný denný príjem</p>
        <p className="text-2xl font-bold text-slate-800">
          {round(avg)} <span className="text-base font-normal text-slate-400">kcal / cieľ {goal}</span>
        </p>
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">Zatiaľ žiadne záznamy v tomto období.</p>
      ) : (
        <div className="card divide-y divide-slate-50">
          {days.map((d) => {
            const pct = Math.min(100, (d.calories / max) * 100);
            const over = d.calories > goal;
            return (
              <div key={d.date} className="px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium capitalize text-slate-700">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("sk-SK", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    })}
                  </span>
                  <span className={over ? "text-red-500" : "text-slate-600"}>
                    {round(d.calories)} kcal
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${over ? "bg-red-400" : "bg-brand-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  B {round(d.protein)} g · S {round(d.carbs)} g · T {round(d.fat)} g · {d.count} položiek
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
