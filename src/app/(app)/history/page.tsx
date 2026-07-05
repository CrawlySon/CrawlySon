"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCache, setCache } from "@/lib/page-cache";
import { round } from "@/lib/nutrition";
import type { Profile } from "@/lib/types";

type Day = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
  healthScore: number | null;
  catCalories: number;
  catCount: number;
  waterMl: number;
};
type Category = { name: string; calories: number; count: number };
type HistoryState = { days: Day[]; categories: Category[] };

// --- helpers ----------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function shiftISO(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function weekStartISO(dateISO: string): string {
  const dt = new Date(dateISO + "T00:00:00");
  const day = dt.getDay(); // 0=Sun
  dt.setDate(dt.getDate() - ((day + 6) % 7)); // align to Monday
  return dt.toISOString().slice(0, 10);
}

function computeGranularity(rangeDays: number): "daily" | "weekly" | "monthly" {
  if (rangeDays <= 35) return "daily";
  if (rangeDays <= 91) return "weekly";
  return "monthly";
}

function rollingMedian(values: number[], halfWin = 3): (number | null)[] {
  return values.map((_, i) => {
    const slice = values
      .slice(Math.max(0, i - halfWin), Math.min(values.length, i + halfWin + 1))
      .filter((v) => v > 0);
    if (slice.length < 2) return null;
    const s = [...slice].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  });
}

function catmullRomPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

function aggregateSeries(
  allDates: string[],
  valueByDate: Map<string, number>,
  granularity: "weekly" | "monthly",
  skipZero: boolean
): { label: string; value: number }[] {
  const groups = new Map<string, { sum: number; count: number }>();
  const order: string[] = [];
  for (const date of allDates) {
    const key = granularity === "weekly" ? weekStartISO(date) : date.slice(0, 7);
    if (!groups.has(key)) { groups.set(key, { sum: 0, count: 0 }); order.push(key); }
    const g = groups.get(key)!;
    const v = valueByDate.get(date) ?? 0;
    if (!skipZero || v > 0) { g.sum += v; g.count++; }
  }
  return order.map((key) => {
    const g = groups.get(key)!;
    let label: string;
    if (granularity === "weekly") {
      const [, m, d] = key.split("-");
      label = `${parseInt(d)}.${parseInt(m)}.`;
    } else {
      label = new Date(key + "-01T00:00:00").toLocaleDateString("sk-SK", { month: "short" });
    }
    return { label, value: g.count > 0 ? g.sum / g.count : 0 };
  });
}

// --- healthText -------------------------------------------------------------

function healthText(h: number): string {
  if (h >= 7) return "text-brand-700";
  if (h >= 4) return "text-amber-600";
  return "text-red-600";
}

const historyKey = (from: string, to: string, cat: string) => `history:${from}:${to}:${cat}`;

// --- component --------------------------------------------------------------

