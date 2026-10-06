// Rozhodovanie, KEDY kouč okomentuje práve pridané jedlo, a podklady pre AI.
// Čisté funkcie bez DB – dajú sa testovať samostatne.
//
// Čaro je v náhodnosti: keby komentoval vždy, po týždni ho prestaneš vnímať.
// Ale nie čisto náhodne – výrazné veci (tretia klobása, šalát po prejedení)
// komentuje skoro vždy, banality (káva, voda) skoro nikdy.
//
// DÔLEŽITÉ: nič sa neodvodzuje od času ZÁPISU. Ľudia zapisujú hromadne a
// spätne – ranná káva zapísaná o 21:00 je stále raňajková káva. Poradie dňa
// sa preto berie podľa jedla dňa (raňajky → … → druhá večera), nie podľa hodín.

export type CommentItem = {
  name: string;
  calories: number;
  protein: number;
  category: string | null;
  healthIndex: number | null;
  mealType?: string | null;
};

export type DayEntry = { name: string; calories: number; mealType: string | null };

export type CommentContext = {
  added: CommentItem[]; // čo sa práve pridalo (aj s jedlom dňa)
  others: DayEntry[]; // ostatné dnešné záznamy BEZ práve pridaných
  goalCalories: number;
  goalProtein: number;
};

export type Trigger = { kind: string; weight: number; note: string };

export const MEAL_ORDER = ["breakfast", "snack", "lunch", "afternoon", "dinner", "supper", "other"];
export const MEAL_SK: Record<string, string> = {
  breakfast: "raňajky",
  snack: "desiata",
  lunch: "obed",
  afternoon: "olovrant",
  dinner: "večera",
  supper: "druhá večera",
  other: "iné",
};

// Neznáme jedlo dňa („iné") radíme na koniec – o jeho poradí nič nevieme.
function slot(meal: string | null | undefined): number {
  const i = MEAL_ORDER.indexOf(meal || "other");
  return i < 0 ? MEAL_ORDER.length - 1 : i;
}

const JUNK_CAT_RX = /slad|fast ?food|alkohol/i;
const DRINK_CAT_RX = /nápoj|napoj/i;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Koľkokrát sa „to isté" jedlo objavilo dnes. Názvy sa líšia („Klobása" vs.
// „Bravčová klobása"), preto stačí, keď jeden obsahuje druhý.
export function countToday(name: string, todayNames: string[]): number {
  const n = norm(name);
  if (n.length < 3) return 0;
  return todayNames.filter((t) => {
    const x = norm(t);
    return x === n || x.includes(n) || n.includes(x);
  }).length;
}

// Jedlo, na ktoré sa komentár sústredí – najkalorickejšie z pridaných.
export function focusItem(added: CommentItem[]): CommentItem {
  return [...added].sort((a, b) => b.calories - a.calories)[0];
}

export function commentTriggers(ctx: CommentContext): Trigger[] {
  const out: Trigger[] = [];
  const goal = ctx.goalCalories;
  const focus = focusItem(ctx.added);
  const s = slot(focus.mealType);

  // Čo bolo zjedené „do tohto jedla dňa" – podľa poradia jedál, nie zápisu.
  const before = ctx.others.filter((e) => slot(e.mealType) <= s).reduce((t, e) => t + e.calories, 0);
  const addedKcal = ctx.added.reduce((t, i) => t + i.calories, 0);
  const after = before + addedKcal;
  const todayNames = [...ctx.others.map((e) => e.name), ...ctx.added.map((a) => a.name)];

  for (const it of ctx.added) {
    const n = countToday(it.name, todayNames);
    if (n >= 2) {
      out.push({ kind: "repeat", weight: 0.9, note: `„${it.name}" je dnes už ${n}. krát` });
    }
  }

  if (focus.mealType === "supper" && addedKcal >= 150) {
    out.push({
      kind: "lateMeal",
      weight: 0.8,
      note: `do druhej večere si pridal ${focus.name} (${Math.round(focus.calories)} kcal)`,
    });
  }

  const healthyNow = ctx.added.find(
    (i) => (i.healthIndex ?? 0) >= 8 && i.calories >= 40 && !(i.category && DRINK_CAT_RX.test(i.category))
  );
  if (healthyNow && goal > 0 && before > goal) {
    out.push({
      kind: "saladAfterBinge",
      weight: 0.9,
      note: `zdravé jedlo (${healthyNow.name}) až po tom, čo už mal do ${MEAL_SK[focus.mealType || "other"]} ${Math.round(before)} kcal pri cieli ${goal}`,
    });
  }

  if (goal > 0 && before <= goal && after > goal) {
    out.push({ kind: "crossedGoal", weight: 0.85, note: `týmto prekročil denný cieľ ${goal} kcal (teraz ${Math.round(after)})` });
  }

  for (const it of ctx.added) {
    const junkCat = it.category != null && JUNK_CAT_RX.test(it.category);
    if (it.calories >= 500 || junkCat || (it.healthIndex != null && it.healthIndex <= 3 && it.calories >= 150)) {
      out.push({ kind: "junk", weight: 0.7, note: `${it.name} (${Math.round(it.calories)} kcal${it.category ? `, ${it.category}` : ""})` });
      break;
    }
  }

  if (healthyNow && !out.some((t) => t.kind === "saladAfterBinge")) {
    out.push({ kind: "healthy", weight: 0.5, note: `zdravá voľba: ${healthyNow.name}` });
  }

  const protein = ctx.added.find((i) => i.protein >= 25);
  if (protein) out.push({ kind: "protein", weight: 0.4, note: `${protein.name} s ${Math.round(protein.protein)} g bielkovín` });

  return out.sort((a, b) => b.weight - a.weight);
}

// Či sa má komentovať. Bez výraznej udalosti len zriedka, a nie dve hlášky
// tesne po sebe – výnimkou sú naozaj silné momenty.
export function shouldComment(
  triggers: Trigger[],
  minutesSinceLast: number | null,
  rand: () => number = Math.random
): boolean {
  let p = triggers.length ? triggers[0].weight : 0.08;
  const strong = triggers.length > 0 && triggers[0].weight >= 0.85;
  if (minutesSinceLast != null && minutesSinceLast < 15 && !strong) p *= 0.25;
  return rand() < p;
}
