import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import { apiError, unauthorized } from "@/lib/errors";
import { dateOr, finite, isoDateSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

// GET /api/water?date=YYYY-MM-DD -> záznamy + súčet + cieľ
export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = dateOr(searchParams.get("date"), skToday());

    const [logs, user] = await Promise.all([
      prisma.waterLog.findMany({ where: { userId, date }, orderBy: { createdAt: "asc" } }),
      prisma.user.findUnique({ where: { id: userId }, select: { goalWaterMl: true } }),
    ]);
    const total = logs.reduce((s, l) => s + l.ml, 0);
    return NextResponse.json({ logs, total, goal: user?.goalWaterMl ?? 2500 });
  } catch (e) {
    return apiError(e, "water GET");
  }
}

const postSchema = z.object({
  date: isoDateSchema.optional(),
  // ml môže byť aj záporné (korekcia), ale nie nula a nie nezmysel.
  ml: finite({ min: -10000, max: 10000 }).transform((n) => Math.round(n)),
});

// POST /api/water { date?, ml } -> pridá záznam
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await parseBody(req, postSchema);
    if (b.ml === 0) return NextResponse.json({ error: "Neplatné množstvo." }, { status: 400 });
    const date = b.date ?? skToday();

    const log = await prisma.waterLog.create({ data: { userId, date, ml: b.ml } });
    return NextResponse.json({ log });
  } catch (e) {
    return apiError(e, "water POST");
  }
}
