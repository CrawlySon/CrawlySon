import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimit, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimit());

  it("povolí `limit` pokusov v okne a potom odmietne s retryAfter", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 60_000, t0 + i).ok).toBe(true);
    const r = rateLimit("k", 5, 60_000, t0 + 10);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("po uplynutí okna sa pokusy uvoľnia", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, t0);
    expect(rateLimit("k", 5, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("kľúče sú nezávislé", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000, 1);
    expect(rateLimit("b", 5, 60_000, 1).ok).toBe(true);
  });
});
