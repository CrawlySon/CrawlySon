import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { sendToSubs } from "@/lib/push";

export const runtime = "nodejs";

// POST /api/push/test -> pošle testovaciu notifikáciu na zariadenia používateľa
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return NextResponse.json({ error: "Žiadne zariadenie nie je prihlásené k odberu." }, { status: 400 });

  try {
    const sent = await sendToSubs(subs, {
      title: "💧 NutriAI – test",
      body: "Notifikácie fungujú! Takto ti pripomenieme pitný režim.",
      url: "/",
    });
    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Nepodarilo sa odoslať." }, { status: 500 });
  }
}
