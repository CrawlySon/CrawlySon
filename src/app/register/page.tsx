"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Pig from "@/components/Pig";

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
      // TODO(Fáza 1): po pridaní polí coachLevel/track* presmerovať do onboardingu (/welcome).
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-6 py-10">
      <div className="card-raised w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-4">
          <Pig mood={error ? "suspicious" : "proud"} size={88} title="Rypák" />
          <div>
            <h1 className="display text-2xl leading-none text-ink">Nový účet</h1>
            <p className="mt-1 text-sm font-medium text-muted">Rypák si ťa už brúsi.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="username">
              Meno (prihlasovacie)
            </label>
            <input
              id="username"
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
            <label className="label" htmlFor="password">
              Heslo
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="aspoň 8 znakov"
            />
          </div>
          <div>
            <label className="label" htmlFor="code">
              Registračný kód
            </label>
            <input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="kód od správcu" />
            <p className="mt-1 text-xs text-muted">Kód ti dá ten, kto ťa pozval.</p>
          </div>
          {error && (
            <p className="border-2 border-bad bg-bad-soft p-2.5 text-sm font-semibold text-bad" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Vytváram…" : "Zaregistrovať sa"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Už máš účet?{" "}
          <Link href="/login" className="font-bold text-ink underline decoration-pig decoration-2 underline-offset-2">
            Prihlás sa
          </Link>
        </p>
      </div>
    </div>
  );
}
