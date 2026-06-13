import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/usage -> súhrn spotreby AI tokenov používateľa
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const rows = await prisma.aiUsage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { promptTokens: true, outputTokens: true, totalTokens: true, date: true, model: true, createdAt: true },
  });

  const calls = rows.length;
  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
  const promptTokens = rows.reduce((s, r) => s + r.promptTokens, 0);
  const outputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);

  // posledných 30 dní (zoskupené)
  const byDate = new Map<string, { tokens: number; calls: number }>();
  for (const r of rows) {
    const cur = byDate.get(r.date) || { tokens: 0, calls: 0 };
    cur.tokens += r.totalTokens;
    cur.calls += 1;
    byDate.set(r.date, cur);
  }
  const days = Array.from(byDate.entries())
    .map(([date, t]) => ({ date, ...t }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  const recent = rows.slice(0, 10).map((r) => ({
    createdAt: r.createdAt,
    model: r.model,
    totalTokens: r.totalTokens,
  }));

  return NextResponse.json({ calls, totalTokens, promptTokens, outputTokens, days, recent });
}
