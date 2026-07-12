import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

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

// POST /api/supplements/log { date?, supplementId?, name, kind, amount, unit }
// -> zaznamená užitie suplementu/lieku pre daný deň. Ak je uvedený supplementId,
// overí, že patrí prihlásenému používateľovi a doplní snapshot z katalógu.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const date: string = b.date || todayISO();

  let name = String(b.name ?? "").trim();
  let kind = normKind(b.kind);
  let amount = normAmount(b.amount);
  let unit = normUnit(b.unit);
  let supplementId: string | null = null;

  if (b.supplementId) {
    const sup = await prisma.supplement.findFirst({
      where: { id: String(b.supplementId), userId },
      select: { id: true, name: true, kind: true, amount: true, unit: true },
    });
    if (!sup) return NextResponse.json({ error: "Suplement nenájdený." }, { status: 404 });
    supplementId = sup.id;
    if (!name) name = sup.name;
    kind = sup.kind === "medication" ? "medication" : "supplement";
    if (amount == null) amount = sup.amount ?? null;
    if (unit == null) unit = sup.unit ?? null;
  }

  if (!name) return NextResponse.json({ error: "Zadaj názov." }, { status: 400 });

  const log = await prisma.supplementLog.create({
    data: { userId, date, supplementId, name: name.slice(0, 80), kind, amount, unit },
    select: { id: true, supplementId: true, date: true, name: true, kind: true, amount: true, unit: true, createdAt: true },
  });

  return NextResponse.json({ log });
}
