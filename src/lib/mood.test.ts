import { describe, expect, it } from "vitest";
import { moodForCommentKind, pigMood, type MoodFacts } from "./mood";

const base: MoodFacts = {
  entryCount: 5,
  calories: 1800,
  goalCalories: 2200,
  healthScore: 7,
  sweetsCount: 0,
  hasAlcohol: false,
  hasJunk: false,
  biggestItemKcal: 450,
  supperKcal: 0,
  isToday: true,
};

describe("pigMood", () => {
  it("prázdny deň = spí", () => {
    expect(pigMood({ ...base, entryCount: 0 })).toBe("sleeping");
  });
  it("v cieli a zdravo = spokojný", () => {
    expect(pigMood(base)).toBe("content");
  });
  it("blíži sa k limitu (85 %+) = podozrievavý, ale len pri rozrobenom dnešku", () => {
    expect(pigMood({ ...base, calories: 1900 })).toBe("suspicious");
    expect(pigMood({ ...base, calories: 1900, isToday: false })).toBe("content");
  });
  it("druhé sladké alebo druhá večera = podozrievavý", () => {
    expect(pigMood({ ...base, sweetsCount: 2 })).toBe("suspicious");
    expect(pigMood({ ...base, supperKcal: 350 })).toBe("suspicious");
  });
  it("prekročený cieľ, junk alebo tretie sladké = znechutený", () => {
    expect(pigMood({ ...base, calories: 2300 })).toBe("disgusted");
    expect(pigMood({ ...base, hasJunk: true })).toBe("disgusted");
    expect(pigMood({ ...base, sweetsCount: 3 })).toBe("disgusted");
  });
  it("alkohol, 900+ kcal položka alebo +30 % nad cieľ = šokovaný (vyhráva nad znechuteným)", () => {
    expect(pigMood({ ...base, hasAlcohol: true })).toBe("shocked");
    expect(pigMood({ ...base, biggestItemKcal: 950, calories: 2400 })).toBe("shocked");
    expect(pigMood({ ...base, calories: 3000 })).toBe("shocked");
  });
  it("odznak alebo rekord série = hrdý, aj pri horšom dni", () => {
    expect(pigMood({ ...base, calories: 2500, newBadge: true })).toBe("proud");
  });
  it("minulý nekompletný deň (pod 50 %) = podozrievavý – Rypák neverí", () => {
    expect(pigMood({ ...base, calories: 600, isToday: false })).toBe("suspicious");
  });
});

describe("moodForCommentKind", () => {
  it("mapuje druhy udalostí na výraz", () => {
    expect(moodForCommentKind("repeat")).toBe("disgusted");
    expect(moodForCommentKind("saladAfterBinge")).toBe("suspicious");
    expect(moodForCommentKind("healthy")).toBe("proud");
    expect(moodForCommentKind("random")).toBe("content");
    expect(moodForCommentKind("junk", "savage")).toBe("savage");
  });
});
