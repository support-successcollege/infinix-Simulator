import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    // The logic under test is pure — no DOM needed. Node 18+ exposes
    // globalThis.crypto.subtle, which is what lib/auth.ts uses.
    environment: "node",
    include: ["client/src/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