export default function HistoryPage() {
  const today = todayISO();
  const defaultFrom = shiftISO(today, -13);

  const [days, setDays] = useState<Day[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profile, setProfile] = useState<Profile | null>(() => getCache<Profile>("profile") ?? null);

  // range: preset (number of days) or "custom"
  const [preset, setPreset] = useState<7 | 14 | 30 | "custom">(14);
  const [customFrom, setCustomFrom] = useState(shiftISO(today, -29));
  const [customTo, setCustomTo] = useState(today);

  const [category, setCategory] = useState<string>("");
  const [catOpen, setCatOpen] = useState(false);
  const [metric, setMetric] = useState<"kcal" | "health" | "water">("kcal");
  const [showMedian, setShowMedian] = useState(false);
  const [loading, setLoading] = useState(true);

  // Effective date range
  const fromDate = preset === "custom" ? customFrom : shiftISO(today, -(preset - 1));
  const toDate = preset === "custom" ? customTo : today;
  const rangeDays = daysBetween(fromDate, toDate) + 1;

  // Aggregation: presets always stay daily for the full-detail view
  const granularity = preset === "custom" ? computeGranularity(rangeDays) : "daily";
  const isDaily = granularity === "daily";

  useEffect(() => {
    const key = historyKey(fromDate, toDate, category);
    const cached = getCache<HistoryState>(key);
    if (cached) {
      setDays(cached.days);
      if (!category) setCategories(cached.categories);
    }
    setLoading(cached === undefined);
    api.history(fromDate, toDate, category || undefined).then((d) => {
      setDays(d.days);
      if (!category) setCategories(d.categories);
      setCache(key, { days: d.days, categories: d.categories });
      setLoading(false);
    });
  }, [fromDate, toDate, category]);

  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p.profile);
      setCache("profile", p.profile);
    });
  }, []);

  const goal = profile?.goalCalories || 2000;
  const avg = days.length ? days.reduce((s, d) => s + d.calories, 0) / days.length : 0;
  const healthDays = days.filter((d) => d.healthScore != null);
  const avgHealth = healthDays.length
    ? healthDays.reduce((s, d) => s + (d.healthScore || 0), 0) / healthDays.length
    : null;
  const avgWater = days.length ? days.reduce((s, d) => s + (d.waterMl || 0), 0) / days.length : 0;

  const max = Math.max(goal, ...days.map((d) => d.calories), 1);
  const catMax = Math.max(...days.map((d) => d.catCalories), 1);

  // Build allDates list (fromDate → toDate inclusive)
  const allDates: string[] = Array.from({ length: rangeDays }, (_, i) => shiftISO(fromDate, i));

  // Value per date for current metric
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const isHealthMetric = metric === "health" && !category;
  const valueByDate = new Map<string, number>();
  for (const date of allDates) {
    const d = dayMap.get(date);
    let v = 0;
    if (d) {
      if (category) v = d.catCalories;
      else if (metric === "kcal") v = d.calories;
      else if (metric === "health") v = d.healthScore ?? 0;
      else v = Math.round((d.waterMl / 1000) * 10) / 10;
    }
    valueByDate.set(date, v);
  }

  // Chart series
  const chartSeries: { label: string; value: number }[] = isDaily
    ? allDates.map((date) => {
        const [, m, dd] = date.split("-");
        return { label: `${parseInt(dd)}.${parseInt(m)}.`, value: valueByDate.get(date) ?? 0 };
      })
    : aggregateSeries(allDates, valueByDate, granularity, isHealthMetric);

  // 7-day rolling median (only daily mode, only when toggled)
  const dailyValues = allDates.map((d) => valueByDate.get(d) ?? 0);
  const medianValues: (number | null)[] = isDaily && showMedian ? rollingMedian(dailyValues) : [];

  const chartGoal = category ? null : metric === "kcal" ? goal : metric === "water" ? (profile ? profile.goalWaterMl / 1000 : null) : null;
  const chartMax = Math.max(...chartSeries.map((s) => s.value), chartGoal || 0, isHealthMetric ? 10 : 0, 1);
  const chartUnit = category || metric === "kcal" ? " kcal" : metric === "water" ? " l" : "";

  function colorFor(v: number): string {
    const BLUE = "#3b82f6", AMBER = "#f59e0b", RED = "#ef4444", WATER = "#0ea5e9";
    if (v <= 0) return "#e2e8f0";
    if (category) return BLUE;
    if (metric === "kcal") {
      if (v <= goal) return BLUE;
      if (v <= goal * 1.5) return AMBER;
      return RED;
    }
    if (metric === "water") return WATER;
    const hue = Math.round(Math.max(0, Math.min(10, v)) / 10 * 220);
    return `hsl(${hue}, 88%, 48%)`;
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800">
        Analytika
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />}
      </h1>

      {/* Range selector */}
      <div className="mb-3 flex flex-wrap gap-2">
        {([7, 14, 30] as const).map((r) => (
          <button
            key={r}
            onClick={() => setPreset(r)}
            className={`rounded-full px-3 py-1.5 text-sm ${preset === r ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {r} dní
          </button>
        ))}
        <button
          onClick={() => setPreset("custom")}
          className={`rounded-full px-3 py-1.5 text-sm ${preset === "custom" ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
        >
          Vlastný
        </button>
      </div>

      {/* Custom date pickers */}
      {preset === "custom" && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] text-slate-400">Od</p>
            <input
              type="date"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] text-slate-400">Do</p>
            <input
              type="date"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setCatOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 truncate text-slate-700">
              <span className="text-slate-400">Kategória:</span>
              <span className="truncate font-medium">{category || "Všetko"}</span>
              {category && (
                <span className="shrink-0 text-xs text-slate-400">
                  {categories.find((c) => c.name === category)?.calories ?? 0} kcal
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {category && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setCategory(""); setCatOpen(false); }}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                >
                  ✕
                </span>
              )}
              <span className={`text-slate-400 transition-transform ${catOpen ? "rotate-180" : ""}`}>▾</span>
            </span>
          </button>
          {catOpen && (
            <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setCategory(""); setCatOpen(false); }}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${category === "" ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600 border border-slate-200"}`}
                >
                  Všetko
                </button>
                {categories.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => { setCategory(c.name); setCatOpen(false); }}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${category === c.name ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600 border border-slate-200"}`}
                  >
                    {c.name} <span className="opacity-60">{c.calories} kcal</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metric selector + median toggle */}
      {!category && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {([["kcal", "Kalórie"], ["health", "Zdravosť"], ["water", "Voda"]] as [typeof metric, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-full px-3 py-1 text-xs ${metric === m ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {label}
            </button>
          ))}
          {isDaily && rangeDays >= 7 && (
            <button
              onClick={() => setShowMedian((v) => !v)}
              className={`ml-auto rounded-full px-3 py-1 text-xs transition ${showMedian ? "bg-orange-500 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              〜 7d medián
            </button>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="card mb-4 p-3">
        <p className="mb-1 text-xs font-medium text-slate-500">
          {category
            ? `Kategória „${category}" — kcal v čase`
            : granularity === "weekly"
              ? `${metric === "kcal" ? "Kalórie" : metric === "health" ? "Zdravosť" : "Voda"} — týždenný priemer`
              : granularity === "monthly"
                ? `${metric === "kcal" ? "Kalórie" : metric === "health" ? "Zdravosť" : "Voda"} — mesačný priemer`
                : metric === "kcal"
                  ? "Kalórie v čase"
                  : metric === "health"
                    ? "Zdravosť v čase (0–10)"
                    : "Pitný režim v čase (l)"}
        </p>
        <TimelineChart
          series={chartSeries}
          max={chartMax}
          goal={chartGoal}
          colorFor={colorFor}
          unit={chartUnit}
          median={medianValues.length ? medianValues : undefined}
        />
      </div>

      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs text-slate-500">Priemer kcal</p>
          <p className="text-xl font-bold text-slate-800">{round(avg)}</p>
          <p className="text-[11px] text-slate-400">cieľ {goal}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">Zdravosť</p>
          <p className={`text-xl font-bold ${avgHealth != null ? healthText(avgHealth) : "text-slate-300"}`}>
            {avgHealth != null ? `${round(avgHealth, 1)}` : "—"}
          </p>
          <p className="text-[11px] text-slate-400">z 10</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">💧 Voda</p>
          <p className="text-xl font-bold text-sky-600">{(avgWater / 1000).toFixed(1)} l</p>
          <p className="text-[11px] text-slate-400">priemer/deň</p>
        </div>
      </div>

      {/* Day list */}
      {days.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          {loading ? "Načítavam…" : "Zatiaľ žiadne záznamy v tomto období."}
        </p>
      ) : (
        <div className="card divide-y divide-slate-50">
          {days.map((d) => {
            const showCat = category !== "";
            const value = showCat ? d.catCalories : d.calories;
            const pct = showCat
              ? Math.min(100, (d.catCalories / catMax) * 100)
              : Math.min(100, (d.calories / max) * 100);
            const over = !showCat && d.calories > goal;
            return (
              <div key={d.date} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-slate-700">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("sk-SK", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    {!showCat && d.healthScore != null && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthText(d.healthScore)} bg-slate-100`}>
                        ♥ {d.healthScore}
                      </span>
                    )}
                    <span className={over ? "text-red-500" : "text-slate-600"}>{round(value)} kcal</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      showCat ? "bg-slate-700"
                        : !over ? "bg-blue-500"
                        : d.calories <= goal * 1.5 ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {showCat
                    ? `${d.catCount}× v kategórii „${category}"`
                    : `B ${round(d.protein)} g · S ${round(d.carbs)} g · T ${round(d.fat)} g${d.waterMl ? ` · 💧 ${(d.waterMl / 1000).toFixed(1)} l` : ""}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!category && (
        <p className="mt-3 px-1 text-xs text-slate-400">
          Farba pruhu: modrá = v rámci cieľa, žltá = do +50 %, červená = nad +50 %.
        </p>
      )}
    </div>
  );
}

// --- TimelineChart ----------------------------------------------------------

function TimelineChart({
  series,
  max,
  goal,
  colorFor,
  unit,
  median,
}: {
  series: { label: string; value: number }[];
  max: number;
  goal: number | null;
  colorFor: (v: number) => string;
  unit: string;
  median?: (number | null)[];
}) {
  const W = 320, H = 150, padL = 30, padR = 6, padT = 10, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const baseline = padT + innerH;
  const n = series.length;

  const { niceMax, ticks } = niceScale(max);
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(22, slot * 0.7));
  const cx = (i: number) => padL + slot * (i + 0.5);
  const y = (v: number) => padT + innerH * (1 - Math.min(1, v / niceMax));
  const fmtVal = (v: number) => (unit.trim() === "l" ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString());

  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  // Build median path segments (skip nulls)
  const medianSegments: { x: number; y: number }[][] = [];
  if (median?.length) {
    let seg: { x: number; y: number }[] = [];
    median.forEach((v, i) => {
      if (v != null) {
        seg.push({ x: cx(i), y: y(v) });
      } else if (seg.length) {
        medianSegments.push(seg);
        seg = [];
      }
    });
    if (seg.length) medianSegments.push(seg);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {/* Y grid + labels */}
      {ticks.map((t, i) => (
        <g key={`t${i}`}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef2f7" strokeWidth="1" />
          <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
            {fmtVal(t)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {series.map((s, i) => {
        const h = Math.max(s.value > 0 ? 1.5 : 0, baseline - y(s.value));
        return (
          <rect key={i} x={cx(i) - barW / 2} y={baseline - h} width={barW} height={h}
            rx={Math.min(3, barW / 2)} fill={colorFor(s.value)} />
        );
      })}

      {/* Goal line */}
      {goal != null && goal > 0 && (
        <>
          <line x1={padL} y1={y(goal)} x2={W - padR} y2={y(goal)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - padR} y={y(goal) - 3} textAnchor="end" fontSize="9" fill="#94a3b8">
            cieľ {unit.trim() === "l" ? (Math.round(goal * 10) / 10).toString() : Math.round(goal)}{unit}
          </text>
        </>
      )}

      {/* Median smooth line (white outline + orange stroke) */}
      {medianSegments.map((seg, si) =>
        seg.length > 1 ? (
          <g key={`med${si}`}>
            <path d={catmullRomPath(seg)} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={catmullRomPath(seg)} fill="none" stroke="#f97316" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : null
      )}

      {/* X labels */}
      {labelIdx.map((i) => (
        <text key={i} x={cx(i)} y={H - 6}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          fontSize="9" fill="#94a3b8">
          {series[i].label}
        </text>
      ))}
    </svg>
  );
}

function niceScale(maxVal: number): { niceMax: number; ticks: number[] } {
  const m = Math.max(maxVal, 1);
  const rough = m / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * pow);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  const niceMax = Math.ceil(m / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { niceMax, ticks };
}
