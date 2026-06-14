import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// POST /api/push/subscribe { subscription } -> uloží/aktualizuje odber
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Neplatný odber." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  });

  // Pri prvom prihlásení k odberu zapni pripomienky (ak ešte neboli nastavené)
  await prisma.user.update({ where: { id: userId }, data: { waterRemind: true } });

  return NextResponse.json({ ok: true });
}
