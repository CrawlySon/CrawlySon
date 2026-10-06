import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { sendToSubs } from "@/lib/push";
import { apiError, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";

// POST /api/push/test -> pošle testovaciu notifikáciu na zariadenia používateľa
export async function POST() {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return NextResponse.json({ error: "Žiadne zariadenie nie je prihlásené k odberu." }, { status: 400 });

    const sent = await sendToSubs(subs, {
      title: "🐷 Rypák – test",
      body: "Notifikácie fungujú. Rypák ťa už nájde.",
      url: "/",
      tag: "test",
    });
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return apiError(e, "push/test");
  }
}
