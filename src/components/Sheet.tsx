"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Spodný panel (bottom sheet) s dialógovou sémantikou. Doteraz mal každý
// overlay vlastný markup bez role="dialog", Escape, fokusu a zámku scrollu –
// toto je jedno miesto pre všetky (pridanie jedla, dlaždice, menu záznamu).
export default function Sheet({
  title,
  onClose,
  children,
  footer,
  size = "auto",
  closeLabel = "Zavrieť",
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "auto" | "tall";
  closeLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Zámok scrollu pozadia + Escape + návrat fokusu po zavretí
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input, textarea, button, [tabindex]:not([tabindex='-1'])");
    (first ?? panel.current)?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      // jednoduchý focus-trap
      if (e.key === "Tab" && panel.current) {
        const focusable = Array.from(
          panel.current.querySelectorAll<HTMLElement>("input, textarea, select, button, a[href], [tabindex]:not([tabindex='-1'])")
        ).filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`sheet mx-auto w-full max-w-md outline-none ${size === "tall" ? "min-h-[60dvh]" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-4 pb-2">
          {title ? (
            <h2 id={titleId} className="display text-xl text-ink">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="btn-ghost h-9 w-9 px-0 py-0" aria-label={closeLabel}>
            <X size={16} />
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
        {footer && <div className="sticky bottom-0 border-t-2 border-ink bg-paper-2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
