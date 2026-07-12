import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

function normAmount(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function normUnit(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, 24) : null;
}

// PATCH /api/supplements/:id -> úprava položky katalógu (názov, dávka, jednotka, poradie)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const data: Record<string, any> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 80);
  if ("amount" in b) data.amount = normAmount(b.amount);
  if ("unit" in b) data.unit = normUnit(b.unit);
  if ("sort" in b && Number.isFinite(Number(b.sort))) data.sort = Math.round(Number(b.sort));

  const result = await prisma.supplement.updateMany({ where: { id: params.id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené" }, { status: 404 });

  const supplement = await prisma.supplement.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, kind: true, amount: true, unit: true, sort: true },
  });
  return NextResponse.json({ supplement });
}

// DELETE /api/supplements/:id -> zmaže položku z katalógu (denné záznamy ostávajú
// zachované, len sa im odpojí supplementId vďaka onDelete: SetNull).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const result = await prisma.supplement.deleteMany({ where: { id: params.id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
