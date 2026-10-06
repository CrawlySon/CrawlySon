import { describe, expect, it } from "vitest";
import {
  BADGES,
  STREAKS,
  currentAbstinenceStreak,
  currentStreak,
  longestStreak,
  satisfiedBadgeKeys,
  shiftISO,
  type BadgeContext,
  type DailyStat,
} from "./badges";

function day(date: string, over: Partial<DailyStat> = {}): DailyStat {
  return {
    date,
    calories: 2000,
    protein: 150,
    healthScore: 7,
    hasFruit: false,
    hasVegetable: false,
    hasProteinShake: false,
    hasSweets: false,
    hasBread: false,
    hasAlcohol: false,
    hasHardAlcohol: false,
    waterMl: 2500,
    entryCount: 3,
    ...over,
  };
}

function ctxOf(today: string, days: DailyStat[], goals = { goalCalories: 2200, goalProtein: 150, goalWaterMl: 2500 }): BadgeContext {
  return { today, byDate: new Map(days.map((d) => [d.date, d])), ...goals, totalEntries: days.length * 3 };
}

describe("série", () => {
  it("currentStreak ide od dneška (alebo včerajška, ak dnes nič nie je) dozadu", () => {
    const ctx = ctxOf("2026-10-06", [day("2026-10-03"), day("2026-10-04"), day("2026-10-05")]);
    expect(currentStreak(ctx, () => true)).toBe(3);
  });

  it("deň s 300 kcal nie je „v cieli“ – séria kalorického cieľa vyžaduje úplný zápis", () => {
    const cal = STREAKS.find((s) => s.type === "cal")!;
    const ctx = ctxOf("2026-10-06", [day("2026-10-04", { calories: 2000 }), day("2026-10-05", { calories: 300 })]);
    expect(currentStreak(ctx, cal.pred(ctx))).toBe(0);
  });

  it("séria „bez alkoholu“ sa preruší nezapísaným dňom – nedá sa tvrdiť, že bol čistý", () => {
    const noAlc = STREAKS.find((s) => s.type === "no_alcohol")!;
    const ctx = ctxOf("2026-10-06", [day("2026-10-02"), day("2026-10-03"), /* 4. 10. chýba */ day("2026-10-05")]);
    expect(currentAbstinenceStreak(ctx, noAlc.pred(ctx))).toBe(1);
  });

  it("rozrobený dnešok sériu „bez…“ nezhadzuje", () => {
    const noSweets = STREAKS.find((s) => s.type === "no_sweets")!;
    const ctx = ctxOf("2026-10-06", [day("2026-10-04"), day("2026-10-05"), day("2026-10-06", { calories: 400, entryCount: 1 })]);
    expect(currentAbstinenceStreak(ctx, noSweets.pred(ctx))).toBe(3);
  });

  it("longestStreak nájde najdlhší úsek po sebe idúcich dní", () => {
    const ctx = ctxOf("2026-10-10", [day("2026-10-01"), day("2026-10-02"), day("2026-10-05"), day("2026-10-06"), day("2026-10-07")]);
    expect(longestStreak(ctx, () => true)).toBe(3);
  });
});

describe("odznaky", () => {
  it("katalóg má unikátne kľúče a každý má názov aj popis", () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of BADGES) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.desc.length).toBeGreaterThan(0);
    }
  });

  it("týždeň v kalorickom cieli odomkne cal_1, cal_3 a cal_7, nie cal_30", () => {
    const days = Array.from({ length: 7 }, (_, i) => day(shiftISO("2026-10-06", -i), { calories: 2000 }));
    const got = satisfiedBadgeKeys(ctxOf("2026-10-06", days));
    expect(got).toEqual(expect.arrayContaining(["cal_1", "cal_3", "cal_7"]));
    expect(got).not.toContain("cal_30");
  });

  it("presný zásah ±10 % cieľa", () => {
    const got = satisfiedBadgeKeys(ctxOf("2026-10-06", [day("2026-10-06", { calories: 2150 })]));
    expect(got).toContain("perfect_day");
  });
});
