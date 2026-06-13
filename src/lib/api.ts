// Tenký klient pre volania na vlastné API.
async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Chyba ${res.status}`);
  }
  return res.json();
}

import type { Entry, ParsedItem, Profile, MealType } from "./types";

export const api = {
  getEntries: (date: string) => req<{ entries: Entry[] }>(`/api/entries?date=${date}`),

  addEntries: (payload: { date: string; mealType: MealType; source: string; items: ParsedItem[] }) =>
    req<{ entries: Entry[] }>(`/api/entries`, { method: "POST", body: JSON.stringify(payload) }),

  updateEntry: (id: string, data: Partial<Entry>) =>
    req<{ entry: Entry }>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteEntry: (id: string) => req<{ ok: true }>(`/api/entries/${id}`, { method: "DELETE" }),

  parse: (text: string) =>
    req<{ items: ParsedItem[]; mealType: MealType }>(`/api/parse`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getProfile: () => req<{ profile: Profile }>(`/api/profile`),
  updateProfile: (data: Partial<Profile>) =>
    req<{ profile: Profile }>(`/api/profile`, { method: "PATCH", body: JSON.stringify(data) }),

  searchFoods: (q: string) => req<{ foods: any[] }>(`/api/foods?q=${encodeURIComponent(q)}`),
  addFood: (data: any) => req<{ food: any }>(`/api/foods`, { method: "POST", body: JSON.stringify(data) }),
  seed: () => req<{ added: number; total: number }>(`/api/seed`, { method: "POST" }),

  history: (days: number) =>
    req<{ days: { date: string; calories: number; protein: number; carbs: number; fat: number; count: number }[] }>(
      `/api/history?days=${days}`
    ),

  logout: () => req<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),
};
