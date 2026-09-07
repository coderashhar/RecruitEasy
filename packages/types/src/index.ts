// Extensionless relative specifiers, deliberately.
//
// These were `./roles.js` etc. — the NodeNext convention where a `.js`
// specifier refers to the `.ts` source. tsc (moduleResolution "Bundler"),
// vitest and tsx all map that back to `.ts`, but Turbopack does not: this
// package is `"type": "module"` with `main` pointing straight at TypeScript
// source, so Turbopack resolved `./roles.js` literally, found nothing, and
// reported the whole barrel as having "no exports at all".
//
// That failure is invisible to `typecheck`, `lint` and `test` — only
// `next build` (or a page actually importing a *value* from here, rather
// than a type, which erases) surfaces it. Extensionless resolves correctly
// in all four toolchains.
export * from "./roles";
export * from "./interview";
export * from "./job";
export * from "./application";
export * from "./feedback";
export * from "./execution";
export * from "./ats";
export * from "./realtime-events";
