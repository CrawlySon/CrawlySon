import { GoogleGenAI, Type } from "@google/genai";
import type { ParsedItem } from "./types";
import { isVllmConfigured, vllmChatJSON } from "./vllm";

// Reťaz modelov – ak primárny zlyhá (preťaženie/kvóta/timeout), skúsi sa ďalší.
// Primárny sa berie z GEMINI_MODEL. Stav k 6/2026 (overené v Google docs):
//  • gemini-3.1-flash-lite – lacný, nízka latencia, PRIMÁRNY (rýchly a stabilný)
//  • gemini-3.5-flash      – silnejší GA Flash, fallback pri zlyhaní
//  • gemini-2.5-flash      – beží do 16.10.2026, posledná záchrana
// POZN.: zámerne NEpridávame "gemini-flash-latest" – je to alias na iný model
// v reťazi, takže pri preťažení by sme dostali tú istú chybu druhýkrát a len
// míňali čas. Rodiny 1.5 a 2.0 sú už vypnuté (404), preto v reťazi nie sú.
const FALLBACK_MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
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
// ďalšie modely. Per-model limit rieši „visiace" requesty, GLOBÁLNY rozpočet
// (budgetMs) rieši 504: zaručí, že celý reťazec skončí skôr, než Vercel zabije
// funkciu, takže používateľ vždy dostane slušnú JSON hlášku namiesto 504.
const PER_MODEL_TIMEOUT_MS = Number(process.env.GEMINI_MODEL_TIMEOUT_MS || 11000);
// Nemá zmysel začínať volanie, ak do konca rozpočtu zostáva menej ako toto.
const MIN_ATTEMPT_MS = 2500;

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
  timeoutMs: number = PER_MODEL_TIMEOUT_MS,
  budgetMs: number = 24000
): Promise<{ response: any; model: string }> {
  const start = Date.now();
  const remaining = () => budgetMs - (Date.now() - start);
  let lastErr: unknown;
  let sawOverload = false;
  let ranOutOfTime = false;

  for (const model of FALLBACK_MODELS) {
    const maxAttempts = 2; // 1 pokus + 1 rýchly retry pri preťažení
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Globálny strop: ak nezostáva dosť času na zmysluplný pokus, končíme.
      const left = remaining();
      if (left < MIN_ATTEMPT_MS) {
        ranOutOfTime = true;
        break;
      }
      // Timeout pokusu = menší z per-model limitu a zvyšného rozpočtu.
      const attemptTimeout = Math.min(timeoutMs, left);
      try {
        const response = await withTimeout(
          ai.models.generateContent({ ...request, model } as any),
          attemptTimeout,
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
        // Retry toho istého modelu len pri preťažení a ak zostáva čas.
        if (overloaded && attempt < maxAttempts && remaining() > MIN_ATTEMPT_MS + 700) {
          await sleep(600 * attempt); // krátky backoff a skús ten istý model ešte raz
          continue;
        }
        break; // skús ďalší model v reťazi
      }
    }
    if (ranOutOfTime || remaining() < MIN_ATTEMPT_MS) {
      ranOutOfTime = true;
      break;
    }
  }

  // Priateľské hlášky podľa príčiny.
  if (ranOutOfTime) {
    throw new Error("AI nestihla odpovedať včas. Skús to prosím o chvíľu znova.");
  }
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
  Alkohol, Hotové jedlo, Fast food. Príklad: bravčový rezeň → category "Mäso",
  subcategory "Bravčové mäso"; losos → "Ryby" / "Morské ryby".
  DÔLEŽITÉ: každý alkoholický nápoj (pivo, víno, tvrdý alkohol, likér, cider,
  miešané drinky) zaraď do category "Alkohol". Sladkosti, čokoládu, zákusky,
  sušienky a dezerty zaraď do category "Sladké".

- Ku každej položke urči "healthIndex" – celé číslo 0 až 10 vyjadrujúce
  zdravosť jedla. Zohľadni najmä: pridaný cukor, nasýtené tuky, soľ, stupeň
  spracovania a obsah vlákniny. Drž sa týchto pravidiel:
  • 9–10: čerstvé ovocie a zelenina, strukoviny, ryby, neochutená voda.
  • 7–8: celozrnné obilniny, orechy a semená, vajcia, biele mäso,
    NEochutené (neslazené) mliečne výrobky – biely jogurt, tvaroh, mlieko.
  • 5–6: varené škrobové prílohy (ryža, cestoviny, zemiaky – aj keď sú uvedené
    ako „suché"/surové, hodnoť ich ako ich varenú prílohu), ovsené vločky,
    syry, chudé červené mäso.
  • 3–4: biele pečivo, údeniny, vyprážané jedlá, sladené nápoje (kola, džús,
    energetické) a bežné SLADENÉ/OCHUTENÉ mliečne výrobky a nápoje (ochutené
    mlieka ako kakao, ochutené jogurty so štandardným obsahom bielkovín).
  • 0–2: fast food (hamburger, hranolky), sladkosti, čokoláda, zákusky, chipsy,
    alkohol. Napr. hamburger z McDonald's ≈ 1–2.
  ÚPRAVY (modifikátory):
  - Ak je výrobok mliečny ALE sladený/ochutený (má pridaný cukor), NEhodnoť ho
    ako biely jogurt/mlieko – patrí medzi sladené.
  - Ak má sladený výrobok zároveň VYSOKÝ podiel bielkovín (proteínové mlieka,
    proteínové nápoje/jogurty, napr. Miller Milch Protein), pridaj +1 oproti
    bežnému sladenému – teda typicky 4–5, lebo bielkoviny čiastočne vyvážia cukor.
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

// Pre vLLM fallback (nedostane responseSchema) opíšeme presný tvar JSON textom.
const PARSE_JSON_SHAPE = `

FORMÁT ODPOVEDE: Vráť IBA platný JSON objekt (bez markdownu, bez vysvetlení) presne v tomto tvare:
{"mealType":"breakfast|snack|lunch|afternoon|dinner|supper|other","waterMl":0,"items":[{"name":"string","quantityGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"category":"string","subcategory":"string","healthIndex":0,"confidence":0.0,"assumption":"string"}]}`;

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
  const prompt = `Používateľ povedal/napísal čo zjedol:\n"""${text}"""${buildReferenceBlock(reference)}`;

  let raw: string;
  let usage: ParseResult["usage"];
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chýba GEMINI_API_KEY v prostredí.");
    const ai = new GoogleGenAI({ apiKey });

    const { response, model } = await generateWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Prázdna odpoveď z Gemini.");
    raw = text;

    const um: any = (response as any).usageMetadata || {};
    usage = {
      model,
      promptTokens: Number(um.promptTokenCount ?? 0),
      outputTokens: Number(um.candidatesTokenCount ?? 0),
      totalTokens: Number(um.totalTokenCount ?? 0),
    };
  } catch (geminiErr) {
    // Fallback na interný vLLM engine (len ak je nakonfigurovaný tokenom).
    if (!isVllmConfigured()) throw geminiErr;
    console.error("Gemini zlyhal – skúšam interný vLLM fallback:", (geminiErr as any)?.message || geminiErr);
    const r = await vllmChatJSON({
      system: SYSTEM_INSTRUCTION + PARSE_JSON_SHAPE,
      user: prompt,
      temperature: 0.3,
    });
    raw = r.text;
    usage = r.usage;
  }

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

// ── Dávkové prehodnotenie zdravosti (re-scoring existujúcich záznamov) ──
// Ohodnotí naraz zoznam položiek podľa rovnakej rubriky ako parseFood,
// aby spätné prehodnotenie minulo minimum tokenov.
const HEALTH_RUBRIC = `Rubrika zdravosti (healthIndex, celé číslo 0..10). Zohľadni pridaný cukor,
nasýtené tuky, soľ, spracovanie a vlákninu.
- 9–10: čerstvé ovocie a zelenina, strukoviny, ryby, neochutená voda.
- 7–8: celozrnné obilniny, orechy a semená, vajcia, biele mäso, NEslazené mliečne (biely jogurt, tvaroh, mlieko).
- 5–6: varené škrobové prílohy (ryža, cestoviny, zemiaky – aj „suché"/surové ako varené), ovsené vločky, syry, chudé červené mäso.
- 3–4: biele pečivo, údeniny, vyprážané jedlá, sladené nápoje a bežné sladené/ochutené mliečne (kakao, ochutené jogurty).
- 0–2: fast food, sladkosti, čokoláda, zákusky, chipsy, alkohol.
Modifikátory: sladený/ochutený mliečny výrobok NEhodnoť ako biely jogurt (patrí medzi sladené);
ak je sladený ALE s vysokým podielom bielkovín (proteínové nápoje/jogurty), pridaj +1 (typicky 4–5).`;

export async function scoreHealthBatch(
  items: { name: string; category: string | null }[]
): Promise<Map<number, number>> {
  const list = items
    .map((it, i) => `${i + 1}. ${it.name}${it.category ? ` (kat. ${it.category})` : ""}`)
    .join("\n");

  const prompt = `Ohodnoť zdravosť každej položky podľa pravidiel a vráť pre každú jej "index" (poradové číslo zo zoznamu) a "healthIndex" (0..10).\n\n${HEALTH_RUBRIC}\n\nPOLOŽKY:\n${list}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scores: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.NUMBER, description: "Poradové číslo položky zo zoznamu (1-based)" },
            healthIndex: { type: Type.NUMBER, description: "Zdravosť 0..10" },
          },
          required: ["index", "healthIndex"],
        },
      },
    },
    required: ["scores"],
  };

  let raw: string | undefined;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chýba GEMINI_API_KEY v prostredí.");
    const ai = new GoogleGenAI({ apiKey });

    const { response } = await generateWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: "Si výživový asistent. Hodnoť striktne podľa zadanej rubriky a vráť iba JSON.",
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });
    raw = response.text;
  } catch (geminiErr) {
    if (!isVllmConfigured()) throw geminiErr;
    console.error("Gemini zlyhal (scoreHealthBatch) – skúšam interný vLLM fallback:", (geminiErr as any)?.message || geminiErr);
    const r = await vllmChatJSON({
      system:
        'Si výživový asistent. Hodnoť striktne podľa zadanej rubriky a vráť IBA JSON objekt v tvare {"scores":[{"index":1,"healthIndex":0}]}.',
      user: prompt,
      temperature: 0.1,
    });
    raw = r.text;
  }

  const out = new Map<number, number>();
  if (!raw) return out;
  let parsed: { scores?: { index?: number; healthIndex?: number }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  for (const s of parsed.scores || []) {
    const idx = Number(s.index);
    const hi = Number(s.healthIndex);
    if (Number.isFinite(idx) && Number.isFinite(hi)) {
      out.set(idx - 1, Math.min(10, Math.max(0, Math.round(hi)))); // 0-based index
    }
  }
  return out;
}
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
    16000, // web grounding býva pomalšie – dlhší limit na model
    45000 // väčší rozpočet (route má maxDuration 60)
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

// Prečíta tabuľku nutričných hodnôt z fotky obalu (vision) a vráti hodnoty na 100 g.
// Názov produktu na tabuľke zvyčajne nie je – ten dopĺňa používateľ.
export async function parseNutritionLabel(imageBase64: string, mimeType: string): Promise<WebLookupResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Chýba GEMINI_API_KEY v prostredí.");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Na obrázku je tabuľka nutričných hodnôt z obalu potravinového výrobku.
Prečítaj z nej hodnoty NA 100 g (alebo 100 ml) – ak je v tabuľke aj stĺpec na porciu,
použi stĺpec na 100 g. Energiu ber v kcal (nie v kJ; ak je len kJ, preveď: kcal = kJ / 4,184).
Ak je na obale čitateľný názov výrobku, vráť ho, inak nechaj prázdny reťazec.
Odhadni aj index zdravosti (healthIndex) 0–10 a hlavnú kategóriu.
Odpovedz IBA platným JSON objektom (bez markdownu) v tvare:
{"found": true/false, "name": "názov alebo \\"\\"", "calories": kcal_na_100g,
 "protein": g, "carbs": g, "fat": g, "fiber": g_alebo_null,
 "category": "kategória (napr. Sladké, Nápoje, Mäso)", "healthIndex": 0-10}
Ak tabuľku nevieš spoľahlivo prečítať, vráť {"found": false}.`;

  const { response, model } = await generateWithFallback(
    ai,
    {
      contents: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    },
    16000, // čítanie obrázka býva pomalšie
    45000 // väčší rozpočet (route má maxDuration 60)
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
    name: String(parsed.name || "").trim(),
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
