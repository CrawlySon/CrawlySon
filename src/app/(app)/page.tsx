"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { round, sumTotals, todayISO } from "@/lib/nutrition";
import { MEAL_LABELS, MEAL_ORDER, type Entry, type MealType, type Profile } from "@/lib/types";
import MacroSummary from "@/components/MacroSummary";
import AddFoodSheet from "@/components/AddFoodSheet";

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  if (date === todayISO()) return "Dnes";
  if (date === shiftDate(todayISO(), -1)) return "Včera";
  return new Date(date + "T00:00:00").toLocaleDateString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export default function TodayPage() {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sheet, setSheet] = useState<MealType | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ entries }, { profile }] = await Promise.all([api.getEntries(date), api.getProfile()]);
    setEntries(entries);
    setProfile(profile);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await api.deleteEntry(id).catch(load);
  }

  const totals = sumTotals(entries);

  return (
    <div className="px-4 pt-4">
      {/* Hlavička s dátumom */}
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="rounded-full bg-white p-2 shadow-sm">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold capitalize text-slate-800">{formatDate(date)}</h1>
          {date !== todayISO() && (
            <button onClick={() => setDate(todayISO())} className="text-xs text-brand-600">
              späť na dnes
            </button>
          )}
        </div>
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          disabled={date >= todayISO()}
          className="rounded-full bg-white p-2 shadow-sm disabled:opacity-30"
        >
          ›
        </button>
      </header>

      {profile && <MacroSummary totals={totals} profile={profile} />}

      {/* Jedlá podľa typu */}
      <div className="mt-4 space-y-3">
        {MEAL_ORDER.map((meal) => {
          const list = entries.filter((e) => e.mealType === meal);
          const mealCals = sumTotals(list).calories;
          if (list.length === 0 && meal === "other") return null;
          return (
            <section key={meal} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <h2 className="font-semibold text-slate-700">{MEAL_LABELS[meal]}</h2>
                  {mealCals > 0 && <span className="text-xs text-slate-400">{round(mealCals)} kcal</span>}
                </div>
                <button onClick={() => setSheet(meal)} className="text-sm font-medium text-brand-600">
                  + pridať
                </button>
              </div>
              {list.length > 0 && (
                <ul className="divide-y divide-slate-50">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {e.name}
                          {e.source === "ai" && <span className="ml-1 text-[10px] text-brand-500">✨</span>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {e.quantityGrams ? `${round(e.quantityGrams)} g · ` : ""}
                          B {round(e.protein)} · S {round(e.carbs)} · T {round(e.fat)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-slate-600">{round(e.calories)}</span>
                      <button onClick={() => handleDelete(e.id)} className="text-slate-300 hover:text-red-400">
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {!loading && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Zatiaľ žiadne jedlo. Klikni na <b className="text-brand-600">+</b> dole a nadiktuj čo si zjedol.
        </p>
      )}

      {/* Plávajúce tlačidlo */}
      <button
        onClick={() => setSheet("other")}
        className="fixed bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 active:scale-95"
      >
        ✨ Pridať jedlo
      </button>

      {sheet && (
        <AddFoodSheet date={date} defaultMeal={sheet} onClose={() => setSheet(null)} onSaved={load} />
      )}
    </div>
  );
}
