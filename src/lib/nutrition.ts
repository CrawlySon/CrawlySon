import type { Entry, Totals } from "./types";

export function emptyTotals(): Totals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

export function sumTotals(entries: Pick<Entry, "calories" | "protein" | "carbs" | "fat" | "fiber">[]): Totals {
  return entries.reduce<Totals>((acc, e) => {
    acc.calories += e.calories || 0;
    acc.protein += e.protein || 0;
    acc.carbs += e.carbs || 0;
    acc.fat += e.fat || 0;
    acc.fiber += e.fiber || 0;
    return acc;
  }, emptyTotals());
}

export function round(n: number, decimals = 0): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// Mifflin–St Jeor BMR
export function bmr(sex: string | null, weightKg: number | null, heightCm: number | null, age: number | null): number | null {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "female") return base - 161;
  return base + 5; // default male
}

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function tdee(
  sex: string | null,
  weightKg: number | null,
  heightCm: number | null,
  age: number | null,
  activity: string | null
): number | null {
  const b = bmr(sex, weightKg, heightCm, age);
  if (b == null) return null;
  const factor = ACTIVITY_FACTORS[activity || "moderate"] ?? 1.55;
  return Math.round(b * factor);
}

// Odporúčaný denný príjem podľa cieľa
export function recommendedCalories(
  sex: string | null,
  weightKg: number | null,
  heightCm: number | null,
  age: number | null,
  activity: string | null,
  goalType: string | null
): number | null {
  const t = tdee(sex, weightKg, heightCm, age, activity);
  if (t == null) return null;
  if (goalType === "lose") return Math.round(t - 400);
  if (goalType === "gain") return Math.round(t + 300);
  return t;
}

// Návrh rozdelenia makier z kalórií (g): 30% B / 40% S / 30% T
export function suggestedMacros(calories: number): { protein: number; carbs: number; fat: number } {
  return {
    protein: Math.round((calories * 0.3) / 4),
    carbs: Math.round((calories * 0.4) / 4),
    fat: Math.round((calories * 0.3) / 9),
  };
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
