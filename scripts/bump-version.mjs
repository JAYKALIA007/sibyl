#!/usr/bin/env node
// Usage: node scripts/bump-version.mjs <new-version>
// Updates all three version sources (package.json, tauri.conf.json, Cargo.toml)
// and the sibyl-desktop entry in Cargo.lock in one shot.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch>')
  process.exit(1)
}

function bumpJson(path, updater) {
  const obj = JSON.parse(readFileSync(path, 'utf8'))
  updater(obj)
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n')
  console.log(`  ${path}`)
}

function bumpText(path, pattern, replacement) {
  const text = readFileSync(path, 'utf8')
  if (!pattern.test(text)) {
    console.error(`  no match in ${path} — pattern: ${pattern}`)
    process.exit(1)
  }
  writeFileSync(path, text.replace(pattern, replacement))
  console.log(`  ${path}`)
}

console.log(`bumping to ${version}:`)

bumpJson('package.json', (o) => { o.version = version })
bumpJson('src-tauri/tauri.conf.json', (o) => { o.version = version })
bumpText('src-tauri/Cargo.toml', /^version = ".*?"/m, `version = "${version}"`)

// Cargo.lock: update only the [[package]] block for sibyl-desktop, not other
// crates that happen to share the same version string.
const lock = readFileSync('src-tauri/Cargo.lock', 'utf8')
const next = lock.replace(
  /(name = "sibyl-desktop"\nversion = )"[^"]*"/,
  `$1"${version}"`,
)
if (next === lock) {
  console.error('  no sibyl-desktop block found in Cargo.lock')
  process.exit(1)
}
writeFileSync('src-tauri/Cargo.lock', next)
console.log('  src-tauri/Cargo.lock')

console.log(`\ndone — commit, push, then: git tag v${version} && git push origin v${version}`)
