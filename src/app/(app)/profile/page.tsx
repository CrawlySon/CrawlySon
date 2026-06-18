"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { recommendedCalories, suggestedMacros, tdee } from "@/lib/nutrition";
import { enablePush, disablePush, isPushSupported, isStandalone } from "@/lib/push-client";
import { getCache, setCache } from "@/lib/page-cache";
import type { Profile, Badge, Streak } from "@/lib/types";

const DEFAULT_WATER_RULES = [
  { hour: 12, minMl: 500 },
  { hour: 18, minMl: 1000 },
];

type Usage = {
  calls: number;
  totalTokens: number;
  promptTokens: number;
  outputTokens: number;
  days: { date: string; tokens: number; calls: number }[];
  recent: { createdAt: string; model: string; totalTokens: number }[];
};

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [saved, setSaved] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getProfile().then((r) => setP(r.profile));
    api.usage().then((u) => setUsage(u)).catch(() => {});
    (async () => {
      if (!isPushSupported()) return;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPushOn(!!sub);
    })().catch(() => {});
  }, []);

  if (!p) return <div className="px-4 pt-10 text-center text-slate-400">Načítavam…</div>;

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!p) return;
    const { profile } = await api.updateProfile(p);
    setP(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const tdeeVal = tdee(p.sex, p.weightKg, p.heightCm, p.age, p.activity);
  const recommended = recommendedCalories(p.sex, p.weightKg, p.heightCm, p.age, p.activity, p.goalType);

  function applyRecommended() {
    if (!recommended) return;
    const m = suggestedMacros(recommended);
    setP((prev) =>
      prev
        ? { ...prev, goalCalories: recommended, goalProtein: m.protein, goalCarbs: m.carbs, goalFat: m.fat }
        : prev
    );
  }

  const waterRules = p.waterReminders && p.waterReminders.length ? p.waterReminders : DEFAULT_WATER_RULES;

  function setRule(i: number, patch: Partial<{ hour: number; minMl: number }>) {
    const next = waterRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    set("waterReminders", next);
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        set("waterRemind", false);
      } else {
        await enablePush();
        setPushOn(true);
        set("waterRemind", true);
        // ulož pravidlá hneď, nech ich plánovač má k dispozícii
        await api.updateProfile({ waterRemind: true, waterReminders: waterRules } as any);
        setPushMsg("Hotovo! Pripomienky pitného režimu sú zapnuté.");
      }
    } catch (e: any) {
      setPushMsg(e?.message || "Nepodarilo sa nastaviť notifikácie.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTest() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      const r = await api.testPush();
      setPushMsg(`Testovacia notifikácia odoslaná (${r.sent} zariadenie/í).`);
    } catch (e: any) {
      setPushMsg(e?.message || "Test zlyhal.");
    } finally {
      setPushBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    router.push("/login");
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Profil a ciele</h1>

      <section className="card mb-4 space-y-3 p-4">
        <h2 className="font-semibold text-slate-700">Osobné údaje</h2>
        <div>
          <label className="label">Meno</label>
          <input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Pohlavie</label>
            <select className="input" value={p.sex || ""} onChange={(e) => set("sex", e.target.value || null)}>
              <option value="">—</option>
              <option value="male">Muž</option>
              <option value="female">Žena</option>
            </select>
          </div>
          <div>
            <label className="label">Vek</label>
            <input
              type="number"
              className="input"
              value={p.age ?? ""}
              onChange={(e) => set("age", e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="label">Výška (cm)</label>
            <input
              type="number"
              className="input"
              value={p.heightCm ?? ""}
              onChange={(e) => set("heightCm", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="label">Váha (kg)</label>
            <input
              type="number"
              className="input"
              value={p.weightKg ?? ""}
              onChange={(e) => set("weightKg", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
        <div>
          <label className="label">Aktivita</label>
          <select className="input" value={p.activity || ""} onChange={(e) => set("activity", e.target.value || null)}>
            <option value="">—</option>
            <option value="sedentary">Sedavá (málo pohybu)</option>
            <option value="light">Ľahká (1–3× týždenne)</option>
            <option value="moderate">Stredná (3–5× týždenne)</option>
            <option value="active">Vysoká (6–7× týždenne)</option>
            <option value="very_active">Veľmi vysoká (šport denne)</option>
          </select>
        </div>
        <div>
          <label className="label">Cieľ</label>
          <select className="input" value={p.goalType || ""} onChange={(e) => set("goalType", e.target.value || null)}>
            <option value="">—</option>
            <option value="lose">Chudnutie</option>
            <option value="maintain">Udržanie</option>
            <option value="gain">Naberanie</option>
          </select>
        </div>

        {tdeeVal && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm">
            <p className="text-slate-600">
              Odhadovaný výdaj (TDEE): <b>{tdeeVal} kcal</b>
            </p>
            {recommended && (
              <p className="mt-1 text-slate-600">
                Odporúčaný príjem pre tvoj cieľ: <b className="text-brand-700">{recommended} kcal</b>
              </p>
            )}
            <button onClick={applyRecommended} className="btn-primary mt-2 w-full">
              Použiť ako môj cieľ
            </button>
          </div>
        )}
      </section>

      <section className="card mb-4 space-y-3 p-4">
        <h2 className="font-semibold text-slate-700">Denné ciele</h2>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Kalórie (kcal)" value={p.goalCalories} onChange={(v) => set("goalCalories", v)} />
          <Num label="Bielkoviny (g)" value={p.goalProtein} onChange={(v) => set("goalProtein", v)} />
          <Num label="Sacharidy (g)" value={p.goalCarbs} onChange={(v) => set("goalCarbs", v)} />
          <Num label="Tuky (g)" value={p.goalFat} onChange={(v) => set("goalFat", v)} />
          <Num label="Voda (ml)" value={p.goalWaterMl} onChange={(v) => set("goalWaterMl", v)} />
        </div>
      </section>

      <BadgesSection />

      {/* Notifikácie – pitný režim */}
      <section className="card mb-4 space-y-3 p-4">
        <h2 className="font-semibold text-slate-700">💧 Pripomienky pitného režimu</h2>
        <p className="text-xs text-slate-500">
          Pošleme notifikáciu, ak v danom čase nemáš vypité aspoň zadané množstvo. Funguje aj keď je appka zatvorená.
        </p>

        {!isPushSupported() ? (
          <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-700">
            Toto zariadenie/prehliadač nepodporuje push notifikácie. Na iPhone appku najprv pridaj na plochu
            (Zdieľať → Pridať na plochu) a otvor ju odtiaľ.
          </p>
        ) : !isStandalone() ? (
          <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-700">
            Tip pre iPhone: notifikácie fungujú len keď je appka pridaná na plochu a spustená odtiaľ.
          </p>
        ) : null}

        <button
          onClick={togglePush}
          disabled={pushBusy || !isPushSupported()}
          className={`w-full rounded-xl py-2.5 text-sm font-semibold ${
            pushOn ? "bg-red-50 text-red-600" : "btn-primary"
          } disabled:opacity-50`}
        >
          {pushBusy ? "Pracujem…" : pushOn ? "Vypnúť notifikácie na tomto zariadení" : "Zapnúť notifikácie"}
        </button>

        {/* Pravidlá */}
        <div className="space-y-2">
          {waterRules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
              <span className="text-xs text-slate-500">o</span>
              <input
                type="number"
                min={0}
                max={23}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                value={r.hour}
                onChange={(e) => setRule(i, { hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) })}
              />
              <span className="text-xs text-slate-500">:00 aspoň</span>
              <input
                type="number"
                step={0.1}
                min={0}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                value={r.minMl / 1000}
                onChange={(e) => setRule(i, { minMl: Math.max(0, Math.round((Number(e.target.value) || 0) * 1000)) })}
              />
              <span className="text-xs text-slate-500">l</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Zmeny pravidiel ulož tlačidlom „Uložiť zmeny".</p>
        </div>

        {/* Motivačný kouč */}
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-brand-600"
            checked={p.coachRemind ?? true}
            onChange={(e) => set("coachRemind", e.target.checked)}
          />
          <span className="text-sm text-slate-600">
            <b className="text-slate-700">🏅 Motivačný kouč</b>
            <br />
            Chytré pripomienky: pozor na kalórie poobede, večerné ovocie a gratulácia k novým odznakom.
          </span>
        </label>

        {pushOn && (
          <button onClick={sendTest} disabled={pushBusy} className="btn-ghost w-full py-2 text-sm">
            Poslať testovaciu notifikáciu
          </button>
        )}
        {pushMsg && <p className="rounded-xl bg-sky-50 p-2 text-xs text-sky-700">{pushMsg}</p>}
      </section>

      <button onClick={save} className="btn-primary w-full">
        {saved ? "✓ Uložené" : "Uložiť zmeny"}
      </button>

      {/* Spotreba AI (tokeny) */}
      {usage && (
        <section className="card mt-4 space-y-3 p-4">
          <h2 className="font-semibold text-slate-700">🔢 Spotreba AI</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Spolu tokenov</p>
              <p className="text-xl font-bold text-slate-800">{usage.totalTokens.toLocaleString("sk-SK")}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">AI volaní</p>
              <p className="text-xl font-bold text-slate-800">{usage.calls}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Vstup {usage.promptTokens.toLocaleString("sk-SK")} · výstup {usage.outputTokens.toLocaleString("sk-SK")} tokenov
            {usage.calls > 0 ? ` · ⌀ ${Math.round(usage.totalTokens / usage.calls)} / volanie` : ""}
          </p>
          {usage.days.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">Po dňoch</p>
              {usage.days.slice(0, 7).map((d) => (
                <div key={d.date} className="flex justify-between text-xs text-slate-500">
                  <span>{new Date(d.date + "T00:00:00").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })}</span>
                  <span>
                    <b className="text-slate-700">{d.tokens.toLocaleString("sk-SK")}</b> tok. · {d.calls}×
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400">Prepis reči je zadarmo (zariadenie); tokeny míňa len spracovanie textu cez Gemini.</p>
        </section>
      )}

      <button onClick={logout} className="btn-ghost mt-3 w-full text-red-500">
        Odhlásiť sa
      </button>
    </div>
  );
}

type BadgesData = { badges: Badge[]; streaks: Streak[]; earnedCount: number; total: number };

// Slovenský tvar slova „deň" podľa počtu.
function dni(n: number): string {
  if (n === 1) return "deň";
  if (n >= 2 && n <= 4) return "dni";
  return "dní";
}

function StreaksSection({ streaks }: { streaks: Streak[] }) {
  if (!streaks || streaks.length === 0) return null;
  // Najprv aktívne/rekordné série, potom podľa rekordu.
  const sorted = [...streaks].sort((a, b) => b.current - a.current || b.best - a.best);

  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-1 font-semibold text-slate-700">🔥 Série a rekordy</h2>
      <p className="mb-3 text-xs text-slate-400">Drž sériu každý deň a prekonaj svoj osobný rekord.</p>
      <div className="space-y-3">
        {sorted.map((s) => {
          const toBeat = Math.max(0, s.best - s.current); // dní k vyrovnaniu rekordu
          const pct = s.best > 0 ? Math.min(100, Math.round((s.current / s.best) * 100)) : s.current > 0 ? 100 : 0;
          return (
            <div key={s.type}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {s.emoji} {s.title}
                </span>
                <span className={s.current > 0 ? "font-semibold text-brand-700" : "text-slate-400"}>
                  {s.current > 0 ? `${s.current} ${dni(s.current)}` : "—"}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${s.isRecord ? "bg-amber-400" : "bg-brand-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {s.isRecord && s.current > 0 ? (
                  <span className="font-medium text-amber-600">🏆 Osobný rekord: {s.current} {dni(s.current)}!</span>
                ) : s.best > 0 ? (
                  <>
                    Rekord: <b className="text-slate-700">{s.best}</b> {dni(s.best)}
                    {s.current > 0 ? ` · ešte ${toBeat} ${dni(toBeat)} k vyrovnaniu` : " · séria prerušená"}
                  </>
                ) : (
                  "Zatiaľ žiadna séria – začni dnes!"
                )}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BadgesSection() {
  const [data, setData] = useState<BadgesData | null>(() => getCache<BadgesData>("badges") ?? null);
  const [selected, setSelected] = useState<Badge | null>(null);

  useEffect(() => {
    api
      .getBadges()
      .then((d) => {
        setData(d);
        setCache("badges", d);
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <>
    {data.streaks && <StreaksSection streaks={data.streaks} />}
    <section className="card mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">🏅 Odznaky</h2>
        <span className="text-xs text-slate-400">
          {data.earnedCount} / {data.total}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {data.badges.map((b) => (
          <button
            key={b.key}
            onClick={() => setSelected(b)}
            className={`flex flex-col items-center rounded-xl p-2 text-center transition active:scale-95 ${b.earned ? "bg-brand-50" : "bg-slate-50"}`}
          >
            <span className={`text-2xl leading-none ${b.earned ? "" : "opacity-30 grayscale"}`}>{b.emoji}</span>
            <span className={`mt-1 text-[11px] font-medium leading-tight ${b.earned ? "text-slate-700" : "text-slate-400"}`}>
              {b.title}
            </span>
            {!b.earned && b.target ? (
              <span className="mt-0.5 text-[10px] text-slate-400">
                {Math.min(b.current ?? 0, b.target)}/{b.target}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {selected && <BadgeModal badge={selected} onClose={() => setSelected(null)} />}
    </section>
    </>
  );
}

function BadgeModal({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const target = badge.target ?? 0;
  const current = Math.min(badge.current ?? 0, target || Infinity);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : badge.earned ? 100 : 0;
  const earnedDate = badge.earnedAt
    ? new Date(badge.earnedAt).toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`text-5xl leading-none ${badge.earned ? "" : "opacity-30 grayscale"}`}>{badge.emoji}</span>
        <h3 className="mt-3 text-lg font-bold text-slate-800">{badge.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{badge.desc}</p>

        {badge.earned ? (
          <div className="mt-4 rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-700">
            ✓ Odomknuté{earnedDate ? ` · ${earnedDate}` : ""}
          </div>
        ) : (
          <div className="mt-4">
            {target > 0 && (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Postup: <b className="text-slate-700">{current}</b> / {target}
                </p>
              </>
            )}
            {target === 0 && <p className="text-xs text-slate-400">Zatiaľ neodomknuté.</p>}
          </div>
        )}

        <button onClick={onClose} className="btn-primary mt-5 w-full">
          Zavrieť
        </button>
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      />
    </div>
  );
}
