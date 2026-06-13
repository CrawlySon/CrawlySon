import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDatabase } from "@/lib/foodSeed";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/seed -> naplní profil a základné potraviny (idempotentne)
export async function POST() {
  try {
    const result = await seedDatabase(prisma);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("seed error:", err);
    return NextResponse.json({ error: err?.message || "Chyba pri napĺňaní databázy." }, { status: 500 });
  }
}
