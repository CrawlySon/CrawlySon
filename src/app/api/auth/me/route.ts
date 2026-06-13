import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });
  return NextResponse.json({ user });
}
