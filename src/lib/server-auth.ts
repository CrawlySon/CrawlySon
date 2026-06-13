import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Vráti userId z platného sedenia, alebo null (pre route handlery, Node runtime).
export async function getUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

// Pomôcka: vráti userId alebo vyhodí 401 odpoveď.
export async function requireUserId(): Promise<{ userId: string } | { res: NextResponse }> {
  const userId = await getUserId();
  if (!userId) return { res: NextResponse.json({ error: "Neprihlásený" }, { status: 401 }) };
  return { userId };
}
