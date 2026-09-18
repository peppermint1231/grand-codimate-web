import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    alias: {
      "cloudflare:workers": new URL("./tests/support/durable-object.ts", import.meta.url).pathname,
    },
  },
});
