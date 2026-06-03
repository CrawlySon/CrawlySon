import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFood, type ReferenceFood } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vyberie z DB potraviny, ktoré sa aspoň trochu zhodujú s textom (slová >= 3 znaky),
// aby sme AI poskytli relevantnú referenciu bez posielania celej databázy.
async function pickReference(text: string): Promise<ReferenceFood[]> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const all = await prisma.food.findMany({
    select: { name: true, baseGrams: true, calories: true, protein: true, carbs: true, fat: true, fiber: true },
  });

  const matched = all.filter((f) => {
    const n = f.name.toLowerCase();
    return words.some((w) => n.includes(w) || w.includes(n.split(" ")[0]));
  });

  // Ak nič nematchne, pošli aspoň pár častých, nech má model "kalibráciu".
  return (matched.length ? matched : all.slice(0, 15)) as ReferenceFood[];
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Zadaj popis jedla." }, { status: 400 });
    }

    const reference = await pickReference(text);
    const items = await parseFood(text.trim(), reference);

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("parse error:", err);
    return NextResponse.json(
      { error: err?.message || "Chyba pri spracovaní AI." },
      { status: 500 }
    );
  }
}
