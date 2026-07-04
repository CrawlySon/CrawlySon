import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { BADGES } from "@/lib/badges";
import { buildBadgeContext, unlockNewBadges, buildStreaks } from "@/lib/coach";

export const runtime = "nodejs";

// GET /api/badges -> katalóg odznakov so stavom (odomknuté / priebeh).
// Pri každom otvorení zároveň odomkne novo splnené odznaky.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { goalCalories: true, goalProtein: true, goalWaterMl: true },
  });
  if (!user) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const ctx = await buildBadgeContext(userId, user);
  await unlockNewBadges(userId, ctx);
  const streaks = await buildStreaks(userId, ctx);

  const earned = await prisma.achievement.findMany({
    where: { userId },
    select: { key: true, earnedAt: true },
  });
  const earnedMap = new Map(earned.map((a) => [a.key, a.earnedAt]));

  const badges = BADGES.map((b) => {
    const ev = b.evaluate(ctx);
    const earnedAt = earnedMap.get(b.key) ?? null;
    return {
      key: b.key,
      emoji: b.emoji,
      title: b.title,
      desc: b.desc,
      group: b.group,
      challengeId: b.challengeId,
      earned: earnedAt != null,
      earnedAt,
      current: ev.current ?? null,
      target: ev.target ?? null,
    };
  });

  return NextResponse.json({
    badges,
    streaks,
    earnedCount: badges.filter((b) => b.earned).length,
    total: badges.length,
  });
}
