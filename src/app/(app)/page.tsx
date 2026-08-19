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
import { clearCache, getCache, setCache } from "@/lib/page-cache";
import { checkBadges } from "@/lib/badge-check";
import { showToast } from "@/lib/toast";
import { round, sumTotals, todayISO } from "@/lib/nutrition";
import { MEAL_LABELS, MEAL_ORDER, type Entry, type FavoriteItem, type MealType, type Profile } from "@/lib/types";
import MacroSummary from "@/components/MacroSummary";
import AddFoodSheet from "@/components/AddFoodSheet";
import WaterCard from "@/components/WaterCard";
import SleepCard from "@/components/SleepCard";
import WeightCard from "@/components/WeightCard";
import SupplementCard from "@/components/SupplementCard";
import QuickFavorites from "@/components/QuickFavorites";
import CalendarPopup from "@/components/CalendarPopup";
import MoveDaySheet from "@/components/MoveDaySheet";

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

const entriesKey = (date: string) => `entries:${date}`;
const PROFILE_KEY = "profile";

export default function TodayPage() {
  const [date, setDate] = useState(todayISO());
  // Štart z cache (ak existuje) – pri návrate na záložku sa hneď ukáže posledný stav
  const [entries, setEntries] = useState<Entry[]>(() => getCache<Entry[]>(entriesKey(todayISO())) ?? []);
  const [profile, setProfile] = useState<Profile | null>(() => getCache<Profile>(PROFILE_KEY) ?? null);
  const [sheet, setSheet] = useState<MealType | null>(null);
  const [loading, setLoading] = useState(() => getCache(entriesKey(todayISO())) === undefined);
  const [reload, setReload] = useState(0);
  const [favReload, setFavReload] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hideFab, setHideFab] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [showMove, setShowMove] = useState(false);
  // Režim výberu položiek (kopírovanie do dnes / uloženie ako jedlo)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);

  // Plávajúce tlačidlo sa schová pri scrollovaní dole a zobrazí pri scrollovaní hore
  useEffect(() => {
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (y > lastY + 6 && y > 90) setHideFab(true);
      else if (y < lastY - 6) setHideFab(false);
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Aktualizácia záznamov, ktorá zároveň zapíše do cache (drží návrat na záložku svieži)
  const applyEntries = useCallback(
    (updater: Entry[] | ((prev: Entry[]) => Entry[])) => {
      setEntries((prev) => {
        const next = typeof updater === "function" ? (updater as (p: Entry[]) => Entry[])(prev) : updater;
        setCache(entriesKey(date), next);
        return next;
      });
    },
    [date]
  );

  const load = useCallback(async () => {
    // Ak máme dáta z cache, ukáž ich okamžite a obnov potichu na pozadí.
    const cachedEntries = getCache<Entry[]>(entriesKey(date));
    const cachedProfile = getCache<Profile>(PROFILE_KEY);
    setEntries(cachedEntries ?? []);
    if (cachedProfile) setProfile(cachedProfile);
    setLoading(cachedEntries === undefined);

    const [{ entries }, { profile }] = await Promise.all([api.getEntries(date), api.getProfile()]);
    setEntries(entries);
    setCache(entriesKey(date), entries);
    setProfile(profile);
    setCache(PROFILE_KEY, profile);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshAll = useCallback(() => {
    setReload((r) => r + 1);
    load();
    checkBadges(); // po pridaní jedla over, či pribudol odznak
  }, [load]);

  // Pri prvom otvorení založ základnú líniu odznakov (bez toastov)
  useEffect(() => {
    checkBadges();
  }, []);

  async function handleDelete(id: string) {
    applyEntries((prev) => prev.filter((e) => e.id !== id));
    await api.deleteEntry(id).catch(load);
  }

  async function editEntry(id: string, patch: Partial<Entry>) {
    applyEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      await api.updateEntry(id, patch);
    } catch {
      load();
    }
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

  // ── Výber položiek ────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Skopíruje vybrané záznamy na DNEŠNÝ deň (každý si nechá svoj typ jedla).
  async function copySelectedToToday() {
    const picked = entries.filter((e) => selected.has(e.id));
    if (!picked.length) return;
    setActionBusy(true);
    try {
      const today = todayISO();
      const items = picked.map((e) => ({
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
        confidence: 1,
        mealType: e.mealType,
      }));
      await api.addEntries({ date: today, mealType: "other", source: "copy", items });
      showToast({ emoji: "📋", title: "Skopírované do dnes", body: `${items.length} ${items.length === 1 ? "položka" : "položky/iek"}` });
      exitSelect();
      if (date === today) refreshAll();
    } catch (e: any) {
      showToast({ emoji: "⚠️", title: "Kopírovanie zlyhalo", body: e?.message });
    } finally {
      setActionBusy(false);
    }
  }

  // Uloží vybrané záznamy ako JEDNU potravinu do databázy. Hodnoty sa spočítajú
  // a baseGrams = súčet gramáží → per-gram (aj per-100 g) sedí podľa gramáží.
  async function saveSelectedAsFood() {
    const picked = entries.filter((e) => selected.has(e.id));
    if (!picked.length) return;
    const defName = picked.length === 1 ? picked[0].name : "Kombinované jedlo";
    const name = window.prompt("Názov jedla do databázy:", defName);
    if (name == null || !name.trim()) return;
    setActionBusy(true);
    try {
      const sum = picked.reduce(
        (a, e) => ({
          calories: a.calories + e.calories,
          protein: a.protein + e.protein,
          carbs: a.carbs + e.carbs,
          fat: a.fat + e.fat,
          fiber: a.fiber + (e.fiber ?? 0),
          grams: a.grams + (e.quantityGrams ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 }
      );
      // vážený index zdravosti podľa hmotnosti (fallback z kalórií)
      let hSum = 0;
      let hW = 0;
      for (const e of picked) {
        if (e.healthIndex == null) continue;
        const w = e.quantityGrams && e.quantityGrams > 0 ? e.quantityGrams : e.calories > 0 ? e.calories / 2 : 100;
        hSum += e.healthIndex * w;
        hW += w;
      }
      const healthIndex = hW > 0 ? Math.round(hSum / hW) : null;
      // najčastejšia kategória
      const catCount = new Map<string, number>();
      for (const e of picked) if (e.category) catCount.set(e.category, (catCount.get(e.category) || 0) + 1);
      let category: string | null = null;
      let best = 0;
      for (const [c, n] of catCount) if (n > best) { best = n; category = c; }
      const baseGrams = sum.grams > 0 ? Math.round(sum.grams) : 100;
      await api.addFood({
        name: name.trim(),
        baseGrams,
        calories: round(sum.calories),
        protein: round(sum.protein, 1),
        carbs: round(sum.carbs, 1),
        fat: round(sum.fat, 1),
        fiber: sum.fiber > 0 ? round(sum.fiber, 1) : null,
        category,
        healthIndex,
      });
      showToast({ emoji: "💾", title: "Uložené do databázy", body: `${name.trim()} · ${baseGrams} g` });
      exitSelect();
    } catch (e: any) {
      showToast({ emoji: "⚠️", title: "Uloženie zlyhalo", body: e?.message });
    } finally {
      setActionBusy(false);
    }
  }

  async function moveEntry(id: string, target: MealType) {
    applyEntries((prev) => prev.map((e) => (e.id === id ? { ...e, mealType: target } : e)));
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
    <div className="px-4 pb-36 pt-4">
      {/* Hlavička s dátumom */}
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="rounded-full bg-white p-2 shadow-sm">
          ‹
        </button>
        <div className="text-center">
          {/* Ťuknutím na dátum sa otvorí vlastný kalendár s bodkami pri dňoch so záznamom */}
          <button
            onClick={() => setShowCal(true)}
            className="inline-flex cursor-pointer items-center gap-1"
            aria-label="Vyber dátum"
          >
            <h1 className="text-lg font-bold capitalize text-slate-800">{formatDate(date)}</h1>
            <span className="text-slate-400">📅</span>
          </button>
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

      {/* Prepínač výberu položiek (kopírovať do dnes / uložiť ako jedlo) */}
      {entries.length > 0 && (
        <div className="mb-1 mt-4 flex items-center justify-between px-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Jedlá</span>
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className="text-xs font-medium text-brand-600"
          >
            {selectMode ? "Zrušiť výber" : "✓ Vybrať položky"}
          </button>
        </div>
      )}

      {/* Jedlá podľa typu (drag & drop medzi jedlami – podrž a presuň) */}
      <DndContext
        sensors={sensors}
        onDragStart={(ev: DragStartEvent) => setActiveId(String(ev.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-2 space-y-2">
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
                    selectMode={selectMode}
                    selected={selected.has(e.id)}
                    onToggleSelect={() => toggleSelect(e.id)}
                    onDelete={() => handleDelete(e.id)}
                    onFavorite={() => saveEntryAsFavorite(e)}
                    onEdit={(patch) => editEntry(e.id, patch)}
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

      {/* Oprava omylom zapísaného dňa – presunie/skopíruje jedlá na iný dátum */}
      {entries.length > 0 && (
        <button
          onClick={() => setShowMove(true)}
          className="mt-2 w-full py-2 text-center text-xs text-slate-400 hover:text-brand-600"
        >
          ⇄ Presunúť záznamy dňa na iný dátum
        </button>
      )}

      <SupplementCard date={date} reloadSignal={reload} />

      <SleepCard date={date} reloadSignal={reload} />

      <WeightCard date={date} reloadSignal={reload} />

      {!loading && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Zatiaľ žiadne jedlo. Klikni na <b className="text-brand-600">+</b> dole a nadiktuj čo si zjedol.
        </p>
      )}

      {/* Plávajúce tlačidlo – schová sa pri scrollovaní dole aj v režime výberu */}
      <button
        onClick={() => setSheet("other")}
        className={`fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/30 transition-all duration-300 active:scale-95 ${
          hideFab || selectMode ? "pointer-events-none translate-y-28 opacity-0" : "opacity-100"
        }`}
      >
        ✨ Pridať jedlo
      </button>

      {/* Lišta akcií výberu */}
      {selectMode && (
        <div className="fixed inset-x-3 bottom-24 z-30 flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/5">
          <span className="text-sm font-medium text-slate-600">
            {selected.size} {selected.size === 1 ? "vybraté" : "vybraté"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={saveSelectedAsFood}
              disabled={selected.size === 0 || actionBusy}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 active:scale-95 disabled:opacity-40"
            >
              💾 Uložiť
            </button>
            <button
              onClick={copySelectedToToday}
              disabled={selected.size === 0 || actionBusy}
              className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white active:scale-95 disabled:opacity-40"
            >
              📋 Do dnes
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <AddFoodSheet date={date} defaultMeal={sheet} onClose={() => setSheet(null)} onSaved={refreshAll} />
      )}

      {showCal && (
        <CalendarPopup value={date} max={todayISO()} onSelect={setDate} onClose={() => setShowCal(false)} />
      )}

      {showMove && (
        <MoveDaySheet
          date={date}
          count={entries.length}
          onClose={() => setShowMove(false)}
          onDone={(target) => {
            setShowMove(false);
            // Zmenil sa zdrojový aj cieľový deň – zahoď cache záznamov aj histórie
            clearCache("entries:");
            clearCache("history:");
            setDate(target);
            refreshAll();
          }}
        />
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
  selectMode,
  selected,
  onToggleSelect,
  onDelete,
  onFavorite,
  onEdit,
}: {
  entry: Entry;
  dimmed: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onEdit: (patch: Partial<Entry>) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: entry.id });
  const [editing, setEditing] = useState(false);
  const [gramsStr, setGramsStr] = useState(String(entry.quantityGrams ?? ""));

  function openEditor() {
    setGramsStr(String(entry.quantityGrams ?? ""));
    setEditing(true);
  }

  // Zmena gramáže spätne prepočíta kcal a makrá (ak máme z čoho škálovať)
  function applyGrams() {
    const g = parseInt(gramsStr) || 0;
    const old = entry.quantityGrams ?? 0;
    if (old > 0 && g > 0) {
      const f = g / old;
      onEdit({
        quantityGrams: g,
        calories: round(entry.calories * f),
        protein: round(entry.protein * f, 1),
        carbs: round(entry.carbs * f, 1),
        fat: round(entry.fat * f, 1),
        fiber: entry.fiber != null ? round(entry.fiber * f, 1) : null,
      });
    } else {
      onEdit({ quantityGrams: g > 0 ? g : null });
    }
    setEditing(false);
  }

  return (
    <li className={`px-3 py-1.5 ${dimmed ? "opacity-30" : ""} ${selectMode && selected ? "bg-brand-50" : ""}`}>
      <div className="flex items-center gap-1.5">
        {selectMode ? (
          /* Zaškrtávacie políčko výberu */
          <button
            onClick={onToggleSelect}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs transition ${
              selected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-transparent"
            }`}
            aria-label={selected ? "Zrušiť výber" : "Vybrať"}
          >
            ✓
          </button>
        ) : (
          /* Úchyt na presun – podrž a ťahaj */
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
        )}
        <button
          onClick={selectMode ? onToggleSelect : openEditor}
          className="min-w-0 flex-1 text-left leading-tight"
          title={selectMode ? "Vybrať" : "Upraviť gramáž"}
        >
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
        </button>
        <span className="text-sm font-semibold text-slate-600">{round(entry.calories)}</span>
        {!selectMode && (
          <>
        <button onClick={openEditor} className="px-0.5 text-slate-300 hover:text-brand-500" title="Upraviť gramáž">
          ✎
        </button>
        <button onClick={onFavorite} className="px-0.5 text-slate-300 hover:text-amber-500" title="Uložiť ako obľúbené">
          ★
        </button>
        <button onClick={onDelete} className="px-0.5 text-slate-300 hover:text-red-400">
          ✕
        </button>
          </>
        )}
      </div>

      {editing && !selectMode && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-2">
          <span className="text-xs font-medium text-brand-700">Gramáž (g):</span>
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={gramsStr}
            onChange={(e) => setGramsStr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyGrams()}
            className="w-20 rounded-lg border border-brand-200 bg-white px-2 py-1 text-sm"
          />
          <button onClick={applyGrams} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white">
            Uložiť
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400">
            zrušiť
          </button>
          {entry.quantityGrams == null && (
            <span className="text-[10px] text-amber-600">bez pôvodnej gramáže sa makrá neprepočítajú</span>
          )}
        </div>
      )}
    </li>
  );
}
