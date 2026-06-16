import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendToSubs } from "@/lib/push";
import { BADGE_BY_KEY, shiftISO } from "@/lib/badges";
import { buildBadgeContext, unlockNewBadges, todayStat, dayStat, skToday } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function skHour(d = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let h = parseInt(p.find((x) => x.type === "hour")?.value || "0", 10);
  if (h === 24) h = 0;
  return h;
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

// Okná pre jednotlivé pripomienky (SK hodina)
const MORNING_WINDOW = (h: number) => h >= 7 && h < 11; // ráno – zhrnutie včerajška
const CAL_WINDOW = (h: number) => h >= 15 && h < 18; // poobede – pozor na limit
const FRUIT_WINDOW = (h: number) => h >= 18 && h < 21; // večer – ovocie

const oneDec = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Neautorizované" }, { status: 401 });

  const today = skToday();
  const hour = skHour();

  const users = await prisma.user.findMany({
    where: { coachRemind: true, pushSubs: { some: {} } },
    select: {
      id: true,
      coachState: true,
      goalCalories: true,
      goalProtein: true,
      goalWaterMl: true,
      pushSubs: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  let notified = 0;

  for (const u of users) {
    const ctx = await buildBadgeContext(u.id, u);

    // 1) Gratulácia k novo odomknutým odznakom (najvyššia priorita, kedykoľvek)
    const fresh = await unlockNewBadges(u.id, ctx);
    if (fresh.length) {
      const first = BADGE_BY_KEY.get(fresh[0]);
      const extra = fresh.length > 1 ? ` (+${fresh.length - 1} ďalší)` : "";
      const sent = await sendToSubs(u.pushSubs, {
        title: "🏅 Nový odznak!",
        body: first ? `${first.emoji} ${first.title} – ${first.desc}${extra}` : `Odomkol si nový odznak${extra}!`,
        url: "/profile",
      });
      if (sent > 0) notified++;
      continue; // jedna notifikácia na beh
    }

    const state = (u.coachState && typeof u.coachState === "object" ? (u.coachState as Record<string, string>) : {}) || {};
    const t = todayStat(ctx);
    const setState = async (kind: string) => {
      await prisma.user.update({
        where: { id: u.id },
        data: { coachState: { ...state, [kind]: today } },
      });
    };

    // 2) Ráno: zhrnutie včerajška
    if (MORNING_WINDOW(hour) && state.summary !== today) {
      const y = dayStat(ctx, shiftISO(today, -1));
      if (y.entryCount > 0) {
        const cal = Math.round(y.calories);
        const g = u.goalCalories;
        const inGoal = g > 0 && cal <= g;
        const parts = [`${cal} kcal${g > 0 ? ` z ${g}` : ""}`, `B ${Math.round(y.protein)} g`];
        if (y.waterMl > 0) parts.push(`💧 ${oneDec(y.waterMl / 1000)} l`);
        if (y.healthScore != null) parts.push(`♥ ${oneDec(y.healthScore)}`);
        const tail =
          g > 0 ? (inGoal ? " Pekná práca, drž to tak! 💪" : " Dnes to zvládneš lepšie 🙂") : "";
        const sent = await sendToSubs(u.pushSubs, {
          title: "📊 Zhrnutie včera",
          body: parts.join(" · ") + tail,
          url: "/history",
        });
        if (sent > 0) {
          notified++;
          await setState("summary");
          continue;
        }
      }
    }

    // 3) Poobede: blížiš sa ku kalorickej hranici → večeru naľahko
    if (CAL_WINDOW(hour) && state.calorie !== today && u.goalCalories > 0 && t.entryCount > 0) {
      const c = Math.round(t.calories);
      const g = u.goalCalories;
      if (c >= g * 0.7 && c <= g) {
        const remaining = g - c;
        const sent = await sendToSubs(u.pushSubs, {
          title: "🍽️ Pozor na večeru",
          body: `Máš zjedené ${c} kcal z ${g}. Na zvyšok dňa ti ostáva ${remaining} kcal – večeru radšej naľahko 🥗`,
          url: "/",
        });
        if (sent > 0) {
          notified++;
          await setState("calorie");
          continue;
        }
      } else if (c > g) {
        const sent = await sendToSubs(u.pushSubs, {
          title: "🍽️ Kalorický cieľ",
          body: `Dnes si už na svojom cieli (${g} kcal). Ak si ešte dáš, voľ niečo ľahké a zdravé 🥗`,
          url: "/",
        });
        if (sent > 0) {
          notified++;
          await setState("calorie");
          continue;
        }
      }
    }

    // 4) Večer: dnes ešte žiadne ovocie
    if (FRUIT_WINDOW(hour) && state.fruit !== today && t.entryCount > 0 && !t.hasFruit) {
      const sent = await sendToSubs(u.pushSubs, {
        title: "🍎 Čas na ovocie",
        body: "Dnes si ešte nemal ovocie. Daj si jablko alebo hrsť bobúľ – telu to spraví dobre.",
        url: "/",
      });
      if (sent > 0) {
        notified++;
        await setState("fruit");
        continue;
      }
    }
  }

  return NextResponse.json({ ok: true, checked: users.length, notified, today, hour });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
