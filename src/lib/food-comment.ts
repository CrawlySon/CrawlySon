// Rozhodovanie, KEDY kouč okomentuje práve pridané jedlo, a podklady pre AI.
// Čisté funkcie bez DB – dajú sa testovať samostatne.
//
// Čaro je v náhodnosti: keby komentoval vždy, po týždni ho prestaneš vnímať.
// Ale nie čisto náhodne – výrazné veci (tretia klobása, nutella o polnoci,
// šalát po prejedení) komentuje skoro vždy, banality (káva, voda) skoro nikdy.

export type CommentItem = {
  name: string;
  calories: number;
  protein: number;
  category: string | null;
  healthIndex: number | null;
};

export type CommentContext = {
  hour: number; // lokálna hodina (Europe/Bratislava)
  added: CommentItem[]; // čo sa práve pridalo
  dayBefore: { calories: number; protein: number; entryCount: number }; // dnešok PRED pridaním
  goalCalories: number;
  goalProtein: number;
  todayNames: string[]; // názvy všetkých dnešných záznamov (vrátane práve pridaných)
};

export type Trigger = { kind: string; weight: number; note: string };

const JUNK_CAT_RX = /slad|fast ?food|alkohol/i;

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

export function commentTriggers(ctx: CommentContext): Trigger[] {
  const out: Trigger[] = [];
  const addedKcal = ctx.added.reduce((s, i) => s + i.calories, 0);
  const after = ctx.dayBefore.calories + addedKcal;
  const goal = ctx.goalCalories;

  for (const it of ctx.added) {
    const n = countToday(it.name, ctx.todayNames);
    if (n >= 2) {
      out.push({ kind: "repeat", weight: 0.9, note: `„${it.name}" je dnes už ${n}. krát` });
    }
  }

  if ((ctx.hour >= 22 || ctx.hour < 4) && addedKcal >= 150) {
    const big = [...ctx.added].sort((a, b) => b.calories - a.calories)[0];
    out.push({ kind: "late", weight: 0.8, note: `je ${ctx.hour}:00 a práve si pridal ${big.name} (${Math.round(big.calories)} kcal)` });
  }

  // Za „zdravú voľbu" berieme len skutočné jedlo – espresso či voda majú síce
  // vysokú zdravosť, ale je to banalita, ku ktorej sa kouč nemá vyjadrovať.
  const healthyNow = ctx.added.find(
    (i) => (i.healthIndex ?? 0) >= 8 && i.calories >= 40 && !(i.category && /nápoj|napoj/i.test(i.category))
  );
  if (healthyNow && goal > 0 && ctx.dayBefore.calories > goal) {
    out.push({
      kind: "saladAfterBinge",
      weight: 0.9,
      note: `zdravé jedlo (${healthyNow.name}) až potom, čo už mal ${Math.round(ctx.dayBefore.calories)} kcal pri cieli ${goal}`,
    });
  }

  if (goal > 0 && ctx.dayBefore.calories <= goal && after > goal) {
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
