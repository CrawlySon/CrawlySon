"use client";

import { useState } from "react";
import { api } from "@/lib/api";

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function pretty(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

// Presunie alebo skopíruje všetky zapísané jedlá dňa na iný dátum.
// Slúži na opravu omylom zapísaného dňa (napr. včerajšie jedlá zapísané na dnes).
export default function MoveDaySheet({
  date,
  count,
  onClose,
  onDone,
}: {
  date: string;
  count: number;
  onClose: () => void;
  onDone: (targetDate: string) => void;
}) {
  const [target, setTarget] = useState(shiftDate(date, -1));
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (target === date) {
      setError("Vyber iný deň, než z ktorého presúvaš.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.moveEntries(date, target, mode);
      onDone(target);
    } catch (e: any) {
      setError(e?.message || "Nepodarilo sa presunúť záznamy.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800">Presunúť záznamy dňa</h2>
        <p className="mt-1 text-sm text-slate-500">
          Zo dňa <b className="capitalize text-slate-700">{pretty(date)}</b> · {count}{" "}
          {count === 1 ? "položka" : count < 5 ? "položky" : "položiek"}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setMode("move")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              mode === "move" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Presunúť
          </button>
          <button
            onClick={() => setMode("copy")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              mode === "copy" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Skopírovať
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">
          {mode === "move"
            ? "Záznamy sa prenesú – pôvodný deň ostane prázdny."
            : "Záznamy ostanú aj v pôvodnom dni a rovnaké pribudnú v cieľovom."}
        </p>

        <label className="label mt-3">Cieľový deň</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="input flex-1"
          />
          <button onClick={() => setTarget(shiftDate(date, -1))} className="btn-ghost px-3 py-2 text-xs">
            Včera
          </button>
          <button onClick={() => setTarget(shiftDate(date, 1))} className="btn-ghost px-3 py-2 text-xs">
            Zajtra
          </button>
        </div>
        {target && target !== date && (
          <p className="mt-1.5 text-xs text-slate-500">
            → <span className="capitalize">{pretty(target)}</span>
          </p>
        )}

        <p className="mt-3 rounded-xl bg-slate-50 p-2 text-xs text-slate-500">
          Týka sa iba zapísaných jedál. Voda, hodnotenie spánku ani suplementy a lieky sa nezmenia. Ak v cieľovom dni už
          nejaké jedlá sú, ostanú – tieto sa k nim pridajú.
        </p>

        {error && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={busy} className="btn-ghost flex-1">
            Zrušiť
          </button>
          <button onClick={submit} disabled={busy || !target} className="btn-primary flex-1">
            {busy ? "Presúvam…" : mode === "move" ? "Presunúť" : "Skopírovať"}
          </button>
        </div>
      </div>
    </div>
  );
}
