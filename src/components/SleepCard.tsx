"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCache, setCache } from "@/lib/page-cache";

const sleepKey = (date: string) => `sleep:${date}`;

// Farba podľa kvality spánku (1..10): nízke červené, stredné žlté, vysoké zelené.
function scoreColor(score: number): string {
  if (score >= 7) return "bg-brand-600 text-white";
  if (score >= 4) return "bg-amber-400 text-white";
  return "bg-red-400 text-white";
}

function labelFor(score: number | null): string {
  if (score == null) return "Ako si sa vyspal(a)?";
  if (score >= 9) return "Perfektný spánok 🤩";
  if (score >= 7) return "Dobrý spánok 🙂";
  if (score >= 4) return "Priemerný spánok 😐";
  return "Zlý spánok 😴";
}

export default function SleepCard({ date, reloadSignal }: { date: string; reloadSignal: number }) {
  const cached = getCache<{ score: number | null }>(sleepKey(date));
  const [score, setScore] = useState<number | null>(cached?.score ?? null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = getCache<{ score: number | null }>(sleepKey(date));
    if (c) setScore(c.score);
    const d = await api.getSleep(date);
    setScore(d.score);
    setCache(sleepKey(date), { score: d.score });
  }, [date]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  async function pick(n: number) {
    const next = score === n ? null : n; // opätovné ťuknutie na to isté = zmazať
    setScore(next); // optimisticky
    setCache(sleepKey(date), { score: next });
    setBusy(true);
    try {
      if (next == null) await api.deleteSleep(date);
      else await api.setSleep(date, next);
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-slate-700">😴 Spánok</h2>
        <span className="text-sm text-slate-500">
          {score != null ? (
            <b className={score >= 7 ? "text-brand-600" : score >= 4 ? "text-amber-600" : "text-red-500"}>{score}/10</b>
          ) : (
            "—"
          )}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-slate-400">{labelFor(score)}</p>

      <div className="mt-3 grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const active = score === n;
          return (
            <button
              key={n}
              onClick={() => pick(n)}
              disabled={busy}
              className={`flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition active:scale-90 ${
                active ? scoreColor(n) : "bg-slate-100 text-slate-500"
              }`}
              aria-label={`Spánok ${n} z 10`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
