"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { api } from "@/lib/api";
import { round, sumTotals, todayISO } from "@/lib/nutrition";
import { MEAL_LABELS, MEAL_ORDER, type Entry, type FavoriteItem, type MealType, type Profile } from "@/lib/types";
import MacroSummary from "@/components/MacroSummary";
import AddFoodSheet from "@/components/AddFoodSheet";
import WaterCard from "@/components/WaterCard";
import QuickFavorites from "@/components/QuickFavorites";

function entryToFavItem(e: Entry): FavoriteItem {
  return {
    name: e.name,
    quantityGrams: e.quantityGrams,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    fiber: e.fiber,
    category: e.category,
    subcategory: e.subcategory,
    healthIndex: e.healthIndex,
  };
}

function shiftDate(date: string, days: number): string {
  // Čisto lokálny výpočet (bez UTC posunu cez toISOString)
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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
  const [reload, setReload] = useState(0);
  const [favReload, setFavReload] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

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

  const refreshAll = useCallback(() => {
    setReload((r) => r + 1);
    load();
  }, [load]);

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await api.deleteEntry(id).catch(load);
  }

  async function saveFavorite(name: string, mealType: MealType, items: FavoriteItem[]) {
    const trimmed = name.trim();
    if (!trimmed || items.length === 0) return;
    try {
      await api.addFavorite({ name: trimmed, mealType, items });
      setFavReload((r) => r + 1);
    } catch (e: any) {
      alert(e?.message || "Nepodarilo sa uložiť obľúbené.");
    }
  }

  function saveEntryAsFavorite(entry: Entry) {
    const name = window.prompt("Názov obľúbeného:", entry.name);
    if (name == null) return;
    saveFavorite(name, entry.mealType, [entryToFavItem(entry)]);
  }

  function saveMealAsFavorite(meal: MealType, list: Entry[]) {
    if (list.length === 0) return;
    const suggested = list.length === 1 ? list[0].name : MEAL_LABELS[meal];
    const name = window.prompt(`Uložiť ${list.length} ${list.length === 1 ? "položku" : "položky/iek"} ako obľúbené. Názov:`, suggested);
    if (name == null) return;
    saveFavorite(name, meal, list.map(entryToFavItem));
  }

  async function moveEntry(id: string, target: MealType) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, mealType: target } : e)));
    try {
      await api.updateEntry(id, { mealType: target });
    } catch {
      load();
    }
  }

  function onDragEnd(ev: DragEndEvent) {
    setActiveId(null);
    const id = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId || !overId.startsWith("meal:")) return;
    const target = overId.slice("meal:".length) as MealType;
    const entry = entries.find((e) => e.id === id);
    if (entry && entry.mealType !== target) moveEntry(id, target);
  }

  const totals = sumTotals(entries);

  // Vážené priemerné skóre zdravosti dňa (váha = hmotnosť, fallback z kalórií)
  const dayHealth = (() => {
    let s = 0;
    let w = 0;
    for (const e of entries) {
      if (e.healthIndex == null) continue;
      const wt = e.quantityGrams && e.quantityGrams > 0 ? e.quantityGrams : e.calories > 0 ? e.calories / 2 : 100;
      s += e.healthIndex * wt;
      w += wt;
    }
    return w > 0 ? Math.round((s / w) * 10) / 10 : null;
  })();

  return (
    <div className="px-4 pt-4">
      {/* Hlavička s dátumom */}
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="rounded-full bg-white p-2 shadow-sm">
          ‹
        </button>
        <div className="text-center">
          {/* Ťuknutím na dátum sa otvorí kalendár (natívny date picker) */}
          <label className="relative inline-flex cursor-pointer items-center gap-1">
            <h1 className="text-lg font-bold capitalize text-slate-800">{formatDate(date)}</h1>
            <span className="text-slate-400">📅</span>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Vyber dátum"
            />
          </label>
          {date !== todayISO() && (
            <button onClick={() => setDate(todayISO())} className="block w-full text-xs text-brand-600">
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

      {profile && <MacroSummary totals={totals} profile={profile} healthScore={dayHealth} />}

      <WaterCard date={date} reloadSignal={reload} />

      <QuickFavorites date={date} reloadSignal={favReload} onLogged={refreshAll} />

      {/* Jedlá podľa typu (drag & drop medzi jedlami – podrž a presuň) */}
      <DndContext
        sensors={sensors}
        onDragStart={(ev: DragStartEvent) => setActiveId(String(ev.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-4 space-y-2">
          {MEAL_ORDER.map((meal) => {
            const list = entries.filter((e) => e.mealType === meal);
            const mealCals = sumTotals(list).calories;
            if (list.length === 0 && meal === "other" && !activeId) return null;
            return (
              <MealSection
                key={meal}
                meal={meal}
                mealCals={mealCals}
                empty={list.length === 0}
                dragging={!!activeId}
                onAdd={() => setSheet(meal)}
                onSaveFavorite={list.length > 0 ? () => saveMealAsFavorite(meal, list) : undefined}
              >
                {list.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    dimmed={activeId === e.id}
                    onDelete={() => handleDelete(e.id)}
                    onFavorite={() => saveEntryAsFavorite(e)}
                  />
                ))}
              </MealSection>
            );
          })}
        </div>

        <DragOverlay>
          {activeId
            ? (() => {
                const e = entries.find((x) => x.id === activeId);
                if (!e) return null;
                return (
                  <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-lg ring-2 ring-brand-300">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{e.name}</p>
                      <p className="text-xs text-slate-400">{round(e.calories)} kcal</p>
                    </div>
                  </div>
                );
              })()
            : null}
        </DragOverlay>
      </DndContext>

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
        <AddFoodSheet date={date} defaultMeal={sheet} onClose={() => setSheet(null)} onSaved={refreshAll} />
      )}
    </div>
  );
}

