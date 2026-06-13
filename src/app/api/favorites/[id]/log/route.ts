import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { todayISO } from "@/lib/nutrition";

export const runtime = "nodejs";

// POST /api/favorites/[id]/log { date?, mealType? } -> zapíše obľúbené ako záznamy dňa
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date: string = body.date || todayISO();

  const fav = await prisma.favorite.findFirst({ where: { id: params.id, userId } });
  if (!fav) return NextResponse.json({ error: "Obľúbené sa nenašlo." }, { status: 404 });

  const mealType: string = body.mealType || fav.mealType || "other";
  const items = Array.isArray(fav.items) ? (fav.items as any[]) : [];

  const created = await prisma.$transaction([
    ...items.map((it: any) =>
      prisma.entry.create({
        data: {
          userId,
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
          source: "favorite",
        },
      })
    ),
    prisma.favorite.update({ where: { id: fav.id }, data: { useCount: { increment: 1 } } }),
  ]);

  const entries = created.slice(0, items.length);
  return NextResponse.json({ entries });
}
