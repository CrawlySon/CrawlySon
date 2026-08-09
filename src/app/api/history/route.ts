import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

type DayAgg = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
  hSum: number; // vážený súčet indexu zdravosti
  hWeight: number; // súčet váh (hmotnosť)
  catCalories: number; // kcal vo zvolenej kategórii
  catCount: number;
};

const MEAL_TYPES = ["breakfast", "snack", "lunch", "afternoon", "dinner", "supper", "other"];

// Váha položky pre výpočet zdravosti = hmotnosť; ak chýba, odhad z kalórií.
function weightOf(grams: number | null, calories: number): number {
  if (grams && grams > 0) return grams;
  if (calories > 0) return calories / 2; // ~2 kcal/g hrubý odhad
  return 100;
}

// GET /api/history?days=14&category=Mäso&meal=breakfast
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") || "").trim();
  // Voliteľný filter na typ jedla (raňajky, obed, …). Neplatná hodnota = bez filtra.
  const mealParam = (searchParams.get("meal") || "").trim();
  const meal = MEAL_TYPES.includes(mealParam) ? mealParam : "";

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  let sinceISO: string;
  let untilISO: string;
  if (fromParam && toParam) {
    sinceISO = fromParam;
    untilISO = toParam;
  } else {
    const days = Math.min(400, Math.max(1, parseInt(searchParams.get("days") || "14", 10)));
    const now = new Date();
    untilISO = now.toISOString().slice(0, 10);
    const since = new Date(now);
    since.setDate(since.getDate() - (days - 1));
    sinceISO = since.toISOString().slice(0, 10);
  }

  const [entries, waterLogs, sleepLogs] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, date: { gte: sinceISO, lte: untilISO } },
      select: { date: true, calories: true, protein: true, carbs: true, fat: true, quantityGrams: true, healthIndex: true, category: true, mealType: true },
    }),
    prisma.waterLog.findMany({ where: { userId, date: { gte: sinceISO, lte: untilISO } }, select: { date: true, ml: true } }),
    prisma.sleepLog.findMany({ where: { userId, date: { gte: sinceISO, lte: untilISO } }, select: { date: true, score: true } }),
  ]);

  const waterByDate = new Map<string, number>();
  for (const w of waterLogs) waterByDate.set(w.date, (waterByDate.get(w.date) || 0) + w.ml);

  const sleepByDate = new Map<string, number>();
  for (const s of sleepLogs) sleepByDate.set(s.date, s.score);

  const byDate = new Map<string, DayAgg>();
  const catTotals = new Map<string, { calories: number; count: number }>();

  // Celkové kcal dňa zo VŠETKÝCH jedál – aj keď je zapnutý filter typu jedla.
  // Vďaka tomu vieme v UI ukázať podiel daného jedla na celom dni.
  const dayCaloriesAll = new Map<string, number>();
  for (const e of entries) dayCaloriesAll.set(e.date, (dayCaloriesAll.get(e.date) || 0) + e.calories);

  // Pri filtri na typ jedla agregujeme len záznamy daného jedla (kcal, makrá,
  // zdravosť aj kategórie sa tak vzťahujú výhradne naň).
  const scoped = meal ? entries.filter((e) => e.mealType === meal) : entries;

  for (const e of scoped) {
    const d =
      byDate.get(e.date) ||
      { date: e.date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, hSum: 0, hWeight: 0, catCalories: 0, catCount: 0 };
    d.calories += e.calories;
    d.protein += e.protein;
    d.carbs += e.carbs;
    d.fat += e.fat;
    d.count += 1;
    if (e.healthIndex != null) {
      const w = weightOf(e.quantityGrams, e.calories);
      d.hSum += e.healthIndex * w;
      d.hWeight += w;
    }
    if (category && e.category && e.category.toLowerCase() === category.toLowerCase()) {
      d.catCalories += e.calories;
      d.catCount += 1;
    }
    byDate.set(e.date, d);

    const cat = e.category || "Bez kategórie";
    const ct = catTotals.get(cat) || { calories: 0, count: 0 };
    ct.calories += e.calories;
    ct.count += 1;
    catTotals.set(cat, ct);
  }

  // Doplň dni, ktoré majú len vodu alebo len spánok (žiadne jedlo)
  for (const date of waterByDate.keys()) {
    if (!byDate.has(date)) {
      byDate.set(date, { date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, hSum: 0, hWeight: 0, catCalories: 0, catCount: 0 });
    }
  }
  for (const date of sleepByDate.keys()) {
    if (!byDate.has(date)) {
      byDate.set(date, { date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, hSum: 0, hWeight: 0, catCalories: 0, catCount: 0 });
    }
  }

  const daysOut = Array.from(byDate.values())
    .map((d) => ({
      date: d.date,
      calories: d.calories,
      protein: d.protein,
      carbs: d.carbs,
      fat: d.fat,
      waterMl: waterByDate.get(d.date) || 0,
      sleepScore: sleepByDate.get(d.date) ?? null,
      count: d.count,
      healthScore: d.hWeight > 0 ? Math.round((d.hSum / d.hWeight) * 10) / 10 : null,
      catCalories: d.catCalories,
      catCount: d.catCount,
      dayCalories: dayCaloriesAll.get(d.date) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const categories = Array.from(catTotals.entries())
    .map(([name, t]) => ({ name, calories: Math.round(t.calories), count: t.count }))
    .sort((a, b) => b.calories - a.calories);

  return NextResponse.json({ days: daysOut, categories });
}