function MealSection({
  meal,
  mealCals,
  empty,
  dragging,
  onAdd,
  onSaveFavorite,
  children,
}: {
  meal: MealType;
  mealCals: number;
  empty: boolean;
  dragging: boolean;
  onAdd: () => void;
  onSaveFavorite?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `meal:${meal}` });
  return (
    <section
      ref={setNodeRef}
      className={`card overflow-hidden transition ${isOver ? "ring-2 ring-brand-400" : ""}`}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-slate-700">{MEAL_LABELS[meal]}</h2>
          {mealCals > 0 && <span className="text-xs text-slate-400">{round(mealCals)} kcal</span>}
        </div>
        <div className="flex items-center gap-3">
          {onSaveFavorite && (
            <button
              onClick={onSaveFavorite}
              className="text-sm text-amber-500"
              title="Uložiť celé jedlo ako obľúbené"
            >
              ★
            </button>
          )}
          <button onClick={onAdd} className="text-sm font-medium text-brand-600">
            + pridať
          </button>
        </div>
      </div>
      {!empty && <ul className="divide-y divide-slate-50">{children}</ul>}
      {empty && dragging && (
        <div className="mx-3 mb-3 rounded-xl border-2 border-dashed border-brand-200 py-4 text-center text-xs text-brand-400">
          presuň sem
        </div>
      )}
    </section>
  );
}

function entryHealthColor(h: number): string {
  if (h >= 7) return "text-brand-600";
  if (h >= 4) return "text-amber-600";
  return "text-red-500";
}

function EntryRow({
  entry,
  dimmed,
  onDelete,
  onFavorite,
}: {
  entry: Entry;
  dimmed: boolean;
  onDelete: () => void;
  onFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: entry.id });
  return (
    <li className={`flex items-center gap-1.5 px-3 py-1.5 ${dimmed ? "opacity-30" : ""}`}>
      {/* Úchyt na presun – podrž a ťahaj */}
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab touch-none select-none px-0.5 text-slate-300 active:cursor-grabbing"
        title="Podrž a presuň do iného jedla"
        aria-label="Presunúť"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium text-slate-800">
          {entry.name}
          {entry.source === "ai" && <span className="ml-1 text-[10px] text-brand-500">✨</span>}
        </p>
        <p className="text-[11px] leading-tight text-slate-400">
          {entry.quantityGrams ? `${round(entry.quantityGrams)} g · ` : ""}
          B {round(entry.protein)} · S {round(entry.carbs)} · T {round(entry.fat)}
          {entry.healthIndex != null && (
            <span className={`ml-1 font-medium ${entryHealthColor(entry.healthIndex)}`}>· ♥ {entry.healthIndex}</span>
          )}
        </p>
      </div>
      <span className="text-sm font-semibold text-slate-600">{round(entry.calories)}</span>
      <button onClick={onFavorite} className="px-0.5 text-slate-300 hover:text-amber-500" title="Uložiť ako obľúbené">
        ★
      </button>
      <button onClick={onDelete} className="px-0.5 text-slate-300 hover:text-red-400">
        ✕
      </button>
    </li>
  );
}
