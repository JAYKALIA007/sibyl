import { defineConfig } from 'tsup'

// Bundles the CLI (bin.ts) and its on-demand chunks (cli.ts / server.ts) to plain
// ESM in dist/ for publishing, so the installed package needs no tsx at runtime.
// pg and express stay external (installed as dependencies); the shebang on bin.ts
// is preserved on the entry file.
export default defineConfig({
  entry: { sibyl: 'bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  splitting: true, // dynamic imports in bin.ts → separate cli/server chunks
  clean: true,
  outDir: 'dist',
  external: ['pg', 'express'],
})
