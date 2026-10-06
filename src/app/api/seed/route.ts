import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDatabase } from "@/lib/foodSeed";
import { getAdminId } from "@/lib/server-auth";
import { apiError, forbidden } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/seed -> naplní základné potraviny (idempotentne). Zapisuje do
// ZDIEĽANEJ databázy, preto len admin – predtým to mohol spustiť ktokoľvek.
export async function POST() {
  const adminId = await getAdminId();
  if (!adminId) return forbidden();
  try {
    const result = await seedDatabase(prisma);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, "seed");
  }
}
