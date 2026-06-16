import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

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
};

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  const data: Record<string, any> = {};

  if (b.name !== undefined) data.name = String(b.name);
  if (b.sex !== undefined) data.sex = b.sex || null;
  if (b.activity !== undefined) data.activity = b.activity || null;
  if (b.goalType !== undefined) data.goalType = b.goalType || null;

  if (b.age !== undefined) data.age = b.age === null || b.age === "" ? null : parseInt(b.age, 10);
  for (const k of ["heightCm", "weightKg"]) {
    if (b[k] !== undefined) data[k] = b[k] === null || b[k] === "" ? null : Number(b[k]);
  }
  for (const k of ["goalCalories", "goalProtein", "goalCarbs", "goalFat", "goalWaterMl"]) {
    if (b[k] !== undefined) data[k] = Math.max(0, parseInt(b[k], 10) || 0);
  }

  if (b.waterRemind !== undefined) data.waterRemind = !!b.waterRemind;
  if (b.coachRemind !== undefined) data.coachRemind = !!b.coachRemind;
  if (b.waterReminders !== undefined) {
    data.waterReminders = Array.isArray(b.waterReminders)
      ? b.waterReminders
          .map((r: any) => ({
            hour: Math.min(23, Math.max(0, parseInt(r.hour, 10) || 0)),
            minMl: Math.max(0, parseInt(r.minMl, 10) || 0),
          }))
          .slice(0, 6)
      : null;
  }

  const profile = await prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });
  return NextResponse.json({ profile });
}
