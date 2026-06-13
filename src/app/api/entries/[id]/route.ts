import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, any> = {};
  for (const k of ["name", "mealType", "note", "category", "subcategory"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  for (const k of ["calories", "protein", "carbs", "fat", "fiber", "quantityGrams", "healthIndex"]) {
    if (body[k] !== undefined) data[k] = body[k] === null ? null : Number(body[k]);
  }

  // Upraví iba ak záznam patrí používateľovi.
  const result = await prisma.entry.updateMany({ where: { id: params.id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené" }, { status: 404 });
  const entry = await prisma.entry.findUnique({ where: { id: params.id } });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const result = await prisma.entry.deleteMany({ where: { id: params.id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
