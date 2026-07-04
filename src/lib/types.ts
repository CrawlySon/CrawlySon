export type MealType = "breakfast" | "snack" | "lunch" | "afternoon" | "dinner" | "supper" | "other";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Raňajky",
  snack: "Desiata",
  lunch: "Obed",
  afternoon: "Olovrant",
  dinner: "Večera",
  supper: "Druhá večera",
  other: "Iné",
};

export const MEAL_ORDER: MealType[] = ["breakfast", "snack", "lunch", "afternoon", "dinner", "supper", "other"];

// Položka navrhnutá AI (alebo zadaná ručne) pred uložením do denníka.
export type ParsedItem = {
  name: string;
  quantityGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  category: string | null;
  subcategory: string | null;
  healthIndex: number | null; // 0..10
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
  category: string | null;
  subcategory: string | null;
  healthIndex: number | null;
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

export type FavoriteItem = {
  name: string;
  quantityGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  category: string | null;
  subcategory: string | null;
  healthIndex: number | null;
};

export type Favorite = {
  id: string;
  name: string;
  mealType: MealType;
  items: FavoriteItem[];
  useCount: number;
  createdAt: string;
};

export type Profile = {
  id: string;
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
  goalWaterMl: number;
  waterRemind?: boolean;
  waterReminders?: { hour: number; minMl: number }[] | null;
  coachRemind?: boolean;
};

export type Badge = {
  key: string;
  emoji: string;
  title: string;
  desc: string;
  group: string;
  challengeId?: string;
  earned: boolean;
  earnedAt: string | null;
  current: number | null;
  target: number | null;
};

export type Streak = {
  type: string;
  emoji: string;
  title: string;
  desc: string;
  current: number;
  best: number;
  isRecord: boolean;
};
