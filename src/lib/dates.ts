// Jediné miesto pre prácu s dátumom dňa (YYYY-MM-DD) na klientovi.
//
// PREČO: dátum dňa je LOKÁLNY dátum zariadenia. Každý výpočet, ktorý ide cez
// `Date.prototype.toISOString()`, prejde do UTC – a v SK čase (UTC+1/+2) je
// lokálna polnoc ešte predchádzajúci deň v UTC. Presne tak vznikol posun
// Analytiky o deň dozadu (chýbajúci dnešok v grafe). Tu sa preto skladá reťazec
// ručne z lokálnych zložiek a toISOString sa nepoužíva vôbec.
//
// Server (cron, komentáre) počíta v Europe/Bratislava cez `skToday()` v coach.ts –
// to je zámerne iná funkcia, lebo server nemá časové pásmo používateľa.

export type ISODate = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

/** Lokálny dátum ako YYYY-MM-DD (bez prechodu cez UTC). */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dnešný lokálny dátum. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Rozloží YYYY-MM-DD na lokálnu polnoc daného dňa. */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Posun o `days` dní (aj záporný), prechod cez mesiac/rok rieši Date sám. */
export function shiftISO(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/** Počet dní medzi dvoma dátumami (b − a), bez vplyvu letného času. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = Date.UTC(...splitUTC(b)) - Date.UTC(...splitUTC(a));
  return Math.round(ms / 86400000);
}

function splitUTC(date: ISODate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m - 1, d];
}

/** Pondelok týždňa, do ktorého dátum patrí. */
export function weekStartISO(date: ISODate): ISODate {
  const dt = parseISODate(date);
  const dow = (dt.getDay() + 6) % 7; // 0 = pondelok
  return shiftISO(date, -dow);
}

/** Prvý deň mesiaca. */
export function monthStartISO(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** Je reťazec platný dátum YYYY-MM-DD (existujúci deň)? */
export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** „Dnes“, „Včera“, inak napr. „ut 6. októbra“. */
export function formatDayLabel(date: ISODate, now: Date = new Date()): string {
  const today = todayISO(now);
  if (date === today) return "Dnes";
  if (date === shiftISO(today, -1)) return "Včera";
  return parseISODate(date).toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "long" });
}

/** Krátky zápis „6. 10.“ */
export function formatShort(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}
