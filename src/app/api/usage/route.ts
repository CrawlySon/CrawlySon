import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/usage -> súhrn spotreby AI tokenov používateľa
// Súčty aj denné zoskupenie počíta priamo databáza (cez index [userId, date]),
// takže výber ostáva rýchly aj pri tisíckach záznamov.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const [agg, byDay, recentRows] = await Promise.all([
    // Celkové súčty – jeden dotaz, žiadne sčítavanie v JS
    prisma.aiUsage.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { totalTokens: true, promptTokens: true, outputTokens: true },
    }),
    // Spotreba po dňoch – zoskupí databáza
    prisma.aiUsage.groupBy({
      by: ["date"],
      where: { userId },
      _sum: { totalTokens: true },
      _count: { _all: true },
    }),
    // Posledných 10 volaní (pre prehľad)
    prisma.aiUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, model: true, totalTokens: true },
    }),
  ]);

  const calls = agg._count._all;
  const totalTokens = agg._sum.totalTokens ?? 0;
  const promptTokens = agg._sum.promptTokens ?? 0;
  const outputTokens = agg._sum.outputTokens ?? 0;

  // posledných 30 dní (najnovšie hore)
  const days = byDay
    .map((d) => ({ date: d.date, tokens: d._sum.totalTokens ?? 0, calls: d._count._all }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  const recent = recentRows.map((r) => ({
    createdAt: r.createdAt,
    model: r.model,
    totalTokens: r.totalTokens,
  }));

  return NextResponse.json({ calls, totalTokens, promptTokens, outputTokens, days, recent });
}
