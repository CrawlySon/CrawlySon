import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFood, type ReferenceFood } from "@/lib/ai";
import { getUserId } from "@/lib/server-auth";
import { LIMITS, checkAiQuota, logAiUsage } from "@/lib/ai-quota";
import { apiError, unauthorized, UserFacingError } from "@/lib/errors";

export const runtime = "nodejs";
// 90s: dostatočná rezerva na volanie OpenAI (strop ~30s) aj pri pomalšej odpovedi.
export const maxDuration = 90;

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
  ).slice(0, 40);

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

  // Ak nič nematchne, pošli pár naposledy použitých VLASTNÝCH potravín (kalibrácia).
  if (!matched.length) {
    matched = await prisma.food.findMany({ where: { userId }, select: SELECT, take: 15, orderBy: { createdAt: "desc" } });
  }

  return matched as ReferenceFood[];
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Zadaj popis jedla." }, { status: 400 });
    if (text.length > LIMITS.parseTextChars) {
      throw new UserFacingError(`Text je príliš dlhý (max ${LIMITS.parseTextChars} znakov). Rozdeľ ho na dve časti.`, 413);
    }

    await checkAiQuota(userId, "parse");

    const t0 = Date.now();
    const reference = await pickReference(userId, text);
    const t1 = Date.now();
    const { items, mealType, waterMl, warning, usage } = await parseFood(text, reference);
    const t2 = Date.now();

    const timings = { refMs: t1 - t0, aiMs: t2 - t1, refCount: reference.length };
    console.log(`[parse] ref=${timings.refMs}ms ai=${timings.aiMs}ms refCount=${timings.refCount} model=${usage.model}`);
    await logAiUsage(userId, "parse", usage);

    return NextResponse.json({ items, mealType, waterMl, warning, usage, timings });
  } catch (err) {
    return apiError(err, "parse");
  }
}
