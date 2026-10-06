import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { apiError, notFound, unauthorized } from "@/lib/errors";
import { mealTypeSchema, nullableNumberish, numberish, optionalText, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  mealType: mealTypeSchema.optional(),
  note: optionalText(500).optional(),
  category: optionalText(80).optional(),
  subcategory: optionalText(80).optional(),
  calories: numberish({ min: 0, max: 20000 }),
  protein: numberish({ min: 0, max: 2000 }),
  carbs: numberish({ min: 0, max: 2000 }),
  fat: numberish({ min: 0, max: 2000 }),
  fiber: nullableNumberish({ min: 0, max: 500 }).optional(),
  quantityGrams: nullableNumberish({ min: 0, max: 20000 }).optional(),
  healthIndex: nullableNumberish({ min: 0, max: 10 }).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await parseBody(req, patchSchema);
    const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nič na úpravu." }, { status: 400 });

    // Upraví iba ak záznam patrí používateľovi.
    const result = await prisma.entry.updateMany({ where: { id: params.id, userId }, data });
    if (result.count === 0) return notFound();
    const entry = await prisma.entry.findUnique({ where: { id: params.id } });
    return NextResponse.json({ entry });
  } catch (e) {
    return apiError(e, "entries PATCH");
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const result = await prisma.entry.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) return notFound();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "entries DELETE");
  }
}
