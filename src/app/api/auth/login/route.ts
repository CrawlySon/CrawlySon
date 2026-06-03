import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "Aplikácia nemá nastavené APP_PASSWORD." },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Nesprávne heslo." }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 rok
  });
  return res;
}
