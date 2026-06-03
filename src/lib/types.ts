export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Raňajky",
  lunch: "Obed",
  dinner: "Večera",
  snack: "Desiata / olovrant",
  other: "Iné",
};

export const MEAL_ORDER: MealType[] = ["breakfast", "snack", "lunch", "dinner", "other"];

// Položka navrhnutá AI (alebo zadaná ručne) pred uložením do denníka.
export type ParsedItem = {
  name: string;
  quantityGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  confidence: number; // 0..1
  assumption?: string; // čo AI predpokladala
};

export type Entry = {
  id: string;
  date: string;
  mealType: MealType;
  name: string;
  quantityGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  note: string | null;
  source: string;
  createdAt: string;
};

export type Totals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type Profile = {
  id: number;
  name: string;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: string | null;
  goalType: string | null;
  goalCalories: number;
  goalProtein: number;
  goalCarbs: number;
  goalFat: number;
};
