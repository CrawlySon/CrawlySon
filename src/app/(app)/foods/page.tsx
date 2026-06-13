"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Food = {
  id: string;
  name: string;
  category: string | null;
  baseGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
};

const EMPTY = { name: "", category: "", baseGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function FoodsPage() {
  const [q, setQ] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [seeding, setSeeding] = useState(false);

  function load() {
    api.searchFoods(q).then((r) => setFoods(r.foods));
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function add() {
    if (!form.name) return;
    await api.addFood(form);
    setForm(EMPTY);
    setAdding(false);
    load();
  }

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Databáza potravín</h1>
        <button onClick={() => setAdding((a) => !a)} className="text-sm font-medium text-brand-600">
          {adding ? "zrušiť" : "+ vlastná"}
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

      {!q && foods.length === 0 && (
        <div className="card mb-3 p-4 text-center">
          <p className="text-sm text-slate-600">Databáza potravín je zatiaľ prázdna.</p>
          <button onClick={seed} disabled={seeding} className="btn-primary mt-3 w-full">
            {seeding ? "Napĺňam…" : "Naplniť základnými potravinami"}
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

function FoodRow({ food, onChanged }: { food: Food; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>(food);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateFood(food.id, {
        name: draft.name,
        baseGrams: draft.baseGrams,
        calories: draft.calories,
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        fiber: draft.fiber,
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
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{food.name}</p>
          <p className="text-xs text-slate-400">
            na {food.baseGrams} g · B {food.protein} · S {food.carbs} · T {food.fat}
            {food.category ? ` · ${food.category}` : ""}
          </p>
        </div>
        <span className="ml-2 shrink-0 text-sm font-semibold text-slate-600">{food.calories} kcal</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <FieldNum label="Na koľko g" v={draft.baseGrams} on={(v) => setDraft({ ...draft, baseGrams: v })} />
            <FieldNum label="kcal" v={draft.calories} on={(v) => setDraft({ ...draft, calories: v })} />
            <FieldNum label="Bielkoviny g" v={draft.protein} on={(v) => setDraft({ ...draft, protein: v })} />
            <FieldNum label="Sacharidy g" v={draft.carbs} on={(v) => setDraft({ ...draft, carbs: v })} />
            <FieldNum label="Tuky g" v={draft.fat} on={(v) => setDraft({ ...draft, fat: v })} />
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
      <input
        type="number"
        className="input mt-0.5 py-1.5"
        value={v}
        onChange={(e) => on(Number(e.target.value))}
      />
    </label>
  );
}
