import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

async function getOrCreate() {
  let profile = await prisma.profile.findUnique({ where: { id: 1 } });
  if (!profile) profile = await prisma.profile.create({ data: { id: 1 } });
  return profile;
}

export async function GET() {
  const profile = await getOrCreate();
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  await getOrCreate();
  const b = await req.json();
  const data: Record<string, any> = {};

  if (b.name !== undefined) data.name = String(b.name);
  if (b.sex !== undefined) data.sex = b.sex || null;
  if (b.activity !== undefined) data.activity = b.activity || null;
  if (b.goalType !== undefined) data.goalType = b.goalType || null;

  for (const k of ["age"]) {
    if (b[k] !== undefined) data[k] = b[k] === null || b[k] === "" ? null : parseInt(b[k], 10);
  }
  for (const k of ["heightCm", "weightKg"]) {
    if (b[k] !== undefined) data[k] = b[k] === null || b[k] === "" ? null : Number(b[k]);
  }
  for (const k of ["goalCalories", "goalProtein", "goalCarbs", "goalFat"]) {
    if (b[k] !== undefined) data[k] = Math.max(0, parseInt(b[k], 10) || 0);
  }

  const profile = await prisma.profile.update({ where: { id: 1 }, data });
  return NextResponse.json({ profile });
}
