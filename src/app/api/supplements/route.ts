import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

const KINDS = ["supplement", "medication"] as const;
function normKind(v: any): "supplement" | "medication" {
  return v === "medication" ? "medication" : "supplement";
}
function normAmount(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function normUnit(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, 24) : null;
}

// GET /api/supplements?date=YYYY-MM-DD -> katalóg + záznamy užitia pre daný deň
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISO();

  const [supplements, logs] = await Promise.all([
    prisma.supplement.findMany({
      where: { userId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, kind: true, amount: true, unit: true, sort: true },
    }),
    prisma.supplementLog.findMany({
      where: { userId, date },
      orderBy: { createdAt: "asc" },
      select: { id: true, supplementId: true, date: true, name: true, kind: true, amount: true, unit: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ supplements, logs });
}

// POST /api/supplements { name, kind, amount, unit } -> pridá položku do katalógu
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Zadaj názov." }, { status: 400 });

  // nové položky daného druhu radíme na koniec
  const count = await prisma.supplement.count({ where: { userId, kind: normKind(b.kind) } });

  const supplement = await prisma.supplement.create({
    data: {
      userId,
      name: name.slice(0, 80),
      kind: normKind(b.kind),
      amount: normAmount(b.amount),
      unit: normUnit(b.unit),
      sort: count,
    },
    select: { id: true, name: true, kind: true, amount: true, unit: true, sort: true },
  });

  return NextResponse.json({ supplement });
}
