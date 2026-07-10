// Copy the running Node binary into the Tauri bundle so the desktop app is fully
// self-contained. Apps launched from Finder don't inherit the shell PATH, so the
// shipped app can't rely on a system `node` being found (it usually won't be) —
// we ship one alongside the sidecar and spawn it by absolute path (see main.rs).
//
// This copies the LOCAL node, so the bundled runtime matches the build machine's
// architecture (arm64 here). For a cross-arch or reproducible build, fetch the
// official node binary for the target triple instead of copying process.execPath.

import { copyFileSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dest = join(here, '..', 'src-tauri', 'bin', 'node')

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(process.execPath, dest)
chmodSync(dest, 0o755)

console.log(`bundled node (${process.arch}) → ${dest}`)
