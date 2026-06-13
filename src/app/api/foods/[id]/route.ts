import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const data: Record<string, any> = {};
  if (b.name !== undefined) data.name = String(b.name);
  if (b.category !== undefined) data.category = b.category || null;
  if (b.subcategory !== undefined) data.subcategory = b.subcategory || null;
  if (b.brand !== undefined) data.brand = b.brand || null;
  for (const k of ["baseGrams", "calories", "protein", "carbs", "fat", "fiber", "healthIndex"]) {
    if (b[k] !== undefined) data[k] = b[k] === null || b[k] === "" ? null : Number(b[k]);
  }

  // Upraviť možno len vlastné (súkromné) potraviny, nie zdieľané.
  const result = await prisma.food.updateMany({ where: { id: params.id, userId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené alebo nie je tvoje" }, { status: 404 });
  const food = await prisma.food.findUnique({ where: { id: params.id } });
  return NextResponse.json({ food });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const result = await prisma.food.deleteMany({ where: { id: params.id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené alebo nie je tvoje" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
