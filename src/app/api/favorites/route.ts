import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

function cleanItem(it: any) {
  return {
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
  };
}

// GET /api/favorites -> obľúbené používateľa (najčastejšie najprv)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ favorites });
}

// POST /api/favorites { name, mealType?, items: [...] } -> vytvorí obľúbené
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const mealType = String(body.mealType || "other");
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map(cleanItem).filter((i: any) => i.name);

  if (!name) return NextResponse.json({ error: "Chýba názov." }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "Žiadne položky." }, { status: 400 });

  const favorite = await prisma.favorite.create({
    data: { userId, name, mealType, items },
  });
  return NextResponse.json({ favorite });
}
