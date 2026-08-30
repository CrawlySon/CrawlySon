// Výživová AI logika appky – beží výhradne na OpenAI (žiadny Gemini).
import type { ParsedItem } from "./types";
import { openAIChatJSON, openAIVisionJSON } from "./openai";

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

ÚPLNOSŤ (NAJDÔLEŽITEJŠIE PRAVIDLO):
- Vráť KAŽDÚ potravinu spomenutú v texte. Nikdy žiadnu nevynechaj, nezhrň viac
  potravín do jednej položky a nezastav sa po prvých pár položkách.
- Text môže obsahovať VIAC jedál dňa naraz – aj vo viacerých riadkoch alebo
  sekciách s nadpisom, napr.:
    "Raňajky: kura v obale, waffle, majonéza, cappuccino
     Obed: hranolky, chickenburger, lungo s mliekom"
  Spracuj VŠETKY sekcie a všetky riadky, nie iba prvý. V tomto príklade musíš
  vrátiť 7 položiek – 4 s mealType "breakfast" a 3 s "lunch".
- Pred odpoveďou si v duchu spočítaj potraviny v texte a over, že "items"
  obsahuje rovnaký počet.

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
- Z textu rozpoznaj typ jedla a prirad ho KAŽDEJ položke zvlášť v poli "mealType"
  (aj v "items" pri každej položke zvlášť!):
  raňajky = "breakfast", desiata (dopoludňajšia) = "snack", obed = "lunch",
  olovrant (popoludňajší) = "afternoon", večera = "dinner",
  druhá večera / večerné maškrtenie / nočné jedenie = "supper".
  Ak typ jedla pre danú položku NEuvedie, vráť "other".
  Keď používateľ spomína viac jedál z rôznych častí dňa naraz – či už v jednej
  vete („ráno som jedol banán, na obed sviečkovú, na večeru kurací steak"),
  alebo v samostatných riadkoch s nadpisom („Raňajky: …" / „Obed: …") – vráť
  položky zo VŠETKÝCH týchto jedál a každej daj jej správny mealType.
  Top-level "mealType" je len orientačný (typ prvého jedla) a NIE JE dôvod
  vynechať položky z ostatných jedál – tie musia byť v "items" tiež.

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

// Presný tvar JSON odpovede (OpenAI nedostane schému, opíšeme ho textom).
const PARSE_JSON_SHAPE = `

FORMÁT ODPOVEDE: Vráť IBA platný JSON objekt (bez markdownu, bez vysvetlení) presne v tomto tvare:
{"mealType":"breakfast|snack|lunch|afternoon|dinner|supper|other","waterMl":0,"items":[{"name":"string","mealType":"breakfast|snack|lunch|afternoon|dinner|supper|other","quantityGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"category":"string","subcategory":"string","healthIndex":0,"confidence":0.0,"assumption":"string"}]}`;

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
  warning?: string;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

// Nadpisy jedál dňa na začiatku riadku, napr. „Obed:" alebo „Druhá večera –".
// Poradie je dôležité: „druhá večera" musí ísť pred „večera".
const MEAL_HEADINGS: { rx: RegExp; meal: DetectedMeal }[] = [
  { rx: /^\s*(?:2\.|druh[áa])\s*ve[čc]er\w*\s*[:\-–—]/i, meal: "supper" },
  { rx: /^\s*ra[ňn]ajk\w*\s*[:\-–—]/i, meal: "breakfast" },
  { rx: /^\s*(?:desiat\w*|dopoludaj\w*)\s*[:\-–—]/i, meal: "snack" },
  { rx: /^\s*obed\w*\s*[:\-–—]/i, meal: "lunch" },
  { rx: /^\s*olovrant\w*\s*[:\-–—]/i, meal: "afternoon" },
  { rx: /^\s*ve[čc]er\w*\s*[:\-–—]/i, meal: "dinner" },
];

type Section = { meal: DetectedMeal | null; text: string };

// Rozdelí text na sekcie podľa nadpisov jedál dňa. Riadky pred prvým nadpisom
// (alebo text bez nadpisov) tvoria sekciu bez určeného jedla.
export function splitMealSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const hit = MEAL_HEADINGS.find((h) => h.rx.test(line));
    if (hit) {
      current = { meal: hit.meal, text: line.replace(hit.rx, "").trim() };
      sections.push(current);
    } else if (current) {
      current.text += `\n${line.trim()}`;
    } else {
      current = { meal: null, text: line.trim() };
      sections.push(current);
    }
  }
  return sections.filter((s) => s.text.trim().length > 0);
}

// Viac jedál naraz posielame ako samostatné volania (paralelne). Jeden veľký
// zoznam model spoľahlivo nezvládne – utne ho po prvej sekcii, aj keď ho prompt
// výslovne žiada celý. Po sekciách je každé volanie krátke a nič sa nestratí.
export async function parseFood(text: string, reference: ReferenceFood[]): Promise<ParseResult> {
  const sections = splitMealSections(text);
  if (sections.length > 1) return parseBySections(sections, reference);
  return parseOnce(text, reference);
}

