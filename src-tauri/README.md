# Sibyl Desktop (Tauri spike)

A spike proving Sibyl can ship as a native desktop app. The Rust shell is deliberately
thin: it opens a window on the built web UI and spawns the existing Node server as a
**sidecar**. All product logic (NL→SQL, `pg`, Ollama, onboarding) stays in TypeScript,
unchanged — the desktop app is a packaging layer, not a rewrite.

## Why Tauri (not Electron / Wails)

- **vs Electron** — ~10 MB bundle vs ~150 MB; uses the OS webview.
- **vs Wails** — Wails wants a Go backend; ours is 100% JS (`core.ts`, `pg`, Ollama).
  Both would end up spawning Node anyway, and Tauri has first-class support for it.
- **Rust cost is near-zero** — the sidecar model is config + ~60 lines of boilerplate
  Rust (`src/main.rs`); we write no custom native commands.

## Architecture

```
┌─────────────────────────── Tauri window ───────────────────────────┐
│  web/dist (React UI)  ──HTTP──►  127.0.0.1:47821/api                │
│  served by Tauri                        │                           │
└─────────────────────────────────────────┼───────────────────────────┘
                                           ▼
                        Node sidecar: sibyl-server.mjs
                     (the same Express server the CLI/web use,
                      bundled to ONE self-contained .mjs file)
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                      ▼
                   Postgres (pg)                     Ollama (localhost:11434)
```

- The UI reaches the sidecar via `VITE_API_URL=http://127.0.0.1:47821/api` (baked into
  the desktop web build). CORS is enabled on the server for the `tauri://` origin.
- `src/main.rs` spawns the sidecar on window setup and kills it on exit.

## What the spike PROVES

- ✅ The server bundles to a **single self-contained `.mjs`** (`pg` + `express`
  inlined). `pg` is pure-JS — **no native addon to bundle**, the biggest risk, gone.
- ✅ That bundle **boots standalone** and serves the full API (`/api/health`,
  `/api/setup`, `/api/connections`, …) — verified with `node sidecar/sibyl-server.mjs`.
- ✅ The server is now **boot-resilient**: it no longer exits when Ollama isn't ready,
  so the desktop app can open and run the onboarding flow (`GET /api/setup`).
- ✅ The Rust shell compiles and the Tauri config/icons/resources are wired.

## Run it

Prereqs: Rust toolchain (`rustup`), Node, `pnpm`, and Ollama (the app onboards you
through the model pull). From the repo root:

```bash
pnpm install
pnpm tauri dev      # bundles the sidecar, builds the desktop web bundle, opens the window
```

Build a distributable app bundle:

```bash
pnpm tauri build    # → src-tauri/target/release/bundle/ (.app, .dmg on macOS)
```

Both run `desktop:prep` first (`sidecar:build` + `desktop:build-web`).

## Deferred (hardening, not spike scope)

1. **No system Node** — the spike spawns the sidecar via the system `node`. Ship-blocker
   for real distribution. Next step: **Node SEA** (Single Executable Application) wraps
   `sibyl-server.mjs` into a standalone binary shipped as a Tauri `externalBin` sidecar
   (needs a CJS entry — `server.ts` already boots via `start()` with no top-level await
   to enable this). Alternative: embed a Node runtime.
2. **Dynamic port** — the port is hardcoded (`47821`). Pick a free port in `main.rs` and
   hand it to the frontend (window global or a Tauri command) instead of baking it.
3. **Code signing + notarization** — required for Gatekeeper (macOS) / SmartScreen
   (Windows). Needs an Apple Developer cert + `tauri.conf.json > bundle > macOS`.
4. **Auto-update** — `tauri-plugin-updater` + a release feed.
5. **Windows dev script** — the `desktop:*` scripts use inline `VAR=val` (POSIX shells);
   Windows needs `cross-env`.
6. **Sidecar startup race** — if the webview loads before the sidecar is listening, the
   first API calls fail; the onboarding poll recovers, but a `/api/health` gate would be
   cleaner.
