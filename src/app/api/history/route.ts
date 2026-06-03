import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/history?days=14  -> denné súčty za posledných N dní
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "14", 10)));

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceISO = since.toISOString().slice(0, 10);

  const entries = await prisma.entry.findMany({
    where: { date: { gte: sinceISO } },
    select: { date: true, calories: true, protein: true, carbs: true, fat: true },
  });

  const byDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number; count: number }>();
  for (const e of entries) {
    const cur = byDate.get(e.date) || { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
    cur.calories += e.calories;
    cur.protein += e.protein;
    cur.carbs += e.carbs;
    cur.fat += e.fat;
    cur.count += 1;
    byDate.set(e.date, cur);
  }

  const result = Array.from(byDate.entries())
    .map(([date, t]) => ({ date, ...t }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ days: result });
}
