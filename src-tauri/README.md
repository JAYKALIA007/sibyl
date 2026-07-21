# Sibyl Desktop

Sibyl as a native macOS app (distributed as a `.dmg`, no App Store). The Rust shell is
deliberately thin: it opens a window on the built web UI and spawns the existing Node
server as a **sidecar**. All product logic (NL→SQL, `pg`, Ollama, onboarding) stays in
TypeScript, unchanged — the desktop app is a packaging layer, not a rewrite.

## Why Tauri (not Electron / Wails)

- **vs Electron** — ~10 MB shell vs ~150 MB; uses the OS webview.
- **vs Wails** — Wails wants a Go backend; ours is 100% JS (`core.ts`, `pg`, Ollama).
  Both would end up spawning Node anyway, and Tauri has first-class support for it.
- **Rust cost is near-zero** — the sidecar model is config + ~70 lines of boilerplate
  Rust (`src/main.rs`); we write no custom native commands.

## Architecture

```
┌─────────────────────────── Tauri window ───────────────────────────┐
│  web/dist (React UI)  ──HTTP──►  127.0.0.1:47821/api                │
│  served by Tauri                        │                           │
└─────────────────────────────────────────┼───────────────────────────┘
                                           ▼
                  Node sidecar: bin/node sidecar/sibyl-server.mjs
              (a bundled Node runtime + the same Express server the
               CLI/web use, bundled to ONE self-contained .mjs file)
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                      ▼
                   Postgres (pg)                     Ollama (localhost:11434)
```

- **Self-contained**: both the Node runtime (`resources/bin/node`) and the server
  bundle (`resources/sidecar/sibyl-server.mjs`) ship inside the app. Nothing on the
  user's machine is needed except Ollama, which onboarding installs. (Apps launched
  from Finder don't inherit the shell `PATH`, so we can't rely on a system `node` —
  hence bundling one. `pg` is pure-JS, so there's no native addon to worry about.)
- **Dynamic port**: `main.rs` asks the OS for a free loopback port, starts the sidecar
  on it, and injects `window.__SIBYL_API__ = 'http://127.0.0.1:<port>/api'` into the
  webview via an initialization script (runs before any page script, so `api.ts` reads
  it synchronously). Nothing is baked into the web build, and two instances can run at
  once. CORS is enabled on the server for the `tauri://` origin.
- Because the port isn't known until setup, the window is created in `main.rs` rather
  than at startup — `tauri.conf.json` sets `"create": false` and keeps the window's
  size/title config, which `WebviewWindowBuilder::from_config` reads back.
- `src/main.rs` spawns the sidecar on window setup and kills it on exit.
- **Updates**: `tauri-plugin-updater` polls `latest.json` on the latest GitHub Release
  and verifies each archive against the minisign public key in `tauri.conf.json`. The
  check is **opt-in** — the frontend (`web/src/updater.ts`) asks once and stores the
  answer, so the app makes no outbound request until the user agrees. Release-side
  setup (signing secrets, the manifest script) is in [`RELEASING.md`](../RELEASING.md).

## Build the DMG

Prereqs: Rust toolchain (`rustup`), Node, `pnpm`. From the repo root:

```bash
pnpm install
pnpm tauri build     # → src-tauri/target/release/bundle/dmg/Sibyl_<version>_aarch64.dmg
```

`beforeBuildCommand` runs `desktop:prep` first — bundles the sidecar, copies the Node
runtime (`desktop:bundle-node`), and builds the desktop web bundle. The app is
**ad-hoc signed** (`bundle.macOS.signingIdentity = "-"`, free, no Apple account) so the
nested Node binary satisfies macOS's "nested code must be signed" rule.

Because it isn't notarized, the first launch shows Gatekeeper's "unidentified
developer" prompt — **right-click → Open** once to whitelist it. First launch also runs
the onboarding flow (install Ollama → pull the model → connect a DB).

Dev loop (uses a system `node`, no bundling):

```bash
pnpm tauri dev
```

## Deferred (hardening)

1. **Notarization** — removes the Gatekeeper prompt for other users. Needs an Apple
   Developer account ($99/yr) + a Developer ID cert; the ad-hoc signing above is the
   free stand-in.
2. **Cross-arch builds** — `desktop:bundle-node` copies the *local* Node, so the DMG
   matches the build machine (arm64 here). For Intel/universal, fetch the official Node
   binary for the target triple instead of copying `process.execPath`.
3. **Smaller bundle** — the bundled Node is ~90 MB. Node SEA (a single-file executable,
   needs a CJS entry) or trimming would shrink it; not worth it for v1.
4. **Windows/Linux** — bundling would ship the matching Node per platform. The updater
   manifest would also need the matching platform keys (`windows-x86_64`, …).
