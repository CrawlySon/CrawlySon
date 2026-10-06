import { defineConfig } from "vitest/config";
import path from "node:path";

// Testy sú len nad čistými funkciami (bez DB, bez siete) – pozri HANDOVER §3.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
