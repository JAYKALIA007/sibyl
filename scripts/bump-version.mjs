#!/usr/bin/env node
// Usage: node scripts/bump-version.mjs <new-version>
// Updates all four version sources (package.json, tauri.conf.json, Cargo.toml,
// the sibyl-desktop entry in Cargo.lock) AND rolls the CHANGELOG's Unreleased
// section into a dated version section, in one shot.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch>')
  process.exit(1)
}

function bumpText(path, pattern, replacement) {
  const text = readFileSync(path, 'utf8')
  if (!pattern.test(text)) {
    console.error(`  no match in ${path}, pattern: ${pattern}`)
    process.exit(1)
  }
  writeFileSync(path, text.replace(pattern, replacement))
  console.log(`  ${path}`)
}

// Roll CHANGELOG's `## [Unreleased]` block into a dated `## [version]` section,
// leave a fresh empty Unreleased, and wire the compare/tag link references. A
// no-op (with a warning) if there's no changelog or nothing under Unreleased,
// so the version bump still succeeds and you can edit the notes by hand.
function bumpChangelog(path) {
  if (!existsSync(path)) {
    console.warn(`  (no ${path}, skipping changelog)`)
    return
  }
  const text = readFileSync(path, 'utf8')

  const section = text.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[)/)
  if (!section) {
    console.warn(`  (no [Unreleased] section in ${path}, skipping)`)
    return
  }
  const body = section[1].trim()
  if (!body) {
    console.warn(`  (${path} [Unreleased] is empty, add notes by hand)`)
    return
  }

  const date = new Date().toISOString().slice(0, 10)
  let next = text.replace(
    /## \[Unreleased\]\s*\n[\s\S]*?(?=\n## \[)/,
    `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n`,
  )

  // Repoint the Unreleased compare link at the new tag and add the tag's own link.
  const unreleased = next.match(/\[Unreleased\]:\s*(\S+?)\/compare\/\S+/)
  if (unreleased) {
    const base = unreleased[1] // e.g. https://github.com/OWNER/REPO
    next = next.replace(
      /\[Unreleased\]:\s*\S+/,
      `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/releases/tag/v${version}`,
    )
  }

  writeFileSync(path, next)
  console.log(`  ${path}`)
}

console.log(`bumping to ${version}:`)

// Surgical version-field replacements (first "version" match = the top-level one in
// both JSON files) so we don't re-serialize and reformat the rest of the file.
bumpText('package.json', /"version":\s*"[^"]*"/, `"version": "${version}"`)
bumpText('src-tauri/tauri.conf.json', /"version":\s*"[^"]*"/, `"version": "${version}"`)
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

bumpChangelog('CHANGELOG.md')

console.log(`\ndone. commit, push, then: git tag v${version} && git push origin v${version}`)
