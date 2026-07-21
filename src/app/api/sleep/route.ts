import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/sleep?date=YYYY-MM-DD -> hodnotenie spánku daného dňa (alebo null)
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();

  const log = await prisma.sleepLog.findUnique({
    where: { userId_date: { userId, date } },
    select: { score: true },
  });
  return NextResponse.json({ score: log?.score ?? null });
}

// POST /api/sleep { date?, score } -> nastaví/prepíše hodnotenie (upsert)
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const date: string = b.date || todayISO();
  const score = Math.round(Number(b.score));
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "Skóre musí byť 0 až 10." }, { status: 400 });
  }

  await prisma.sleepLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, score },
    update: { score },
  });
  return NextResponse.json({ score });
}

// DELETE /api/sleep?date=YYYY-MM-DD -> zmaže hodnotenie daného dňa
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();
  await prisma.sleepLog.deleteMany({ where: { userId, date } });
  return NextResponse.json({ ok: true });
}
