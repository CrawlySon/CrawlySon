import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMealPhoto, type ReferenceFood } from "@/lib/ai";
import { getUserId } from "@/lib/server-auth";
import { checkAiQuota, checkImageInput, logAiUsage } from "@/lib/ai-quota";
import { apiError, unauthorized } from "@/lib/errors";

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
    if (!userId) return unauthorized();

    const b = await req.json().catch(() => ({}));
    const { imageBase64, mimeType } = checkImageInput(b.imageBase64, b.mimeType);
    await checkAiQuota(userId, "parse-photo");

    // Z fotky nemáme text, podľa ktorého by sa dala vyberať referencia, tak
    // pošleme naposledy použité VLASTNÉ potraviny – model sa nimi vie kalibrovať
    // (napr. trafiť „tvoju" kávu namiesto všeobecnej). Zdieľané sem zámerne
    // nejdú: ich najnovšie riadky by do promptu každého používateľa dostali
    // čokoľvek, čo práve niekto naskenoval.
    const reference = (await prisma.food.findMany({
      where: { userId },
      select: SELECT,
      take: 15,
      orderBy: { createdAt: "desc" },
    })) as ReferenceFood[];

    const t0 = Date.now();
    const { items, mealType, waterMl, usage } = await parseMealPhoto(imageBase64, mimeType, reference);
    console.log(`[parse/photo] ai=${Date.now() - t0}ms items=${items.length} model=${usage.model}`);
    await logAiUsage(userId, "parse-photo", usage);

    return NextResponse.json({ items, mealType, waterMl, usage });
  } catch (err) {
    return apiError(err, "parse/photo");
  }
}
