// Hašovanie hesiel cez scrypt (zabudované v Node, bez závislostí).
// Asynchrónne – scryptSync blokoval event loop a každý pokus o prihlásenie
// zdržal celú inštanciu funkcie (ľahký DoS cez opakované prihlásenia).
import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, KEYLEN)).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const hash = Buffer.from(hashHex, "hex");
  let computed: Buffer;
  try {
    computed = await scrypt(password, salt, KEYLEN);
  } catch {
    return false;
  }
  if (hash.length !== computed.length) return false;
  return timingSafeEqual(hash, computed);
}

// Pri neexistujúcom mene sa predtým scrypt vôbec nespustil, takže čas odpovede
// prezrádzal, či účet existuje. Tu sa „naprázdno“ overí heslo voči fixnému hašu,
// aby neúspech trval rovnako dlho v oboch prípadoch.
let dummyHash: Promise<string> | null = null;
export async function verifyDummy(password: string): Promise<void> {
  if (!dummyHash) dummyHash = hashPassword("rypak-dummy-password");
  await verifyPassword(password, await dummyHash);
}
