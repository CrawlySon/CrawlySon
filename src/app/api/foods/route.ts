import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/foods?q=...  -> vyhľadávanie v referenčnej databáze
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const foods = await prisma.food.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    take: 50,
  });
  return NextResponse.json({ foods });
}

// POST /api/foods -> pridá vlastnú potravinu do databázy
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "Chýba názov." }, { status: 400 });
  const food = await prisma.food.create({
    data: {
      name: String(b.name),
      category: b.category ? String(b.category) : null,
      baseGrams: b.baseGrams ? Number(b.baseGrams) : 100,
      calories: Math.max(0, Number(b.calories || 0)),
      protein: Math.max(0, Number(b.protein || 0)),
      carbs: Math.max(0, Number(b.carbs || 0)),
      fat: Math.max(0, Number(b.fat || 0)),
      fiber: b.fiber != null ? Number(b.fiber) : null,
    },
  });
  return NextResponse.json({ food });
}
