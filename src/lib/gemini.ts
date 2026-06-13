import { GoogleGenAI, Type } from "@google/genai";
import type { ParsedItem } from "./types";

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
  raňajky = "breakfast", obed = "lunch", večera = "dinner",
  desiata/olovrant = "snack". Ak používateľ typ jedla NEuvedie, vráť "other".

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
      description: 'Typ jedla z textu: "breakfast" | "lunch" | "dinner" | "snack" | "other"',
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

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;
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
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  const prompt = `Používateľ povedal/napísal čo zjedol:\n"""${text}"""${buildReferenceBlock(reference)}`;

  const response = await ai.models.generateContent({
    model,
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
