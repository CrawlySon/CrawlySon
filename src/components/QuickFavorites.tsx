"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";
import type { Favorite } from "@/lib/types";

export default function QuickFavorites({
  date,
  reloadSignal,
  onLogged,
}: {
  date: string;
  reloadSignal: number;
  onLogged: () => void;
}) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const { favorites } = await api.getFavorites();
      setFavorites(favorites);
    } catch {
      /* ignoruj – nech to nezhodí stránku */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  async function add(fav: Favorite) {
    if (busy) return;
    setBusy(fav.id);
    try {
      await api.logFavorite(fav.id, date);
      onLogged();
    } finally {
      setBusy(null);
    }
  }

  async function remove(fav: Favorite) {
    await api.deleteFavorite(fav.id);
    setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
  }

  if (favorites.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">⚡ Rýchle pridanie</h2>
        <button onClick={() => setEdit((e) => !e)} className="text-xs font-medium text-brand-600">
          {edit ? "hotovo" : "upraviť"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {favorites.map((fav) => {
          const kcal = round(fav.items.reduce((s, i) => s + (i.calories || 0), 0));
          const multi = fav.items.length > 1;
          return (
            <button
              key={fav.id}
              onClick={() => (edit ? remove(fav) : add(fav))}
              disabled={busy === fav.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition active:scale-95 disabled:opacity-50 ${
                edit
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-brand-100 bg-white text-slate-700 shadow-sm"
              }`}
              title={fav.items.map((i) => i.name).join(" + ")}
            >
              {edit ? <span>✕</span> : <span className="text-brand-500">＋</span>}
              <span className="max-w-[44vw] truncate font-medium">{fav.name}</span>
              <span className="text-xs text-slate-400">
                {kcal} kcal{multi ? ` · ${fav.items.length}×` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
