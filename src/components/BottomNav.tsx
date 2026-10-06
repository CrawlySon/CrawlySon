"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CircleDot, Plus, ShoppingBasket, UserRound } from "lucide-react";

// Spodné menu s plusom v strede – nahrádza plávajúce tlačidlo, ktoré prekrývalo
// obsah a ignorovalo spodný safe-area inset. Plus otvorí pridávanie na „Dnes“
// (z inej záložky cez ?add=1).
const items = [
  { href: "/", label: "Dnes", Icon: CircleDot },
  { href: "/history", label: "Analytika", Icon: BarChart3 },
  { href: "__add__", label: "Pridať", Icon: Plus },
  { href: "/foods", label: "Potraviny", Icon: ShoppingBasket },
  { href: "/profile", label: "Profil", Icon: UserRound },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // href, na ktorý práve prechádzame (pre okamžité zvýraznenie + spinner)
  const [target, setTarget] = useState<string | null>(null);

  // Predikčné načítanie záložiek – prechod je potom svižnejší
  useEffect(() => {
    for (const it of items) if (it.href !== "__add__") router.prefetch(it.href);
  }, [router]);

  // Po dokončení prechodu (zmení sa cesta) zruš cieľ
  useEffect(() => {
    setTarget(null);
  }, [pathname]);

  function go(href: string) {
    if (href === "__add__") {
      // Na „Dnes“ otvorí sheet priamo (udalosť), inde prejde na Dnes s ?add=1
      if (pathname === "/") window.dispatchEvent(new CustomEvent("rypak:add"));
      else startTransition(() => router.push("/?add=1"));
      return;
    }
    if (href === pathname) return;
    setTarget(href); // okamžitá vizuálna odozva na ťuknutie
    startTransition(() => router.push(href));
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper-2 safe-bottom">
      <div className="mx-auto flex max-w-md items-stretch">
        {items.map((it) => {
          const isAdd = it.href === "__add__";
          const active = !isAdd && pathname === it.href;
          const navigating = target === it.href; // ťuknuté, ešte sa otvára
          const highlight = active || navigating;
          const Icon = it.Icon;
          if (isAdd) {
            return (
              <button key={it.href} onClick={() => go(it.href)} aria-label="Pridať jedlo" className="flex flex-1 items-center justify-center py-1">
                <span className="-mt-6 flex h-14 w-14 items-center justify-center border-2 border-ink bg-ink text-paper shadow-pig transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none">
                  <Icon size={26} strokeWidth={3} />
                </span>
              </button>
            );
          }
          return (
            <button
              key={it.href}
              onClick={() => go(it.href)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-transform duration-100 active:scale-90 ${
                highlight ? "font-bold text-ink" : "font-semibold text-muted"
              }`}
            >
              <span className="relative flex h-6 w-6 items-center justify-center">
                {navigating && isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink" />
                ) : (
                  <Icon size={22} strokeWidth={highlight ? 2.6 : 2.1} className={highlight && it.href === "/" ? "fill-pig" : undefined} />
                )}
              </span>
              {it.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
