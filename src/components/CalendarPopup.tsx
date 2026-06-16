"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const WD = ["PO", "UT", "ST", "ŠT", "PI", "SO", "NE"];
const MONTHS = [
  "január", "február", "marec", "apríl", "máj", "jún",
  "júl", "august", "september", "október", "november", "december",
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function CalendarPopup({
  value,
  max,
  onSelect,
  onClose,
}: {
  value: string; // vybraný dátum YYYY-MM-DD
  max: string; // najneskorší voliteľný dátum (dnes)
  onSelect: (d: string) => void;
  onClose: () => void;
}) {
  const [vy, setVy] = useState(() => Number(value.slice(0, 4)));
  const [vm, setVm] = useState(() => Number(value.slice(5, 7)) - 1); // 0-based
  const [marked, setMarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const last = new Date(vy, vm + 1, 0).getDate();
    api
      .calendarDays(iso(vy, vm, 1), iso(vy, vm, last))
      .then((r) => setMarked(new Set(r.dates)))
      .catch(() => {});
  }, [vy, vm]);

  const firstWeekday = (new Date(vy, vm, 1).getDay() + 6) % 7; // pondelok = 0
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const maxY = Number(max.slice(0, 4));
  const maxM = Number(max.slice(5, 7)) - 1;
  const canNext = vy < maxY || (vy === maxY && vm < maxM);

  function prevMonth() {
    if (vm === 0) {
      setVy(vy - 1);
      setVm(11);
    } else setVm(vm - 1);
  }
  function nextMonth() {
    if (!canNext) return;
    if (vm === 11) {
      setVy(vy + 1);
      setVm(0);
    } else setVm(vm + 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-xs rounded-3xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Hlavička s mesiacom */}
        <div className="mb-3 flex items-center justify-between">
          <button onClick={prevMonth} className="rounded-full px-2 py-1 text-brand-600 hover:bg-slate-100">
            ‹
          </button>
          <span className="text-sm font-bold capitalize text-slate-800">
            {MONTHS[vm]} {vy}
          </span>
          <button
            onClick={nextMonth}
            disabled={!canNext}
            className="rounded-full px-2 py-1 text-brand-600 hover:bg-slate-100 disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {/* Dni v týždni */}
        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
          {WD.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        {/* Mriežka */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} />;
            const dateISO = iso(vy, vm, d);
            const selected = dateISO === value;
            const disabled = dateISO > max;
            const hasData = marked.has(dateISO);
            return (
              <button
                key={dateISO}
                disabled={disabled}
                onClick={() => {
                  onSelect(dateISO);
                  onClose();
                }}
                className={`relative flex h-9 items-center justify-center rounded-full text-sm ${
                  selected
                    ? "bg-brand-600 font-semibold text-white"
                    : disabled
                      ? "text-slate-300"
                      : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {d}
                {/* bodka pri dňoch s dátami */}
                {hasData && (
                  <span
                    className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-brand-500"}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legenda + akcie */}
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> deň so záznamom
          </span>
          <button onClick={onClose} className="text-sm font-medium text-slate-500">
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
}
