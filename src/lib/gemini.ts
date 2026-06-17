import { GoogleGenAI, Type } from "@google/genai";
import type { ParsedItem } from "./types";

// Reťaz modelov – ak primárny zlyhá (preťaženie/kvóta/timeout), skúsi sa ďalší.
// Primárny sa berie z GEMINI_MODEL. Stav k 6/2026 (overené v Google docs):
//  • gemini-3.5-flash   – aktuálny GA Flash (od 19.5.2026), primárny
//  • gemini-flash-latest – alias na najnovší Flash
//  • gemini-3.1-flash-lite – lacný, nízka latencia, iná kapacita (dobrý fallback pri 503)
//  • gemini-2.5-flash   – beží do 16.10.2026, posledná záchrana
// POZN.: rodiny 1.5 a 2.0 sú už vypnuté (404), preto v reťazi nie sú.
const FALLBACK_MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_MODEL || "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
    ].filter(Boolean)
  )
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zistí HTTP status z chyby (rôzne SDK ho dávajú inak).
function errStatus(e: any): number | null {
  const s = e?.status ?? e?.statusCode ?? e?.code;
  if (typeof s === "number") return s;
  const m = String(e?.message || "");
  const mm = m.match(/\b(4\d\d|5\d\d)\b/);
  return mm ? Number(mm[1]) : null;
}

// Je to dočasné preťaženie/kvóta (oplatí sa krátko počkať a skúsiť znova)?
function isOverloaded(e: any): boolean {
  const s = errStatus(e);
  if (s === 503 || s === 429) return true;
  const m = String(e?.message || "").toUpperCase();
  return (
    m.includes("UNAVAILABLE") ||
    m.includes("RESOURCE_EXHAUSTED") ||
    m.includes("OVERLOAD") ||
    m.includes("HIGH DEMAND")
  );
}

// Zavolá generateContent s časovým limitom, retry pri preťažení a fallbackom na
// ďalšie modely. Per-model limit rieši „visiace" requesty (príčina 504),
// retry rieši dočasné 503/429 (preťaženie kapacity Gemini).
const PER_MODEL_TIMEOUT_MS = Number(process.env.GEMINI_MODEL_TIMEOUT_MS || 12000);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Model "${label}" neodpovedal do ${ms} ms (timeout).`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function generateWithFallback(
  ai: GoogleGenAI,
  request: Record<string, any>,
  timeoutMs: number = PER_MODEL_TIMEOUT_MS
): Promise<{ response: any; model: string }> {
  let lastErr: unknown;
  let sawOverload = false;

  for (const model of FALLBACK_MODELS) {
    const maxAttempts = 2; // 1 pokus + 1 rýchly retry pri preťažení
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({ ...request, model } as any),
          timeoutMs,
          model
        );
        return { response, model };
      } catch (e) {
        lastErr = e;
        const overloaded = isOverloaded(e);
        if (overloaded) sawOverload = true;
        console.error(
          `Gemini model "${model}" pokus ${attempt}/${maxAttempts} zlyhal:`,
          (e as any)?.message || e
        );
        if (overloaded && attempt < maxAttempts) {
          await sleep(600 * attempt); // krátky backoff a skús ten istý model ešte raz
          continue;
        }
        break; // skús ďalší model v reťazi
      }
    }
  }

  // Priateľská hláška: keď bolo všetko preťažené, nech používateľ vie skúsiť neskôr.
  if (sawOverload) {
    throw new Error("AI je práve preťažené (Google 503). Skús to prosím o chvíľu znova.");
  }
  throw lastErr instanceof Error
    ? new Error(`Gemini nedostupný (skúšané: ${FALLBACK_MODELS.join(", ")}). ${lastErr.message}`)
    : new Error("Všetky Gemini modely zlyhali.");
}

export type ReferenceFood = {
  name: string;
  baseGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  category: string | null;
  subcategory: string | null;
  healthIndex: number | null;
};

const SYSTEM_INSTRUCTION = `Si výživový asistent pre slovenskú aplikáciu na sledovanie stravy.
Tvojou úlohou je z voľného textu (alebo prepisu reči) používateľa rozpoznať
jednotlivé zjedené potraviny/jedlá a odhadnúť ich nutričné hodnoty.

PRAVIDLÁ:
- Rozlož jedlo na zmysluplné jednotlivé položky (napr. "sviečková s knedľou"
  rozdeľ na omáčku/mäso a knedľu, ak to dáva zmysel; ak ide o jedno jedlo, nechaj
  jednu položku).
- Ak používateľ uvedie gramáž, počítaj hodnoty PRESNE z tej gramáže.
- Ak gramáž neuvedie, odhadni typickú porciu a do poľa "assumption" napíš aký
  predpoklad si urobil (napr. "predpokladaná porcia ~150 g").
- Vráť hodnoty ako CELKOVÉ množstvo pre reálne zjedenú porciu (nie na 100 g).
- PRIORITA: ak sa potravina nachádza v referenčnej databáze (aj približný názov),
  VŽDY použi jej hodnoty a len ich prepočítaj podľa gramáže/porcie. Zachovaj
  rovnaký názov ako v databáze. Vlastný odhad rob len ak v databáze nič podobné nie je.
