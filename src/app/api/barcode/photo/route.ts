import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server-auth";
import { parseNutritionLabel } from "@/lib/ai";
import { checkAiQuota, checkImageInput, logAiUsage } from "@/lib/ai-quota";
import { apiError, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/barcode/photo { imageBase64, mimeType } -> AI prečíta tabuľku
// nutričných hodnôt z fotky a vráti hodnoty na 100 g (bez uloženia – názov
// doplní používateľ a uloží sa cez /api/foods).
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await req.json().catch(() => ({}));
    const { imageBase64, mimeType } = checkImageInput(b.imageBase64, b.mimeType);
    await checkAiQuota(userId, "barcode-photo");

    const { food, usage } = await parseNutritionLabel(imageBase64, mimeType);
    await logAiUsage(userId, "barcode-photo", usage);

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
  } catch (err) {
    return apiError(err, "barcode/photo");
  }
}
