// Jednoduchá jednopoužívateľská autentifikácia podpísanou cookie.
// Používa Web Crypto API, aby fungovala aj v Edge runtime (middleware).

export const SESSION_COOKIE = "nutri_session";

function getSecret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

// Token podpisuje konštantu — pre osobnú appku postačuje (cookie sa nedá
// sfalšovať bez znalosti SESSION_SECRET).
export async function createSessionToken(): Promise<string> {
  return hmac("authenticated");
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken();
  // konštantné porovnanie dĺžky
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
