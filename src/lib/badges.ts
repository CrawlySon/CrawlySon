// Katalóg odznakov + vyhodnocovacia logika (bez DB – čisté funkcie).
// Používa ho aj API /api/badges, aj motivačný cron /api/cron/coach.

export type DailyStat = {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  healthScore: number | null; // vážený priemer zdravosti dňa (0..10)
  hasFruit: boolean;      // surové/čerstvé ovocie (healthIndex ≥ 8, kat. Ovocie)
  hasVegetable: boolean;  // surová/čerstvá zelenina (healthIndex ≥ 8, kat. Zelenina)
  hasProteinShake: boolean; // proteínový šejk podľa názvu/podkategórie
  hasSweets: boolean;
  hasAlcohol: boolean;
  hasHardAlcohol: boolean; // tvrdý alkohol (destiláty – bez piva/vína)
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
  challengeId?: string; // zoskupenie do výzvy (4 úrovne vedľa seba v UI)
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
const hadProteinShake = (s: DailyStat) => s.hasProteinShake;
const healthy = (s: DailyStat) => s.healthScore != null && s.healthScore >= 7;
const metProtein = (ctx: BadgeContext) => (s: DailyStat) => ctx.goalProtein > 0 && s.protein >= ctx.goalProtein;
// „Bez ..." sa počíta len pre dni, v ktorých si naozaj niečo zapísal (inak nevieme).
const noSweets = (s: DailyStat) => s.entryCount > 0 && !s.hasSweets;
const noAlcohol = (s: DailyStat) => s.entryCount > 0 && !s.hasAlcohol;
const noHardAlcohol = (s: DailyStat) => s.entryCount > 0 && !s.hasHardAlcohol;
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

// Pomocník: pridá challengeId ku badge (inline spread)
function withChallenge(b: BadgeDef, challengeId: string): BadgeDef {
  return { ...b, challengeId };
}
// 4-úrovňová výzva: 1 deň, 3 dni, 7 dní, 30 dní
function challenge4(
  id: string, emoji: string, title: string, group: BadgeGroup,
  pred: (ctx: BadgeContext) => (s: DailyStat) => boolean
): BadgeDef[] {
  return [1, 3, 7, 30].map((n) =>
    withChallenge(
      streakBadge(`${id}_${n}`, emoji, `${title} · ${n === 1 ? "1×" : `${n}d`}`, `${n} ${n === 1 ? "deň" : "dní po sebe"}`, group, n, pred),
      id
    )
  );
}

export const BADGES: BadgeDef[] = [
  // Výzvy (4 úrovne každá: 1×, 3d, 7d, 30d)
  ...challenge4("cal",          "🎯", "Kalorický cieľ",        "kalórie", inCalorieGoal),
  ...challenge4("log",          "📝", "Zápis jedál",           "zápis",   () => logged),
  ...challenge4("water",        "💧", "Pitný režim",           "voda",    metWater),
  ...challenge4("fruit",        "🍎", "Surové ovocie",         "strava",  () => hadFruit),
  ...challenge4("veg",          "🥗", "Surová zelenina",       "strava",  () => hadVegetable),
  ...challenge4("healthy",      "🥦", "Zdravé dni",            "strava",  () => healthy),
  ...challenge4("protein",      "🥤", "Proteínový šejk",       "strava",  () => hadProteinShake),
  ...challenge4("no_sweets",    "🚫🍭","Bez sladkého",         "strava",  () => noSweets),
  ...challenge4("no_alcohol",   "🚱", "Bez alkoholu",          "strava",  () => noAlcohol),
  ...challenge4("no_hard_alc",  "🥃", "Bez tvrdého alkoholu",  "strava",  () => noHardAlcohol),

  // Míľniky (samostatné, bez challengeId)
  countBadge("entries_10",  "🌱", "Začiatočník", "10 zapísaných jedál",  10),
  countBadge("entries_100", "🍽️","Foodlogger",  "100 zapísaných jedál", 100),
  withChallenge(dayBadge("perfect_day", "⭐", "Presný zásah", "Deň v rozmedzí ±10 % kalorického cieľa", "míľnik", perfect), ""),
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
  { type: "fruit", emoji: "🍎", title: "Surové ovocie", desc: "dni po sebe so surovým ovocím", pred: () => hadFruit },
  { type: "veg", emoji: "🥗", title: "Surová zelenina", desc: "dni po sebe so surovou zeleninou", pred: () => hadVegetable },
  { type: "healthy", emoji: "🥦", title: "Zdravé dni", desc: "dni po sebe so zdravosťou ≥ 7", pred: () => healthy },
  { type: "protein", emoji: "🥤", title: "Proteínový šejk", desc: "dni po sebe s proteínovým šejkom", pred: () => hadProteinShake },
  { type: "no_sweets", emoji: "🚫🍭", title: "Bez sladkého", desc: "dni po sebe bez sladkého", pred: () => noSweets },
  { type: "no_alcohol", emoji: "🚱", title: "Bez alkoholu", desc: "dni po sebe bez alkoholu", pred: () => noAlcohol },
  { type: "no_hard_alcohol", emoji: "🥃", title: "Bez tvrdého alkoholu", desc: "dni po sebe bez tvrdého alkoholu", pred: () => noHardAlcohol },
];

export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

// Kľúče odznakov, ktoré sú práve teraz splnené (na odomknutie).
export function satisfiedBadgeKeys(ctx: BadgeContext): string[] {
  return BADGES.filter((b) => b.evaluate(ctx).earned).map((b) => b.key);
}
