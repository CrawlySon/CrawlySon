// Nálada maskota Rypáka – odvodená DETERMINISTICKY z čísel dňa, bez AI.
// Výraz je okamžitý, zadarmo a testovateľný; AI píše len text hlášok.
//
// Poradie pravidiel je dôležité: najsilnejšia udalosť vyhráva. Hodnoty
// prahov zodpovedajú doménovým pravidlám z badges.ts / food-comment.ts
// (úplný deň = 50 % cieľa, „junk“ = alkohol / fast food / sladké).

export type PigMood =
  | "sleeping" // nič nezapísané
  | "content" // v cieli, zdravý deň
  | "suspicious" // blíži sa limit, druhé sladké, druhá večera
  | "disgusted" // limit prekročený, fast food, tretí sladký
  | "shocked" // veľký nálet naraz, alkohol, 900+ kcal položka
  | "proud" // rekord série, nový odznak, týždeň v cieli
  | "savage"; // 4. úroveň „bez servítky“ (len vizuálny variant)

export type MoodFacts = {
  entryCount: number;
  calories: number;
  goalCalories: number;
  healthScore: number | null; // 0..10
  sweetsCount: number; // koľko položiek v kategórii Sladké
  hasAlcohol: boolean;
  hasJunk: boolean; // fast food / healthIndex ≤ 2 s ≥ 150 kcal
  biggestItemKcal: number; // najkalorickejšia položka dňa
  supperKcal: number; // kcal v druhej večeri
  // udalosti mimo jedla
  newBadge?: boolean;
  streakRecord?: boolean;
  // rozpracovaný deň? (dnešok) – pri minulých dňoch sa „blíži sa limit“ nehodnotí
  isToday?: boolean;
};

export function pigMood(f: MoodFacts): PigMood {
  if (f.entryCount === 0) return "sleeping";
  if (f.newBadge || f.streakRecord) return "proud";

  const goal = f.goalCalories > 0 ? f.goalCalories : null;
  const over = goal != null && f.calories > goal;
  const ratio = goal != null ? f.calories / goal : 0;

  if (f.hasAlcohol || f.biggestItemKcal >= 900 || (goal != null && f.calories > goal * 1.3)) return "shocked";
  if (over || f.hasJunk || f.sweetsCount >= 3) return "disgusted";
  if (f.sweetsCount >= 2 || f.supperKcal >= 300 || (f.isToday && goal != null && ratio >= 0.85)) return "suspicious";
  if (goal != null && !f.isToday && ratio < 0.5) return "suspicious"; // nekompletný deň – Rypák neverí
  return "content";
}

export const MOOD_LABEL: Record<PigMood, string> = {
  sleeping: "Spí",
  content: "Spokojný",
  suspicious: "Podozrievavý",
  disgusted: "Znechutený",
  shocked: "Šokovaný",
  proud: "Hrdý",
  savage: "Bez servítky",
};

// Nálada podľa druhu udalosti bubliny (api/comment vracia `kind`).
export function moodForCommentKind(kind: string | undefined | null, persona?: string | null): PigMood {
  if (persona === "savage") return "savage";
  switch (kind) {
    case "repeat":
    case "junk":
    case "crossedGoal":
      return "disgusted";
    case "saladAfterBinge":
    case "lateMeal":
      return "suspicious";
    case "alcohol":
    case "binge":
      return "shocked";
    case "healthy":
    case "protein":
    case "workout":
      return "proud";
    default:
      return "content";
  }
}
