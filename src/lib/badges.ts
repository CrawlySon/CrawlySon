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

// Séria „bez javu" končiaca dnes: počíta po sebe idúce dni BEZ výskytu javu,
// pričom nelogovaný/prázdny deň sa berie ako bez výskytu (absencia zápisu ≠
// konzumácia). Ohraničené najstarším dňom v dátach, nech neráta pred začiatkom
// sledovania. Odráža „koľko dní odvtedy, čo si mal naposledy ...".
export function currentAbstinenceStreak(ctx: BadgeContext, has: (s: DailyStat) => boolean): number {
  const keys = [...ctx.byDate.keys()];
  if (keys.length === 0) return 0;
  const earliest = keys.reduce((a, b) => (a < b ? a : b));
  let d = ctx.today;
  let n = 0;
  while (d >= earliest) {
    const s = ctx.byDate.get(d);
    if (s && has(s)) break; // v tento deň bol jav → séria končí
    n++;
    d = shiftISO(d, -1);
  }
  return n;
}

// Najdlhšia séria „bez javu" v dostupných dátach (medzery = bez javu), po dnešok.
export function longestAbstinenceStreak(ctx: BadgeContext, has: (s: DailyStat) => boolean): number {
  const keys = [...ctx.byDate.keys()].sort();
  if (keys.length === 0) return 0;
  let d = keys[0];
  const last = ctx.today;
  let best = 0;
  let run = 0;
  while (d <= last) {
    const s = ctx.byDate.get(d);
    if (s && has(s)) run = 0;
    else {
      run++;
      if (run > best) best = run;
    }
    d = shiftISO(d, 1);
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
// „Bez ..." série pracujú s VÝSKYTOM javu v daný deň (nie s absenciou zápisu).
// Nelogovaný/prázdny deň = bez výskytu, takže séria = dni od posledného výskytu.
const hasSweetsDay = (s: DailyStat) => s.hasSweets;
const hasAlcoholDay = (s: DailyStat) => s.hasAlcohol;
const hasHardAlcoholDay = (s: DailyStat) => s.hasHardAlcohol;
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

// Odznak pre sériu „bez ..." – nelogované dni sa berú ako bez výskytu.
function abstinenceStreakBadge(
  key: string,
  emoji: string,
  title: string,
  desc: string,
  group: BadgeGroup,
  target: number,
  has: (s: DailyStat) => boolean
): BadgeDef {
  return {
    key,
    emoji,
    title,
    desc,
    group,
    evaluate: (ctx) => {
      const cur = currentAbstinenceStreak(ctx, has);
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

// Otaguje badge do challenge skupiny.
function inChallenge(id: string, b: BadgeDef): BadgeDef {
  return { ...b, challengeId: id };
}

// Metadata challenge skupín pre UI (poradie = poradie zobrazenia).
export const CHALLENGE_META: Record<string, { emoji: string; title: string }> = {
  cal:         { emoji: "🎯",    title: "Kalorická disciplína" },
  log:         { emoji: "📝",    title: "Pravidelnosť zápisu" },
  water:       { emoji: "💧",    title: "Hydratácia" },
  fruit:       { emoji: "🍎",    title: "Surové ovocie" },
  veg:         { emoji: "🥗",    title: "Surová zelenina" },
  healthy:     { emoji: "🥦",    title: "Zdravá strava" },
  protein:     { emoji: "🥤",    title: "Proteínový šejk" },
  no_sweets:   { emoji: "🚫🍭", title: "Bez sladkého" },
  no_alcohol:  { emoji: "🚱",    title: "Bez alkoholu" },
  no_hard_alc: { emoji: "🥃",    title: "Bez tvrdého alkoholu" },
};
export const CHALLENGE_ORDER = Object.keys(CHALLENGE_META);

export const BADGES: BadgeDef[] = [
  // Kalorická disciplína (1d → 3d → 7d → 30d)
  inChallenge("cal", streakBadge("cal_1",  "🎯", "Prvý krok",           "1 deň v kalorickom cieli",    "kalórie", 1,  inCalorieGoal)),
  inChallenge("cal", streakBadge("cal_3",  "🎯", "Na ceste",            "3 dni po sebe v cieli",       "kalórie", 3,  inCalorieGoal)),
  inChallenge("cal", streakBadge("cal_7",  "🔥", "Týždeň disciplíny",   "7 dní po sebe v cieli",       "kalórie", 7,  inCalorieGoal)),
  inChallenge("cal", streakBadge("cal_30", "🥇", "Mesiac v cieli",      "30 dní po sebe v cieli",      "kalórie", 30, inCalorieGoal)),

  // Pravidelnosť zápisu
  inChallenge("log", streakBadge("log_1",  "📝", "Zapisovač",     "1 deň so zapísaným jedlom",   "zápis", 1,  () => logged)),
  inChallenge("log", streakBadge("log_3",  "📝", "Pravidelný",    "3 dni po sebe zapísané",      "zápis", 3,  () => logged)),
  inChallenge("log", streakBadge("log_7",  "📅", "Fooddiarista",  "7 dní po sebe zapísané",      "zápis", 7,  () => logged)),
  inChallenge("log", streakBadge("log_30", "📅", "Mesiac v kuse", "30 dní po sebe zapísané",     "zápis", 30, () => logged)),

  // Hydratácia
  inChallenge("water", streakBadge("water_1",  "💧", "Hydratovaný",    "1 deň splnený cieľ vody",    "voda", 1,  metWater)),
  inChallenge("water", streakBadge("water_3",  "💧", "Vodná rutina",   "3 dni po sebe splnený cieľ", "voda", 3,  metWater)),
  inChallenge("water", streakBadge("water_7",  "🌊", "Vodný režim",    "7 dní po sebe splnený cieľ", "voda", 7,  metWater)),
  inChallenge("water", streakBadge("water_30", "🐳", "Vodný majster",  "30 dní po sebe splnený cieľ","voda", 30, metWater)),

  // Surové ovocie
  inChallenge("fruit", streakBadge("fruit_1",  "🍎", "Vitamínka",     "1 deň surové ovocie",         "strava", 1,  () => hadFruit)),
  inChallenge("fruit", streakBadge("fruit_3",  "🍓", "Ovocná trojka", "3 dni po sebe surové ovocie", "strava", 3,  () => hadFruit)),
  inChallenge("fruit", streakBadge("fruit_7",  "🍓", "Týždeň ovocia","7 dní po sebe surové ovocie",  "strava", 7,  () => hadFruit)),
  inChallenge("fruit", streakBadge("fruit_30", "🍇", "Ovocný mesiac", "30 dní po sebe surové ovocie","strava", 30, () => hadFruit)),

  // Surová zelenina
  inChallenge("veg", streakBadge("veg_1",  "🥗", "Zelený tanier",    "1 deň surová zelenina",         "strava", 1,  () => hadVegetable)),
  inChallenge("veg", streakBadge("veg_3",  "🥕", "Zelená trojka",    "3 dni po sebe surová zelenina", "strava", 3,  () => hadVegetable)),
  inChallenge("veg", streakBadge("veg_7",  "🥕", "Týždeň zeleniny", "7 dní po sebe surová zelenina",  "strava", 7,  () => hadVegetable)),
  inChallenge("veg", streakBadge("veg_30", "🥬", "Zelený mesiac",    "30 dní po sebe surová zelenina","strava", 30, () => hadVegetable)),

  // Zdravá strava
  inChallenge("healthy", streakBadge("healthy_1",  "🥦", "Zdravý tanier",   "1 deň zdravosť ≥ 7",          "strava", 1,  () => healthy)),
  inChallenge("healthy", streakBadge("healthy_3",  "🌿", "Čistá trojka",    "3 dni po sebe zdravosť ≥ 7",  "strava", 3,  () => healthy)),
  inChallenge("healthy", streakBadge("healthy_7",  "🌿", "Zdravý týždeň",   "7 dní po sebe zdravosť ≥ 7",  "strava", 7,  () => healthy)),
  inChallenge("healthy", streakBadge("healthy_30", "🌳", "Mesiac čistoty",  "30 dní po sebe zdravosť ≥ 7", "strava", 30, () => healthy)),

  // Proteínový šejk
  inChallenge("protein", streakBadge("protein_1",  "🥤", "Šejkár",      "1 deň proteínový šejk",          "strava", 1,  () => hadProteinShake)),
  inChallenge("protein", streakBadge("protein_3",  "🥤", "Šejk trojka", "3 dni po sebe proteínový šejk",  "strava", 3,  () => hadProteinShake)),
  inChallenge("protein", streakBadge("protein_7",  "🥤", "Šejk týždeň", "7 dní po sebe proteínový šejk",  "strava", 7,  () => hadProteinShake)),
  inChallenge("protein", streakBadge("protein_30", "🥤", "Šejk mesiac", "30 dní po sebe proteínový šejk", "strava", 30, () => hadProteinShake)),

  // Bez sladkého
  inChallenge("no_sweets", abstinenceStreakBadge("no_sweets_1",  "🚫🍭", "Odolný",               "1 deň bez sladkého",          "strava", 1,  hasSweetsDay)),
  inChallenge("no_sweets", abstinenceStreakBadge("no_sweets_3",  "🚫🍭", "Silná vôľa",           "3 dni po sebe bez sladkého",  "strava", 3,  hasSweetsDay)),
  inChallenge("no_sweets", abstinenceStreakBadge("no_sweets_7",  "🚫🍭", "Týždeň bez sladkého",  "7 dní po sebe bez sladkého",  "strava", 7,  hasSweetsDay)),
  inChallenge("no_sweets", abstinenceStreakBadge("no_sweets_30", "🦷",   "Mesiac bez sladkého",  "30 dní po sebe bez sladkého", "strava", 30, hasSweetsDay)),

  // Bez alkoholu
  inChallenge("no_alcohol", abstinenceStreakBadge("no_alcohol_1",  "🚱", "Striedmy",             "1 deň bez alkoholu",          "strava", 1,  hasAlcoholDay)),
  inChallenge("no_alcohol", abstinenceStreakBadge("no_alcohol_3",  "🚱", "Čistá myseľ",          "3 dni po sebe bez alkoholu",  "strava", 3,  hasAlcoholDay)),
  inChallenge("no_alcohol", abstinenceStreakBadge("no_alcohol_7",  "🚱", "Týždeň bez alkoholu",  "7 dní po sebe bez alkoholu",  "strava", 7,  hasAlcoholDay)),
  inChallenge("no_alcohol", abstinenceStreakBadge("no_alcohol_30", "🧘", "Mesiac bez alkoholu",  "30 dní po sebe bez alkoholu", "strava", 30, hasAlcoholDay)),

  // Bez tvrdého alkoholu
  inChallenge("no_hard_alc", abstinenceStreakBadge("no_hard_alc_1",  "🥃", "Bez pálenky",        "1 deň bez tvrdého alkoholu",          "strava", 1,  hasHardAlcoholDay)),
  inChallenge("no_hard_alc", abstinenceStreakBadge("no_hard_alc_3",  "🥃", "Čistý víkend",       "3 dni po sebe bez tvrdého alkoholu",  "strava", 3,  hasHardAlcoholDay)),
  inChallenge("no_hard_alc", abstinenceStreakBadge("no_hard_alc_7",  "🥃", "Týždeň bez tvrdého", "7 dní po sebe bez tvrdého alkoholu",  "strava", 7,  hasHardAlcoholDay)),
  inChallenge("no_hard_alc", abstinenceStreakBadge("no_hard_alc_30", "🏅", "Mesiac bez tvrdého", "30 dní po sebe bez tvrdého alkoholu", "strava", 30, hasHardAlcoholDay)),

  // Míľniky (bez challengeId)
  countBadge("entries_10",  "🌱",  "Začiatočník", "10 zapísaných jedál",  10),
  countBadge("entries_100", "🍽️", "Foodlogger",  "100 zapísaných jedál", 100),
  dayBadge("perfect_day",   "⭐",  "Presný zásah","Deň v rozmedzí ±10 % kalorického cieľa", "míľnik", perfect),
];

// Katalóg typov sérií pre sekciu „Série a rekordy". Pre každý typ vieme určiť
// aktuálnu sériu, najdlhšiu (rekord) a progres k jeho prekonaniu.
export type StreakDef = {
  type: string;
  emoji: string;
  title: string;
  desc: string;
  pred: (ctx: BadgeContext) => (s: DailyStat) => boolean;
  // Ak true, pred(ctx) vracia predikát VÝSKYTU javu a séria sa počíta ako
  // „dni bez javu" (nelogované dni = bez javu) cez *AbstinenceStreak funkcie.
  abstinence?: boolean;
};

export const STREAKS: StreakDef[] = [
  { type: "cal", emoji: "🎯", title: "Kalorický cieľ", desc: "dni po sebe v kalorickom cieli", pred: inCalorieGoal },
  { type: "log", emoji: "📝", title: "Zápis jedál", desc: "dni po sebe so zapísaným jedlom", pred: () => logged },
  { type: "water", emoji: "💧", title: "Pitný režim", desc: "dni po sebe splnený cieľ vody", pred: metWater },
  { type: "fruit", emoji: "🍎", title: "Surové ovocie", desc: "dni po sebe so surovým ovocím", pred: () => hadFruit },
  { type: "veg", emoji: "🥗", title: "Surová zelenina", desc: "dni po sebe so surovou zeleninou", pred: () => hadVegetable },
  { type: "healthy", emoji: "🥦", title: "Zdravé dni", desc: "dni po sebe so zdravosťou ≥ 7", pred: () => healthy },
  { type: "protein", emoji: "🥤", title: "Proteínový šejk", desc: "dni po sebe s proteínovým šejkom", pred: () => hadProteinShake },
  { type: "no_sweets", emoji: "🚫🍭", title: "Bez sladkého", desc: "dni bez sladkého", pred: () => hasSweetsDay, abstinence: true },
  { type: "no_alcohol", emoji: "🚱", title: "Bez alkoholu", desc: "dni bez alkoholu", pred: () => hasAlcoholDay, abstinence: true },
  { type: "no_hard_alcohol", emoji: "🥃", title: "Bez tvrdého alkoholu", desc: "dni bez tvrdého alkoholu", pred: () => hasHardAlcoholDay, abstinence: true },
];

export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

// Kľúče odznakov, ktoré sú práve teraz splnené (na odomknutie).
export function satisfiedBadgeKeys(ctx: BadgeContext): string[] {
  return BADGES.filter((b) => b.evaluate(ctx).earned).map((b) => b.key);
}
