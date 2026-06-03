"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { recommendedCalories, suggestedMacros, tdee } from "@/lib/nutrition";
import type { Profile } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then((r) => setP(r.profile));
  }, []);

  if (!p) return <div className="px-4 pt-10 text-center text-slate-400">Načítavam…</div>;

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!p) return;
    const { profile } = await api.updateProfile(p);
    setP(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const tdeeVal = tdee(p.sex, p.weightKg, p.heightCm, p.age, p.activity);
  const recommended = recommendedCalories(p.sex, p.weightKg, p.heightCm, p.age, p.activity, p.goalType);

  function applyRecommended() {
    if (!recommended) return;
    const m = suggestedMacros(recommended);
    setP((prev) =>
      prev
        ? { ...prev, goalCalories: recommended, goalProtein: m.protein, goalCarbs: m.carbs, goalFat: m.fat }
        : prev
    );
  }

  async function logout() {
    await api.logout();
    router.push("/login");
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Profil a ciele</h1>

      <section className="card mb-4 space-y-3 p-4">
        <h2 className="font-semibold text-slate-700">Osobné údaje</h2>
        <div>
          <label className="label">Meno</label>
          <input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Pohlavie</label>
            <select className="input" value={p.sex || ""} onChange={(e) => set("sex", e.target.value || null)}>
              <option value="">—</option>
              <option value="male">Muž</option>
              <option value="female">Žena</option>
            </select>
          </div>
          <div>
            <label className="label">Vek</label>
            <input
              type="number"
              className="input"
              value={p.age ?? ""}
              onChange={(e) => set("age", e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="label">Výška (cm)</label>
            <input
              type="number"
              className="input"
              value={p.heightCm ?? ""}
              onChange={(e) => set("heightCm", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="label">Váha (kg)</label>
            <input
              type="number"
              className="input"
              value={p.weightKg ?? ""}
              onChange={(e) => set("weightKg", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
        <div>
          <label className="label">Aktivita</label>
          <select className="input" value={p.activity || ""} onChange={(e) => set("activity", e.target.value || null)}>
            <option value="">—</option>
            <option value="sedentary">Sedavá (málo pohybu)</option>
            <option value="light">Ľahká (1–3× týždenne)</option>
            <option value="moderate">Stredná (3–5× týždenne)</option>
            <option value="active">Vysoká (6–7× týždenne)</option>
            <option value="very_active">Veľmi vysoká (šport denne)</option>
          </select>
        </div>
        <div>
          <label className="label">Cieľ</label>
          <select className="input" value={p.goalType || ""} onChange={(e) => set("goalType", e.target.value || null)}>
            <option value="">—</option>
            <option value="lose">Chudnutie</option>
            <option value="maintain">Udržanie</option>
            <option value="gain">Naberanie</option>
          </select>
        </div>

        {tdeeVal && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm">
            <p className="text-slate-600">
              Odhadovaný výdaj (TDEE): <b>{tdeeVal} kcal</b>
            </p>
            {recommended && (
              <p className="mt-1 text-slate-600">
                Odporúčaný príjem pre tvoj cieľ: <b className="text-brand-700">{recommended} kcal</b>
              </p>
            )}
            <button onClick={applyRecommended} className="btn-primary mt-2 w-full">
              Použiť ako môj cieľ
            </button>
          </div>
        )}
      </section>

      <section className="card mb-4 space-y-3 p-4">
        <h2 className="font-semibold text-slate-700">Denné ciele</h2>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Kalórie (kcal)" value={p.goalCalories} onChange={(v) => set("goalCalories", v)} />
          <Num label="Bielkoviny (g)" value={p.goalProtein} onChange={(v) => set("goalProtein", v)} />
          <Num label="Sacharidy (g)" value={p.goalCarbs} onChange={(v) => set("goalCarbs", v)} />
          <Num label="Tuky (g)" value={p.goalFat} onChange={(v) => set("goalFat", v)} />
        </div>
      </section>

      <button onClick={save} className="btn-primary w-full">
        {saved ? "✓ Uložené" : "Uložiť zmeny"}
      </button>

      <button onClick={logout} className="btn-ghost mt-3 w-full text-red-500">
        Odhlásiť sa
      </button>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      />
    </div>
  );
}
