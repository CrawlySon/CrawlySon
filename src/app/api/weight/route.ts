import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import { apiError, unauthorized } from "@/lib/errors";
import { dateOr, isoDateSchema, numberish, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

// Po zápise zosynchronizuje hmotnosť v profile (kvôli výpočtu TDEE), ale iba ak
// ide o najnovší záznam – doplnenie staršieho dňa nemá prepísať aktuálnu váhu.
async function syncProfileWeight(userId: string) {
  const newest = await prisma.weightLog.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { kg: true },
  });
  if (newest) await prisma.user.update({ where: { id: userId }, data: { weightKg: newest.kg } });
}

// GET /api/weight?date=YYYY-MM-DD -> hmotnosť daného dňa + posledný skorší záznam
export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());

    const [log, previous] = await Promise.all([
      prisma.weightLog.findUnique({ where: { userId_date: { userId, date } }, select: { kg: true } }),
      prisma.weightLog.findFirst({
        where: { userId, date: { lt: date } },
        orderBy: { date: "desc" },
        select: { kg: true, date: true },
      }),
    ]);

    return NextResponse.json({ kg: log?.kg ?? null, previous: previous ?? null });
  } catch (e) {
    return apiError(e, "weight GET");
  }
}

const postSchema = z.object({
  date: isoDateSchema.optional(),
  kg: numberish({ min: 20, max: 400 }),
});

// POST /api/weight { date?, kg } -> nastaví/prepíše hmotnosť dňa (upsert)
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await parseBody(req, postSchema);
    if (b.kg == null) return NextResponse.json({ error: "Hmotnosť musí byť medzi 20 a 400 kg." }, { status: 400 });
    const kg = Math.round(b.kg * 10) / 10;
    const date = b.date ?? skToday();

    await prisma.weightLog.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, kg },
      update: { kg },
    });
    await syncProfileWeight(userId);
    return NextResponse.json({ kg });
  } catch (e) {
    return apiError(e, "weight POST");
  }
}

// DELETE /api/weight?date=YYYY-MM-DD -> zmaže záznam daného dňa
export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());
    await prisma.weightLog.deleteMany({ where: { userId, date } });
    await syncProfileWeight(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "weight DELETE");
  }
}
