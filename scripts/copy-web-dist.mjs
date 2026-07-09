// Copy the built web SPA into dist/web/dist so the published package can serve it.
// server.ts resolves web assets relative to its own file (import.meta.url); after
// bundling that file lives in dist/, so the assets must sit at dist/web/dist.
import { cpSync, existsSync } from 'node:fs'

const SRC = 'web/dist'
const DEST = 'dist/web/dist'

if (!existsSync(SRC)) {
  console.error(`✗ ${SRC} not found — run \`pnpm run web:build\` first.`)
  process.exit(1)
}

cpSync(SRC, DEST, { recursive: true })
console.log(`✓ copied ${SRC} → ${DEST}`)
