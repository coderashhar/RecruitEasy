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
      // Vitest runs plain Node, outside Next's RSC bundler, so the "react-server"
      // condition that normally makes this package a no-op is never active and it
      // throws unconditionally. Point it at its own no-op build under test.
      "server-only": fileURLToPath(new URL("../../node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
