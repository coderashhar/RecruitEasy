import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse and mammoth are Node.js-only packages used in server actions for
  // resume parsing. Turbopack resolves the "browser" export condition of
  // pdf-parse and loads its browser/web-worker build instead of the Node.js
  // CJS build, causing "Invalid PDF structure" errors at runtime. Marking them
  // as serverExternalPackages skips bundling and lets Node require() them
  // directly, which resolves the correct "require" export path.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  turbopack: {
    resolveAlias: {
      // y-monaco@0.1.6 hardcodes `monaco-editor/esm/vs/editor/editor.api.js`,
      // which monaco-editor@0.56's exports map no longer permits: its
      // `"./*": "./esm/vs/*.js"` rule rewrites that specifier to a doubled
      // `esm/vs/esm/vs/...` path that doesn't exist, so the interview room
      // fails to build. y-monaco still declares `monaco-editor >=0.20.0`, so
      // there's no version of it that has caught up.
      //
      // `monaco-editor/editor/editor.api` is the same file by the path the
      // exports map actually allows.
      "monaco-editor/esm/vs/editor/editor.api.js": "monaco-editor/editor/editor.api",
    },
  },
};

export default nextConfig;