const emptyUsage = () => ({ model: "openai", promptTokens: 0, outputTokens: 0, totalTokens: 0 });

async function parseBySections(sections: Section[], reference: ReferenceFood[]): Promise<ParseResult> {
  const results = await Promise.allSettled(sections.map((s) => parseOnce(s.text, reference, s.meal)));

  const items: ParsedItem[] = [];
  let waterMl = 0;
  const usage = emptyUsage();
  const failed: string[] = [];

  results.forEach((r, i) => {
    const meal = sections[i].meal;
    if (r.status !== "fulfilled") {
      failed.push(meal ? MEAL_SK[meal] : "časť zoznamu");
      return;
    }
    // Jedlo dňa poznáme z nadpisu – je spoľahlivejšie než odhad modelu.
    for (const it of r.value.items) items.push(meal ? { ...it, mealType: meal } : it);
    waterMl += r.value.waterMl;
    usage.model = r.value.usage.model;
    usage.promptTokens += r.value.usage.promptTokens;
    usage.outputTokens += r.value.usage.outputTokens;
    usage.totalTokens += r.value.usage.totalTokens;
  });

  if (!items.length && failed.length) {
    throw new Error("Nepodarilo sa spracovať žiadnu časť zoznamu. Skús to prosím znova.");
  }

  return {
    items,
    mealType: sections.find((s) => s.meal)?.meal ?? "other",
    waterMl,
    warning: failed.length ? `Nepodarilo sa spracovať: ${failed.join(", ")}. Skús to pre tieto jedlá zopakovať.` : undefined,
    usage,
  };
}

const MEAL_SK: Record<DetectedMeal, string> = {
  breakfast: "raňajky",
  snack: "desiata",
  lunch: "obed",
  afternoon: "olovrant",
  dinner: "večera",
  supper: "druhá večera",
  other: "iné",
};

async function parseOnce(text: string, reference: ReferenceFood[], meal?: DetectedMeal | null): Promise<ParseResult> {
  const mealHint = meal ? `\n\nToto je jedlo dňa: ${MEAL_SK[meal]} – všetkým položkám nastav mealType "${meal}".` : "";
  const prompt = `Používateľ povedal/napísal čo zjedol:\n"""${text}"""${mealHint}${buildReferenceBlock(reference)}`;

  const r = await openAIChatJSON({
    system: SYSTEM_INSTRUCTION + PARSE_JSON_SHAPE,
    user: prompt,
    temperature: 0.3,
    // Jedna položka zaberie ~100–130 tokenov, takže strop musí uniesť aj dlhý
    // zoznam (celý deň naraz). Pri prekročení by prišiel odseknutý JSON.
    maxTokens: 6000,
  });
  const usage = r.usage;

  // Odseknutá odpoveď = neúplný zoznam. Radšej zrozumiteľná hláška než „neplatný JSON".
  if (r.finishReason === "length") {
    throw new Error("Zoznam jedál je príliš dlhý na jedno spracovanie. Rozdeľ ho prosím na dve časti.");
  }

  let parsed: { items?: any[]; mealType?: string; waterMl?: number };
  try {
    parsed = JSON.parse(r.text);
  } catch {
    throw new Error("Nepodarilo sa spracovať odpoveď AI (neplatný JSON).");
  }

  const rawMeal = String(parsed.mealType ?? "other");
  const mealType: DetectedMeal = (MEAL_TYPES as readonly string[]).includes(rawMeal)
    ? (rawMeal as DetectedMeal)
    : "other";

  const waterMl = parsed.waterMl && Number(parsed.waterMl) > 0 ? Math.round(Number(parsed.waterMl)) : 0;

  const arr = Array.isArray(parsed.items) ? parsed.items : [];
  const items = arr.map((it): ParsedItem => {
    const rawItMeal = String(it.mealType ?? "");
    const itMealType =
      (MEAL_TYPES as readonly string[]).includes(rawItMeal) && rawItMeal !== "other"
        ? (rawItMeal as DetectedMeal)
        : undefined;
    return {
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
      mealType: itMealType,
    };
  });

  return { items, mealType, waterMl, usage };
}

