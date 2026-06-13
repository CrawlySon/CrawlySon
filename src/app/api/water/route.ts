import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/water?date=YYYY-MM-DD -> záznamy + súčet + cieľ
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();

  const [logs, user] = await Promise.all([
    prisma.waterLog.findMany({ where: { userId, date }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { goalWaterMl: true } }),
  ]);
  const total = logs.reduce((s, l) => s + l.ml, 0);
  return NextResponse.json({ logs, total, goal: user?.goalWaterMl ?? 2500 });
}

// POST /api/water { date?, ml } -> pridá záznam (ml môže byť aj záporné na korekciu)
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const ml = Math.round(Number(b.ml));
  if (!Number.isFinite(ml) || ml === 0) return NextResponse.json({ error: "Neplatné množstvo." }, { status: 400 });
  const date: string = b.date || todayISO();

  const log = await prisma.waterLog.create({ data: { userId, date, ml } });
  return NextResponse.json({ log });
}
