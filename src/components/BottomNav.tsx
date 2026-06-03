"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dnes", icon: "🍽️" },
  { href: "/history", label: "História", icon: "📊" },
  { href: "/foods", label: "Potraviny", icon: "🥗" },
  { href: "/profile", label: "Profil", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                active ? "text-brand-600 font-semibold" : "text-slate-400"
              }`}
            >
              <span className="text-xl leading-none">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
