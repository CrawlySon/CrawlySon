import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Verejné cesty (prihlásenie, registrácia, statika)
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/manifest.webmanifest",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token);

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
