import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/push/vapid -> verejný VAPID kľúč pre klienta
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY || null });
}
