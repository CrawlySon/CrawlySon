import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Vráti dni, v ktorých má používateľ aspoň jeden záznam jedla alebo vody.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") || "").slice(0, 10);
  const to = (searchParams.get("to") || "").slice(0, 10);
  if (!from || !to) return NextResponse.json({ error: "Chýba rozsah." }, { status: 400 });

  const [entries, water] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true },
      distinct: ["date"],
    }),
    prisma.waterLog.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true },
      distinct: ["date"],
    }),
  ]);

  const dates = Array.from(new Set([...entries.map((e) => e.date), ...water.map((w) => w.date)]));
  return NextResponse.json({ dates });
}
