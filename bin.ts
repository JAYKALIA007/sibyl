#!/usr/bin/env node
// Published entry point for the `sibyl` command. Dispatches between the REPL
// (default) and the web GUI server (`sibyl serve` / `sibyl --web`). Kept tiny; the
// real work lives in cli.ts and server.ts, loaded on demand so only the chosen one
// runs its top-level.

// Installed globally there is no `--env-file` flag, so load .env from the current
// directory ourselves (mirrors the dev scripts). Missing file → the first-run
// wizard takes over.
try {
  process.loadEnvFile('.env')
} catch {
  // no .env in cwd — fine
}

const cmd = process.argv[2]

if (cmd === 'serve' || cmd === '--web') {
  process.argv.splice(2, 1) // hide the subcommand from server.ts's arg parsing
  await import('./server.ts')
} else {
  await import('./cli.ts')
}
