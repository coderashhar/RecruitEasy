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
    // The integration suite talks to a real, remote Postgres (Neon). Each test
    // makes several round trips — create an interview, hydrate the room, load
    // chat history — and takes 2-5s on its own, which vitest's 5s default
    // failed intermittently, and reliably once turbo ran it alongside the web
    // suite. Timing out means "the network was slow", not "the code is wrong".
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
