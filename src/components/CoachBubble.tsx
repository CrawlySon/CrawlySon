"use client";

import { useEffect, useState } from "react";

// Bublina kouča – vyskočí nad tlačidlom „Pridať jedlo", po chvíli zmizne.
// Ťuknutím sa zavrie hneď.
export default function CoachBubble({ text, persona, onClose }: { text: string; persona?: string; onClose: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true));
    // Dlhšia hláška = dlhšie na čítanie
    const ms = Math.min(12000, 5000 + text.length * 45);
    const hide = setTimeout(() => setShown(false), ms);
    const done = setTimeout(onClose, ms + 300);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [text, onClose]);

  const mascot = persona === "roast" ? "🐷" : persona === "nice" ? "🥰" : "🤨";

  return (
    <button
      onClick={() => {
        setShown(false);
        setTimeout(onClose, 300);
      }}
      className={`fixed inset-x-4 bottom-40 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-white p-3 text-left shadow-xl ring-1 ring-black/5 transition-all duration-300 ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      aria-live="polite"
    >
      <span className="text-3xl leading-none">{mascot}</span>
      <span className="pt-0.5 text-sm font-medium leading-snug text-slate-700">{text}</span>
    </button>
  );
}
