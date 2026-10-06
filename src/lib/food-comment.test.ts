import { describe, expect, it } from "vitest";
import {
  applyFeedback,
  bumpStats,
  commentTriggers,
  countToday,
  feedbackFactor,
  shouldComment,
  type CommentItem,
  type DayEntry,
} from "./food-comment";

const item = (over: Partial<CommentItem> & { name: string }): CommentItem => ({
  calories: 100,
  protein: 5,
  category: null,
  healthIndex: 5,
  mealType: "lunch",
  ...over,
});
const entry = (name: string, calories: number, mealType: string | null = "lunch"): DayEntry => ({ name, calories, mealType });

describe("countToday", () => {
  it("počíta aj čiastočné zhody názvu („Klobása“ vs. „Bravčová klobása“)", () => {
    expect(countToday("Klobása", ["Bravčová klobása", "klobása", "Rožok"])).toBe(2);
  });
  it("príliš krátke názvy nepočíta", () => {
    expect(countToday("aj", ["čaj", "aj"])).toBe(0);
  });
});

describe("commentTriggers – kontext podľa jedla dňa, nie času zápisu", () => {
  it("tretia klobása dnes je najsilnejšia udalosť (repeat)", () => {
    const t = commentTriggers({
      added: [item({ name: "Klobása", calories: 300, category: "Mäso" })],
      others: [entry("Klobása", 300, "breakfast"), entry("Klobása", 300, "snack")],
      goalCalories: 2200,
      goalProtein: 150,
    });
    expect(t[0].kind).toBe("repeat");
    expect(t[0].note).toContain("3. krát");
  });

  it("prekročenie cieľa sa počíta z jedál DO daného jedla dňa – večera zapísaná pred obedom nehrá rolu", () => {
    // Do obeda bolo 1 900, obed 400 → prekročí 2 200. Večera (dinner) je „neskôr“, nepočíta sa do „before“.
    const t = commentTriggers({
      added: [item({ name: "Rezeň", calories: 400, mealType: "lunch" })],
      others: [entry("Raňajky", 1900, "breakfast"), entry("Večera", 900, "dinner")],
      goalCalories: 2200,
      goalProtein: 150,
    });
    expect(t.some((x) => x.kind === "crossedGoal")).toBe(true);
    const crossed = t.find((x) => x.kind === "crossedGoal")!;
    expect(crossed.note).toContain("2300");
  });

  it("šalát po prejedení: zdravé jedlo až po prekročení cieľa", () => {
    const t = commentTriggers({
      added: [item({ name: "Šalát", calories: 120, healthIndex: 9, category: "Zelenina", mealType: "dinner" })],
      others: [entry("Pizza", 2300, "lunch")],
      goalCalories: 2200,
      goalProtein: 150,
    });
    expect(t[0].kind).toBe("saladAfterBinge");
    expect(t.some((x) => x.kind === "healthy")).toBe(false);
  });

  it("espresso bez udalosti nespustí nič", () => {
    const t = commentTriggers({
      added: [item({ name: "Espresso", calories: 5, healthIndex: 7, category: "Nápoje" })],
      others: [],
      goalCalories: 2200,
      goalProtein: 150,
    });
    expect(t).toEqual([]);
  });

  it("druhá večera so 150+ kcal je lateMeal", () => {
    const t = commentTriggers({
      added: [item({ name: "Chlieb s maslom", calories: 250, mealType: "supper" })],
      others: [],
      goalCalories: 2200,
      goalProtein: 150,
    });
    expect(t.some((x) => x.kind === "lateMeal")).toBe(true);
  });
});

describe("shouldComment", () => {
  it("bez udalosti komentuje zriedka (~8 %)", () => {
    expect(shouldComment([], null, () => 0.05)).toBe(true);
    expect(shouldComment([], null, () => 0.2)).toBe(false);
  });
  it("cooldown 15 minút znižuje šancu, ale nie pri silnej udalosti", () => {
    const weak = [{ kind: "healthy", weight: 0.5, note: "" }];
    const strong = [{ kind: "repeat", weight: 0.9, note: "" }];
    expect(shouldComment(weak, 5, () => 0.3)).toBe(false); // 0.5 × 0.25 = 0.125
    expect(shouldComment(strong, 5, () => 0.3)).toBe(true);
  });
});

describe("učenie z 👍/👎 – kedy sa ozvať", () => {
  it("faktor je 1 bez dát a ohraničený 0,5–1,5", () => {
    expect(feedbackFactor(null, "junk")).toBe(1);
    expect(feedbackFactor({ junk: { up: 100, down: 0 } }, "junk")).toBeCloseTo(1.49, 1);
    expect(feedbackFactor({ junk: { up: 0, down: 100 } }, "junk")).toBeCloseTo(0.51, 1);
  });
  it("bumpStats pripočíta hlas a applyFeedback drží strop 0,95", () => {
    let stats = bumpStats(null, "repeat", 1);
    stats = bumpStats(stats, "repeat", 1);
    expect(stats.repeat).toEqual({ up: 2, down: 0 });
    const t = applyFeedback([{ kind: "repeat", weight: 0.9, note: "" }], { repeat: { up: 50, down: 0 } });
    expect(t[0].weight).toBeLessThanOrEqual(0.95);
  });
});