// ── Dávkové prehodnotenie zdravosti (re-scoring existujúcich záznamov) ──
const HEALTH_RUBRIC = `Rubrika zdravosti (healthIndex, celé číslo 0..10). Zohľadni pridaný cukor,
nasýtené tuky, soľ, spracovanie a vlákninu.
- 9–10: čerstvé ovocie a zelenina, strukoviny, ryby, neochutená voda.
- 7–8: celozrnné obilniny, orechy a semená, vajcia, biele mäso, NEslazené mliečne (biely jogurt, tvaroh, mlieko).
- 5–6: varené škrobové prílohy (ryža, cestoviny, zemiaky – aj „suché"/surové ako varené), ovsené vločky, syry, chudé červené mäso.
- 3–4: biele pečivo, údeniny, vyprážané jedlá, sladené nápoje a bežné sladené/ochutené mliečne (kakao, ochutené jogurty).
- 0–2: fast food, sladkosti, čokoláda, zákusky, chipsy, alkohol.
Modifikátory: sladený/ochutený mliečny výrobok NEhodnoť ako biely jogurt (patrí medzi sladené);
ak je sladený ALE s vysokým podielom bielkovín (proteínové nápoje/jogurty), pridaj +1 (typicky 4–5).

KONZISTENTNOSŤ (dôležité):
- Hodnoť podľa uvedených hodnôt NA 100 g, nie podľa toho, ako názov znie.
  Hodnoty sú už prepočítané na 100 g – veľkosť balenia ani porcie neber do úvahy.
- Položky s prakticky rovnakými hodnotami a rovnakého druhu musia dostať ROVNAKÉ
  skóre. Napr. „Müllermilch" a „Müllermilch pistácia a kokos" pri rovnakých
  hodnotách na 100 g patria na rovnaké číslo – príchuť sama o sebe skóre nemení.
- Prejdi zoznam ako celok a over, že podobné položky nemajú rozhádzané skóre.`;

export type HealthScoreItem = {
  name: string;
  category: string | null;
  // Výživové hodnoty PREPOČÍTANÉ na 100 g (ak ich poznáme).
  per100?: { calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; fiber?: number | null } | null;
};

function per100Text(p: HealthScoreItem["per100"]): string {
  if (!p || p.calories == null) return "";
  const n = (v: number | null | undefined) => (v == null ? "?" : Math.round(v * 10) / 10);
  return ` – na 100 g: ${Math.round(p.calories)} kcal, B ${n(p.protein)} g, S ${n(p.carbs)} g, T ${n(p.fat)} g${
    p.fiber != null ? `, vláknina ${n(p.fiber)} g` : ""
  }`;
}

export async function scoreHealthBatch(items: HealthScoreItem[]): Promise<Map<number, number>> {
  const list = items
    .map((it, i) => `${i + 1}. ${it.name}${it.category ? ` (kat. ${it.category})` : ""}${per100Text(it.per100)}`)
    .join("\n");

  const prompt = `Ohodnoť zdravosť každej položky podľa pravidiel a vráť pre každú jej "index" (poradové číslo zo zoznamu) a "healthIndex" (0..10).\n\n${HEALTH_RUBRIC}\n\nPOLOŽKY:\n${list}`;

  const out = new Map<number, number>();
  let raw: string | undefined;
  try {
    const r = await openAIChatJSON({
      system:
        'Si výživový asistent. Hodnoť striktne podľa zadanej rubriky a vráť IBA JSON objekt v tvare {"scores":[{"index":1,"healthIndex":0}]}.',
      user: prompt,
      temperature: 0.1,
    });
    raw = r.text;
  } catch (e) {
    console.error("scoreHealthBatch zlyhal:", (e as any)?.message || e);
    return out;
  }

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
  source?: string;
};

export type WebLookupResult = {
  food: WebFood | null;
  usage: { model: string; promptTokens: number; outputTokens: number; totalTokens: number };
};

// Dohľadanie produktu podľa názvu/čiarového kódu z vedomostí modelu (bez reálneho
// prehľadávania webu). Ak model produkt nepozná spoľahlivo, vráti found:false.
export async function lookupProductByWeb(query: string): Promise<WebLookupResult> {
  const prompt = `Pomôž identifikovať a určiť nutričné hodnoty produktu: "${query}".
Ak je v zadaní čiarový kód (EAN/GTIN), skús podľa neho a/alebo názvu určiť, o aký produkt ide.
Použi svoje znalosti o bežných potravinách a značkách. Potrebujem hodnoty NA 100 g (alebo 100 ml).
Ak produkt nevieš spoľahlivo určiť, vráť "found": false (nehádaj naslepo).
Odpovedz IBA platným JSON objektom (bez markdownu) v tvare:
{"found": true/false, "name": "presný názov produktu", "calories": kcal_na_100g,
 "protein": g, "carbs": g, "fat": g, "fiber": g_alebo_null,
 "category": "kategória (napr. Sladké, Nápoje, Mäso)", "healthIndex": 0-10}`;

  const r = await openAIChatJSON({
    system: "Si výživový asistent. Odpovedaj IBA platným JSON objektom.",
    user: prompt,
    temperature: 0.2,
    timeoutMs: 45000,
  });
  const usage = r.usage;

  const raw = (r.text || "").trim();
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

// Prečíta tabuľku nutričných hodnôt z fotky obalu (OpenAI vision) → hodnoty na 100 g.
export async function parseNutritionLabel(imageBase64: string, mimeType: string): Promise<WebLookupResult> {
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

  const r = await openAIVisionJSON({
    system: "Si výživový asistent. Odpovedaj IBA platným JSON objektom.",
    prompt,
    imageBase64,
    mimeType,
    temperature: 0.1,
    maxTokens: 700,
    timeoutMs: 45000,
  });
  const usage = r.usage;

  const raw = (r.text || "").trim();
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
