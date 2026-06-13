import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    return NextResponse.json(
      { error: "Server nemá nastavený SESSION_SECRET (min. 16 znakov)." },
      { status: 500 }
    );
  }
  if (!username || !password) {
    return NextResponse.json({ error: "Zadaj meno a heslo." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username: String(username).trim().toLowerCase() } });
  // Rovnaká hláška pri zlom mene aj hesle (neprezrádzame existenciu účtu).
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
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
}
