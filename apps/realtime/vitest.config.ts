import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Loaded here (not just in package.json's dev/start scripts) so the
// integration suite has DATABASE_URL / REALTIME_JWT_SECRET without every
// contributor having to export them by hand before running `npm test`.
const envPath = new URL("./.env", import.meta.url).pathname;
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  test: {
    environment: "node",
  },
});
