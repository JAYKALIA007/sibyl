#!/usr/bin/env node
// Usage: node scripts/updater-manifest.mjs <out-path>
//
// Builds the `latest.json` feed that tauri-plugin-updater polls. `tauri build` (with
// bundle.createUpdaterArtifacts) emits a `.app.tar.gz` plus a detached `.sig`; this
// pairs them into the manifest format the plugin expects and points the download at
// the GitHub release for the current version.
//
// Kept as a script rather than switching the workflow to tauri-action, so the release
// job stays one `pnpm tauri build` we can reproduce locally.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'latest.json'
const BUNDLE_DIR = 'src-tauri/target/release/bundle/macos'
const REPO = 'https://github.com/JAYKALIA007/sibyl'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const files = readdirSync(BUNDLE_DIR)
const archive = files.find((f) => f.endsWith('.app.tar.gz'))
const signature = files.find((f) => f.endsWith('.app.tar.gz.sig'))

if (!archive || !signature) {
  console.error(
    `expected a .app.tar.gz and .app.tar.gz.sig in ${BUNDLE_DIR}, found: ${files.join(', ') || '(nothing)'}\n` +
      'Is bundle.createUpdaterArtifacts set, and were the signing env vars present?',
  )
  process.exit(1)
}

// We ship an arm64-only build today (#78 tracks universal). A missing platform key
// simply means the updater reports "no update" on that architecture, which is the
// correct answer until we publish one.
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature: readFileSync(join(BUNDLE_DIR, signature), 'utf8').trim(),
      url: `${REPO}/releases/download/v${version}/${encodeURIComponent(archive)}`,
    },
  },
}

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${out} for v${version} (${archive})`)
