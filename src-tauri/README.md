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
- The UI reaches the sidecar via `VITE_API_URL=http://127.0.0.1:47821/api` (baked into
  the desktop web build). CORS is enabled on the server for the `tauri://` origin.
- `src/main.rs` spawns the sidecar on window setup and kills it on exit.

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
4. **Dynamic port** — the port is hardcoded (`47821`). Pick a free port in `main.rs` and
   hand it to the frontend (window global / Tauri command) instead of baking it.
5. **Auto-update** — `tauri-plugin-updater` + a release feed.
6. **Windows/Linux** — `desktop:*` scripts use inline `VAR=val` (POSIX); Windows needs
   `cross-env`. Bundling would ship the matching Node per platform.
7. **Sidecar startup race** — if the webview loads before the sidecar is listening, the
   first API calls fail; the onboarding poll recovers, but a `/api/health` gate would be
   cleaner.
