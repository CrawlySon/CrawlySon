import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { apiError, unauthorized } from "@/lib/errors";
import { foodItemSchema, mealTypeSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

// GET /api/favorites -> obľúbené používateľa (najčastejšie najprv)
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ favorites });
  } catch (e) {
    return apiError(e, "favorites GET");
  }
}

const postSchema = z.object({
  name: z.string().trim().min(1, "Chýba názov.").max(120),
  mealType: mealTypeSchema.optional().catch(undefined),
  items: z.array(foodItemSchema).min(1, "Žiadne položky.").max(40),
});

// POST /api/favorites { name, mealType?, items: [...] } -> vytvorí obľúbené
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await parseBody(req, postSchema);
    const favorite = await prisma.favorite.create({
      data: { userId, name: body.name, mealType: body.mealType ?? "other", items: body.items },
    });
    return NextResponse.json({ favorite });
  } catch (e) {
    return apiError(e, "favorites POST");
  }
}
