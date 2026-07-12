"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCache, setCache } from "@/lib/page-cache";
import type { Supplement, SupplementLog, SupplementKind } from "@/lib/types";

type State = { supplements: Supplement[]; logs: SupplementLog[] };
const suppKey = (date: string) => `supplements:${date}`;

const KINDS: SupplementKind[] = ["supplement", "medication"];
const KIND_META: Record<SupplementKind, { emoji: string; title: string; addLabel: string; placeholder: string }> = {
  supplement: { emoji: "🧴", title: "Suplementy", addLabel: "suplement", placeholder: "napr. Kreatín, Omega-3, Vitamín D" },
  medication: { emoji: "💊", title: "Lieky", addLabel: "liek", placeholder: "napr. Ibalgin, Euthyrox" },
};

function doseText(amount: number | null, unit: string | null): string {
  const a = amount != null ? String(amount) : "";
  const u = unit ?? "";
  return `${a} ${u}`.trim();
}

// Ponuka jednotiek/foriem pre suplementy a lieky
const UNIT_OPTIONS = ["tableta", "kapsula", "kvapka", "odmerka", "vrecko", "ml", "g", "mg", "µg", "IU", "ks"];
const UNIT_CUSTOM = "__custom__";

export default function SupplementCard({ date, reloadSignal }: { date: string; reloadSignal: number }) {
  const cached = getCache<State>(suppKey(date));
  const [supplements, setSupplements] = useState<Supplement[]>(cached?.supplements ?? []);
  const [logs, setLogs] = useState<SupplementLog[]>(cached?.logs ?? []);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [addingKind, setAddingKind] = useState<SupplementKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const c = getCache<State>(suppKey(date));
    if (c) {
      setSupplements(c.supplements);
      setLogs(c.logs);
    }
    const d = await api.getSupplements(date);
    setSupplements(d.supplements);
    setLogs(d.logs);
    setCache(suppKey(date), { supplements: d.supplements, logs: d.logs });
  }, [date]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  function setItemBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const logsForCatalog = (supId: string) => logs.filter((l) => l.supplementId === supId);

  // +1 užitie daného suplementu/lieku v tento deň
  async function inc(sup: Supplement) {
    if (busy.has(sup.id)) return;
    setItemBusy(sup.id, true);
    try {
      await api.logSupplement({
        date,
        supplementId: sup.id,
        name: sup.name,
        kind: sup.kind,
        amount: sup.amount,
        unit: sup.unit,
      });
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy(sup.id, false);
    }
  }

  // −1 užitie (odoberie posledný dnešný záznam daného suplementu/lieku)
  async function dec(sup: Supplement) {
    if (busy.has(sup.id)) return;
    const existing = logsForCatalog(sup.id);
    if (!existing.length) return;
    setItemBusy(sup.id, true);
    try {
      await api.deleteSupplementLog(existing[existing.length - 1].id);
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy(sup.id, false);
    }
  }

  // Pridá novú položku do katalógu a rovno ju zaznamená ako užitú v tento deň.
  async function addNew(kind: SupplementKind, name: string, amount: number | null, unit: string | null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setItemBusy("add:" + kind, true);
    try {
      const { supplement } = await api.addSupplement({ name: trimmed, kind, amount, unit });
      await api.logSupplement({ date, supplementId: supplement.id, name: supplement.name, kind, amount, unit });
      setAddingKind(null);
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy("add:" + kind, false);
    }
  }

  async function saveEdit(id: string, name: string, amount: number | null, unit: string | null) {
    setItemBusy(id, true);
    try {
      await api.updateSupplement(id, { name: name.trim(), amount, unit });
      setEditingId(null);
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy(id, false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Zmazať z môjho zoznamu? Doterajšie denné záznamy ostanú zachované.")) return;
    setItemBusy(id, true);
    try {
      await api.deleteSupplement(id);
      setEditingId(null);
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy(id, false);
    }
  }

  // Odstráni jednorazový (ad-hoc) záznam bez väzby na katalóg
  async function removeAdhoc(logId: string) {
    setItemBusy(logId, true);
    try {
      await api.deleteSupplementLog(logId);
      await load();
    } catch {
      await load();
    } finally {
      setItemBusy(logId, false);
    }
  }

  const catalogIds = new Set(supplements.map((s) => s.id));
  const takenCount = logs.length;

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-slate-700">💊 Suplementy a lieky</h2>
        {takenCount > 0 && <span className="text-sm text-slate-400">{takenCount} užité</span>}
      </div>

      <div className="mt-2 space-y-3">
        {KINDS.map((kind) => {
          const meta = KIND_META[kind];
          const items = supplements.filter((s) => s.kind === kind);
          // ad-hoc záznamy tohto druhu bez položky v katalógu (napr. po zmazaní z katalógu)
          const adhoc = logs.filter((l) => l.kind === kind && (!l.supplementId || !catalogIds.has(l.supplementId)));
          return (
            <div key={kind}>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {meta.emoji} {meta.title}
                </h3>
                <button
                  onClick={() => setAddingKind(addingKind === kind ? null : kind)}
                  className="text-xs font-medium text-brand-600"
                >
                  {addingKind === kind ? "zrušiť" : `+ pridať ${meta.addLabel}`}
                </button>
              </div>

              {addingKind === kind && (
                <AddForm
                  placeholder={meta.placeholder}
                  busy={busy.has("add:" + kind)}
                  onSubmit={(name, amount, unit) => addNew(kind, name, amount, unit)}
                />
              )}

              {items.length === 0 && adhoc.length === 0 && addingKind !== kind && (
                <p className="text-xs text-slate-400">Zatiaľ nič. Ťukni na „+ pridať {meta.addLabel}".</p>
              )}

              <div className="space-y-1">
                {items.map((sup) =>
                  editingId === sup.id ? (
                    <EditForm
                      key={sup.id}
                      sup={sup}
                      busy={busy.has(sup.id)}
                      onSave={(name, amount, unit) => saveEdit(sup.id, name, amount, unit)}
                      onDelete={() => remove(sup.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <CatalogRow
                      key={sup.id}
                      sup={sup}
                      count={logsForCatalog(sup.id).length}
                      busy={busy.has(sup.id)}
                      onInc={() => inc(sup)}
                      onDec={() => dec(sup)}
                      onEdit={() => setEditingId(sup.id)}
                    />
                  )
                )}

                {adhoc.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5"
                  >
                    <span className="text-sm text-brand-500">✓</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {l.name}
                      {doseText(l.amount, l.unit) && (
                        <span className="ml-1.5 text-[11px] text-slate-400">{doseText(l.amount, l.unit)}</span>
                      )}
                    </span>
                    <button
                      onClick={() => removeAdhoc(l.id)}
                      disabled={busy.has(l.id)}
                      className="text-slate-300 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CatalogRow({
  sup,
  count,
  busy,
  onInc,
  onDec,
  onEdit,
}: {
  sup: Supplement;
  count: number;
  busy: boolean;
  onInc: () => void;
  onDec: () => void;
  onEdit: () => void;
}) {
  const dose = doseText(sup.amount, sup.unit);
  const taken = count > 0;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
        taken ? "border-brand-200 bg-brand-50" : "border-slate-100 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1 truncate">
        <span className={`text-sm font-medium ${taken ? "text-brand-800" : "text-slate-700"}`}>{sup.name}</span>
        {dose && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{dose}</span>}
      </div>
      <button onClick={onEdit} className="px-0.5 text-slate-300 hover:text-brand-500" title="Upraviť">
        ✎
      </button>
      {/* počet užití – meniteľný cez − / + */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onDec}
          disabled={busy || count === 0}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-base leading-none text-slate-500 active:scale-95 disabled:opacity-30"
          aria-label="Ubrať"
        >
          −
        </button>
        <span className={`w-4 text-center text-sm font-semibold tabular-nums ${taken ? "text-brand-700" : "text-slate-300"}`}>
          {count}
        </span>
        <button
          onClick={onInc}
          disabled={busy}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-base leading-none text-white active:scale-95 disabled:opacity-40"
          aria-label="Pridať"
        >
          +
        </button>
      </div>
    </div>
  );
}

function AddForm({
  placeholder,
  busy,
  onSubmit,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (name: string, amount: number | null, unit: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  function submit() {
    const a = parseFloat(amount.replace(",", "."));
    onSubmit(name, Number.isFinite(a) && a > 0 ? a : null, unit.trim() || null);
    setName("");
    setAmount("");
    setUnit("");
  }
  return (
    <div className="mb-2 space-y-2 rounded-xl bg-slate-50 p-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-start gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="dávka (napr. 1)"
          className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <UnitSelect value={unit} onChange={setUnit} />
      </div>
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="btn-primary w-full py-2 text-sm disabled:opacity-50"
      >
        {busy ? "Pridávam…" : "Pridať a označiť ako užité dnes"}
      </button>
    </div>
  );
}

function EditForm({
  sup,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  sup: Supplement;
  busy: boolean;
  onSave: (name: string, amount: number | null, unit: string | null) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sup.name);
  const [amount, setAmount] = useState(sup.amount != null ? String(sup.amount) : "");
  const [unit, setUnit] = useState(sup.unit ?? "");
  function save() {
    const a = parseFloat(amount.replace(",", "."));
    onSave(name, Number.isFinite(a) && a > 0 ? a : null, unit.trim() || null);
  }
  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-start gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="dávka"
          className="w-1/2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <UnitSelect value={unit} onChange={setUnit} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy || !name.trim()} className="btn-primary flex-1 py-1.5 text-sm disabled:opacity-50">
          Uložiť
        </button>
        <button onClick={onCancel} className="px-2 text-sm text-slate-400">
          zrušiť
        </button>
        <button onClick={onDelete} disabled={busy} className="px-2 text-sm text-red-400">
          zmazať
        </button>
      </div>
    </div>
  );
}

// Výber jednotky/formy z ponuky (+ možnosť „Iné…" na vlastnú hodnotu).
function UnitSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = value === "" || UNIT_OPTIONS.includes(value);
  const [mode, setMode] = useState(known ? value : UNIT_CUSTOM);
  return (
    <div className="w-1/2 space-y-1">
      <select
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          setMode(v);
          onChange(v === UNIT_CUSTOM ? "" : v);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">forma / jednotka…</option>
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value={UNIT_CUSTOM}>Iné…</option>
      </select>
      {mode === UNIT_CUSTOM && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="vlastná jednotka"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      )}
    </div>
  );
}
