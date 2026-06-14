import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// POST /api/push/unsubscribe { endpoint } -> zmaže odber tohto zariadenia
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = body.endpoint;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  // Ak používateľovi nezostal žiadny odber, vypni pripomienky
  const remaining = await prisma.pushSubscription.count({ where: { userId } });
  if (remaining === 0) {
    await prisma.user.update({ where: { id: userId }, data: { waterRemind: false } });
  }

  return NextResponse.json({ ok: true });
}
