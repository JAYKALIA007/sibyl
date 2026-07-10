import { defineConfig } from 'tsup'

// The desktop sidecar: the SAME Express server the CLI/web use, but bundled into ONE
// self-contained CJS file with pg + express INLINED (the CLI keeps them external as
// npm deps; the sidecar has no node_modules alongside it). This single file is what
// the Tauri shell spawns — and, later, what Node SEA wraps into a standalone binary
// so the desktop app needs no system Node. pg is pure-JS, so there's no native addon
// to bundle; pg-native is an optional require we never use.
export default defineConfig({
  entry: { 'sibyl-server': 'server.ts' },
  // ESM (.mjs) because several modules use top-level await (self-test blocks). The
  // catch: bundling CJS deps (Express/pg) into ESM makes esbuild emit a __require
  // shim that throws on dynamic require. The banner supplies a real createRequire so
  // that shim resolves node built-ins instead of throwing — the standard esbuild fix.
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  banner: {
    js: "import { createRequire as __sibylCreateRequire } from 'module'; const require = __sibylCreateRequire(import.meta.url);",
  },
  platform: 'node',
  target: 'node20',
  splitting: false, // one file, no sibling chunks — the sidecar must stand alone
  // Bakes process.env.SIBYL_SIDECAR='1' into the bundle so isMain() reports false —
  // otherwise every module's self-test block fires (they collapse to one file whose
  // URL equals argv[1]). See isMain.ts.
  env: { SIBYL_SIDECAR: '1' },
  clean: true,
  outDir: 'src-tauri/sidecar',
  noExternal: [/.*/], // bundle EVERYTHING — the sidecar stands alone
  external: ['pg-native'], // optional native driver we never load
})
