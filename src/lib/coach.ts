// Serverová logika motivačného „kouča": poskladá denné štatistiky používateľa,
// odomkne novo splnené odznaky a pripraví podklady pre chytré pripomienky.
import { prisma } from "./db";
import {
  shiftISO,
  satisfiedBadgeKeys,
  currentStreak,
  longestStreak,
  STREAKS,
  type BadgeContext,
  type DailyStat,
} from "./badges";

const FRUIT_RX = /ovoc/i; // kategória „Ovocie" (case-insensitive)
const VEG_RX = /zelenin/i; // kategória „Zelenina" (case-insensitive)

// Lokálny dátum (Europe/Bratislava) vo formáte YYYY-MM-DD.
export function skToday(d = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return p; // en-CA dáva rovno YYYY-MM-DD
}

// Váha položky pre vážený priemer zdravosti (hmotnosť, fallback z kalórií).
function weightOf(grams: number | null, calories: number): number {
  if (grams && grams > 0) return grams;
  if (calories > 0) return calories / 2;
  return 100;
}

export type UserGoals = {
  goalCalories: number;
  goalProtein: number;
  goalWaterMl: number;
};

// Poskladá kontext pre vyhodnotenie odznakov za posledných ~60 dní.
export async function buildBadgeContext(userId: string, goals: UserGoals): Promise<BadgeContext> {
  const today = skToday();
  const since = shiftISO(today, -60);

  const [entries, waterLogs, totalEntries] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, calories: true, protein: true, quantityGrams: true, healthIndex: true, category: true },
    }),
    prisma.waterLog.findMany({ where: { userId, date: { gte: since } }, select: { date: true, ml: true } }),
    prisma.entry.count({ where: { userId } }),
  ]);

  type Acc = DailyStat & { hSum: number; hWeight: number };
  const byDate = new Map<string, Acc>();
  const ensure = (date: string): Acc => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, calories: 0, protein: 0, healthScore: null, hasFruit: false, hasVegetable: false, waterMl: 0, entryCount: 0, hSum: 0, hWeight: 0 };
      byDate.set(date, d);
    }
    return d;
  };

  for (const e of entries) {
    const d = ensure(e.date);
    d.calories += e.calories;
    d.protein += e.protein;
    d.entryCount += 1;
    if (e.category && FRUIT_RX.test(e.category)) d.hasFruit = true;
    if (e.category && VEG_RX.test(e.category)) d.hasVegetable = true;
    if (e.healthIndex != null) {
      const w = weightOf(e.quantityGrams, e.calories);
      d.hSum += e.healthIndex * w;
      d.hWeight += w;
    }
  }
  for (const w of waterLogs) ensure(w.date).waterMl += w.ml;
  for (const d of byDate.values()) d.healthScore = d.hWeight > 0 ? d.hSum / d.hWeight : null;

  return {
    today,
    byDate: byDate as Map<string, DailyStat>,
    goalCalories: goals.goalCalories,
    goalProtein: goals.goalProtein,
    goalWaterMl: goals.goalWaterMl,
    totalEntries,
  };
}

// Odomkne novo splnené odznaky; vráti kľúče tých, ktoré pribudli teraz.
export async function unlockNewBadges(userId: string, ctx: BadgeContext): Promise<string[]> {
  const satisfied = satisfiedBadgeKeys(ctx);
  if (satisfied.length === 0) return [];
  const existing = await prisma.achievement.findMany({
    where: { userId, key: { in: satisfied } },
    select: { key: true },
  });
  const have = new Set(existing.map((a) => a.key));
  const fresh = satisfied.filter((k) => !have.has(k));
  if (fresh.length) {
    await prisma.achievement.createMany({
      data: fresh.map((key) => ({ userId, key })),
      skipDuplicates: true,
    });
  }
  return fresh;
}

// Štatistika konkrétneho dňa (prázdna, ak preň nie sú dáta).
export function dayStat(ctx: BadgeContext, date: string): DailyStat {
  return (
    ctx.byDate.get(date) ?? {
      date,
      calories: 0,
      protein: 0,
      healthScore: null,
      hasFruit: false,
      hasVegetable: false,
      waterMl: 0,
      entryCount: 0,
    }
  );
}

export type StreakState = {
  type: string;
  emoji: string;
  title: string;
  desc: string;
  current: number; // aktuálna séria (končiaca dnes/včera)
  best: number; // osobný rekord (všetky časy)
  isRecord: boolean; // aktuálna séria je (alebo vyrovnáva) rekord
};

// Spočíta aktuálnu sériu a osobný rekord pre každý typ; nové rekordy uloží do DB.
// Rekord = max(uložený rekord, najdlhšia séria v dátach, aktuálna séria), takže
// prežije aj orezanie okna (60 dní) či zmazanie starých dní.
export async function buildStreaks(userId: string, ctx: BadgeContext): Promise<StreakState[]> {
  const stored = await prisma.streakRecord.findMany({ where: { userId }, select: { type: true, best: true } });
  const storedMap = new Map(stored.map((r) => [r.type, r.best]));

  const out: StreakState[] = [];
  const updates: { type: string; best: number }[] = [];

  for (const def of STREAKS) {
    const pred = def.pred(ctx);
    const current = currentStreak(ctx, pred);
    const windowBest = longestStreak(ctx, pred);
    const prevBest = storedMap.get(def.type) ?? 0;
    const best = Math.max(prevBest, windowBest, current);
    if (best > prevBest) updates.push({ type: def.type, best });
    out.push({
      type: def.type,
      emoji: def.emoji,
      title: def.title,
      desc: def.desc,
      current,
      best,
      isRecord: current > 0 && current >= best,
    });
  }

  if (updates.length) {
    const now = new Date();
    await Promise.all(
      updates.map((u) =>
        prisma.streakRecord.upsert({
          where: { userId_type: { userId, type: u.type } },
          create: { userId, type: u.type, best: u.best, bestAt: now },
          update: { best: u.best, bestAt: now },
        })
      )
    );
  }

  return out;
}

// Štatistika dnešného dňa (pre pripomienky).
export function todayStat(ctx: BadgeContext): DailyStat {
  return dayStat(ctx, ctx.today);
}
