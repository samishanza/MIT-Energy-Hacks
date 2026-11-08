import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // A whole recorded site run takes most of a second, and a test may run several while other files run in parallel.
    testTimeout: 30_000,
  },
});
