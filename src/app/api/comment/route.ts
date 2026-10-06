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
import { checkAiQuota, logAiUsage } from "@/lib/ai-quota";
import { apiError, unauthorized, UserFacingError } from "@/lib/errors";

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
const MAX_ITEMS = 30;

// POST /api/comment { date, items } -> { comment: string | null }
// Volá sa PO uložení jedla (záznamy už sú v DB). Väčšinou vráti null –
// kouč sa ozve len niekedy, to je zámer.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const b = await req.json().catch(() => ({}));
    const date = String(b.date || "");
    const added: CommentItem[] = (Array.isArray(b.items) ? b.items.slice(0, MAX_ITEMS) : [])
      .map((i: any) => ({
        name: String(i?.name || "").trim().slice(0, 200),
        calories: Math.min(20000, Math.max(0, Number(i?.calories) || 0)),
        protein: Math.min(2000, Math.max(0, Number(i?.protein) || 0)),
        category: i?.category ? String(i.category).slice(0, 80) : null,
        healthIndex: i?.healthIndex != null && Number.isFinite(Number(i.healthIndex)) ? Number(i.healthIndex) : null,
        mealType: i?.mealType ? String(i.mealType).slice(0, 20) : null,
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

    // Komentár je bonus: pri vyčerpanom limite sa potichu neozve.
    try {
      await checkAiQuota(userId, "comment");
    } catch (e) {
      if (e instanceof UserFacingError) return NextResponse.json({ comment: null });
      throw e;
    }

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
    await logAiUsage(userId, "comment", out.usage);
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
  } catch (e) {
    return apiError(e, "comment");
  }
}
