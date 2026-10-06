import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { lookupProductByWeb } from "@/lib/ai";
import { checkAiQuota, logAiUsage } from "@/lib/ai-quota";
import { apiError, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const CODE_RX = /^\d{6,14}$/;

// POST /api/barcode/ai { name?, code? } -> dohľadá produkt z vedomostí modelu
// a uloží ho ako SÚKROMNÚ potravinu používateľa. Predtým sa ukladal ako
// zdieľaný – ktokoľvek tak vedel podstrčiť názov všetkým ostatným (aj do ich
// AI promptov cez referenčný blok). Zdieľané ostávajú len seed a Open Food Facts.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await req.json().catch(() => ({}));
    const name = String(b.name || "").trim().slice(0, 120);
    const codeRaw = b.code ? String(b.code).trim() : "";
    const code = CODE_RX.test(codeRaw) ? codeRaw : null;
    if (!name && !code) return NextResponse.json({ error: "Zadaj kód alebo názov produktu." }, { status: 400 });

    // Ak už používateľ tento kód má, netreba platiť za AI.
    if (code) {
      const own = await prisma.food.findFirst({ where: { userId, barcode: code } });
      if (own) return NextResponse.json({ found: true, food: own, cached: true });
    }

    await checkAiQuota(userId, "barcode-web");

    // Postav dopyt: primárne podľa EAN kódu, názov je voliteľné upresnenie
    const query = name && code ? `${name}, čiarový kód EAN ${code}` : code ? `produkt s čiarovým kódom (EAN/GTIN) ${code}` : name;
    const { food, usage } = await lookupProductByWeb(query);
    await logAiUsage(userId, "barcode-web", usage);

    if (!food) return NextResponse.json({ found: false });

    const created = await prisma.food.create({
      data: {
        userId,
        barcode: code,
        name: food.name.slice(0, 120),
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
  } catch (err) {
    return apiError(err, "barcode/ai");
  }
}
