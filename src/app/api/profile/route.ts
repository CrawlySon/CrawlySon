import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { apiError, unauthorized } from "@/lib/errors";
import { nullableNumberish, numberish, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const PROFILE_SELECT = {
  id: true,
  name: true,
  sex: true,
  age: true,
  heightCm: true,
  weightKg: true,
  activity: true,
  goalType: true,
  goalCalories: true,
  goalProtein: true,
  goalCarbs: true,
  goalFat: true,
  goalWaterMl: true,
  waterRemind: true,
  waterReminders: true,
  coachRemind: true,
  coachRoast: true,
  coachPersona: true,
  coachComments: true,
};

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const profile = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError(e, "profile GET");
  }
}

const nullableEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(values).nullable()).optional();

// Whitelist polí – role, username ani passwordHash sa cez profil zmeniť nedajú.
const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sex: nullableEnum(["male", "female"]),
  activity: nullableEnum(["sedentary", "light", "moderate", "active", "very_active"]),
  goalType: nullableEnum(["lose", "maintain", "gain"]),
  age: nullableNumberish({ min: 10, max: 120 }).transform((n) => (n == null ? null : Math.round(n))).optional(),
  heightCm: nullableNumberish({ min: 100, max: 250 }).optional(),
  weightKg: nullableNumberish({ min: 20, max: 400 }).optional(),
  goalCalories: numberish({ min: 0, max: 20000 }).transform((n) => (n == null ? undefined : Math.round(n))),
  goalProtein: numberish({ min: 0, max: 2000 }).transform((n) => (n == null ? undefined : Math.round(n))),
  goalCarbs: numberish({ min: 0, max: 3000 }).transform((n) => (n == null ? undefined : Math.round(n))),
  goalFat: numberish({ min: 0, max: 1000 }).transform((n) => (n == null ? undefined : Math.round(n))),
  goalWaterMl: numberish({ min: 0, max: 20000 }).transform((n) => (n == null ? undefined : Math.round(n))),
  waterRemind: z.boolean().optional(),
  coachRemind: z.boolean().optional(),
  coachRoast: z.boolean().optional(),
  coachPersona: z.enum(["nice", "normal", "roast"]).optional(),
  coachComments: z.boolean().optional(),
  waterReminders: z
    .array(
      z.object({
        hour: numberish({ min: 0, max: 23 }).transform((n) => Math.round(n ?? 0)),
        minMl: numberish({ min: 0, max: 20000 }).transform((n) => Math.round(n ?? 0)),
      })
    )
    .max(6)
    .nullable()
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await parseBody(req, patchSchema);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (v !== undefined) data[k] = v;

    if (b.coachPersona !== undefined) {
      data.coachRoast = b.coachPersona === "roast"; // drž staré pole v súlade
    }
    if (b.waterReminders === null) data.waterReminders = null;

    if (!Object.keys(data).length) return NextResponse.json({ error: "Nič na úpravu." }, { status: 400 });

    const profile = await prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError(e, "profile PATCH");
  }
}
