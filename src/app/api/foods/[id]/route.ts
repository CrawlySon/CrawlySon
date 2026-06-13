import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  const data: Record<string, any> = {};
  if (b.name !== undefined) data.name = String(b.name);
  if (b.category !== undefined) data.category = b.category || null;
  if (b.brand !== undefined) data.brand = b.brand || null;
  for (const k of ["baseGrams", "calories", "protein", "carbs", "fat", "fiber"]) {
    if (b[k] !== undefined) data[k] = b[k] === null || b[k] === "" ? null : Number(b[k]);
  }
  const food = await prisma.food.update({ where: { id: params.id }, data });
  return NextResponse.json({ food });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.food.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
