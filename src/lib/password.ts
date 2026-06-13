// Hašovanie hesiel cez scrypt (zabudované v Node, bez závislostí).
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const hash = Buffer.from(hashHex, "hex");
  let computed: Buffer;
  try {
    computed = scryptSync(password, salt, KEYLEN);
  } catch {
    return false;
  }
  if (hash.length !== computed.length) return false;
  return timingSafeEqual(hash, computed);
}
