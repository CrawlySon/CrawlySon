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

// Váha položky pre výpočet zdravosti = hmotnosť; ak chýba, odhad z kalórií.
function weightOf(grams: number | null, calories: number): number {
  if (grams && grams > 0) return grams;
  if (calories > 0) return calories / 2; // ~2 kcal/g hrubý odhad
  return 100;
}

// GET /api/history?days=14&category=Mäso
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(120, Math.max(1, parseInt(searchParams.get("days") || "14", 10)));
  const category = (searchParams.get("category") || "").trim();

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceISO = since.toISOString().slice(0, 10);

  const entries = await prisma.entry.findMany({
    where: { userId, date: { gte: sinceISO } },
    select: { date: true, calories: true, protein: true, carbs: true, fat: true, quantityGrams: true, healthIndex: true, category: true },
  });

  const byDate = new Map<string, DayAgg>();
  const catTotals = new Map<string, { calories: number; count: number }>();

  for (const e of entries) {
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

  const daysOut = Array.from(byDate.values())
    .map((d) => ({
      date: d.date,
      calories: d.calories,
      protein: d.protein,
      carbs: d.carbs,
      fat: d.fat,
      count: d.count,
      healthScore: d.hWeight > 0 ? Math.round((d.hSum / d.hWeight) * 10) / 10 : null,
      catCalories: d.catCalories,
      catCount: d.catCount,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const categories = Array.from(catTotals.entries())
    .map(([name, t]) => ({ name, calories: Math.round(t.calories), count: t.count }))
    .sort((a, b) => b.calories - a.calories);

  return NextResponse.json({ days: daysOut, categories });
}
