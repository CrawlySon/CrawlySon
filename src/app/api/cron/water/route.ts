import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendToSubs } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rule = { hour: number; minMl: number };
const DEFAULT_RULES: Rule[] = [
  { hour: 12, minMl: 500 },
  { hour: 18, minMl: 1000 },
];

// Okno (min) po čase pravidla, počas ktorého ešte môže pripomienka odísť
const WINDOW_MIN = 120;

function skParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(p.minute, 10);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + minute };
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // bez nastaveného tajomstva (napr. dev) povolíme
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Neautorizované" }, { status: 401 });

  const now = new Date();
  const sk = skParts(now);

  const users = await prisma.user.findMany({
    where: { waterRemind: true, pushSubs: { some: {} } },
    select: {
      id: true,
      waterReminders: true,
      waterLastNotified: true,
      pushSubs: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  let notified = 0;

  for (const u of users) {
    const rules = (Array.isArray(u.waterReminders) ? (u.waterReminders as any[]) : DEFAULT_RULES)
      .map((r) => ({ hour: Number(r.hour), minMl: Number(r.minMl) }))
      .filter((r) => Number.isFinite(r.hour) && Number.isFinite(r.minMl))
      .sort((a, b) => a.hour - b.hour);
    if (rules.length === 0) continue;

    const last = u.waterLastNotified ? skParts(u.waterLastNotified) : null;
    const lastMinutesToday = last && last.date === sk.date ? last.minutes : -1;

    // koľko vody dnes (SK dátum)
    const agg = await prisma.waterLog.aggregate({
      where: { userId: u.id, date: sk.date },
      _sum: { ml: true },
    });
    const total = agg._sum.ml || 0;

    for (const rule of rules) {
      const ruleMin = rule.hour * 60;
      if (sk.minutes < ruleMin) continue; // ešte nie je čas
      if (sk.minutes >= ruleMin + WINDOW_MIN) continue; // okno už prešlo
      if (lastMinutesToday >= ruleMin) continue; // pre toto pravidlo už dnes poslané
      if (total >= rule.minMl) continue; // dosť vypil

      const goalL = (rule.minMl / 1000).toString().replace(".", ",");
      const haveL = (Math.round((total / 1000) * 10) / 10).toString().replace(".", ",");
      const sent = await sendToSubs(u.pushSubs, {
        title: "💧 Pitný režim",
        body:
          total > 0
            ? `Zatiaľ máš ${haveL} l. Doplň vodu – malo by to byť aspoň ${goalL} l.`
            : `Ešte si dnes nepil. Daj si vodu – malo by to byť aspoň ${goalL} l.`,
        url: "/",
      });
      if (sent > 0) {
        notified++;
        await prisma.user.update({ where: { id: u.id }, data: { waterLastNotified: now } });
      }
      break; // jedna pripomienka na beh
    }
  }

  return NextResponse.json({ ok: true, checked: users.length, notified, sk });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
