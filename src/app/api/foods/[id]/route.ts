import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { z } from "zod";
import { apiError, unauthorized } from "@/lib/errors";
import { nullableNumberish, numberish, optionalText, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: optionalText(80).optional(),
  subcategory: optionalText(80).optional(),
  brand: optionalText(80).optional(),
  baseGrams: numberish({ min: 1, max: 20000 }),
  calories: numberish({ min: 0, max: 20000 }),
  protein: numberish({ min: 0, max: 2000 }),
  carbs: numberish({ min: 0, max: 2000 }),
  fat: numberish({ min: 0, max: 2000 }),
  fiber: nullableNumberish({ min: 0, max: 500 }).optional(),
  healthIndex: nullableNumberish({ min: 0, max: 10 }).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await parseBody(req, patchSchema);
    const data = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nič na úpravu." }, { status: 400 });

    // Upraviť možno len vlastné (súkromné) potraviny, nie zdieľané.
    const result = await prisma.food.updateMany({ where: { id: params.id, userId }, data });
    if (result.count === 0) return NextResponse.json({ error: "Nenájdené alebo nie je tvoje" }, { status: 404 });
    const food = await prisma.food.findUnique({ where: { id: params.id } });
    return NextResponse.json({ food });
  } catch (e) {
    return apiError(e, "foods PATCH");
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const result = await prisma.food.deleteMany({ where: { id: params.id, userId } });
  if (result.count === 0) return NextResponse.json({ error: "Nenájdené alebo nie je tvoje" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
