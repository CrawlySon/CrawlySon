"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "@/lib/api";
import { round } from "@/lib/nutrition";
import { MEAL_LABELS, MEAL_ORDER, type MealType, type ParsedItem, type Favorite, type FavoriteItem } from "@/lib/types";
import BarcodeScanner from "@/components/BarcodeScanner";

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
  const [tab, setTab] = useState<"ai" | "manual" | "fav">("ai");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [water, setWater] = useState(0); // voda detegovaná AI (ml)

  // Ručné pridanie
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  // Obľúbené (rýchle pridanie do vybranej časti dňa)
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favError, setFavError] = useState(false);

  // Skenovanie čiarových kódov
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [unknownForm, setUnknownForm] = useState<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    category: string;
    healthIndex: number | null;
  }>({ name: "", calories: 0, protein: 0, carbs: 0, fat: 0, category: "", healthIndex: null });
  const [estimating, setEstimating] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

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
    // 1 znak preskočíme – sken veľkej databázy potravín pri jednom písmene
    // je drahý a výsledok aj tak nič nehovorí (index sa rozbehne od 2+ znakov).
    const trimmed = query.trim();
    if (trimmed.length === 1) return;
    const t = setTimeout(async () => {
      try {
        const { foods } = await api.searchFoods(trimmed);
        setResults(foods);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, tab]);

  // Načítaj obľúbené raz (pre tab „Obľúbené")
  useEffect(() => {
    api
      .getFavorites()
      .then((r) => setFavorites(r.favorites))
      .catch(() => setFavError(true));
  }, []);

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
    setNotice(null);
    try {
      const { items, mealType, waterMl, usage } = await api.parse(text);
      if (!items.length && !waterMl) setError("AI nerozpoznala žiadne jedlo ani vodu. Skús to upresniť.");
      // Daj vedieť, keď Gemini zlyhalo a odpovedal záložný interný engine.
      if (usage?.model?.startsWith("vllm:")) {
        setNotice("ℹ️ Gemini bolo nedostupné – spracované záložným interným enginom (gpt-oss).");
      }
      setItems(items);
      setWater(waterMl || 0);
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
        category: food.category ?? null,
        subcategory: food.subcategory ?? null,
        healthIndex: food.healthIndex ?? null,
        confidence: 1,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  // Vloží položky obľúbeného do návrhu (uložia sa potom do vybranej časti dňa).
  function addFavorite(fav: Favorite) {
    const mapped: ParsedItem[] = (fav.items || []).map((it: FavoriteItem) => ({
      name: it.name,
      quantityGrams: it.quantityGrams,
      calories: it.calories,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      fiber: it.fiber,
      category: it.category,
      subcategory: it.subcategory,
      healthIndex: it.healthIndex,
      confidence: 1,
    }));
    if (!mapped.length) return;
    setItems((prev) => [...prev, ...mapped]);
  }

  async function onScanned(code: string) {
    setScanning(false);
    setScanMsg(null);
    setUnknownCode(null);
    setTab("manual");
    try {
      const r = await api.lookupBarcode(code);
      if (r.found && r.food) {
        setResults([r.food]);
        setScanMsg(`Nájdené (${r.source === "openfoodfacts" ? "Open Food Facts" : "databáza"}): ${r.food.name} — zvoľ gramáž a pridaj.`);
      } else {
        setUnknownCode(code);
        setShowForm(false);
        setUnknownForm({ name: "", calories: 0, protein: 0, carbs: 0, fat: 0, category: "", healthIndex: null });
        setScanMsg(`Kód ${code} nie je v databázach. Dohľadaj cez AI, odfoť tabuľku nutričných hodnôt, alebo zadaj ručne.`);
      }
    } catch (e: any) {
      setScanMsg(e.message || "Chyba pri hľadaní kódu.");
    }
  }

  // Agentické dohľadanie cez Gemini (web search)
  async function aiLookupUnknown() {
    if (!unknownCode && !unknownForm.name.trim()) return;
    setEstimating(true);
    setScanMsg("AI dohľadáva produkt na webe…");
    try {
      const r = await api.aiBarcodeLookup(unknownForm.name.trim(), unknownCode);
      if (r.found && r.food) {
        setUnknownCode(null);
        setResults([r.food]);
        setScanMsg(`Dohľadané cez AI: ${r.food.name} (${r.food.calories} kcal/100 g) — zvoľ gramáž a pridaj.`);
      } else {
        setScanMsg("AI to spoľahlivo nenašlo. Zadaj hodnoty ručne (na 100 g).");
      }
    } catch (e: any) {
      setScanMsg(e.message || "Chyba pri dohľadávaní.");
    } finally {
      setEstimating(false);
    }
  }

  // Zmenší fotku (max strana 1280 px, JPEG ~0,7) a vráti base64 bez prefixu.
  async function fileToCompressedBase64(file: File): Promise<{ base64: string; mime: string }> {
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64: dataUrl.split(",")[1] || "", mime: file.type || "image/jpeg" };
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.7);
    return { base64: out.split(",")[1] || "", mime: "image/jpeg" };
  }

  // Odfotenie tabuľky nutričných hodnôt → AI ju prečíta a predvyplní formulár.
  async function onLabelPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // umožni vybrať tú istú fotku znova
    if (!file) return;
    setPhotoBusy(true);
    setScanMsg("Čítam tabuľku z fotky…");
    try {
      const { base64, mime } = await fileToCompressedBase64(file);
      if (!base64) throw new Error("Fotku sa nepodarilo spracovať.");
      const r = await api.parseNutritionPhoto(base64, mime);
      if (r.found && r.nutrition) {
        const n = r.nutrition;
        setUnknownForm((f) => ({
          name: f.name || n.name || "",
          calories: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
          category: n.category || f.category,
          healthIndex: n.healthIndex,
        }));
        setShowForm(true);
        setScanMsg(
          `Z fotky načítané (na 100 g): ${n.calories} kcal · B ${n.protein} · S ${n.carbs} · T ${n.fat}. Doplň názov a ulož.`
        );
      } else {
        setShowForm(true);
        setScanMsg("Z fotky sa nepodarilo prečítať hodnoty. Skús ostrejšiu fotku samotnej tabuľky, alebo zadaj ručne.");
      }
    } catch (err: any) {
      setScanMsg(err?.message || "Chyba pri čítaní fotky.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveUnknown() {
    if (!unknownCode || !unknownForm.name.trim()) return;
    const { food } = await api.addFood({
      name: unknownForm.name.trim(),
      barcode: unknownCode,
      baseGrams: 100,
      calories: unknownForm.calories,
      protein: unknownForm.protein,
      carbs: unknownForm.carbs,
      fat: unknownForm.fat,
      category: unknownForm.category || null,
      healthIndex: unknownForm.healthIndex,
    });
    setUnknownCode(null);
    setResults([food]);
    setScanMsg(`Uložené: ${food.name} — zvoľ gramáž a pridaj.`);
  }

  async function handleSave() {
    if (!items.length && water <= 0) return;
    setLoading(true);
    try {
      if (items.length) {
        await api.addEntries({ date, mealType: meal, source: tab === "ai" ? "ai" : "manual", items });
      }
      if (water > 0) {
        await api.addWater(date, water);
      }
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
            ✨ AI
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${tab === "manual" ? "bg-white shadow" : "text-slate-500"}`}
          >
            🔍 Databáza
          </button>
          <button
            onClick={() => setTab("fav")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${tab === "fav" ? "bg-white shadow" : "text-slate-500"}`}
          >
            ★ Obľúbené
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
            <div className="mb-2 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hľadaj potravinu…"
                className="input flex-1"
              />
              <button onClick={() => setScanning(true)} className="btn-ghost shrink-0" title="Skenovať čiarový kód">
                📷
              </button>
            </div>

            {scanMsg && <p className="mb-2 rounded-xl bg-sky-50 p-2 text-xs text-sky-700">{scanMsg}</p>}

            {/* Neznámy kód → dohľadať cez web, odfotiť tabuľku, alebo zadať ručne */}
            {unknownCode && (
              <div className="mb-2 space-y-2 rounded-xl border border-amber-100 bg-amber-50 p-2">
                <p className="text-sm text-amber-800">
                  Produkt s kódom <b>{unknownCode}</b> nie je v databáze.
                </p>
                <button
                  onClick={aiLookupUnknown}
                  disabled={estimating || photoBusy}
                  className="btn-primary w-full py-2 text-sm"
                >
                  {estimating ? "Dohľadávam na webe…" : "🔎 Dohľadať produkt cez web (AI)"}
                </button>

                <label
                  className={`flex w-full cursor-pointer items-center justify-center rounded-xl border border-amber-300 bg-white py-2 text-sm font-medium text-amber-800 ${
                    photoBusy ? "opacity-60" : "active:bg-amber-100"
                  }`}
                >
                  {photoBusy ? "Čítam fotku…" : "📸 Odfotiť tabuľku nutričných hodnôt"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={photoBusy || estimating}
                    onChange={onLabelPhoto}
                  />
                </label>

                <input
                  value={unknownForm.name}
                  onChange={(e) => setUnknownForm({ ...unknownForm, name: e.target.value })}
                  placeholder="Názov produktu (povinný na uloženie)"
                  className="input py-2 text-sm"
                />

                {!showForm && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="w-full text-xs text-amber-700 underline"
                  >
                    alebo zadať / upraviť hodnoty ručne (na 100 g)
                  </button>
                )}

                {showForm && (
                  <div className="space-y-2 rounded-lg bg-white/70 p-2">
                    <p className="text-[11px] text-amber-700">Hodnoty na 100 g – skontroluj a uprav:</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      <SmallNum label="kcal" v={unknownForm.calories} on={(v) => setUnknownForm({ ...unknownForm, calories: v })} />
                      <SmallNum label="B g" v={unknownForm.protein} on={(v) => setUnknownForm({ ...unknownForm, protein: v })} />
                      <SmallNum label="S g" v={unknownForm.carbs} on={(v) => setUnknownForm({ ...unknownForm, carbs: v })} />
                      <SmallNum label="T g" v={unknownForm.fat} on={(v) => setUnknownForm({ ...unknownForm, fat: v })} />
                    </div>
                    <input
                      value={unknownForm.category}
                      onChange={(e) => setUnknownForm({ ...unknownForm, category: e.target.value })}
                      placeholder="Kategória (napr. Sladké, Nápoje)"
                      className="input py-1.5 text-sm"
                    />
                    <button
                      onClick={saveUnknown}
                      disabled={!unknownForm.name.trim() || unknownForm.calories <= 0}
                      className="btn-primary w-full py-2 text-sm"
                    >
                      Uložiť ku kódu {unknownCode}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {results.map((f) => (
                <ManualRow key={f.id} food={f} onAdd={addManual} />
              ))}
              {query && !results.length && <p className="py-2 text-sm text-slate-400">Nič nenájdené.</p>}
            </div>
          </div>
        )}

        {tab === "fav" && (
          <div className="card p-3">
            <p className="mb-2 text-xs text-slate-500">
              Ťukni na obľúbené – pridá sa do návrhu a uloží do <b>{MEAL_LABELS[meal]}</b>.
            </p>
            {favError && <p className="py-2 text-sm text-red-500">Nepodarilo sa načítať obľúbené.</p>}
            {!favError && favorites.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">
                Zatiaľ žiadne obľúbené. Ulož si jedlo cez ★ pri zázname na obrazovke Dnes.
              </p>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {favorites.map((f) => {
                const kcal = (f.items || []).reduce((s, it) => s + (it.calories || 0), 0);
                return (
                  <button
                    key={f.id}
                    onClick={() => addFavorite(f)}
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-left active:bg-brand-50"
                  >
                    <span className="text-amber-400">★</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{f.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {(f.items || []).length} {(f.items || []).length === 1 ? "položka" : "položky/iek"} · {round(kcal)} kcal
                      </span>
                    </span>
                    <span className="text-brand-600">＋</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{notice}</p>}

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

        {/* Detegovaná voda */}
        {water > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50 p-3">
            <span className="flex items-center gap-2 text-sm font-medium text-sky-700">💧 Pitný režim</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={water}
                onChange={(e) => setWater(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded-lg border border-sky-200 px-2 py-1 text-right text-sm"
              />
              <span className="text-sm text-sky-700">ml</span>
              <button onClick={() => setWater(0)} className="text-sky-400 hover:text-red-400">
                ✕
              </button>
            </span>
          </div>
        )}

        {/* Akcie */}
        <div className="sticky bottom-0 mt-4 flex gap-2 bg-slate-50 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            Zrušiť
          </button>
          <button
            onClick={handleSave}
            disabled={(!items.length && water <= 0) || loading}
            className="btn-primary flex-1"
          >
            {loading
              ? "Ukladám…"
              : water > 0 && !items.length
                ? `Pridať 💧 ${water} ml`
                : `Pridať (${items.length})`}
          </button>
        </div>
      </div>

      {scanning && <BarcodeScanner onResult={onScanned} onClose={() => setScanning(false)} />}
    </div>
  );
}

function SmallNum({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="text-[11px] text-slate-500">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={v}
        onChange={(e) => on(Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-slate-200 px-1.5 py-1 text-sm"
      />
    </label>
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
          {food.healthIndex != null && (
            <span className={`ml-1 font-medium ${healthColor(food.healthIndex)}`}>· ♥ {food.healthIndex}/10</span>
          )}
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
  // Pevný základ na škálovanie. Zachytí sa pri vstupe do poľa gramáže, takže
  // prepočet pri písaní neškáluje z priebežne menenej (a zaokrúhľovanej)
  // hodnoty – inak by sa chyby navrstvili (napr. 150 g/300 kcal → 50 g = 20 kcal).
  const baseRef = useRef<{
    grams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
  } | null>(null);

  function snapshotBase() {
    const g = item.quantityGrams ?? 0;
    baseRef.current =
      g > 0
        ? { grams: g, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber }
        : null;
  }

  // Zmena gramáže proporcionálne prepočíta kcal a makrá (ak máme z čoho škálovať)
  function setGrams(g: number) {
    if (!baseRef.current) snapshotBase(); // poistka, ak onFocus nestihol bežať
    const base = baseRef.current;
    if (base && base.grams > 0 && g > 0) {
      const f = g / base.grams;
      onChange({
        quantityGrams: g,
        calories: round(base.calories * f),
        protein: round(base.protein * f, 1),
        carbs: round(base.carbs * f, 1),
        fat: round(base.fat * f, 1),
        fiber: base.fiber != null ? round(base.fiber * f, 1) : null,
      });
    } else {
      onChange({ quantityGrams: g > 0 ? g : null });
    }
  }

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
          {(item.category || item.healthIndex != null) && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs">
              {item.category && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                  {item.category}
                  {item.subcategory ? ` · ${item.subcategory}` : ""}
                </span>
              )}
              {item.healthIndex != null && (
                <span className={`rounded px-1.5 py-0.5 font-medium ${healthColor(item.healthIndex)}`} title="Index zdravosti 0–10">
                  ♥ {item.healthIndex}/10
                </span>
              )}
            </p>
          )}
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
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-brand-50 p-2">
            <label className="text-xs">
              <span className="font-medium text-brand-700">Gramáž (g) — prepočíta kcal aj makrá</span>
              <input
                type="number"
                inputMode="numeric"
                value={item.quantityGrams ?? ""}
                onFocus={snapshotBase}
                onChange={(e) => setGrams(parseInt(e.target.value) || 0)}
                placeholder="napr. 250"
                className="mt-0.5 w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumField label="kcal" value={item.calories} onChange={(v) => onChange({ calories: v })} />
            <NumField label="Bielk. (g)" value={item.protein} onChange={(v) => onChange({ protein: v })} />
            <NumField label="Sach. (g)" value={item.carbs} onChange={(v) => onChange({ carbs: v })} />
            <NumField label="Tuky (g)" value={item.fat} onChange={(v) => onChange({ fat: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TextField label="Kategória" value={item.category ?? ""} onChange={(v) => onChange({ category: v || null })} />
            <TextField label="Podkategória" value={item.subcategory ?? ""} onChange={(v) => onChange({ subcategory: v || null })} />
            <NumField
              label="Zdravosť 0–10"
              value={item.healthIndex ?? 0}
              onChange={(v) => onChange({ healthIndex: Math.min(10, Math.max(0, v)) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function healthColor(h: number): string {
  if (h >= 7) return "bg-brand-100 text-brand-700";
  if (h >= 4) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1"
      />
    </label>
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
