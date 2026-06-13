import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/foods?q=...  -> vyhľadávanie v zdieľanej + vlastnej databáze
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const scope = searchParams.get("scope") || "all"; // mine | global | all

  const visibility =
    scope === "mine" ? { userId } : scope === "global" ? { userId: null } : { OR: [{ userId: null }, { userId }] };

  const foods = await prisma.food.findMany({
    where: q ? { AND: [visibility, { name: { contains: q, mode: "insensitive" } }] } : visibility,
    orderBy: { name: "asc" },
    take: 200,
  });
  return NextResponse.json({ foods });
}

// POST /api/foods -> pridá vlastnú (súkromnú) potravinu
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "Chýba názov." }, { status: 400 });
  const food = await prisma.food.create({
    data: {
      userId,
      name: String(b.name),
      barcode: b.barcode ? String(b.barcode) : null,
      category: b.category ? String(b.category) : null,
      subcategory: b.subcategory ? String(b.subcategory) : null,
      baseGrams: b.baseGrams ? Number(b.baseGrams) : 100,
      calories: Math.max(0, Number(b.calories || 0)),
      protein: Math.max(0, Number(b.protein || 0)),
      carbs: Math.max(0, Number(b.carbs || 0)),
      fat: Math.max(0, Number(b.fat || 0)),
      fiber: b.fiber != null ? Number(b.fiber) : null,
      healthIndex: b.healthIndex != null && b.healthIndex !== "" ? Number(b.healthIndex) : null,
      source: "manual",
    },
  });
  return NextResponse.json({ food });
}
