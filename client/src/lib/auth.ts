/* ============================================================
   auth.ts — Client-side credential hashing

   IMPORTANT — read this before trusting it with anything:
   INFINIX ships as a static site (GitHub Pages). There is no
   server, so every check here runs on the visitor's own machine
   and can be bypassed by anyone willing to open DevTools.

   What this module DOES buy us:
     - Passwords are never written to localStorage in the clear,
       so a shared/kiosk browser doesn't leak them.
     - The bootstrap admin password is not committed to Git.
     - The bootstrap credential stops working once it's rotated.

   What it does NOT buy us: real authentication or authorization.
   Do not put confidential material behind this gate. See
   docs/SECURITY.md.
   ============================================================ */

const PBKDF2_ITERATIONS = 150_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** True when Web Crypto's subtle API is usable (https or localhost). */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/**
 * Derive a PBKDF2-SHA256 hash for `password` using `saltHex`.
 * Deliberately slow so that dumping localStorage doesn't hand an
 * attacker an instantly-crackable list.
 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  if (!isCryptoAvailable()) {
    throw new Error("הדפדפן אינו תומך בהצפנה מאובטחת (נדרש חיבור HTTPS)");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BITS
  );

  return toHex(bits);
}

/**
 * Compare two hex digests without an early return, so the loop's
 * runtime doesn't depend on how many leading characters matched.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createCredential(password: string): Promise<{ salt: string; passwordHash: string }> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  return { salt, passwordHash };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return safeCompare(actual, expectedHash);
}

/** Minimum bar for a new password. Returns null when acceptable. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[A-Za-z]/.test(password)) return "הסיסמה חייבת להכיל לפחות אות אחת";
  if (!/[0-9]/.test(password)) return "הסיסמה חייבת להכיל לפחות ספרה אחת";
  return null;
}
