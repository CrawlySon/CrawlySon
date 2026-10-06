import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Sedenie je bezstavová podpísaná cookie (60 dní). Podpis sám o sebe nepovie,
// či používateľ ešte existuje – zmazaný účet by mal platnú cookie ďalších
// 60 dní a jeho zápisy by padali na cudzích kľúčoch. Preto si existenciu
// overíme v DB, ale s krátkou pamäťou na inštanciu, nech to nestojí dotaz
// pri každom volaní.
const KNOWN_TTL_MS = 60_000;
const known = new Map<string, number>();

async function userExists(userId: string): Promise<boolean> {
  const until = known.get(userId);
  if (until && until > Date.now()) return true;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) {
    known.delete(userId);
    return false;
  }
  if (known.size > 5000) known.clear();
  known.set(userId, Date.now() + KNOWN_TTL_MS);
  return true;
}

// Vráti userId z platného sedenia, alebo null (pre route handlery, Node runtime).
export async function getUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  return (await userExists(userId)) ? userId : null;
}

// Vráti userId, len ak je používateľ admin.
export async function getAdminId(): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === "admin" ? userId : null;
}

// Pomôcka: vráti userId alebo vyhodí 401 odpoveď.
export async function requireUserId(): Promise<{ userId: string } | { res: NextResponse }> {
  const userId = await getUserId();
  if (!userId) return { res: NextResponse.json({ error: "Neprihlásený" }, { status: 401 }) };
  return { userId };
}

// Po zmazaní účtu zahodí jeho záznam z pamäte, nech cookie prestane platiť hneď.
export function forgetUser(userId: string) {
  known.delete(userId);
}
