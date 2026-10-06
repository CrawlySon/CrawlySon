"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Pig from "@/components/Pig";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
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
          <Pig mood={error ? "suspicious" : "content"} size={88} title="Rypák" />
          <div>
            <h1 className="display text-3xl leading-none text-ink">Rypák</h1>
            <p className="mt-1 text-sm font-medium text-muted">Denník, ktorý ti to povie.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="username">
              Meno
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              placeholder="napr. jaro"
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
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="border-2 border-bad bg-bad-soft p-2.5 text-sm font-semibold text-bad" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Prihlasujem…" : "Prihlásiť sa"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Nemáš účet?{" "}
          <Link href="/register" className="font-bold text-ink underline decoration-pig decoration-2 underline-offset-2">
            Zaregistruj sa
          </Link>
        </p>
      </div>
    </div>
  );
}
