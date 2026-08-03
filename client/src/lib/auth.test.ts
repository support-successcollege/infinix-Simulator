import { describe, expect, it } from "vitest";

import {
  createCredential,
  generateSalt,
  hashPassword,
  isCryptoAvailable,
  safeCompare,
  validatePasswordStrength,
  verifyPassword,
} from "./auth";

describe("isCryptoAvailable", () => {
  it("is true under the test runner", () => {
    expect(isCryptoAvailable()).toBe(true);
  });
});

describe("generateSalt", () => {
  it("returns 32 hex characters (16 bytes)", () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    const salts = new Set(Array.from({ length: 50 }, () => generateSalt()));
    expect(salts.size).toBe(50);
  });
});

describe("hashPassword", () => {
  it("is deterministic for the same password and salt", async () => {
    const salt = generateSalt();
    expect(await hashPassword("hunter2", salt)).toBe(await hashPassword("hunter2", salt));
  });

  it("produces a different digest for a different salt", async () => {
    const a = await hashPassword("hunter2", generateSalt());
    const b = await hashPassword("hunter2", generateSalt());
    expect(a).not.toBe(b);
  });

  it("produces a different digest for a different password", async () => {
    const salt = generateSalt();
    expect(await hashPassword("hunter2", salt)).not.toBe(await hashPassword("hunter3", salt));
  });

  it("never returns the password itself", async () => {
    const digest = await hashPassword("hunter2", generateSalt());
    expect(digest).not.toContain("hunter2");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("safeCompare", () => {
  it("matches identical strings", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(safeCompare("abc123", "abc124")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
    expect(safeCompare("", "a")).toBe(false);
  });
});

describe("createCredential / verifyPassword", () => {
  it("round-trips the correct password", async () => {
    const { salt, passwordHash } = await createCredential("Passw0rd");
    expect(await verifyPassword("Passw0rd", salt, passwordHash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const { salt, passwordHash } = await createCredential("Passw0rd");
    expect(await verifyPassword("Passw0rd!", salt, passwordHash)).toBe(false);
    expect(await verifyPassword("", salt, passwordHash)).toBe(false);
  });

  it("rejects when the stored hash is empty (unknown-account probe)", async () => {
    expect(await verifyPassword("anything", generateSalt(), "")).toBe(false);
  });

  it("gives two accounts with the same password different hashes", async () => {
    const a = await createCredential("shared-password-1");
    const b = await createCredential("shared-password-1");
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});

describe("validatePasswordStrength", () => {
  it("accepts a password with 8+ chars, a letter and a digit", () => {
    expect(validatePasswordStrength("infinix2024")).toBeNull();
  });

  it("rejects short passwords", () => {
    expect(validatePasswordStrength("ab1")).toContain("8 תווים");
  });

  it("rejects passwords with no letter", () => {
    expect(validatePasswordStrength("12345678")).toContain("אות");
  });

  it("rejects passwords with no digit", () => {
    expect(validatePasswordStrength("abcdefgh")).toContain("ספרה");
  });

  it("rejects the old hardcoded default", () => {
    expect(validatePasswordStrength("123456")).not.toBeNull();
  });
});
