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

import type { Entry, ParsedItem, Profile, MealType, Favorite, FavoriteItem, Badge, Streak } from "./types";

export const api = {
  getEntries: (date: string) => req<{ entries: Entry[] }>(`/api/entries?date=${date}`),

  addEntries: (payload: { date: string; mealType: MealType; source: string; items: ParsedItem[] }) =>
    req<{ entries: Entry[] }>(`/api/entries`, { method: "POST", body: JSON.stringify(payload) }),

  updateEntry: (id: string, data: Partial<Entry>) =>
    req<{ entry: Entry }>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteEntry: (id: string) => req<{ ok: true }>(`/api/entries/${id}`, { method: "DELETE" }),

  parse: (text: string) =>
    req<{ items: ParsedItem[]; mealType: MealType; waterMl: number; usage?: { model: string } }>(`/api/parse`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getFavorites: () => req<{ favorites: Favorite[] }>(`/api/favorites`),
  addFavorite: (payload: { name: string; mealType: MealType; items: FavoriteItem[] }) =>
    req<{ favorite: Favorite }>(`/api/favorites`, { method: "POST", body: JSON.stringify(payload) }),
  deleteFavorite: (id: string) => req<{ ok: true }>(`/api/favorites/${id}`, { method: "DELETE" }),
  logFavorite: (id: string, date: string, mealType?: MealType) =>
    req<{ entries: Entry[] }>(`/api/favorites/${id}/log`, {
      method: "POST",
      body: JSON.stringify({ date, mealType }),
    }),

  testPush: () => req<{ ok: true; sent: number }>(`/api/push/test`, { method: "POST" }),

  getProfile: () => req<{ profile: Profile }>(`/api/profile`),
  updateProfile: (data: Partial<Profile>) =>
    req<{ profile: Profile }>(`/api/profile`, { method: "PATCH", body: JSON.stringify(data) }),

  getBadges: () =>
    req<{ badges: Badge[]; streaks: Streak[]; earnedCount: number; total: number }>(`/api/badges`),

  calendarDays: (from: string, to: string) =>
    req<{ dates: string[] }>(`/api/calendar?from=${from}&to=${to}`),

  searchFoods: (q: string, scope: "mine" | "global" | "all" = "all") =>
    req<{ foods: any[] }>(`/api/foods?q=${encodeURIComponent(q)}&scope=${scope}`),
  addFood: (data: any) => req<{ food: any }>(`/api/foods`, { method: "POST", body: JSON.stringify(data) }),
  updateFood: (id: string, data: any) =>
    req<{ food: any }>(`/api/foods/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFood: (id: string) => req<{ ok: true }>(`/api/foods/${id}`, { method: "DELETE" }),
  seed: () => req<{ added: number; total: number }>(`/api/seed`, { method: "POST" }),
  lookupBarcode: (code: string) =>
    req<{ found: boolean; source?: string; food?: any; code?: string }>(`/api/barcode?code=${encodeURIComponent(code)}`),
  aiBarcodeLookup: (name: string, code?: string | null) =>
    req<{ found: boolean; food?: any }>(`/api/barcode/ai`, {
      method: "POST",
      body: JSON.stringify({ name, code }),
    }),
  parseNutritionPhoto: (imageBase64: string, mimeType: string) =>
    req<{
      found: boolean;
      nutrition?: {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number | null;
        category: string | null;
        healthIndex: number | null;
      };
    }>(`/api/barcode/photo`, {
      method: "POST",
      body: JSON.stringify({ imageBase64, mimeType }),
    }),

  getWater: (date: string) =>
    req<{ logs: { id: string; ml: number; createdAt: string }[]; total: number; goal: number }>(
      `/api/water?date=${date}`
    ),
  addWater: (date: string, ml: number) =>
    req<{ log: any }>(`/api/water`, { method: "POST", body: JSON.stringify({ date, ml }) }),
  deleteWater: (id: string) => req<{ ok: true }>(`/api/water/${id}`, { method: "DELETE" }),

  history: (from: string, to: string, category?: string) =>
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
    }>(`/api/history?from=${from}&to=${to}${category ? `&category=${encodeURIComponent(category)}` : ""}`),

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
  usage: () =>
    req<{
      calls: number;
      totalTokens: number;
      promptTokens: number;
      outputTokens: number;
      days: { date: string; tokens: number; calls: number }[];
      recent: { createdAt: string; model: string; totalTokens: number }[];
    }>(`/api/usage`),
  logout: () => req<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),
};
