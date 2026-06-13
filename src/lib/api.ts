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
    req<{ items: ParsedItem[]; mealType: MealType; waterMl: number }>(`/api/parse`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getProfile: () => req<{ profile: Profile }>(`/api/profile`),
  updateProfile: (data: Partial<Profile>) =>
    req<{ profile: Profile }>(`/api/profile`, { method: "PATCH", body: JSON.stringify(data) }),

  searchFoods: (q: string) => req<{ foods: any[] }>(`/api/foods?q=${encodeURIComponent(q)}`),
  addFood: (data: any) => req<{ food: any }>(`/api/foods`, { method: "POST", body: JSON.stringify(data) }),
  updateFood: (id: string, data: any) =>
    req<{ food: any }>(`/api/foods/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFood: (id: string) => req<{ ok: true }>(`/api/foods/${id}`, { method: "DELETE" }),
  seed: () => req<{ added: number; total: number }>(`/api/seed`, { method: "POST" }),

  getWater: (date: string) =>
    req<{ logs: { id: string; ml: number; createdAt: string }[]; total: number; goal: number }>(
      `/api/water?date=${date}`
    ),
  addWater: (date: string, ml: number) =>
    req<{ log: any }>(`/api/water`, { method: "POST", body: JSON.stringify({ date, ml }) }),
  deleteWater: (id: string) => req<{ ok: true }>(`/api/water/${id}`, { method: "DELETE" }),

  history: (days: number, category?: string) =>
    req<{
      days: {
        date: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        count: number;
        healthScore: number | null;
        catCalories: number;
        catCount: number;
        waterMl: number;
      }[];
      categories: { name: string; calories: number; count: number }[];
    }>(`/api/history?days=${days}${category ? `&category=${encodeURIComponent(category)}` : ""}`),

  login: (username: string, password: string) =>
    req<{ ok: true; username: string }>(`/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, code: string) =>
    req<{ ok: true; username: string }>(`/api/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username, password, code }),
    }),
  me: () => req<{ user: { id: string; username: string; role: string } | null }>(`/api/auth/me`),
  logout: () => req<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),
};
