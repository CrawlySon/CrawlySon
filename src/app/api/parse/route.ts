import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFood, type ReferenceFood } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vyberie z DB potraviny, ktoré sa aspoň trochu zhodujú s textom (slová >= 3 znaky),
// aby sme AI poskytli relevantnú referenciu bez posielania celej databázy.
const SELECT = { name: true, baseGrams: true, calories: true, protein: true, carbs: true, fat: true, fiber: true };

async function pickReference(text: string): Promise<ReferenceFood[]> {
  const words = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    )
  );

  // Najprv hľadaj v databáze potravín podľa slov z textu (škáluje aj pri tisícoch položiek).
  let matched: any[] = [];
  if (words.length) {
    matched = await prisma.food.findMany({
      where: { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
      select: SELECT,
      take: 40,
    });
  }

  // Ak nič nematchne, pošli pár naposledy pridaných (kalibrácia pre model).
  if (!matched.length) {
    matched = await prisma.food.findMany({ select: SELECT, take: 15, orderBy: { createdAt: "desc" } });
  }

  return matched as ReferenceFood[];
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Zadaj popis jedla." }, { status: 400 });
    }

    const reference = await pickReference(text);
    const { items, mealType } = await parseFood(text.trim(), reference);

    return NextResponse.json({ items, mealType });
  } catch (err: any) {
    console.error("parse error:", err);
    return NextResponse.json(
      { error: err?.message || "Chyba pri spracovaní AI." },
      { status: 500 }
    );
  }
}
