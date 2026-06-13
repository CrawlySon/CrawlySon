import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";

export const runtime = "nodejs";

// GET /api/entries?date=YYYY-MM-DD  -> záznamy dňa
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();
  const entries = await prisma.entry.findMany({
    where: { date },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ entries });
}

// Zapamätá si jedlo do databázy potravín, ak tam ešte nie je (podľa názvu).
// Existujúce potraviny neprepisuje – zachová prípadné ručné úpravy používateľa.
async function rememberFoods(items: any[]) {
  for (const it of items) {
    const name = String(it.name || "").trim();
    if (!name) continue;
    try {
      const existing = await prisma.food.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (existing) continue;
      const grams = it.quantityGrams != null && Number(it.quantityGrams) > 0 ? Number(it.quantityGrams) : null;
      await prisma.food.create({
        data: {
          name,
          baseGrams: grams ?? 100,
          calories: Math.max(0, Number(it.calories || 0)),
          protein: Math.max(0, Number(it.protein || 0)),
          carbs: Math.max(0, Number(it.carbs || 0)),
          fat: Math.max(0, Number(it.fat || 0)),
          fiber: it.fiber != null ? Number(it.fiber) : null,
          category: it.category ? String(it.category) : null,
          subcategory: it.subcategory ? String(it.subcategory) : null,
          healthIndex: it.healthIndex != null ? Number(it.healthIndex) : null,
          source: "auto",
        },
      });
    } catch {
      /* nech zlyhanie uloženia potraviny nezhodí zápis jedla */
    }
  }
}

// POST /api/entries  -> pridá jednu alebo viac položiek
// body: { date?, mealType, items: ParsedItem[] }  alebo jedna položka
export async function POST(req: Request) {
  const body = await req.json();
  const date: string = body.date || todayISO();
  const mealType: string = body.mealType || "other";
  const source: string = body.source || "manual";

  const items = Array.isArray(body.items) ? body.items : [body];

  const created = await prisma.$transaction(
    items.map((it: any) =>
      prisma.entry.create({
        data: {
          date,
          mealType,
          name: String(it.name || "Jedlo"),
          quantityGrams: it.quantityGrams != null ? Number(it.quantityGrams) : null,
          calories: Math.max(0, Number(it.calories || 0)),
          protein: Math.max(0, Number(it.protein || 0)),
          carbs: Math.max(0, Number(it.carbs || 0)),
          fat: Math.max(0, Number(it.fat || 0)),
          fiber: it.fiber != null ? Number(it.fiber) : null,
          category: it.category ? String(it.category) : null,
          subcategory: it.subcategory ? String(it.subcategory) : null,
          healthIndex: it.healthIndex != null ? Number(it.healthIndex) : null,
          note: it.note ? String(it.note) : null,
          source,
        },
      })
    )
  );

  // Po uložení jedla si potraviny zapamätáme do databázy (nové názvy).
  await rememberFoods(items);

  return NextResponse.json({ entries: created });
}
