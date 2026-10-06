import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { skToday } from "@/lib/coach";
import {
  commentTriggers,
  applyFeedback,
  shouldComment,
  focusItem,
  MEAL_SK,
  type CommentItem,
  type CommentStats,
  type DayEntry,
} from "@/lib/food-comment";
import { writeFoodComment } from "@/lib/ai";
import { personaOf } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Pamäť proti opakovaniu. Ukladáme len krátke značky, nie celé hlášky, takže
// prompt ostáva krátky aj po stovkách bublín:
//  recent – posledné celé hlášky (doslovné zopakovanie)
//  nicks  – posledné prezývky (nech ťa nevolá stále rovnako)
//  motifs – pointy posledných bublín; po ~20 bublinách vypadnú a motív sa
//           môže vrátiť v novej podobe
type Log = { at?: string; recent?: string[]; nicks?: string[]; motifs?: string[] };
const KEEP_RECENT = 6;
const KEEP_NICKS = 15;
const KEEP_MOTIFS = 20;

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
      mealType: i?.mealType ? String(i.mealType) : null,
    }))
    .filter((i: CommentItem) => i.name);

  // Komentujeme len dnešok – „tretia klobása dnes" pri dopĺňaní minulých dní nesedí.
  // (Čas zápisu NEhrá rolu – kontext dáva jedlo dňa, do ktorého sa položka pridala.)
  if (!added.length || date !== skToday()) return NextResponse.json({ comment: null });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      coachComments: true,
      coachPersona: true,
      coachRoast: true,
      goalCalories: true,
      goalProtein: true,
      commentLog: true,
      commentStyle: true,
      commentStats: true,
    },
  });
  if (!user || !user.coachComments) return NextResponse.json({ comment: null });

  const today = await prisma.entry.findMany({
    where: { userId, date },
    select: { name: true, calories: true, mealType: true },
  });

  // Práve pridané položky už sú v DB – zo zvyšku dňa ich vyberieme
  // (po jednej na každú pridanú), nech sa nerátajú dvakrát.
  const others: DayEntry[] = [...today];
  for (const a of added) {
    const i = others.findIndex((e) => e.name === a.name && Math.abs(e.calories - a.calories) < 0.5);
    if (i >= 0) others.splice(i, 1);
  }

  // Váhy udalostí upravené podľa toho, čo používateľ hodnotil 👍/👎
  const triggers = applyFeedback(
    commentTriggers({ added, others, goalCalories: user.goalCalories, goalProtein: user.goalProtein }),
    user.commentStats as CommentStats | null
  );

  const log = (user.commentLog && typeof user.commentLog === "object" ? user.commentLog : {}) as Log;
  const minutesSinceLast = log.at ? (Date.now() - new Date(log.at).getTime()) / 60000 : null;
  if (!shouldComment(triggers, minutesSinceLast)) return NextResponse.json({ comment: null });

  const persona = personaOf(user);
  const recent = Array.isArray(log.recent) ? log.recent.slice(0, KEEP_RECENT) : [];
  const nicks = Array.isArray(log.nicks) ? log.nicks.slice(0, KEEP_NICKS) : [];
  const motifs = Array.isArray(log.motifs) ? log.motifs.slice(0, KEEP_MOTIFS) : [];
  const focus = focusItem(added);
  const out = await writeFoodComment({
    persona,
    triggers,
    added,
    meal: MEAL_SK[focus.mealType || "other"] || "iné",
    dayCalories: today.reduce((t, e) => t + e.calories, 0),
    goalCalories: user.goalCalories,
    recent,
    style: user.commentStyle,
    avoidNicknames: nicks,
    avoidMotifs: motifs,
  });
  if (!out) return NextResponse.json({ comment: null });
  const comment = out.text;

  await prisma.user.update({
    where: { id: userId },
    data: {
      commentLog: {
        at: new Date().toISOString(),
        recent: [comment, ...recent].slice(0, KEEP_RECENT),
        nicks: out.nickname ? [out.nickname, ...nicks].slice(0, KEEP_NICKS) : nicks,
        motifs: out.motif ? [out.motif, ...motifs].slice(0, KEEP_MOTIFS) : motifs,
      },
    },
  });

  return NextResponse.json({ comment, persona, kind: triggers[0]?.kind ?? "random" });
}
