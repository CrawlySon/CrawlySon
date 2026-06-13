import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// DELETE /api/favorites/[id] -> zmaže obľúbené používateľa
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  await prisma.favorite.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
