// Katalóg odznakov + vyhodnocovacia logika (bez DB – čisté funkcie).
// Používa ho aj API /api/badges, aj motivačný cron /api/cron/coach.

export type DailyStat = {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  healthScore: number | null; // vážený priemer zdravosti dňa (0..10)
  hasFruit: boolean; // bol v daný deň zaznamenaný kus ovocia?
  hasVegetable: boolean; // bola v daný deň zaznamenaná zelenina?
  waterMl: number;
  entryCount: number;
};

export type BadgeContext = {
  today: string; // YYYY-MM-DD (lokálny dátum používateľa)
  byDate: Map<string, DailyStat>;
  goalCalories: number;
  goalProtein: number;
  goalWaterMl: number;
  totalEntries: number; // celkový počet záznamov za celé obdobie
};

export type BadgeGroup = "kalórie" | "zápis" | "voda" | "strava" | "míľnik";

export type BadgeDef = {
  key: string;
  emoji: string;
  title: string;
  desc: string;
  group: BadgeGroup;
  // Vráti splnenie + (voliteľne) priebeh k cieľu pre zamknuté odznaky.
  evaluate: (ctx: BadgeContext) => { earned: boolean; current?: number; target?: number };
};

// --- pomocníci -------------------------------------------------------------

export function shiftISO(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Aktuálna séria po sebe idúcich dní (končiaca dnes alebo včera) spĺňajúca podmienku.
export function currentStreak(ctx: BadgeContext, pred: (s: DailyStat) => boolean): number {
  let d = ctx.byDate.has(ctx.today) ? ctx.today : shiftISO(ctx.today, -1);
  let n = 0;
  while (true) {
    const s = ctx.byDate.get(d);
    if (!s || !pred(s)) break;
    n++;
    d = shiftISO(d, -1);
  }
  return n;
}

// Najdlhšia séria po sebe idúcich dní spĺňajúca podmienku v rámci dostupných dát.
export function longestStreak(ctx: BadgeContext, pred: (s: DailyStat) => boolean): number {
  const dates = [...ctx.byDate.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    const ok = pred(ctx.byDate.get(d)!);
    if (!ok) {
      run = 0;
      prev = d;
      continue;
    }
    run = prev && shiftISO(prev, 1) === d ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return best;
}

// Existuje aspoň jeden deň spĺňajúci podmienku?
function anyDay(ctx: BadgeContext, pred: (s: DailyStat) => boolean): boolean {
  for (const s of ctx.byDate.values()) if (pred(s)) return true;
  return false;
}

// --- predikáty dňa ---------------------------------------------------------

const inCalorieGoal = (ctx: BadgeContext) => (s: DailyStat) =>
  s.calories > 0 && ctx.goalCalories > 0 && s.calories <= ctx.goalCalories;
const logged = (s: DailyStat) => s.entryCount > 0;
const metWater = (ctx: BadgeContext) => (s: DailyStat) => ctx.goalWaterMl > 0 && s.waterMl >= ctx.goalWaterMl;
const hadFruit = (s: DailyStat) => s.hasFruit;
const hadVegetable = (s: DailyStat) => s.hasVegetable;
const healthy = (s: DailyStat) => s.healthScore != null && s.healthScore >= 7;
const metProtein = (ctx: BadgeContext) => (s: DailyStat) => ctx.goalProtein > 0 && s.protein >= ctx.goalProtein;
const perfect = (ctx: BadgeContext) => (s: DailyStat) =>
  s.calories > 0 && ctx.goalCalories > 0 && Math.abs(s.calories - ctx.goalCalories) <= ctx.goalCalories * 0.1;

// --- katalóg ---------------------------------------------------------------

function streakBadge(
  key: string,
  emoji: string,
  title: string,
  desc: string,
  group: BadgeGroup,
  target: number,
  pred: (ctx: BadgeContext) => (s: DailyStat) => boolean
): BadgeDef {
  return {
    key,
    emoji,
    title,
    desc,
    group,
    evaluate: (ctx) => {
      const cur = currentStreak(ctx, pred(ctx));
      return { earned: cur >= target, current: cur, target };
    },
  };
}

function dayBadge(
  key: string,
  emoji: string,
  title: string,
  desc: string,
  group: BadgeGroup,
  pred: (ctx: BadgeContext) => (s: DailyStat) => boolean
): BadgeDef {
  return {
    key,
    emoji,
    title,
    desc,
    group,
    evaluate: (ctx) => ({ earned: anyDay(ctx, pred(ctx)), target: 1, current: anyDay(ctx, pred(ctx)) ? 1 : 0 }),
  };
}

function countBadge(
  key: string,
  emoji: string,
  title: string,
  desc: string,
  target: number
): BadgeDef {
  return {
    key,
    emoji,
    title,
    desc,
    group: "míľnik",
    evaluate: (ctx) => ({ earned: ctx.totalEntries >= target, current: ctx.totalEntries, target }),
  };
}

export const BADGES: BadgeDef[] = [
  // Kalorická disciplína
  streakBadge("cal_streak_3", "🎯", "Na ceste", "3 dni po sebe v kalorickom cieli", "kalórie", 3, inCalorieGoal),
  streakBadge("cal_streak_7", "🔥", "Týždeň disciplíny", "7 dní po sebe v kalorickom cieli", "kalórie", 7, inCalorieGoal),
  streakBadge("cal_streak_14", "🏆", "Majster sebakontroly", "14 dní po sebe v kalorickom cieli", "kalórie", 14, inCalorieGoal),
  streakBadge("cal_streak_30", "🥇", "Mesiac v cieli", "30 dní po sebe v kalorickom cieli", "kalórie", 30, inCalorieGoal),
  dayBadge("perfect_day", "⭐", "Presný zásah", "Deň v rozmedzí ±10 % kalorického cieľa", "kalórie", perfect),

  // Pravidelnosť zápisu
  streakBadge("log_streak_7", "📝", "Pravidelný", "7 dní po sebe zapísané jedlo", "zápis", 7, () => logged),
  streakBadge("log_streak_30", "📅", "Mesiac v kuse", "30 dní po sebe zapísané jedlo", "zápis", 30, () => logged),
  countBadge("entries_10", "🌱", "Začiatočník", "10 zapísaných jedál", 10),
  countBadge("entries_100", "🍽️", "Foodlogger", "100 zapísaných jedál", 100),

  // Hydratácia
  dayBadge("water_goal", "💧", "Hydratovaný", "Splnený denný cieľ vody", "voda", metWater),
  streakBadge("water_streak_7", "🌊", "Vodný režim", "7 dní po sebe splnený cieľ vody", "voda", 7, metWater),
  streakBadge("water_streak_14", "🐳", "Dva týždne vody", "14 dní po sebe splnený cieľ vody", "voda", 14, metWater),

  // Strava (ovocie, zelenina, zdravosť, bielkoviny)
  dayBadge("fruit_day", "🍎", "Vitamínka", "Ovocie aspoň v jeden deň", "strava", () => hadFruit),
  streakBadge("fruit_streak_5", "🍓", "Päť dní ovocia", "5 dní po sebe ovocie", "strava", 5, () => hadFruit),
  streakBadge("fruit_streak_10", "🍇", "Desať dní ovocia", "10 dní po sebe ovocie", "strava", 10, () => hadFruit),
  dayBadge("veg_day", "🥗", "Zelený tanier", "Zelenina aspoň v jeden deň", "strava", () => hadVegetable),
  streakBadge("veg_streak_5", "🥕", "Päť dní zeleniny", "5 dní po sebe zelenina", "strava", 5, () => hadVegetable),
  streakBadge("veg_streak_10", "🥬", "Desať dní zeleniny", "10 dní po sebe zelenina", "strava", 10, () => hadVegetable),
  dayBadge("healthy_day", "🥦", "Zdravý tanier", "Deň s priemernou zdravosťou ≥ 7", "strava", () => healthy),
  streakBadge("healthy_streak_5", "🌿", "Čistá strava", "5 dní po sebe zdravosť ≥ 7", "strava", 5, () => healthy),
  streakBadge("healthy_streak_10", "🌳", "Desať čistých dní", "10 dní po sebe zdravosť ≥ 7", "strava", 10, () => healthy),
  dayBadge("protein_goal", "💪", "Bielkovinový cieľ", "Splnený denný cieľ bielkovín", "strava", metProtein),
  streakBadge("protein_streak_5", "🥩", "Päť dní bielkovín", "5 dní po sebe cieľ bielkovín", "strava", 5, metProtein),
  streakBadge("protein_streak_10", "🍗", "Desať dní bielkovín", "10 dní po sebe cieľ bielkovín", "strava", 10, metProtein),
];

// Katalóg typov sérií pre sekciu „Série a rekordy". Pre každý typ vieme určiť
// aktuálnu sériu, najdlhšiu (rekord) a progres k jeho prekonaniu.
export type StreakDef = {
  type: string;
  emoji: string;
  title: string;
  desc: string;
  pred: (ctx: BadgeContext) => (s: DailyStat) => boolean;
};

export const STREAKS: StreakDef[] = [
  { type: "cal", emoji: "🎯", title: "Kalorický cieľ", desc: "dni po sebe v kalorickom cieli", pred: inCalorieGoal },
  { type: "log", emoji: "📝", title: "Zápis jedál", desc: "dni po sebe so zapísaným jedlom", pred: () => logged },
  { type: "water", emoji: "💧", title: "Pitný režim", desc: "dni po sebe splnený cieľ vody", pred: metWater },
  { type: "fruit", emoji: "🍎", title: "Ovocie", desc: "dni po sebe s ovocím", pred: () => hadFruit },
  { type: "veg", emoji: "🥗", title: "Zelenina", desc: "dni po sebe so zeleninou", pred: () => hadVegetable },
  { type: "healthy", emoji: "🥦", title: "Zdravé dni", desc: "dni po sebe so zdravosťou ≥ 7", pred: () => healthy },
  { type: "protein", emoji: "💪", title: "Bielkoviny", desc: "dni po sebe splnený cieľ bielkovín", pred: metProtein },
];

export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

// Kľúče odznakov, ktoré sú práve teraz splnené (na odomknutie).
export function satisfiedBadgeKeys(ctx: BadgeContext): string[] {
  return BADGES.filter((b) => b.evaluate(ctx).earned).map((b) => b.key);
}
