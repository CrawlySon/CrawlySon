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

function healthColor(h: number): string {
  if (h >= 7) return "bg-brand-500";
  if (h >= 4) return "bg-amber-400";
  return "bg-red-400";
}
function healthText(h: number): string {
  if (h >= 7) return "text-brand-700";
  if (h >= 4) return "text-amber-600";
  return "text-red-600";
}

type HistoryState = { days: Day[]; categories: Category[] };
const historyKey = (range: number, category: string) => `history:${range}:${category}`;

export default function HistoryPage() {
  const initial = getCache<HistoryState>(historyKey(14, ""));
  const [days, setDays] = useState<Day[]>(initial?.days ?? []);
  const [categories, setCategories] = useState<Category[]>(initial?.categories ?? []);
  const [profile, setProfile] = useState<Profile | null>(() => getCache<Profile>("profile") ?? null);
  const [range, setRange] = useState(14);
  const [category, setCategory] = useState<string>("");
  const [catOpen, setCatOpen] = useState(false);
  const [metric, setMetric] = useState<"kcal" | "health" | "water">("kcal");
  const [loading, setLoading] = useState(initial === undefined);

  useEffect(() => {
    // Z cache hneď, potom obnov na pozadí – bez bliknutia pri návrate na záložku
    const cached = getCache<HistoryState>(historyKey(range, category));
    if (cached) {
      setDays(cached.days);
      if (!category) setCategories(cached.categories);
    }
    setLoading(cached === undefined);
    api.history(range, category || undefined).then((d) => {
      setDays(d.days);
      if (!category) setCategories(d.categories);
      setCache(historyKey(range, category), { days: d.days, categories: d.categories });
      setLoading(false);
    });
  }, [range, category]);

  // Profil stačí načítať raz – nemení sa pri zmene rozsahu/kategórie
  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p.profile);
      setCache("profile", p.profile);
    });
  }, []);

  const goal = profile?.goalCalories || 2000;
  const max = Math.max(goal, ...days.map((d) => d.calories), 1);
  const avg = days.length ? days.reduce((s, d) => s + d.calories, 0) / days.length : 0;

  const healthDays = days.filter((d) => d.healthScore != null);
  const avgHealth = healthDays.length
    ? healthDays.reduce((s, d) => s + (d.healthScore || 0), 0) / healthDays.length
    : null;
  const avgWater = days.length ? days.reduce((s, d) => s + (d.waterMl || 0), 0) / days.length : 0;

  const catMax = Math.max(...days.map((d) => d.catCalories), 1);

  // Spojitá časová os (vrátane prázdnych dní) pre graf
  const byDate = new Map(days.map((d) => [d.date, d]));
  const series = Array.from({ length: range }, (_, k) => {
    const i = range - 1 - k; // od najstaršieho po dnešok
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const tz = dt.getTimezoneOffset() * 60000;
    const iso = new Date(dt.getTime() - tz).toISOString().slice(0, 10);
    const d = byDate.get(iso);
    let value = 0;
    if (category) value = d?.catCalories ?? 0;
    else if (metric === "kcal") value = d?.calories ?? 0;
    else if (metric === "health") value = d?.healthScore ?? 0;
    else value = Math.round(((d?.waterMl ?? 0) / 1000) * 10) / 10;
    return { date: dt, value };
  });

  const chartGoal = category ? null : metric === "kcal" ? goal : metric === "water" ? (profile ? profile.goalWaterMl / 1000 : null) : null;
  const chartMax = Math.max(...series.map((s) => s.value), chartGoal || 0, metric === "health" && !category ? 10 : 0, 1);
  const chartUnit = category || metric === "kcal" ? " kcal" : metric === "water" ? " l" : "";

  // Farba stĺpca podľa cieľa / hodnoty
  function colorFor(v: number): string {
    const BLUE = "#3b82f6";
    const RED = "#ef4444";
    const WATER = "#0ea5e9"; // modrá pre pitný režim
    if (v <= 0) return "#e2e8f0"; // bez dát
    if (category) return BLUE;
    if (metric === "kcal") return v > goal ? RED : BLUE; // nad cieľom = červená
    if (metric === "water") return WATER; // pitie vody – vždy modrá
    // zdravosť: 10 odtieňov od tmavo červenej (1) po svetlo modrú (10)
    const s = Math.max(1, Math.min(10, Math.round(v)));
    const t = (s - 1) / 9; // 0..1
    const hue = Math.round(t * 210); // 0 (červená) → 210 (modrá)
    const light = Math.round(35 + t * 30); // tmavá → svetlá
    return `hsl(${hue}, 70%, ${light}%)`;
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800">
        Analytika
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        )}
      </h1>

      <div className="mb-3 flex gap-2">
        {[7, 14, 30].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-sm ${range === r ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {r} dní
          </button>
        ))}
      </div>

      {/* Filter podľa kategórie – zbalený, aby nezaberal pol obrazovky */}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategory("");
                    setCatOpen(false);
                  }}
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
                  onClick={() => {
                    setCategory("");
                    setCatOpen(false);
                  }}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${category === "" ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600 border border-slate-200"}`}
                >
                  Všetko
                </button>
                {categories.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      setCategory(c.name);
                      setCatOpen(false);
                    }}
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

      {/* Metrika grafu */}
      {!category && (
        <div className="mb-2 flex gap-2">
          {([
            ["kcal", "Kalórie"],
            ["health", "Zdravosť"],
            ["water", "Voda"],
          ] as [typeof metric, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-full px-3 py-1 text-xs ${metric === m ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Časový graf (timeline) */}
      <div className="card mb-4 p-3">
        <p className="mb-1 text-xs font-medium text-slate-500">
          {category
            ? `Kategória „${category}" — kcal v čase`
            : metric === "kcal"
              ? "Kalórie v čase"
              : metric === "health"
                ? "Zdravosť v čase (0–10)"
                : "Pitný režim v čase (l)"}
        </p>
        <TimelineChart series={series} max={chartMax} goal={chartGoal} colorFor={colorFor} unit={chartUnit} />
      </div>

      {/* Súhrny */}
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

      {days.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          {loading ? "Načítavam…" : "Zatiaľ žiadne záznamy v tomto období."}
        </p>
      ) : (
        <div className="card divide-y divide-slate-50">
          {days.map((d) => {
            const showCat = category !== "";
            const value = showCat ? d.catCalories : d.calories;
            const pct = showCat ? Math.min(100, (d.catCalories / catMax) * 100) : Math.min(100, (d.calories / max) * 100);
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
                      showCat ? "bg-slate-700" : over ? "bg-red-400" : d.healthScore != null ? healthColor(d.healthScore) : "bg-brand-500"
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
          Farba pruhu = zdravosť dňa (zelená = zdravé, červená = menej zdravé). Klikni na kategóriu hore pre filter.
        </p>
      )}
    </div>
  );
}

function TimelineChart({
  series,
  max,
  goal,
  colorFor,
  unit,
}: {
  series: { date: Date; value: number }[];
  max: number;
  goal: number | null;
  colorFor: (v: number) => string;
  unit: string;
}) {
  const W = 320;
  const H = 150;
  const padL = 30;
  const padR = 6;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const baseline = padT + innerH;
  const n = series.length;

  // „Pekná" škála Y osi (zaokrúhlený vrchol + rovnomerné dieliky)
  const { niceMax, ticks } = niceScale(max);

  const slot = innerW / n;
  const barW = Math.max(2, Math.min(22, slot * 0.7));
  const cx = (i: number) => padL + slot * (i + 0.5);
  const y = (v: number) => padT + innerH * (1 - Math.min(1, v / niceMax));

  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const fmtVal = (v: number) => (unit.trim() === "l" ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString());

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {/* Y mriežka + popisky hodnôt */}
      {ticks.map((t, i) => (
        <g key={`t${i}`}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef2f7" strokeWidth="1" />
          <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
            {fmtVal(t)}
          </text>
        </g>
      ))}

      {/* stĺpce */}
      {series.map((s, i) => {
        const top = y(s.value);
        const h = Math.max(s.value > 0 ? 1.5 : 0, baseline - top);
        return (
          <rect
            key={i}
            x={cx(i) - barW / 2}
            y={baseline - h}
            width={barW}
            height={h}
            rx={Math.min(3, barW / 2)}
            fill={colorFor(s.value)}
          />
        );
      })}

      {/* cieľová čiara */}
      {goal != null && goal > 0 && (
        <>
          <line x1={padL} y1={y(goal)} x2={W - padR} y2={y(goal)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - padR} y={y(goal) - 3} textAnchor="end" fontSize="9" fill="#94a3b8">
            cieľ {unit.trim() === "l" ? (Math.round(goal * 10) / 10).toString() : Math.round(goal)}
            {unit}
          </text>
        </>
      )}

      {/* x popisky */}
      {labelIdx.map((i) => (
        <text key={i} x={cx(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="9" fill="#94a3b8">
          {fmt(series[i].date)}
        </text>
      ))}
    </svg>
  );
}

// Vypočíta „peknú" hornú hranicu Y osi a rovnomerné dieliky (~3–4)
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
