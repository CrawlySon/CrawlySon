// Serverová logika motivačného „kouča": poskladá denné štatistiky používateľa,
// odomkne novo splnené odznaky a pripraví podklady pre chytré pripomienky.
import { prisma } from "./db";
import { shiftISO, satisfiedBadgeKeys, type BadgeContext, type DailyStat } from "./badges";

const FRUIT_RX = /ovoc/i; // kategória „Ovocie" (case-insensitive)

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
      d = { date, calories: 0, protein: 0, healthScore: null, hasFruit: false, waterMl: 0, entryCount: 0, hSum: 0, hWeight: 0 };
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

// Štatistika dnešného dňa (pre pripomienky).
export function todayStat(ctx: BadgeContext): DailyStat {
  return (
    ctx.byDate.get(ctx.today) ?? {
      date: ctx.today,
      calories: 0,
      protein: 0,
      healthScore: null,
      hasFruit: false,
      waterMl: 0,
      entryCount: 0,
    }
  );
}
