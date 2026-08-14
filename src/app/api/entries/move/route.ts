import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/entries/move { from, to, mode: "move" | "copy" }
// Presunie (alebo skopíruje) VŠETKY zapísané jedlá jedného dňa na iný dátum.
// Dotýka sa výhradne tabuľky Entry daného používateľa – voda, spánok ani
// suplementy nie sú nijako ovplyvnené. Cieľový deň sa nepremazáva, záznamy
// sa k jeho prípadnému obsahu pridajú.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const from = String(b.from || "").trim();
  const to = String(b.to || "").trim();
  const mode = b.mode === "copy" ? "copy" : "move";

  if (!DATE_RX.test(from) || !DATE_RX.test(to)) {
    return NextResponse.json({ error: "Neplatný dátum." }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: "Zdrojový a cieľový deň sú rovnaké." }, { status: 400 });
  }

  const entries = await prisma.entry.findMany({ where: { userId, date: from } });
  if (entries.length === 0) {
    return NextResponse.json({ error: "V zdrojovom dni nie sú žiadne jedlá." }, { status: 400 });
  }

  if (mode === "move") {
    const res = await prisma.entry.updateMany({ where: { userId, date: from }, data: { date: to } });
    return NextResponse.json({ moved: res.count, mode });
  }

  await prisma.entry.createMany({
    data: entries.map((e) => ({
      userId,
      date: to,
      mealType: e.mealType,
      name: e.name,
      quantityGrams: e.quantityGrams,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fiber: e.fiber,
      category: e.category,
      subcategory: e.subcategory,
      healthIndex: e.healthIndex,
      note: e.note,
      source: e.source,
    })),
  });
  return NextResponse.json({ moved: entries.length, mode });
}
