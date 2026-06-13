"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.register(username, password, code);
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-100 px-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl">
            🥗
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Vytvoriť účet</h1>
          <p className="text-sm text-slate-500">NutriAI</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Meno (prihlasovacie)</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              placeholder="3–30 znakov, malé písmená/čísla"
            />
          </div>
          <div>
            <label className="label">Heslo</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="aspoň 8 znakov"
            />
          </div>
          <div>
            <label className="label">Registračný kód</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="kód od správcu"
            />
            <p className="mt-1 text-xs text-slate-400">Prvý účet pri prázdnej databáze kód nepotrebuje.</p>
          </div>
          {error && <p className="rounded-xl bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Vytváram…" : "Zaregistrovať sa"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Už máš účet?{" "}
          <Link href="/login" className="font-medium text-brand-600">
            Prihlás sa
          </Link>
        </p>
      </div>
    </div>
  );
}
