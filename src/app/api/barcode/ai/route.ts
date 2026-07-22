import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { lookupProductByWeb } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

function todayLocalISO() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// POST /api/barcode/ai { code?, name } -> OpenAI určí produkt (z vedomostí modelu) a uloží ho
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  const code = b.code ? String(b.code).trim() : null;
  if (!name && !code) return NextResponse.json({ error: "Zadaj kód alebo názov produktu." }, { status: 400 });

  // Postav dopyt: primárne podľa EAN kódu, názov je voliteľné upresnenie
  const query = name && code ? `${name}, čiarový kód EAN ${code}` : code ? `produkt s čiarovým kódom (EAN/GTIN) ${code}` : name;

  try {
    const { food, usage } = await lookupProductByWeb(query);

    // zaloguj spotrebu tokenov
    try {
      await prisma.aiUsage.create({
        data: {
          userId,
          kind: "barcode-web",
          model: usage.model,
          promptTokens: usage.promptTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          date: todayLocalISO(),
        },
      });
    } catch (e) {
      console.error("aiUsage log error:", e);
    }

    if (!food) return NextResponse.json({ found: false });

    // ulož ako zdieľanú potravinu (nabudúce „známa")
    const created = await prisma.food.create({
      data: {
        userId: null,
        barcode: code,
        name: food.name,
        category: food.category,
        baseGrams: 100,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        healthIndex: food.healthIndex,
        source: "ai-web",
      },
    });

    return NextResponse.json({ found: true, food: created });
  } catch (err: any) {
    console.error("barcode ai error:", err);
    return NextResponse.json({ error: err?.message || "Chyba pri dohľadávaní." }, { status: 500 });
  }
}
