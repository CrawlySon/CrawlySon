import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import { apiError, notFound, unauthorized } from "@/lib/errors";
import { dateOr, foodItemSchema, mealTypeSchema } from "@/lib/validation";

export const runtime = "nodejs";

// POST /api/favorites/[id]/log { date?, mealType? } -> zapíše obľúbené ako záznamy dňa
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const date = dateOr(body.date, skToday());

    const fav = await prisma.favorite.findFirst({ where: { id: params.id, userId } });
    if (!fav) return notFound("Obľúbené");

    const meal = mealTypeSchema.safeParse(body.mealType);
    const favMeal = mealTypeSchema.safeParse(fav.mealType);
    const mealType = meal.success ? meal.data : favMeal.success ? favMeal.data : "other";
    const rawItems = Array.isArray(fav.items) ? (fav.items as unknown[]) : [];
    const items = rawItems.map((it) => foodItemSchema.parse(it ?? {}));
    if (!items.length) return NextResponse.json({ error: "Obľúbené je prázdne." }, { status: 400 });

    const created = await prisma.$transaction([
      ...items.map((it) =>
        prisma.entry.create({
          data: {
            userId,
            date,
            mealType,
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
            source: "favorite",
          },
        })
      ),
      prisma.favorite.update({ where: { id: fav.id }, data: { useCount: { increment: 1 } } }),
    ]);

    const entries = created.slice(0, items.length);
    return NextResponse.json({ entries });
  } catch (e) {
    return apiError(e, "favorites/log POST");
  }
}
