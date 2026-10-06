import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/auth";
import { verifyDummy, verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Limity pokusov: na IP aj na kombináciu IP + meno (hádanie hesla jedného účtu).
const IP_LIMIT = { limit: 30, windowMs: 15 * 60_000 };
const USER_LIMIT = { limit: 6, windowMs: 15 * 60_000 };

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json().catch(() => ({}));

    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
      return NextResponse.json({ error: "Server nemá nastavený SESSION_SECRET (min. 16 znakov)." }, { status: 500 });
    }
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Zadaj meno a heslo." }, { status: 400 });
    }

    const name = username.trim().toLowerCase().slice(0, 60);
    const ip = clientIp(req);
    const ipGate = rateLimit(`login:${ip}`, IP_LIMIT.limit, IP_LIMIT.windowMs);
    const userGate = rateLimit(`login:${ip}:${name}`, USER_LIMIT.limit, USER_LIMIT.windowMs);
    if (!ipGate.ok || !userGate.ok) {
      const retry = Math.max(ipGate.retryAfterSec, userGate.retryAfterSec);
      return NextResponse.json(
        { error: `Priveľa pokusov. Skús to o ${Math.ceil(retry / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(retry) } }
      );
    }

    const user = await prisma.user.findUnique({ where: { username: name } });
    // Rovnaká hláška aj rovnaký čas pri zlom mene aj hesle (neprezrádzame existenciu účtu).
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyDummy(password), false);
    if (!ok || !user) {
      return NextResponse.json({ error: "Nesprávne meno alebo heslo." }, { status: 401 });
    }

    const token = await createSessionToken(user.id);
    const res = NextResponse.json({ ok: true, username: user.username });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e) {
    return apiError(e, "auth/login");
  }
}
