import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/version -> verejné: ktorý commit práve beží. Slúži na overenie
// nasadenia po pushi (smoke test) – Vercel do buildu dáva VERCEL_GIT_COMMIT_SHA.
export async function GET() {
  return NextResponse.json({
    app: "rypak",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    time: new Date().toISOString(),
  });
}
