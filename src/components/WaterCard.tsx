"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCache, setCache } from "@/lib/page-cache";
import { checkBadges } from "@/lib/badge-check";

type Log = { id: string; ml: number; createdAt: string };
type WaterState = { total: number; goal: number; logs: Log[] };
const waterKey = (date: string) => `water:${date}`;

export default function WaterCard({ date, reloadSignal }: { date: string; reloadSignal: number }) {
  const cached = getCache<WaterState>(waterKey(date));
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [goal, setGoal] = useState(cached?.goal ?? 2500);
  const [logs, setLogs] = useState<Log[]>(cached?.logs ?? []);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = getCache<WaterState>(waterKey(date));
    if (c) {
      setTotal(c.total);
      setGoal(c.goal);
      setLogs(c.logs);
    }
    const d = await api.getWater(date);
    setTotal(d.total);
    setGoal(d.goal);
    setLogs(d.logs);
    setCache(waterKey(date), { total: d.total, goal: d.goal, logs: d.logs });
  }, [date]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  async function add(ml: number) {
    setBusy(true);
    setTotal((t) => Math.max(0, t + ml)); // optimisticky
    try {
      await api.addWater(date, ml);
      await load();
      checkBadges(); // splnenie cieľa vody môže odomknúť odznak
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function undoLast() {
    const last = logs[logs.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      await api.deleteWater(last.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const liters = (total / 1000).toFixed(total % 1000 === 0 ? 0 : 2);

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-slate-700">💧 Pitný režim</h2>
        <span className="text-sm text-slate-500">
          <b className="text-sky-600">{liters} l</b> / {(goal / 1000).toFixed(goal % 1000 === 0 ? 0 : 1)} l
        </span>
      </div>

      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-sky-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => add(250)} disabled={busy} className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 active:scale-95">
          + 250 ml
        </button>
        <button onClick={() => add(500)} disabled={busy} className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 active:scale-95">
          + 500 ml
        </button>
        <button onClick={() => add(750)} disabled={busy} className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 active:scale-95">
          + 750 ml
        </button>
        {logs.length > 0 && (
          <button onClick={undoLast} disabled={busy} className="ml-auto text-sm text-slate-400 hover:text-red-400">
            späť ({logs.length})
          </button>
        )}
      </div>
    </div>
  );
}
