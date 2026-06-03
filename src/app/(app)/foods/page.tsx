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

  function load() {
    api.searchFoods(q).then((r) => setFoods(r.foods));
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

      <input className="input mb-3" placeholder="Hľadaj…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card divide-y divide-slate-50">
        {foods.map((f) => (
          <div key={f.id} className="px-4 py-2.5">
            <div className="flex justify-between">
              <p className="font-medium text-slate-800">{f.name}</p>
              <p className="text-sm font-semibold text-slate-600">{f.calories} kcal</p>
            </div>
            <p className="text-xs text-slate-400">
              na {f.baseGrams} g · B {f.protein} · S {f.carbs} · T {f.fat}
              {f.category ? ` · ${f.category}` : ""}
            </p>
          </div>
        ))}
        {foods.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nič nenájdené.</p>}
      </div>
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
