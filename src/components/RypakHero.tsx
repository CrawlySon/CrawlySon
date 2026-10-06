"use client";

import { useMemo } from "react";
import Pig from "@/components/Pig";
import { ambientLine } from "@/lib/ambient";
import { isAlcohol } from "@/lib/food-tags";
import { MOOD_LABEL, pigMood, type PigMood } from "@/lib/mood";
import { round } from "@/lib/nutrition";
import { personaOf, type Entry, type Profile, type Totals } from "@/lib/types";

// Hero karta „Dnes“: Rypák s náladou dňa a hláškou, pod ním čísla dňa.
// Nálada aj záložná hláška sú deterministické (bez AI); posledná skutočná
// hláška z bubliny má prednosť, kým je čerstvá.
export default function RypakHero({
  date,
  isToday,
  entries,
  totals,
  profile,
  healthScore,
  lastLine,
  event,
}: {
  date: string;
  isToday: boolean;
  entries: Entry[];
  totals: Totals;
  profile: Profile;
  healthScore: number | null;
  lastLine?: string | null;
  event?: { newBadge?: boolean; streakRecord?: boolean };
}) {
  const persona = personaOf(profile);
  const goal = profile.goalCalories;

  const mood: PigMood = useMemo(() => {
    const sweets = entries.filter((e) => /slad/i.test(e.category || "")).length;
    const hasAlcohol = entries.some((e) => isAlcohol(e));
    const hasJunk = entries.some(
      (e) => /fast ?food/i.test(e.category || "") || (e.healthIndex != null && e.healthIndex <= 2 && e.calories >= 150)
    );
    const biggest = entries.reduce((m, e) => Math.max(m, e.calories), 0);
    const supperKcal = entries.filter((e) => e.mealType === "supper").reduce((s, e) => s + e.calories, 0);
    return pigMood({
      entryCount: entries.length,
      calories: totals.calories,
      goalCalories: goal,
      healthScore,
      sweetsCount: sweets,
      hasAlcohol,
      hasJunk,
      biggestItemKcal: biggest,
      supperKcal,
      newBadge: event?.newBadge,
      streakRecord: event?.streakRecord,
      isToday,
    });
  }, [entries, totals.calories, goal, healthScore, event, isToday]);

  const line = lastLine || ambientLine(mood, persona, `${date}:${mood}:${entries.length}`);
  const over = goal > 0 ? totals.calories - goal : 0;
  const pct = goal > 0 ? Math.min(100, (totals.calories / goal) * 100) : 0;
  const verdict =
    goal <= 0 ? null : over > goal * 0.3 ? ["Nálet", "stamp-bad"] : over > 0 ? ["Nad limitom", "stamp-bad"] : pct >= 85 ? ["Tesne", "stamp-warn"] : isToday ? ["Zatiaľ v limite", "stamp-good"] : ["V limite", "stamp-good"];

  return (
    <section className="space-y-3">
      <div className="card-raised flex items-start gap-3 p-3">
        <Pig mood={mood} size={104} title={`Rypák – ${MOOD_LABEL[mood]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow text-bad">Rypák hovorí</span>
            <span className="chip py-0.5 text-[10px]">{MOOD_LABEL[mood]}</span>
          </div>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">{line}</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{isToday ? "Dnes zjedené" : "Zjedené"}</div>
            <div className="flex items-baseline gap-2">
              <span className="display text-[40px] leading-none text-ink">{round(totals.calories).toLocaleString("sk-SK")}</span>
              <span className="text-sm font-semibold text-muted">/ {goal.toLocaleString("sk-SK")} kcal</span>
            </div>
          </div>
          {verdict && <span className={`${verdict[1]} mt-1 whitespace-nowrap`}>{verdict[0]}</span>}
        </div>
        <div className="mt-3 h-3.5 border-2 border-ink bg-paper">
          <div
            className={`h-full border-r-2 border-ink transition-all duration-500 ${over > 0 ? "bg-bad" : "bg-pig"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Macro label="Bielkoviny" value={totals.protein} goal={profile.goalProtein} tone="ink" />
          <Macro label="Sacharidy" value={totals.carbs} goal={profile.goalCarbs} tone="warn" />
          <Macro label="Tuky" value={totals.fat} goal={profile.goalFat} tone="bad-when-over" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            {over <= 0 ? (
              <>
                Ostáva <b className="text-ink">{round(-over)} kcal</b>
              </>
            ) : (
              <>
                Nad limitom o <b className="text-bad">{round(over)} kcal</b>
              </>
            )}
          </span>
          {healthScore != null && (
            <span>
              zdravosť{" "}
              <b className={healthScore >= 7 ? "text-good" : healthScore >= 4 ? "text-warn-text" : "text-bad"}>
                {healthScore}/10
              </b>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Macro({ label, value, goal, tone }: { label: string; value: number; goal: number; tone: "ink" | "warn" | "bad-when-over" }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal > 0 && value > goal;
  const bar = tone === "ink" ? "bg-ink" : tone === "warn" ? "bg-warn" : over ? "bg-bad" : "bg-ink";
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-muted">{label}</span>
        <span className={over && tone === "bad-when-over" ? "text-bad" : "text-ink"}>
          {round(value)}/{goal}
        </span>
      </div>
      <div className="mt-1 h-2 border border-ink bg-paper">
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
