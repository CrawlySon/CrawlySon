import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, any> = {};
  for (const k of ["name", "mealType", "note"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  for (const k of ["calories", "protein", "carbs", "fat", "fiber", "quantityGrams"]) {
    if (body[k] !== undefined) data[k] = body[k] === null ? null : Number(body[k]);
  }
  const entry = await prisma.entry.update({ where: { id: params.id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.entry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
