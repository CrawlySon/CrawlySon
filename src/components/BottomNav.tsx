"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/", label: "Dnes", icon: "🍽️" },
  { href: "/history", label: "Analytika", icon: "📊" },
  { href: "/foods", label: "Potraviny", icon: "🥗" },
  { href: "/profile", label: "Profil", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // href, na ktorý práve prechádzame (pre okamžité zvýraznenie + spinner)
  const [target, setTarget] = useState<string | null>(null);

  // Predikčné načítanie záložiek – prechod je potom svižnejší
  useEffect(() => {
    for (const it of items) router.prefetch(it.href);
  }, [router]);

  // Po dokončení prechodu (zmení sa cesta) zruš cieľ
  useEffect(() => {
    setTarget(null);
  }, [pathname]);

  function go(href: string) {
    if (href === pathname) return;
    setTarget(href); // okamžitá vizuálna odozva na ťuknutie
    startTransition(() => router.push(href));
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 safe-bottom"
      style={{ background: "var(--nm-bg)", boxShadow: "0 -6px 16px var(--nm-dark)" }}
    >
      <div className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = pathname === it.href;
          const navigating = target === it.href; // ťuknuté, ešte sa otvára
          const highlight = active || navigating;
          return (
            <button
              key={it.href}
              onClick={() => go(it.href)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-transform duration-100 active:scale-90 ${
                highlight ? "text-brand-600 font-semibold" : "text-slate-400"
              }`}
            >
              <span className="relative flex h-6 w-6 items-center justify-center text-xl leading-none">
                {navigating && isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                ) : (
                  it.icon
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
