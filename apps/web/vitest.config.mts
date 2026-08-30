import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" — vitest resolves modules
    // itself and doesn't read tsconfig path mappings, so middleware.ts's
    // `@/lib/roles` import (unresolvable without this) fails only under
    // test, not under `next build`.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
