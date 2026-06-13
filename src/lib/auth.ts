// Bezpečné, viacpoužívateľské sedenia cez podpísanú cookie.
// Token = base64url(payload).HMAC(payload), payload = "<userId>.<issuedAtMs>".
// Funguje v Edge (middleware) aj Node runtime (Web Crypto API).

export const SESSION_COOKIE = "nutri_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 dní

function getSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  // Žiadny nebezpečný fallback – bez tajného kľúča sa NIKTO neprihlási (fail-closed).
  if (!s || s.length < 16) return null;
  return s;
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(userId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("SESSION_SECRET nie je nastavený (min. 16 znakov).");
  const payload = `${userId}.${Date.now()}`;
  const enc = b64urlEncode(payload);
  const sig = await hmacHex(enc, secret);
  return `${enc}.${sig}`;
}

// Overí podpis aj vek tokenu. Vráti userId alebo null.
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const enc = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const expected = await hmacHex(enc, secret);
  if (!constantTimeEqual(sig, expected)) return null;

  let payload: string;
  try {
    payload = b64urlDecode(enc);
  } catch {
    return null;
  }
  const dot = payload.indexOf(".");
  if (dot <= 0) return null;
  const userId = payload.slice(0, dot);
  const issuedAt = Number(payload.slice(dot + 1));
  if (!userId || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return userId;
}
