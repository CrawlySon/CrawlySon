"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Bublina kouča – vyskočí nad tlačidlom „Pridať jedlo", po chvíli zmizne.
// 👍/👎 učí kouča, čo je vtipné a čo trápne.
export default function CoachBubble({
  text,
  persona,
  kind,
  onClose,
}: {
  text: string;
  persona?: string;
  kind?: string;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  function close(delay = 0) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShown(false);
      setTimeout(onClose, 300);
    }, delay);
  }

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true));
    // Dlhšia hláška = dlhšie na čítanie
    close(Math.min(14000, 6000 + text.length * 50));
    return () => {
      cancelAnimationFrame(enter);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function rate(r: 1 | -1) {
    if (rated) return;
    setRated(r);
    api.commentFeedback({ text, kind, persona, rating: r }).catch(() => {
      /* hodnotenie je bonus */
    });
    close(1200);
  }

  const mascot = persona === "roast" ? "🐷" : persona === "nice" ? "🥰" : "🤨";

  return (
    <div
      className={`fixed inset-x-4 bottom-40 z-40 mx-auto max-w-md rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 transition-all duration-300 ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      aria-live="polite"
    >
      <button onClick={() => close()} className="flex w-full items-start gap-3 text-left">
        <span className="text-3xl leading-none">{mascot}</span>
        <span className="pt-0.5 text-sm font-medium leading-snug text-slate-700">{text}</span>
      </button>

      <div className="mt-2 flex items-center justify-end gap-2">
        {rated ? (
          <span className="text-xs text-slate-400">{rated > 0 ? "Zapamätám si, čo ťa baví 😏" : "Dobre, toto už nie 🙄"}</span>
        ) : (
          <>
            <button
              onClick={() => rate(-1)}
              className="rounded-full bg-slate-100 px-3 py-1 text-base active:scale-90"
              aria-label="Trápne"
              title="Trápne"
            >
              👎
            </button>
            <button
              onClick={() => rate(1)}
              className="rounded-full bg-slate-100 px-3 py-1 text-base active:scale-90"
              aria-label="Vtipné"
              title="Vtipné"
            >
              👍
            </button>
          </>
        )}
      </div>
    </div>
  );
}
