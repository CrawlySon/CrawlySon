import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { parseNutritionLabel } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

function todayLocalISO() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// POST /api/barcode/photo { imageBase64, mimeType } -> AI prečíta tabuľku
// nutričných hodnôt z fotky a vráti hodnoty na 100 g (bez uloženia – názov
// doplní používateľ a uloží sa cez /api/foods).
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const imageBase64 = String(b.imageBase64 || "").trim();
  const mimeType = String(b.mimeType || "image/jpeg").trim();
  if (!imageBase64) return NextResponse.json({ error: "Chýba fotka." }, { status: 400 });

  try {
    const { food, usage } = await parseNutritionLabel(imageBase64, mimeType);

    // zaloguj spotrebu tokenov
    try {
      await prisma.aiUsage.create({
        data: {
          userId,
          kind: "barcode-photo",
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

    return NextResponse.json({
      found: true,
      nutrition: {
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        category: food.category,
        healthIndex: food.healthIndex,
      },
    });
  } catch (err: any) {
    console.error("barcode photo error:", err);
    return NextResponse.json({ error: err?.message || "Chyba pri čítaní fotky." }, { status: 500 });
  }
}
