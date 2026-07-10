// True when THIS module is the process entrypoint (`node foo.ts`) — used to gate the
// dev self-test blocks at the bottom of each module.
//
// Why not just compare inline: the desktop sidecar bundles every module into ONE
// .mjs file, so each module's `import.meta.url` collapses to that single file's URL,
// which then equals `process.argv[1]` for ALL of them — every self-test would fire on
// boot. tsup defines process.env.SIBYL_SIDECAR at build time (see
// tsup.sidecar.config.ts), so this returns false there. The CLI dist build uses code
// splitting (distinct chunk URLs) and normal `tsx` runs set nothing — both unaffected.
export function isMain(importMetaUrl: string): boolean {
  if (process.env.SIBYL_SIDECAR === '1') return false
  return importMetaUrl === `file://${process.argv[1]}`
}
