"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCache, setCache } from "@/lib/page-cache";

type State = { kg: number | null; previous: { kg: number; date: string } | null };
const weightKey = (date: string) => `weight:${date}`;

function prettyDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

export default function WeightCard({ date, reloadSignal }: { date: string; reloadSignal: number }) {
  const cached = getCache<State>(weightKey(date));
  const [kg, setKg] = useState<number | null>(cached?.kg ?? null);
  const [previous, setPrevious] = useState<State["previous"]>(cached?.previous ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = getCache<State>(weightKey(date));
    if (c) {
      setKg(c.kg);
      setPrevious(c.previous);
    }
    const d = await api.getWeight(date);
    setKg(d.kg);
    setPrevious(d.previous);
    setCache(weightKey(date), { kg: d.kg, previous: d.previous });
  }, [date]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  // Pri otvorení editácie predvyplň poslednú známu hodnotu – zmena býva malá.
  function openEditor() {
    setDraft(String(kg ?? previous?.kg ?? ""));
    setEditing(true);
  }

  async function save(value: number) {
    const rounded = Math.round(value * 10) / 10;
    if (!Number.isFinite(rounded) || rounded < 20 || rounded > 400) return;
    setBusy(true);
    setKg(rounded); // optimisticky
    setEditing(false);
    try {
      await api.setWeight(date, rounded);
      await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setKg(null);
    setEditing(false);
    try {
      await api.deleteWeight(date);
      await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Zmena oproti poslednému skoršiemu záznamu
  const diff = kg != null && previous ? Math.round((kg - previous.kg) * 10) / 10 : null;

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-slate-700">⚖️ Hmotnosť</h2>
        {kg != null ? (
          <span className="text-sm text-slate-500">
            <b className="text-slate-800">{kg.toFixed(1)} kg</b>
            {diff != null && diff !== 0 && (
              <span className={`ml-1.5 ${diff < 0 ? "text-brand-600" : "text-amber-600"}`}>
                {diff > 0 ? "+" : ""}
                {diff.toFixed(1)} kg
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </div>

      {!editing && (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={openEditor} disabled={busy} className="btn-ghost flex-1 py-2 text-sm">
            {kg != null ? "Upraviť hmotnosť" : "＋ Zapísať hmotnosť"}
          </button>
          {kg != null && (
            <button onClick={remove} disabled={busy} className="px-2 text-sm text-slate-300 hover:text-red-400">
              ✕
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraft((d) => String(Math.round(((parseFloat(d.replace(",", ".")) || 0) - 0.1) * 10) / 10))}
              className="btn-ghost px-3 py-2 text-base leading-none"
              aria-label="Ubrať 0,1 kg"
            >
              −
            </button>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save(parseFloat(draft.replace(",", ".")))}
              inputMode="decimal"
              placeholder="napr. 82,4"
              className="input flex-1 text-center"
            />
            <span className="text-sm text-slate-400">kg</span>
            <button
              onClick={() => setDraft((d) => String(Math.round(((parseFloat(d.replace(",", ".")) || 0) + 0.1) * 10) / 10))}
              className="btn-ghost px-3 py-2 text-base leading-none"
              aria-label="Pridať 0,1 kg"
            >
              +
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost flex-1 py-2 text-sm">
              Zrušiť
            </button>
            <button
              onClick={() => save(parseFloat(draft.replace(",", ".")))}
              disabled={busy || !draft.trim()}
              className="btn-primary flex-1 py-2 text-sm"
            >
              Uložiť
            </button>
          </div>
        </div>
      )}

      {previous && (
        <p className="mt-1.5 text-xs text-slate-400">
          Naposledy {previous.kg.toFixed(1)} kg ({prettyDate(previous.date)})
        </p>
      )}
    </div>
  );
}
