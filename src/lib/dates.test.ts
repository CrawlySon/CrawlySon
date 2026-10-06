import { describe, expect, it } from "vitest";
import { daysBetween, formatDayLabel, isISODate, monthStartISO, shiftISO, todayISO, weekStartISO } from "./dates";

describe("dates (lokálne, bez UTC posunu)", () => {
  it("shiftISO nemení deň pri posune 0 – chyba, ktorá posúvala Analytiku", () => {
    // Pôvodná implementácia cez toISOString() vrátila v Europe/Bratislava 2026-10-05.
    expect(shiftISO("2026-10-06", 0)).toBe("2026-10-06");
    expect(shiftISO("2026-10-06", -1)).toBe("2026-10-05");
    expect(shiftISO("2026-10-06", 1)).toBe("2026-10-07");
  });

  it("shiftISO prechádza cez mesiac, rok aj priestupný február", () => {
    expect(shiftISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftISO("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("shiftISO prechádza cez zmenu letného času bez straty dňa", () => {
    // 29. 3. 2026 je v SK prechod na letný čas (deň má 23 hodín).
    expect(shiftISO("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftISO("2026-03-29", 1)).toBe("2026-03-30");
    expect(shiftISO("2026-10-25", 1)).toBe("2026-10-26"); // zimný čas, 25 hodín
  });

  it("daysBetween počíta celé dni aj cez DST", () => {
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-06", "2026-10-01")).toBe(-5);
  });

  it("weekStartISO vracia pondelok", () => {
    expect(weekStartISO("2026-10-06")).toBe("2026-10-05"); // utorok → pondelok
    expect(weekStartISO("2026-10-05")).toBe("2026-10-05"); // pondelok ostáva
    expect(weekStartISO("2026-10-11")).toBe("2026-10-05"); // nedeľa patrí k predchádzajúcemu pondelku
  });

  it("monthStartISO", () => {
    expect(monthStartISO("2026-10-06")).toBe("2026-10-01");
  });

  it("isISODate prijme len existujúce dni", () => {
    expect(isISODate("2026-10-06")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("6.10.2026")).toBe(false);
    expect(isISODate(20261006)).toBe(false);
    expect(isISODate("")).toBe(false);
  });

  it("todayISO a formatDayLabel pracujú s lokálnym časom", () => {
    const now = new Date(2026, 9, 6, 0, 30); // 6. 10. 2026 00:30 lokálne – v UTC ešte 5. 10.
    expect(todayISO(now)).toBe("2026-10-06");
    expect(formatDayLabel("2026-10-06", now)).toBe("Dnes");
    expect(formatDayLabel("2026-10-05", now)).toBe("Včera");
    expect(formatDayLabel("2026-10-01", now)).toMatch(/1\. októbra/);
  });
});
