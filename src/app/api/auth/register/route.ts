import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const code = String(body.code || "");

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    return NextResponse.json({ error: "Server nemá nastavený SESSION_SECRET." }, { status: 500 });
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Meno: 3–30 znakov, malé písmená/čísla/._-" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Heslo musí mať aspoň 8 znakov." }, { status: 400 });
  }

  const userCount = await prisma.user.count();
  const isFirst = userCount === 0;
  const expectedCode = process.env.REGISTRATION_CODE;

  // Prvý účet (bootstrap admin): povolený, ak REGISTRATION_CODE nie je nastavený,
  // inak musí kód sedieť. Ďalšie účty vždy vyžadujú správny registračný kód.
  if (isFirst) {
    if (expectedCode && code !== expectedCode) {
      return NextResponse.json({ error: "Nesprávny registračný kód." }, { status: 403 });
    }
  } else {
    if (!expectedCode) {
      return NextResponse.json({ error: "Registrácia je zakázaná." }, { status: 403 });
    }
    if (code !== expectedCode) {
      return NextResponse.json({ error: "Nesprávny registračný kód." }, { status: 403 });
    }
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: "Toto meno už existuje." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      role: isFirst ? "admin" : "user",
      name: username,
    },
  });

  // Prvý používateľ „adoptuje" existujúce dáta z jednopoužívateľskej éry.
  if (isFirst) {
    await prisma.entry.updateMany({ where: { userId: null }, data: { userId: user.id } });
    // Súkromné potraviny (auto/manual) priradíme adminovi; seed/openfoodfacts ostávajú zdieľané.
    await prisma.food.updateMany({
      where: { userId: null, source: { in: ["auto", "manual"] } },
      data: { userId: user.id },
    });
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
