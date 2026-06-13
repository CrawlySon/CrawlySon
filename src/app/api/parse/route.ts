import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFood, type ReferenceFood } from "@/lib/gemini";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vyberie z DB potraviny, ktoré sa aspoň trochu zhodujú s textom (slová >= 3 znaky),
// aby sme AI poskytli relevantnú referenciu bez posielania celej databázy.
const SELECT = {
  name: true,
  baseGrams: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
  fiber: true,
  category: true,
  subcategory: true,
  healthIndex: true,
};

async function pickReference(userId: string, text: string): Promise<ReferenceFood[]> {
  const words = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    )
  );

  const visibility = { OR: [{ userId: null }, { userId }] };

  // Najprv hľadaj v zdieľanej + vlastnej databáze podľa slov z textu (škáluje).
  let matched: any[] = [];
  if (words.length) {
    matched = await prisma.food.findMany({
      where: {
        AND: [visibility, { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) }],
      },
      select: SELECT,
      take: 40,
    });
  }

  // Ak nič nematchne, pošli pár naposledy pridaných (kalibrácia pre model).
  if (!matched.length) {
    matched = await prisma.food.findMany({ where: visibility, select: SELECT, take: 15, orderBy: { createdAt: "desc" } });
  }

  return matched as ReferenceFood[];
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Zadaj popis jedla." }, { status: 400 });
    }

    const reference = await pickReference(userId, text.trim());
    const { items, mealType, waterMl, usage } = await parseFood(text.trim(), reference);

    // Zaloguj spotrebu tokenov (best-effort, nech nezhodí odpoveď)
    try {
      await prisma.aiUsage.create({
        data: {
          userId,
          kind: "parse",
          model: usage.model,
          promptTokens: usage.promptTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
        },
      });
    } catch (e) {
      console.error("aiUsage log error:", e);
    }

    return NextResponse.json({ items, mealType, waterMl, usage });
  } catch (err: any) {
    console.error("parse error:", err);
    return NextResponse.json(
      { error: err?.message || "Chyba pri spracovaní AI." },
      { status: 500 }
    );
  }
}
