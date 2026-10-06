import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Chyba, ktorej text je určený používateľovi (po slovensky, bez technických
// detailov). Všetko ostatné (Prisma, OpenAI HTTP telá, výnimky) ide len do logu
// a klient dostane všeobecnú hlášku – repo je verejné a chybové texty
// prezrádzali vnútro (odpovede OpenAI do 300 znakov, texty Prismy).
export class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

export const GENERIC_ERROR = "Niečo sa pokazilo. Skús to prosím znova.";

// Jednotná odpoveď na chybu v route handleri.
export function apiError(err: unknown, context = "api"): NextResponse {
  if (err instanceof UserFacingError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return NextResponse.json({ error: `Neplatné údaje${where}.` }, { status: 400 });
  }
  console.error(`[${context}]`, err instanceof Error ? err.stack || err.message : err);
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
}

export const unauthorized = () => NextResponse.json({ error: "Neprihlásený" }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "Nemáš na to oprávnenie." }, { status: 403 });
export const notFound = (what = "Záznam") => NextResponse.json({ error: `${what} sa nenašiel.` }, { status: 404 });
