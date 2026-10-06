import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { apiError, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";

// Server neskôr na endpoint POST-uje (web-push). Bez kontroly by sa dal podstrčiť
// ľubovoľný server vrátane interných adries (SSRF). Push služby prehliadačov
// sú vždy https a nikdy nie lokálne/privátne adresy.
function isSafePushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(h) || h.includes(":")) return false; // IP adresy nie
  return true;
}

// POST /api/push/subscribe { subscription } -> uloží odber zariadenia
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!isSafePushEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 300 || auth.length > 100) {
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
  } catch (e) {
    return apiError(e, "push/subscribe");
  }
}
