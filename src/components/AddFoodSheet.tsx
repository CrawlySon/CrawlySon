"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";
import { MEAL_LABELS, MEAL_ORDER, type MealType, type ParsedItem } from "@/lib/types";

type Props = {
  date: string;
  defaultMeal: MealType;
  onClose: () => void;
  onSaved: () => void;
};

// Web Speech API typ (nie je v TS lib)
type SpeechRecognition = any;

export default function AddFoodSheet({ date, defaultMeal, onClose, onSaved }: Props) {
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [mealTouched, setMealTouched] = useState(false);
  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ručné pridanie
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  // Zistenie podpory rozpoznávania reči až na klientovi (bez SSR nesúladu)
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    // Po odmountovaní vždy zastav prípadné nahrávanie
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (tab !== "manual") return;
    const t = setTimeout(async () => {
      try {
        const { foods } = await api.searchFoods(query);
        setResults(foods);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, tab]);

  function stopListening() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    let r: SpeechRecognition;
    try {
      r = new SR();
    } catch {
      return;
    }
    r.lang = "sk-SK";
    r.interimResults = true;
    r.continuous = false;
    recRef.current = r;

    let finalText = text ? text + " " : "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr + " ";
        else interim += tr;
      }
      setText((finalText + interim).trim());
    };
    r.onerror = (e: any) => {
      const code = e?.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Prístup k mikrofónu je zamietnutý. Povoľ ho v nastaveniach, alebo diktuj cez mikrofón na klávesnici.");
      } else if (code === "no-speech") {
        setError("Nič som nepočul. Skús to znova, alebo napíš jedlo ručne.");
      } else if (code && code !== "aborted") {
        setError("Diktovanie sa nepodarilo. Skús mikrofón na klávesnici alebo napíš jedlo ručne.");
      }
      stopListening();
    };
    r.onend = () => stopListening();

    setError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      stopListening();
      return;
    }
    // Poistka proti zaseknutiu na iOS – po 15 s nahrávanie vždy ukonči
    stopTimerRef.current = setTimeout(() => stopListening(), 15000);
  }

  function toggleMic() {
    if (listening) stopListening();
    else startListening();
  }

  async function handleParse() {
    if (!text.trim()) return;
    stopListening(); // ukonči prípadné nahrávanie pred spracovaním
    setLoading(true);
    setError(null);
    try {
      const { items, mealType } = await api.parse(text);
      if (!items.length) setError("AI nerozpoznala žiadne jedlo. Skús to upresniť.");
      setItems(items);
      // Ak AI z textu rozpoznala typ jedla a používateľ ho ručne nezmenil,
      // nastav ho automaticky (napr. „na raňajky banán" → Raňajky).
      if (mealType && mealType !== "other" && !mealTouched) setMeal(mealType);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(idx: number, patch: Partial<ParsedItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addManual(food: any, grams: number) {
    const factor = grams / (food.baseGrams || 100);
    setItems((prev) => [
      ...prev,
      {
        name: food.name,
        quantityGrams: grams,
        calories: round(food.calories * factor),
        protein: round(food.protein * factor, 1),
        carbs: round(food.carbs * factor, 1),
        fat: round(food.fat * factor, 1),
        fiber: food.fiber != null ? round(food.fiber * factor, 1) : null,
        confidence: 1,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  async function handleSave() {
    if (!items.length) return;
    setLoading(true);
    try {
      await api.addEntries({ date, mealType: meal, source: tab === "ai" ? "ai" : "manual", items });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const totals = items.reduce(
    (a, it) => ({
      calories: a.calories + it.calories,
      protein: a.protein + it.protein,
      carbs: a.carbs + it.carbs,
      fat: a.fat + it.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-slate-50 p-4 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />

        {/* Výber jedla */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {MEAL_ORDER.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMeal(m);
                setMealTouched(true);
              }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                meal === m ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Taby */}
        <div className="mb-3 flex rounded-xl bg-slate-200 p-1">
          <button
            onClick={() => setTab("ai")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${tab === "ai" ? "bg-white shadow" : "text-slate-500"}`}
          >
            ✨ AI / diktovanie
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${tab === "manual" ? "bg-white shadow" : "text-slate-500"}`}
          >
            🔍 Z databázy
          </button>
        </div>

        {tab === "ai" && (
          <div className="card p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Napr.: „Zjedol som zhruba 400 g porciu sviečkovej s knedľou a vypil pol litra coly."'
              className="input min-h-[90px] resize-none"
            />
            <div className="mt-2 flex gap-2">
              {speechSupported && (
                <button
                  onClick={toggleMic}
                  className={`btn ${listening ? "bg-red-500 text-white animate-pulse" : "btn-ghost"}`}
                >
                  {listening ? "⏺ Počúvam… (stop)" : "🎤 Diktovať"}
                </button>
              )}
              <button onClick={handleParse} disabled={loading || !text.trim()} className="btn-primary flex-1">
                {loading ? "Spracúvam…" : "Spracovať AI"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {speechSupported
                ? "Tip: ak diktovanie cez tlačidlo nezačne (časté na iPhone), ťukni do poľa a použi mikrofón priamo na klávesnici."
                : "Diktovanie cez prehliadač tu nie je dostupné. Ťukni do poľa a použi mikrofón na klávesnici (na iPhone vedľa medzerníka)."}
            </p>
          </div>
        )}

        {tab === "manual" && (
          <div className="card p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hľadaj potravinu…"
              className="input"
            />
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {results.map((f) => (
                <ManualRow key={f.id} food={f} onAdd={addManual} />
              ))}
              {query && !results.length && <p className="py-2 text-sm text-slate-400">Nič nenájdené.</p>}
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {/* Návrh položiek */}
        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            <h3 className="px-1 text-sm font-semibold text-slate-500">
              Návrh ({items.length}) — skontroluj a uprav:
            </h3>
            {items.map((it, idx) => (
              <ItemCard key={idx} item={it} onChange={(p) => updateItem(idx, p)} onRemove={() => removeItem(idx)} />
            ))}

            <div className="card flex items-center justify-between p-3 text-sm">
              <span className="font-semibold text-slate-700">Spolu</span>
              <span className="text-slate-600">
                <b>{round(totals.calories)} kcal</b> · B {round(totals.protein)} · S {round(totals.carbs)} · T{" "}
                {round(totals.fat)}
              </span>
            </div>
          </div>
        )}

        {/* Akcie */}
        <div className="sticky bottom-0 mt-4 flex gap-2 bg-slate-50 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            Zrušiť
          </button>
          <button onClick={handleSave} disabled={!items.length || loading} className="btn-primary flex-1">
            {loading ? "Ukladám…" : `Pridať (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualRow({ food, onAdd }: { food: any; onAdd: (food: any, grams: number) => void }) {
  const [grams, setGrams] = useState(String(food.baseGrams || 100));
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{food.name}</p>
        <p className="text-xs text-slate-400">
          {food.calories} kcal / {food.baseGrams} g
        </p>
      </div>
      <input
        type="number"
        inputMode="numeric"
        value={grams}
        onChange={(e) => setGrams(e.target.value)}
        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
      />
      <span className="text-xs text-slate-400">g</span>
      <button onClick={() => onAdd(food, Number(grams) || 0)} className="rounded-lg bg-brand-600 px-2 py-1 text-sm text-white">
        +
      </button>
    </div>
  );
}

function ItemCard({
  item,
  onChange,
  onRemove,
}: {
  item: ParsedItem;
  onChange: (patch: Partial<ParsedItem>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full bg-transparent font-medium text-slate-800 outline-none"
          />
          <p className="text-xs text-slate-500">
            {item.quantityGrams ? `${round(item.quantityGrams)} g · ` : ""}
            <b>{round(item.calories)} kcal</b> · B {round(item.protein)} · S {round(item.carbs)} · T {round(item.fat)}
          </p>
          {item.assumption && <p className="mt-0.5 text-xs italic text-amber-600">⚠ {item.assumption}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              item.confidence >= 0.7 ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-700"
            }`}
            title="Istota odhadu AI"
          >
            {Math.round(item.confidence * 100)} %
          </span>
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-slate-400">
            {open ? "skryť" : "upraviť"}
          </button>
          <button onClick={onRemove} className="text-xs text-red-400">
            zmazať
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumField label="kcal" value={item.calories} onChange={(v) => onChange({ calories: v })} />
          <NumField label="Bielk. (g)" value={item.protein} onChange={(v) => onChange({ protein: v })} />
          <NumField label="Sach. (g)" value={item.carbs} onChange={(v) => onChange({ carbs: v })} />
          <NumField label="Tuky (g)" value={item.fat} onChange={(v) => onChange({ fat: v })} />
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1"
      />
    </label>
  );
}
