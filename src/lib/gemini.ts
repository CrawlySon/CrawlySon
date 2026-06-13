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
- Ak je v referenčnej databáze podobná potravina, vychádzaj z jej hodnôt na
  100 g a prepočítaj podľa gramáže. Inak odhadni podľa bežných nutričných tabuliek.
- "confidence" je tvoja istota odhadu od 0 do 1.
- Buď realistický, nepreháňaj presnosť. Názvy polož v slovenčine.
- Z textu rozpoznaj aj typ jedla a vráť ho v poli "mealType":
  raňajky = "breakfast", obed = "lunch", večera = "dinner",
  desiata/olovrant = "snack". Ak používateľ typ jedla NEuvedie, vráť "other".`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    mealType: {
      type: Type.STRING,
      description: 'Typ jedla z textu: "breakfast" | "lunch" | "dinner" | "snack" | "other"',
    },
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
          confidence: { type: Type.NUMBER, description: "Istota odhadu 0..1" },
          assumption: { type: Type.STRING, description: "Aký predpoklad si urobil" },
        },
        required: ["name", "calories", "protein", "carbs", "fat", "confidence"],
      },
    },
  },
  required: ["items"],
};

function buildReferenceBlock(foods: ReferenceFood[]): string {
  if (!foods.length) return "";
  const lines = foods.map(
    (f) =>
      `- ${f.name} (na ${f.baseGrams} g): ${f.calories} kcal, B ${f.protein}g, S ${f.carbs}g, T ${f.fat}g`
  );
  return `\n\nREFERENČNÁ DATABÁZA POTRAVÍN (orientačné hodnoty):\n${lines.join("\n")}`;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;
export type DetectedMeal = (typeof MEAL_TYPES)[number];

export type ParseResult = {
  items: ParsedItem[];
  mealType: DetectedMeal;
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

  let parsed: { items?: any[]; mealType?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Nepodarilo sa spracovať odpoveď AI (neplatný JSON).");
  }

  const rawMeal = String(parsed.mealType ?? "other");
  const mealType: DetectedMeal = (MEAL_TYPES as readonly string[]).includes(rawMeal)
    ? (rawMeal as DetectedMeal)
    : "other";

  const arr = Array.isArray(parsed.items) ? parsed.items : [];
  const items = arr.map((it): ParsedItem => ({
    name: String(it.name ?? "Neznáme jedlo"),
    quantityGrams: it.quantityGrams && it.quantityGrams > 0 ? Number(it.quantityGrams) : null,
    calories: Math.max(0, Number(it.calories ?? 0)),
    protein: Math.max(0, Number(it.protein ?? 0)),
    carbs: Math.max(0, Number(it.carbs ?? 0)),
    fat: Math.max(0, Number(it.fat ?? 0)),
    fiber: it.fiber && it.fiber > 0 ? Number(it.fiber) : null,
    confidence: Math.min(1, Math.max(0, Number(it.confidence ?? 0.5))),
    assumption: it.assumption ? String(it.assumption) : undefined,
  }));

  return { items, mealType };
}
