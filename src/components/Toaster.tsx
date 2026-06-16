"use client";

import { useEffect, useState } from "react";
import { subscribeToast, type Toast } from "@/lib/toast";

type Shown = Toast & { leaving?: boolean };

export default function Toaster() {
  const [items, setItems] = useState<Shown[]>([]);

  useEffect(() => {
    const unsub = subscribeToast((t) => {
      setItems((prev) => [...prev, t]);
      // Automatické zmiznutie po 5 s (najprv spustí odchodovú animáciu)
      setTimeout(() => {
        setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, leaving: true } : x)));
        setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 300);
      }, 5000);
    });
    return unsub;
  }, []);

  function dismiss(id: number) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 300);
  }

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-3 safe-top">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-brand-100 bg-white px-4 py-3 text-left shadow-lg shadow-brand-600/10 ring-1 ring-black/5 transition-all duration-300 ${
            t.leaving ? "-translate-y-3 opacity-0" : "translate-y-0 opacity-100"
          }`}
          style={{ animation: t.leaving ? undefined : "toastIn 0.35s cubic-bezier(0.2,0.9,0.3,1.2)" }}
        >
          {t.emoji && <span className="text-2xl leading-none">{t.emoji}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">{t.title}</span>
            {t.body && <span className="block text-xs text-slate-500">{t.body}</span>}
          </span>
        </button>
      ))}
      <style jsx global>{`
        @keyframes toastIn {
          0% {
            transform: translateY(-16px) scale(0.96);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
