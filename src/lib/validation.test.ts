import { describe, expect, it } from "vitest";
import { dateOr, foodItemSchema, mealTypeSchema, numberish, nullableNumberish } from "./validation";

describe("validation", () => {
  it("numberish prijme číslo aj reťazec s čiarkou, odmietne NaN", () => {
    expect(numberish().parse("82,4")).toBe(82.4);
    expect(numberish().parse(12)).toBe(12);
    expect(numberish().parse("")).toBeUndefined();
    expect(() => numberish().parse("abc")).toThrow();
    expect(() => numberish({ min: 0 }).parse(-1)).toThrow();
  });

  it("nullableNumberish mapuje prázdne na null", () => {
    expect(nullableNumberish().parse("")).toBeNull();
    expect(nullableNumberish().parse(null)).toBeNull();
    expect(nullableNumberish().parse("5")).toBe(5);
  });

  it("foodItemSchema opraví nezmysly namiesto pádu – zápis jedla nesmie zlyhať na NaN", () => {
    const it1 = foodItemSchema.parse({ name: "Rožok", calories: "abc", protein: null, mealType: "brunch", healthIndex: 42 });
    expect(it1.name).toBe("Rožok");
    expect(it1.calories).toBe(0);
    expect(it1.protein).toBe(0);
    expect(it1.mealType).toBeUndefined();
    expect(it1.healthIndex).toBeNull();
  });

  it("foodItemSchema drží platné hodnoty", () => {
    const it1 = foodItemSchema.parse({ name: " Makovník ", quantityGrams: 160, calories: 410, protein: 8, carbs: 58, fat: 16, category: "Sladké", mealType: "afternoon" });
    expect(it1).toMatchObject({ name: "Makovník", quantityGrams: 160, calories: 410, category: "Sladké", mealType: "afternoon" });
  });

  it("mealTypeSchema a dateOr", () => {
    expect(mealTypeSchema.safeParse("lunch").success).toBe(true);
    expect(mealTypeSchema.safeParse("brunch").success).toBe(false);
    expect(dateOr("2026-10-06", "2026-01-01")).toBe("2026-10-06");
    expect(dateOr("zajtra", "2026-01-01")).toBe("2026-01-01");
    expect(dateOr(undefined, "2026-01-01")).toBe("2026-01-01");
  });
});
