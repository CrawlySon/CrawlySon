import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";
import { getUserId } from "@/lib/server-auth";

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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();

  const [log, previous] = await Promise.all([
    prisma.weightLog.findUnique({ where: { userId_date: { userId, date } }, select: { kg: true } }),
    prisma.weightLog.findFirst({
      where: { userId, date: { lt: date } },
      orderBy: { date: "desc" },
      select: { kg: true, date: true },
    }),
  ]);

  return NextResponse.json({ kg: log?.kg ?? null, previous: previous ?? null });
}

// POST /api/weight { date?, kg } -> nastaví/prepíše hmotnosť dňa (upsert)
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const date: string = b.date || todayISO();
  const kg = Math.round(Number(b.kg) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
    return NextResponse.json({ error: "Hmotnosť musí byť medzi 20 a 400 kg." }, { status: 400 });
  }

  await prisma.weightLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, kg },
    update: { kg },
  });
  await syncProfileWeight(userId);
  return NextResponse.json({ kg });
}

// DELETE /api/weight?date=YYYY-MM-DD -> zmaže záznam daného dňa
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();
  await prisma.weightLog.deleteMany({ where: { userId, date } });
  await syncProfileWeight(userId);
  return NextResponse.json({ ok: true });
}
