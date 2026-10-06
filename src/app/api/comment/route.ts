import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday, skHour } from "@/lib/coach";
import { commentTriggers, shouldComment, type CommentItem } from "@/lib/food-comment";
import { writeFoodComment } from "@/lib/ai";
import { personaOf } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Log = { at?: string; recent?: string[] };

// POST /api/comment { date, items } -> { comment: string | null }
// Volá sa PO uložení jedla (záznamy už sú v DB). Väčšinou vráti null –
// kouč sa ozve len niekedy, to je zámer.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const date = String(b.date || "");
  const added: CommentItem[] = (Array.isArray(b.items) ? b.items : [])
    .map((i: any) => ({
      name: String(i?.name || "").trim(),
      calories: Math.max(0, Number(i?.calories) || 0),
      protein: Math.max(0, Number(i?.protein) || 0),
      category: i?.category ? String(i.category) : null,
      healthIndex: i?.healthIndex != null && Number.isFinite(Number(i.healthIndex)) ? Number(i.healthIndex) : null,
    }))
    .filter((i: CommentItem) => i.name);

  // Komentujeme len dnešok – „je 23:00" ani „tretia dnes" pri spätnom dopĺňaní nesedia.
  if (!added.length || date !== skToday()) return NextResponse.json({ comment: null });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { coachComments: true, coachPersona: true, coachRoast: true, goalCalories: true, goalProtein: true, commentLog: true },
  });
  if (!user || !user.coachComments) return NextResponse.json({ comment: null });

  const today = await prisma.entry.findMany({ where: { userId, date }, select: { name: true, calories: true, protein: true } });
  const addedKcal = added.reduce((s, i) => s + i.calories, 0);
  const addedProtein = added.reduce((s, i) => s + i.protein, 0);
  const totalKcal = today.reduce((s, e) => s + e.calories, 0);
  const totalProtein = today.reduce((s, e) => s + e.protein, 0);

  const hour = skHour();
  const triggers = commentTriggers({
    hour,
    added,
    dayBefore: {
      calories: Math.max(0, totalKcal - addedKcal),
      protein: Math.max(0, totalProtein - addedProtein),
      entryCount: Math.max(0, today.length - added.length),
    },
    goalCalories: user.goalCalories,
    goalProtein: user.goalProtein,
    todayNames: today.map((e) => e.name),
  });

  const log = (user.commentLog && typeof user.commentLog === "object" ? user.commentLog : {}) as Log;
  const minutesSinceLast = log.at ? (Date.now() - new Date(log.at).getTime()) / 60000 : null;
  if (!shouldComment(triggers, minutesSinceLast)) return NextResponse.json({ comment: null });

  const persona = personaOf(user);
  const recent = Array.isArray(log.recent) ? log.recent.slice(0, 6) : [];
  const comment = await writeFoodComment({
    persona,
    triggers,
    added,
    dayCalories: totalKcal,
    goalCalories: user.goalCalories,
    hour,
    recent,
  });
  if (!comment) return NextResponse.json({ comment: null });

  await prisma.user.update({
    where: { id: userId },
    data: { commentLog: { at: new Date().toISOString(), recent: [comment, ...recent].slice(0, 6) } },
  });

  return NextResponse.json({ comment, persona });
}