- Ak je v referenčnej databáze podobná potravina, vychádzaj z jej hodnôt na uvedenú
  gramáž a prepočítaj. Inak odhadni podľa bežných nutričných tabuliek.
- "confidence" je tvoja istota odhadu od 0 do 1.
- Buď realistický, nepreháňaj presnosť. Názvy polož v slovenčine.
- Z textu rozpoznaj aj typ jedla a vráť ho v poli "mealType":
  raňajky = "breakfast", desiata (dopoludňajšia) = "snack", obed = "lunch",
  olovrant (popoludňajší) = "afternoon", večera = "dinner",
  druhá večera / večerné maškrtenie / nočné jedenie = "supper".
  Ak používateľ typ jedla NEuvedie, vráť "other".

- Ku každej položke urči "category" (hlavná kategória) a "subcategory"
  (podkategória) v slovenčine. Príklady kategórií: Ovocie, Zelenina, Mäso, Ryby,
  Mliečne, Obilniny, Pečivo, Strukoviny, Orechy, Tuky, Sladké, Nápoje,
  Hotové jedlo, Fast food. Príklad: bravčový rezeň → category "Mäso",
  subcategory "Bravčové mäso"; losos → "Ryby" / "Morské ryby".

- Ku každej položke urči "healthIndex" – celé číslo 0 až 10 vyjadrujúce
  zdravosť jedla. Drž sa týchto orientačných pravidiel:
  • 9–10: čerstvé ovocie a zelenina, strukoviny, ryby.
  • 7–8: celozrnné obilniny, orechy, vajcia, biele mäso, biely jogurt.
  • 5–6: varené prílohy (ryža, zemiaky), syry, chudé mäso.
  • 3–4: vyprážané jedlá, biele pečivo, údeniny, sladené nápoje.
  • 0–2: fast food (hamburger, hranolky z fast foodu), sladkosti, alkohol,
    vyprážané sladké. Napr. hamburger z McDonald's ≈ 1–2.
  Index je vlastnosť jedla (nezávisí od zjedeného množstva).

- ČISTÁ VODA (aj perlivá/neperlivá neochutená) sa NEukladá ako jedlo. Jej množstvo
  spočítaj v mililitroch do poľa "waterMl" (napr. „pol litra vody" = 500) a NEdávaj
  ju do "items". Sladené/kalorické nápoje (kola, džús, pivo, káva s mliekom) patria
  normálne do "items". Ak voda nie je spomenutá, "waterMl" = 0.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    mealType: {
      type: Type.STRING,
      description:
        'Typ jedla z textu: "breakfast" | "snack" | "lunch" | "afternoon" | "dinner" | "supper" | "other"',
    },
    waterMl: { type: Type.NUMBER, description: "Vypitá čistá voda v ml (0 ak žiadna)" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Názov potraviny/jedla" },
          quantityGrams: { type: Type.NUMBER, description: "Odhadovaná gramáž porcie (g), 0 ak neznáma" },
          calories: { type: Type.NUMBER, description: "Celkové kcal za porciu" },
          protein: { type: Type.NUMBER, description: "Bielkoviny (g) za porciu" },
          carbs: { type: Type.NUMBER, description: "Sacharidy (g) za porciu" },
          fat: { type: Type.NUMBER, description: "Tuky (g) za porciu" },
          fiber: { type: Type.NUMBER, description: "Vláknina (g) za porciu, 0 ak neznáma" },
          category: { type: Type.STRING, description: "Hlavná kategória (napr. Mäso, Ovocie)" },
          subcategory: { type: Type.STRING, description: "Podkategória (napr. Bravčové mäso)" },
          healthIndex: { type: Type.NUMBER, description: "Index zdravosti 0..10" },
          confidence: { type: Type.NUMBER, description: "Istota odhadu 0..1" },
          assumption: { type: Type.STRING, description: "Aký predpoklad si urobil" },
        },
        required: ["name", "calories", "protein", "carbs", "fat", "category", "healthIndex", "confidence"],
      },
    },
  },
  required: ["items"],
};

function buildReferenceBlock(foods: ReferenceFood[]): string {
  if (!foods.length) return "";
  const lines = foods.map((f) => {
    const cat = f.category ? `, kat. ${f.category}${f.subcategory ? `/${f.subcategory}` : ""}` : "";
    const hi = f.healthIndex != null ? `, zdravosť ${f.healthIndex}` : "";
    return `- ${f.name} (na ${f.baseGrams} g): ${f.calories} kcal, B ${f.protein}g, S ${f.carbs}g, T ${f.fat}g${cat}${hi}`;
  });
  return `\n\nREFERENČNÁ DATABÁZA POTRAVÍN (orientačné hodnoty):\n${lines.join("\n")}`;
}

const MEAL_TYPES = ["breakfast", "snack", "lunch", "afternoon", "dinner", "supper", "other"] as const;
export type DetectedMeal = (typeof MEAL_TYPES)[number];

