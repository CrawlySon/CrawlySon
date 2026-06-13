"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";

type Food = {
  id: string;
  userId: string | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  healthIndex: number | null;
  baseGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
};

type Scope = "all" | "mine" | "global";
const EMPTY = { name: "", category: "", baseGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function FoodsPage() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [foods, setFoods] = useState<Food[]>([]);
  const [adding, setAdding] = useState(false);
  const [building, setBuilding] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(() => {
    api.searchFoods(q, scope).then((r) => setFoods(r.foods));
  }, [q, scope]);

  async function seed() {
    setSeeding(true);
    try {
      await api.seed();
      load();
    } finally {
      setSeeding(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function add() {
    if (!form.name) return;
    await api.addFood(form);
    setForm(EMPTY);
    setAdding(false);
    setScope("mine");
    load();
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-3 text-xl font-bold text-slate-800">Databáza potravín</h1>

      {/* Prepínač rozsahu */}
      <div className="mb-3 flex rounded-xl bg-slate-200 p-1 text-sm">
        {([
          ["all", "Všetko"],
          ["mine", "Moje"],
          ["global", "Globálne"],
        ] as [Scope, string][]).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`flex-1 rounded-lg py-1.5 font-medium ${scope === s ? "bg-white shadow" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Akcie: vlastná potravina + skladanie jedla */}
      <div className="mb-3 flex gap-2">
        <button onClick={() => { setAdding((a) => !a); setBuilding(false); }} className="btn-ghost flex-1 text-sm">
          {adding ? "zrušiť" : "+ vlastná potravina"}
        </button>
        <button onClick={() => { setBuilding((b) => !b); setAdding(false); }} className="btn-ghost flex-1 text-sm">
          {building ? "zrušiť" : "🍲 jedlo zo surovín"}
        </button>
      </div>

      {adding && (
        <div className="card mb-4 space-y-2 p-3">
          <input
            className="input"
            placeholder="Názov potraviny"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <FieldNum label="Na koľko g" v={form.baseGrams} on={(v) => setForm({ ...form, baseGrams: v })} />
            <FieldNum label="kcal" v={form.calories} on={(v) => setForm({ ...form, calories: v })} />
            <FieldNum label="Bielkoviny g" v={form.protein} on={(v) => setForm({ ...form, protein: v })} />
            <FieldNum label="Sacharidy g" v={form.carbs} on={(v) => setForm({ ...form, carbs: v })} />
            <FieldNum label="Tuky g" v={form.fat} on={(v) => setForm({ ...form, fat: v })} />
          </div>
          <button onClick={add} className="btn-primary w-full">
            Uložiť potravinu
          </button>
        </div>
      )}

      {building && (
        <RecipeBuilder
          onSaved={() => {
            setBuilding(false);
            setScope("mine");
            load();
          }}
        />
      )}

      {/* Seed / doplnenie globálnej databázy */}
      {((scope !== "mine" && foods.length === 0 && !q) || scope === "global") && (
        <div className="card mb-3 p-3 text-center">
          {foods.length === 0 ? (
            <p className="mb-2 text-sm text-slate-600">Globálna databáza je zatiaľ prázdna.</p>
          ) : (
            <p className="mb-2 text-xs text-slate-400">Chýbajú ti základné potraviny? Doplň globálnu databázu.</p>
          )}
          <button onClick={seed} disabled={seeding} className="btn-primary w-full">
            {seeding ? "Napĺňam…" : "Naplniť / doplniť globálnu databázu"}
          </button>
        </div>
      )}

      <input className="input mb-3" placeholder="Hľadaj…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card divide-y divide-slate-50">
        {foods.map((f) => (
          <FoodRow key={f.id} food={f} onChanged={load} />
        ))}
        {q && foods.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nič nenájdené.</p>}
      </div>
    </div>
  );
}

function RecipeBuilder({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Hotové jedlo");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [ingredients, setIngredients] = useState<{ food: Food; grams: number }[]>([]);
  const [finalWeight, setFinalWeight] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.searchFoods(q, "all").then((r) => setResults(r.foods));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function addIngredient(food: Food) {
    setIngredients((prev) => [...prev, { food, grams: food.baseGrams || 100 }]);
    setQ("");
    setResults([]);
  }
  function setGrams(idx: number, grams: number) {
    setIngredients((prev) => prev.map((it, i) => (i === idx ? { ...it, grams } : it)));
  }
  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  // Súčty zo surovín
  const totals = ingredients.reduce(
    (a, { food, grams }) => {
      const f = grams / (food.baseGrams || 100);
      a.calories += food.calories * f;
      a.protein += food.protein * f;
      a.carbs += food.carbs * f;
      a.fat += food.fat * f;
      a.grams += grams;
      a.hSum += (food.healthIndex ?? 5) * grams;
      return a;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0, hSum: 0 }
  );

  const weight = Number(finalWeight) > 0 ? Number(finalWeight) : totals.grams;
  const avgHealth = totals.grams > 0 ? Math.round(totals.hSum / totals.grams) : null;

  async function save() {
    if (!name.trim() || ingredients.length === 0 || weight <= 0) return;
    setBusy(true);
    try {
      // Ulož ako potravinu: hodnoty zodpovedajú „weight" g hotového jedla.
      await api.addFood({
        name: name.trim(),
        category,
        baseGrams: Math.round(weight),
        calories: round(totals.calories),
        protein: round(totals.protein, 1),
        carbs: round(totals.carbs, 1),
        fat: round(totals.fat, 1),
        healthIndex: avgHealth,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 space-y-3 p-3">
      <p className="text-sm font-semibold text-slate-600">🍲 Vlastné jedlo zo surovín</p>
      <input className="input" placeholder="Názov jedla (napr. Sviečková po domácky)" value={name} onChange={(e) => setName(e.target.value)} />

      {/* Pridávanie surovín */}
      <div>
        <input className="input" placeholder="Pridaj surovinu (hľadaj v databáze)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {results.map((f) => (
              <button
                key={f.id}
                onClick={() => addIngredient(f)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 bg-white px-2 py-1.5 text-left text-sm"
              >
                <span className="truncate">{f.name}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{f.calories} kcal/{f.baseGrams} g</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zoznam surovín */}
      {ingredients.length > 0 && (
        <ul className="space-y-1">
          {ingredients.map((it, idx) => (
            <li key={idx} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{it.food.name}</span>
              <input
                type="number"
                inputMode="numeric"
                value={it.grams}
                onChange={(e) => setGrams(idx, Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right"
              />
              <span className="text-xs text-slate-400">g</span>
              <button onClick={() => removeIngredient(idx)} className="text-slate-300 hover:text-red-400">✕</button>
            </li>
          ))}
        </ul>
      )}

      {ingredients.length > 0 && (
        <>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Spolu zo surovín: <b>{round(totals.calories)} kcal</b> · B {round(totals.protein)} · S {round(totals.carbs)} · T {round(totals.fat)} · {round(totals.grams)} g
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FieldText label="Kategória" v={category} on={setCategory} />
            <label className="text-xs">
              <span className="text-slate-400">Hotová hmotnosť (g)</span>
              <input
                type="number"
                inputMode="numeric"
                className="input mt-0.5 py-1.5"
                placeholder={`${round(totals.grams)}`}
                value={finalWeight}
                onChange={(e) => setFinalWeight(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Uloží sa ako jedlo s priemerom <b>{weight > 0 ? round((totals.calories / weight) * 100) : 0} kcal/100 g</b>. Potom
            stačí zadať gramáž porcie (napr. 400 g) a hodnoty sa prepočítajú.
          </p>
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary w-full">
            {busy ? "Ukladám…" : "Uložiť jedlo do mojej databázy"}
          </button>
        </>
      )}
    </div>
  );
}

function FoodRow({ food, onChanged }: { food: Food; onChanged: () => void }) {
  const owned = food.userId != null; // globálne (userId null) sú len na čítanie
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>(food);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateFood(food.id, {
        name: draft.name,
        category: draft.category,
        subcategory: draft.subcategory,
        baseGrams: draft.baseGrams,
        calories: draft.calories,
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        fiber: draft.fiber,
        healthIndex: draft.healthIndex,
      });
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Zmazať „${food.name}" z databázy?`)) return;
    setBusy(true);
    try {
      await api.deleteFood(food.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={() => owned && setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">
            {food.name}
            {!owned && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">globálne</span>}
          </p>
          <p className="text-xs text-slate-400">
            na {food.baseGrams} g · B {food.protein} · S {food.carbs} · T {food.fat}
            {food.category ? ` · ${food.category}` : ""}
            {food.healthIndex != null ? ` · ♥ ${food.healthIndex}/10` : ""}
          </p>
        </div>
        <span className="ml-2 shrink-0 text-sm font-semibold text-slate-600">{food.calories} kcal</span>
      </button>

      {open && owned && (
        <div className="mt-3 space-y-2">
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <FieldText label="Kategória" v={draft.category ?? ""} on={(v) => setDraft({ ...draft, category: v })} />
            <FieldText label="Podkategória" v={draft.subcategory ?? ""} on={(v) => setDraft({ ...draft, subcategory: v })} />
            <FieldNum label="Na koľko g" v={draft.baseGrams} on={(v) => setDraft({ ...draft, baseGrams: v })} />
            <FieldNum label="kcal" v={draft.calories} on={(v) => setDraft({ ...draft, calories: v })} />
            <FieldNum label="Bielkoviny g" v={draft.protein} on={(v) => setDraft({ ...draft, protein: v })} />
            <FieldNum label="Sacharidy g" v={draft.carbs} on={(v) => setDraft({ ...draft, carbs: v })} />
            <FieldNum label="Tuky g" v={draft.fat} on={(v) => setDraft({ ...draft, fat: v })} />
            <FieldNum label="Zdravosť 0–10" v={draft.healthIndex ?? 0} on={(v) => setDraft({ ...draft, healthIndex: Math.min(10, Math.max(0, v)) })} />
          </div>
          <div className="flex gap-2">
            <button onClick={remove} disabled={busy} className="btn-ghost text-red-500">
              Zmazať
            </button>
            <button onClick={save} disabled={busy} className="btn-primary flex-1">
              {busy ? "Ukladám…" : "Uložiť zmeny"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldNum({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="text-xs">
      <span className="text-slate-400">{label}</span>
      <input type="number" className="input mt-0.5 py-1.5" value={v} onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}

function FieldText({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="text-xs">
      <span className="text-slate-400">{label}</span>
      <input className="input mt-0.5 py-1.5" value={v} onChange={(e) => on(e.target.value)} />
    </label>
  );
}
