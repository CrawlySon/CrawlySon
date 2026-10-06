import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import { apiError, unauthorized } from "@/lib/errors";
import { dateOr, finite, isoDateSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

// GET /api/sleep?date=YYYY-MM-DD -> hodnotenie spánku daného dňa (alebo null)
export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());

    const log = await prisma.sleepLog.findUnique({
      where: { userId_date: { userId, date } },
      select: { score: true },
    });
    return NextResponse.json({ score: log?.score ?? null });
  } catch (e) {
    return apiError(e, "sleep GET");
  }
}

const postSchema = z.object({
  date: isoDateSchema.optional(),
  score: finite({ min: 0, max: 10 }).transform((n) => Math.round(n)),
});

// POST /api/sleep { date?, score } -> nastaví/prepíše hodnotenie (upsert)
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await parseBody(req, postSchema);
    const date = b.date ?? skToday();

    await prisma.sleepLog.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, score: b.score },
      update: { score: b.score },
    });
    return NextResponse.json({ score: b.score });
  } catch (e) {
    return apiError(e, "sleep POST");
  }
}

// DELETE /api/sleep?date=YYYY-MM-DD -> zmaže hodnotenie daného dňa
export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());
    await prisma.sleepLog.deleteMany({ where: { userId, date } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "sleep DELETE");
  }
}
