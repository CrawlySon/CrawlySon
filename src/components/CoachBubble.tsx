"use client";

import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api";
import { moodForCommentKind } from "@/lib/mood";
import Pig from "@/components/Pig";

// Bublina Rypáka – vyskočí nad spodným menu po pridaní jedla, po chvíli zmizne.
// 👍/👎 učí kouča, čo je vtipné a čo trápne. Kým sa jej používateľ dotýka,
// automatické zavretie čaká.
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
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const holding = useRef(false);

  function close(delay = 0) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (holding.current) {
        close(1500); // ešte číta – skús o chvíľu
        return;
      }
      setShown(false);
      closeTimer.current = setTimeout(onClose, 300);
    }, delay);
  }

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true));
    // Dlhšia hláška = dlhšie na čítanie
    close(Math.min(14000, 6000 + text.length * 50));
    return () => {
      cancelAnimationFrame(enter);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
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

  const mood = moodForCommentKind(kind, persona);

  return (
    <div
      className={`fixed inset-x-3 z-40 mx-auto max-w-md transition-all duration-300 ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      style={{ bottom: "calc(104px + env(safe-area-inset-bottom))" }}
      role="status"
      aria-live="polite"
      onPointerDown={() => (holding.current = true)}
      onPointerUp={() => (holding.current = false)}
      onPointerCancel={() => (holding.current = false)}
    >
      <div className="card-raised flex items-start gap-3 p-3">
        <Pig mood={mood} size={64} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-bad">Rypák hovorí</div>
          <button onClick={() => close()} className="mt-0.5 block w-full text-left text-[15px] font-semibold leading-snug text-ink">
            {text}
          </button>
          <div className="mt-2 flex items-center justify-end gap-2">
            {rated ? (
              <span className="text-xs text-muted">{rated > 0 ? "Zapamätám si, čo ťa baví." : "Dobre, toto už nie."}</span>
            ) : (
              <>
                <button onClick={() => rate(-1)} className="btn-ghost h-9 w-11 px-0 py-0" aria-label="Trápne" title="Trápne">
                  <ThumbsDown size={16} />
                </button>
                <button onClick={() => rate(1)} className="btn-pig h-9 w-11 px-0 py-0" aria-label="Vtipné" title="Vtipné">
                  <ThumbsUp size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
