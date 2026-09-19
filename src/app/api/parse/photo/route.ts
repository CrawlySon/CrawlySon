import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMealPhoto, type ReferenceFood } from "@/lib/ai";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";
// Vision volanie býva pomalšie než textové – nechávame mu rezervu.
export const maxDuration = 120;

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

// POST /api/parse/photo { imageBase64, mimeType }
// Rozpozná jedlo na fotke a odhadne porcie + nutričné hodnoty.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Chýba fotka." }, { status: 400 });
    }

    // Z fotky nemáme text, podľa ktorého by sa dala vyberať referencia, tak
    // pošleme naposledy pridané potraviny – model sa nimi vie kalibrovať
    // (napr. trafiť „tvoju" kávu namiesto všeobecnej).
    const reference = (await prisma.food.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: SELECT,
      take: 15,
      orderBy: { createdAt: "desc" },
    })) as ReferenceFood[];

    const t0 = Date.now();
    const { items, mealType, waterMl, usage } = await parseMealPhoto(
      imageBase64,
      typeof mimeType === "string" && mimeType ? mimeType : "image/jpeg",
      reference
    );
    console.log(`[parse/photo] ai=${Date.now() - t0}ms items=${items.length} model=${usage.model}`);

    try {
      await prisma.aiUsage.create({
        data: {
          userId,
          kind: "parse-photo",
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
    console.error("parse/photo error:", err);
    return NextResponse.json({ error: err?.message || "Chyba pri rozpoznávaní fotky." }, { status: 500 });
  }
}
