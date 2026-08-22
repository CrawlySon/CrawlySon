// Serverová logika motivačného „kouča": poskladá denné štatistiky používateľa,
// odomkne novo splnené odznaky a pripraví podklady pre chytré pripomienky.
import { prisma } from "./db";
import {
  shiftISO,
  satisfiedBadgeKeys,
  currentStreak,
  longestStreak,
  currentAbstinenceStreak,
  longestAbstinenceStreak,
  STREAKS,
  type BadgeContext,
  type DailyStat,
} from "./badges";
// Alkohol rozpoznávame zdieľanou logikou – rovnako ako filtre v analytike.
import { ALCOHOL_RX, HARD_ALCOHOL_RX } from "./food-tags";

const FRUIT_RX = /ovoc/i;
const VEG_RX = /zelenin/i;
// Proteínový ŠEJK/nápoj – nie čokoľvek s „proteín" v názve (tyčinka, jogurt,
// mlieko, puding to NIE sú). Vyžadujeme jednoznačné šejkové/práškové signály,
// alebo „proteín" v spojení s nápoj/drink/shake/smoothie/izolát/koncentrát.
const SHAKE_RX =
  /shake|šejk|\bwhey\b|srvátkov|gainer|proteín(ov[ýáé])?\s*(nápoj|drink|kokteil|koktail|smoothie)|(proteín(ov[ýá])?|whey|srvátkov)\s*(izolát|izolat|koncentrát|koncentrat)/i;
// Sladké: spoľahlivá je AI kategória „Sladké".
const SWEETS_RX = /slad/i;
// Pečivo: hlavný signál je AI kategória „Pečivo". Názvy sú poistka pre záznamy
// zaradené inam (napr. pod „Obilniny") – radšej zachytiť aj tie, než tvrdiť
// sériu bez pečiva v deň, keď si si dal rožok.
const BREAD_CAT_RX = /pečiv|peciv/i;
const BREAD_NAME_RX =
  /chlieb|chlebík|chlebik|chlebov|rožok|rozok|rožky|rozky|žemľ|zeml|baget|croissant|kroasan|toust|toast|briošk|briosk|praclík|praclik|\bpita\b|tortill|lavaš|lavas|bulk|veka\b|pagáč|pagac|langoš|langos/i;

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

// Koľko dní dozadu načítavame dáta pre série a odznaky. Okno je zámerne dlhé,
// aby doň spadla celá bežná história – vtedy vieme rekordy počítať presne.
export const STREAK_WINDOW_DAYS = 400;

// Poskladá kontext pre vyhodnotenie odznakov za posledných ~400 dní.
export async function buildBadgeContext(userId: string, goals: UserGoals): Promise<BadgeContext> {
  const today = skToday();
  const since = shiftISO(today, -STREAK_WINDOW_DAYS);

  const [entries, waterLogs, totalEntries] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, calories: true, protein: true, quantityGrams: true, healthIndex: true, category: true, subcategory: true, name: true },
    }),
    prisma.waterLog.findMany({ where: { userId, date: { gte: since } }, select: { date: true, ml: true } }),
    prisma.entry.count({ where: { userId } }),
  ]);

  type Acc = DailyStat & { hSum: number; hWeight: number };
  const byDate = new Map<string, Acc>();
  const ensure = (date: string): Acc => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, calories: 0, protein: 0, healthScore: null, hasFruit: false, hasVegetable: false, hasProteinShake: false, hasSweets: false, hasBread: false, hasAlcohol: false, hasHardAlcohol: false, waterMl: 0, entryCount: 0, hSum: 0, hWeight: 0 };
      byDate.set(date, d);
    }
    return d;
  };

  for (const e of entries) {
    const d = ensure(e.date);
    d.calories += e.calories;
    d.protein += e.protein;
    d.entryCount += 1;
    const isRaw = e.healthIndex == null || e.healthIndex >= 8;
    if (e.category && FRUIT_RX.test(e.category) && isRaw) d.hasFruit = true;
    if (e.category && VEG_RX.test(e.category) && isRaw) d.hasVegetable = true;
    if (e.category && SWEETS_RX.test(e.category)) d.hasSweets = true;
    const blob = `${e.category || ""} ${e.subcategory || ""} ${e.name || ""}`;
    if ((e.category && BREAD_CAT_RX.test(e.category)) || BREAD_NAME_RX.test(blob)) d.hasBread = true;
    if (ALCOHOL_RX.test(blob)) d.hasAlcohol = true;
    if (HARD_ALCOHOL_RX.test(blob)) d.hasHardAlcohol = true;
    if (SHAKE_RX.test(blob)) d.hasProteinShake = true;
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
      hasProteinShake: false,
      hasSweets: false,
      hasBread: false,
      hasAlcohol: false,
      hasHardAlcohol: false,
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

// Spočíta aktuálnu sériu a osobný rekord pre každý typ; zmenené rekordy uloží.
//
// Rekord sa NEberie ako trvalé maximum. Ak máme načítanú celú históriu
// používateľa, je výpočet z dát autoritatívny a rekord smie aj klesnúť – inak by
// po zmazaní/presune záznamov alebo po zmene kalorického cieľa navždy ostala
// hodnota, ktorú dáta nepodporujú. Len ak história siaha až na okraj okna (a teda
// môžu existovať staršie dni, ktoré nevidíme), držíme uloženú hodnotu ako spodnú
// hranicu, nech sa dávny rekord nestratí.
export async function buildStreaks(userId: string, ctx: BadgeContext): Promise<StreakState[]> {
  const stored = await prisma.streakRecord.findMany({ where: { userId }, select: { type: true, best: true } });
  const storedMap = new Map(stored.map((r) => [r.type, r.best]));

  // Máme všetko? Áno, ak najstarší načítaný deň leží až za začiatkom okna –
  // vtedy pred ním nemôže byť žiadny nenačítaný záznam.
  const windowStart = shiftISO(ctx.today, -STREAK_WINDOW_DAYS);
  const dates = [...ctx.byDate.keys()].sort();
  const haveFullHistory = dates.length === 0 || dates[0] > windowStart;

  const out: StreakState[] = [];
  const updates: { type: string; best: number }[] = [];

  for (const def of STREAKS) {
    const pred = def.pred(ctx);
    const current = def.abstinence ? currentAbstinenceStreak(ctx, pred) : currentStreak(ctx, pred);
    const windowBest = def.abstinence ? longestAbstinenceStreak(ctx, pred) : longestStreak(ctx, pred);
    const prevBest = storedMap.get(def.type) ?? 0;
    const best = haveFullHistory
      ? Math.max(windowBest, current)
      : Math.max(prevBest, windowBest, current);
    if (best !== prevBest) updates.push({ type: def.type, best });
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
