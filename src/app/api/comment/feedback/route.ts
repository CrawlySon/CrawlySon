import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { bumpStats, type CommentStats } from "@/lib/food-comment";
import { distillCommentStyle } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Po koľkých nových hodnoteniach sa prepočíta profil vkusu. Nie po každom –
// jednotlivý palec je šum, vzorec sa ukáže až v dávke.
const DISTILL_EVERY = 5;

// POST /api/comment/feedback { text, kind, persona, rating: 1 | -1 }
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const text = String(b.text || "").trim().slice(0, 300);
  const rating = Number(b.rating) > 0 ? 1 : -1;
  const kind = b.kind ? String(b.kind).slice(0, 40) : null;
  const persona = b.persona ? String(b.persona).slice(0, 20) : null;
  if (!text) return NextResponse.json({ error: "Chýba text." }, { status: 400 });

  await prisma.commentFeedback.create({ data: { userId, text, kind, persona, rating } });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { commentStats: true, commentStyle: true, styleDistilledAt: true },
  });
  if (!user) return NextResponse.json({ ok: true });

  // 1) KEDY sa ozvať – lacné počítadlo, hneď
  const data: Record<string, any> = {};
  if (kind) data.commentStats = bumpStats(user.commentStats as CommentStats | null, kind, rating as 1 | -1);

  // 2) AKO písať – destilácia profilu štýlu z nespracovaných hodnotení
  const pending = await prisma.commentFeedback.findMany({
    where: { userId, ...(user.styleDistilledAt ? { createdAt: { gt: user.styleDistilledAt } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: { text: true, rating: true, kind: true, persona: true },
  });
  if (pending.length >= DISTILL_EVERY) {
    const profile = await distillCommentStyle(user.commentStyle, pending);
    if (profile) {
      data.commentStyle = profile;
      data.styleDistilledAt = new Date();
    }
  }

  if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true, learned: !!data.commentStyle });
}

// GET /api/comment/feedback -> čo sa kouč o vkuse používateľa naučil
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { commentStyle: true, styleDistilledAt: true },
  });
  const [up, down, pending] = await Promise.all([
    prisma.commentFeedback.count({ where: { userId, rating: 1 } }),
    prisma.commentFeedback.count({ where: { userId, rating: -1 } }),
    prisma.commentFeedback.count({
      where: { userId, ...(user?.styleDistilledAt ? { createdAt: { gt: user.styleDistilledAt } } : {}) },
    }),
  ]);

  return NextResponse.json({
    style: user?.commentStyle ?? null,
    updatedAt: user?.styleDistilledAt ?? null,
    up,
    down,
    // koľko hodnotení ešte chýba do najbližšieho prepočtu profilu
    untilUpdate: Math.max(0, DISTILL_EVERY - pending),
  });
}

// DELETE /api/comment/feedback -> zabudne naučený vkus aj hodnotenia
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  await prisma.$transaction([
    prisma.commentFeedback.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { commentStyle: null, commentStats: Prisma.DbNull, styleDistilledAt: null },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