export type ParseResult = {
  items: ParsedItem[];
  mealType: DetectedMeal;
  waterMl: number;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

export async function parseFood(text: string, reference: ReferenceFood[]): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chýba GEMINI_API_KEY v prostredí.");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Používateľ povedal/napísal čo zjedol:\n"""${text}"""${buildReferenceBlock(reference)}`;

  const { response, model } = await generateWithFallback(ai, {
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.3,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Prázdna odpoveď z Gemini.");

  const um: any = (response as any).usageMetadata || {};
  const usage = {
    model,
    promptTokens: Number(um.promptTokenCount ?? 0),
    outputTokens: Number(um.candidatesTokenCount ?? 0),
    totalTokens: Number(um.totalTokenCount ?? 0),
  };

  let parsed: { items?: any[]; mealType?: string; waterMl?: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Nepodarilo sa spracovať odpoveď AI (neplatný JSON).");
  }

  const rawMeal = String(parsed.mealType ?? "other");
  const mealType: DetectedMeal = (MEAL_TYPES as readonly string[]).includes(rawMeal)
    ? (rawMeal as DetectedMeal)
    : "other";

  const waterMl = parsed.waterMl && Number(parsed.waterMl) > 0 ? Math.round(Number(parsed.waterMl)) : 0;

  const arr = Array.isArray(parsed.items) ? parsed.items : [];
  const items = arr.map((it): ParsedItem => ({
    name: String(it.name ?? "Neznáme jedlo"),
    quantityGrams: it.quantityGrams && it.quantityGrams > 0 ? Number(it.quantityGrams) : null,
    calories: Math.max(0, Number(it.calories ?? 0)),
    protein: Math.max(0, Number(it.protein ?? 0)),
    carbs: Math.max(0, Number(it.carbs ?? 0)),
    fat: Math.max(0, Number(it.fat ?? 0)),
    fiber: it.fiber && it.fiber > 0 ? Number(it.fiber) : null,
    category: it.category ? String(it.category) : null,
    subcategory: it.subcategory ? String(it.subcategory) : null,
    healthIndex:
      it.healthIndex != null && !Number.isNaN(Number(it.healthIndex))
        ? Math.min(10, Math.max(0, Math.round(Number(it.healthIndex))))
        : null,
    confidence: Math.min(1, Math.max(0, Number(it.confidence ?? 0.5))),
    assumption: it.assumption ? String(it.assumption) : undefined,
  }));

  return { items, mealType, waterMl, usage };
}

// ── Agentické dohľadanie produktu na webe (Google Search grounding) ──
export type WebFood = {
  name: string;
  calories: number; // na 100 g
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  category: string | null;
  healthIndex: number | null;
  found: boolean;
  source?: string; // odkiaľ (doména), ak dostupné
};

export type WebLookupResult = {
  food: WebFood | null;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

export async function lookupProductByWeb(query: string): Promise<WebLookupResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chýba GEMINI_API_KEY v prostredí.");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Pomôž identifikovať a nájsť nutričné hodnoty produktu: "${query}".
Ak je v zadaní čiarový kód (EAN/GTIN), najprv podľa neho na webe zisti, o aký produkt ide
(názov a značku), potom nájdi jeho nutričné hodnoty. Pozri stránky výrobcu/e-shopov.
Potrebujem hodnoty NA 100 g (alebo 100 ml).
Ak produkt nevieš spoľahlivo nájsť, vráť "found": false.
Odpovedz IBA platným JSON objektom (bez markdownu) v tvare:
{"found": true/false, "name": "presný názov produktu", "calories": kcal_na_100g,
 "protein": g, "carbs": g, "fat": g, "fiber": g_alebo_null,
 "category": "kategória (napr. Sladké, Nápoje, Mäso)", "healthIndex": 0-10}`;

  const { response, model } = await generateWithFallback(
    ai,
    {
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    },
    18000 // web grounding býva pomalšie – dlhší limit na model
  );

  const um: any = (response as any).usageMetadata || {};
  const usage = {
    model,
    promptTokens: Number(um.promptTokenCount ?? 0),
    outputTokens: Number(um.candidatesTokenCount ?? 0),
    totalTokens: Number(um.totalTokenCount ?? 0),
  };

  const raw = (response.text || "").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { food: null, usage };

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { food: null, usage };
  }

  if (!parsed || parsed.found === false || parsed.calories == null) {
    return { food: null, usage };
  }

  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const food: WebFood = {
    name: String(parsed.name || query).trim(),
    calories: Math.max(0, Math.round(num(parsed.calories))),
    protein: Math.max(0, Math.round(num(parsed.protein) * 10) / 10),
    carbs: Math.max(0, Math.round(num(parsed.carbs) * 10) / 10),
    fat: Math.max(0, Math.round(num(parsed.fat) * 10) / 10),
    fiber: parsed.fiber != null && Number.isFinite(Number(parsed.fiber)) ? Number(parsed.fiber) : null,
    category: parsed.category ? String(parsed.category) : null,
    healthIndex:
      parsed.healthIndex != null && Number.isFinite(Number(parsed.healthIndex))
        ? Math.min(10, Math.max(0, Math.round(Number(parsed.healthIndex))))
        : null,
    found: true,
  };
  return { food, usage };
}
