import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import { apiError, unauthorized } from "@/lib/errors";
import { dateOr, foodItemSchema, isoDateSchema, mealTypeSchema } from "@/lib/validation";

export const runtime = "nodejs";

// GET /api/entries?date=YYYY-MM-DD  -> záznamy dňa prihláseného používateľa
export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());
    const entries = await prisma.entry.findMany({
      where: { userId, date },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ entries });
  } catch (e) {
    return apiError(e, "entries GET");
  }
}

// Zapamätá si jedlo do SÚKROMNEJ databázy potravín používateľa, ak tam (ani v zdieľanej)
// ešte nie je podľa názvu. Existujúce potraviny neprepisuje.
async function rememberFoods(userId: string, items: z.infer<typeof foodItemSchema>[]) {
  for (const it of items) {
    const name = it.name.trim();
    if (!name) continue;
    try {
      const existing = await prisma.food.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          OR: [{ userId: null }, { userId }],
        },
      });
      if (existing) continue;
      const grams = it.quantityGrams != null && it.quantityGrams > 0 ? it.quantityGrams : null;
      await prisma.food.create({
        data: {
          userId, // súkromná potravina používateľa
          name,
          baseGrams: grams ?? 100,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          fiber: it.fiber,
          category: it.category,
          subcategory: it.subcategory,
          healthIndex: it.healthIndex,
          source: "auto",
        },
      });
    } catch {
      /* nech zlyhanie uloženia potraviny nezhodí zápis jedla */
    }
  }
}

const MAX_ITEMS = 60;

const bodySchema = z.object({
  date: isoDateSchema.optional(),
  mealType: mealTypeSchema.optional(),
  source: z.string().trim().max(20).optional(),
  items: z.array(foodItemSchema).max(MAX_ITEMS).optional(),
});

// POST /api/entries  -> pridá jednu alebo viac položiek
// body: { date?, mealType, source?, items: ParsedItem[] }  alebo jedna položka
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = bodySchema.parse(raw);
    const items = body.items ?? [foodItemSchema.parse(raw)];
    if (!items.length) return NextResponse.json({ error: "Žiadne položky." }, { status: 400 });

    const date = body.date ?? skToday();
    const mealType = body.mealType ?? "other";
    const source = body.source || "manual";

    const created = await prisma.$transaction(
      items.map((it) =>
        prisma.entry.create({
          data: {
            userId,
            date,
            mealType: it.mealType ?? mealType,
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
            note: it.note,
            source,
          },
        })
      )
    );

    // Po uložení jedla si potraviny zapamätáme do súkromnej databázy (nové názvy).
    await rememberFoods(userId, items);

    return NextResponse.json({ entries: created });
  } catch (e) {
    return apiError(e, "entries POST");
  }
}

