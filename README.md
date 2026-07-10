# Sibyl

**Ask your database in plain English.** Sibyl reads your schema, writes the SQL,
runs it, and shows you the answer — locally, with **no cloud and no API key**. Your
schema, your data, and your questions never leave your machine.

> Named for the [sibyls](https://en.wikipedia.org/wiki/Sibyl) — the oracles you
> asked a question and got an answer from.

```
sibyl> How many orders did each user place?

  SQL: SELECT u.name, COUNT(o.id) AS order_count FROM users u
       JOIN orders o ON o.user_id = u.id GROUP BY u.name ORDER BY order_count DESC

  ┌───────────────┬─────────────┐
  │ name          │ order_count │
  ┼───────────────┼─────────────┼
  │ Alice Johnson │ 3           │
  │ Bob Smith     │ 2           │
  │ Carla Diaz    │ 2           │
  │ Deepak Rao    │ 2           │
  │ Elena Petrova │ 1           │
  └───────────────┴─────────────┘

  ✓ Alice Johnson placed the most orders (3), followed by Bob Smith, Carla Diaz,
    and Deepak Rao (2 each), and Elena Petrova (1). (2.4s, 5 rows)
```

Sibyl runs the model **locally via [Ollama](https://ollama.com)** and talks to **your
own Postgres**. There are three ways to use it, all the same engine underneath:

- 🖥️ **Native macOS app** — a `.dmg`, easiest for non-terminal users.
- 💬 **CLI REPL** — `npx sibyl-cli`, for people who live in the terminal.
- 🌐 **Web GUI** — `npx sibyl-cli serve`, a browser front-end over the same engine.

<!-- TODO: add a screenshot of the desktop app / web GUI here, e.g.:
![Sibyl](docs/screenshot.png) -->

## Download

### macOS desktop app

The easiest way to run Sibyl — no terminal required.

**[⬇ Download the latest `.dmg` from GitHub Releases →](https://github.com/JAYKALIA007/sibyl/releases/latest)**

Open the `.dmg`, drag **Sibyl** to Applications, and launch it. On first run, Sibyl
walks you through [onboarding](#first-run-onboarding) — install Ollama, pull the
model, connect a database — and you're asking questions.

> **A couple of things to know:**
>
> - **Apple Silicon (arm64) only** for now. Intel/universal builds are on the
>   roadmap — see [`src-tauri/README.md`](./src-tauri/README.md).
> - The app is **unsigned / ad-hoc signed** (no paid Apple Developer account), so on
>   first launch macOS Gatekeeper will warn about an unidentified developer.
>   **Right-click the app → Open** once to whitelist it; after that it opens normally.
> - **[Ollama](https://ollama.com) is required** to run the local model — onboarding
>   installs and sets it up for you.

### Prefer the terminal?

You don't need the desktop app. The same engine ships on npm as
[`sibyl-cli`](https://www.npmjs.com/package/sibyl-cli):

```bash
npx sibyl-cli            # CLI REPL — run without installing
npx sibyl-cli serve      # Web GUI — opens a local URL in your browser
```

Or install the `sibyl` command globally: `npm i -g sibyl-cli`, then `sibyl` /
`sibyl serve`. (The package publishes as `sibyl-cli`; the command it installs is
**`sibyl`**.) See [Install](#install) for details.

## Features

- **Local & private** — the model runs on your machine via Ollama; nothing leaves it,
  and there's no API key.
- **Read-only & safe** — Sibyl only ever runs `SELECT` (a guard rejects anything
  else) and auto-injects a `LIMIT`. Point it at a **read-only Postgres role** and the
  database itself becomes the safety wall.
- **First-run onboarding** — guides you through installing Ollama, pulling the model,
  and connecting a database. No config files to edit first.
- **Multi-connection sidebar** (web + desktop) — save any number of databases, switch
  between them without restarting; each switch starts a fresh conversation.
- **Slash commands** — type `/` in the composer for `/schema`, `/tables`,
  `/sql <query>`, `/new`, and `/help`.
- **Schema-aware starter questions** — the empty state suggests questions generated
  from your actual schema, with an animated loader while they warm up.
- **Self-correcting** — retries on SQL errors, feeding the database's own error
  message back to the model as guidance.
- **Conversational** — remembers the last few turns, so follow-ups like "how many did
  *they* order?" resolve.
- **Measured** — an execution-accuracy eval proves the generated SQL is correct.

## Prerequisites

Sibyl talks to two things that `npx sibyl-cli` does **not** bundle (the desktop app
bundles its own Node runtime, but still needs these):

1. **[Ollama](https://ollama.com)** — the local model host. Onboarding installs it and
   pulls the SQL model (`ollama pull qwen2.5-coder`, ~4.7 GB, one time).
2. **A PostgreSQL connection URL** — any Postgres database you have read access to.

## Install

Sibyl runs entirely on a **local LLM** — nothing leaves your machine, and there's no
API key.

**If you don't already have a local model, run this once:**

```bash
# 1. install Ollama (macOS / Linux / Windows) from https://ollama.com, then:
ollama pull qwen2.5-coder      # the model Sibyl uses to write SQL
```

Sibyl checks this on startup — if Ollama isn't running, or the model isn't pulled, it
tells you exactly what to run (and offers to pull the model for you).

**Then run Sibyl:**

```bash
npx sibyl-cli            # run the CLI REPL without installing
npx sibyl-cli serve      # or launch the web GUI

# or install the `sibyl` command globally:
npm i -g sibyl-cli       # then: sibyl   /   sibyl serve
```

The package publishes as `sibyl-cli`; the command it installs is **`sibyl`**.

### First-run onboarding

With nothing configured, Sibyl guides you through setup — no config files to edit
first. This applies to the **desktop app**, `sibyl serve`, and the CLI REPL:

1. **Ollama** — if it isn't installed/running, Sibyl points you to
   [ollama.com/download](https://ollama.com/download) and waits.
2. **Model** — if the SQL model isn't pulled, it hands you the exact
   `ollama pull qwen2.5-coder` command (the CLI offers to run it for you). The web and
   desktop onboarding poll automatically and advance the moment the model is ready.
3. **Database** — connect a Postgres URL. The CLI asks for one, connects to check it,
   reports the table count, and offers to save it to `.env`; the web/desktop app opens
   an **Add connection** dialog and validates the URL before saving.

Then you land at the prompt (or the chat composer). Ask away.

> **CLI note:** Sibyl reads `.env` from — and saves it to — the **current directory**.
> Run it from the folder where you want that `.env` to live. Point at a database for a
> single run without any file via `sibyl --db "postgresql://…"`.

## Connecting a database

Sibyl introspects the schema automatically — point it at any PostgreSQL database you
have read access to, via the first-run onboarding, a `DATABASE_URL` in `.env`, or the
`--db` flag (CLI). For a database that holds **real data**, connect as a **read-only
role**: that's the safety wall, so even a mistaken write is rejected by the database
itself (Sibyl also refuses non-`SELECT` SQL, but defense in depth wins).

> ⚠️ Don't run `seed.sql` against a database you care about — it's sample data for a
> fresh/throwaway DB, not something to load into an existing one.

**Create a read-only role** (run once in your SQL editor — this only adds a login, it
does not modify any data):

```sql
CREATE ROLE sibyl_ro LOGIN PASSWORD 'pick-a-strong-password';
GRANT CONNECT ON DATABASE postgres TO sibyl_ro;
GRANT USAGE  ON SCHEMA public       TO sibyl_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sibyl_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sibyl_ro;
```

Verify it really is read-only — this must **fail** with a permission error:

```sql
SET ROLE sibyl_ro;
DELETE FROM <any-table> WHERE false;   -- expected: permission denied
RESET ROLE;
```

Then point Sibyl at it — onboarding prompts for it, or set it yourself in `.env`:

```
DATABASE_URL=postgresql://sibyl_ro:PASSWORD@host:5432/dbname?sslmode=require
```

…or for a single CLI run without touching `.env`:

```bash
npx sibyl-cli --db "postgresql://sibyl_ro:PASSWORD@host:5432/dbname?sslmode=require"
```

On Supabase, find the host under **Project Settings → Database → Connection string →
Direct connection** (port **5432**, not the 6543 pooler); SSL is required. See
[`SETUP.md`](./SETUP.md) for the full walkthrough, including the bundled `seed.sql`
sample database.

## Built-in commands

**CLI REPL** — type a `.command`:

| Command           | What it does                                    |
|-------------------|-------------------------------------------------|
| `.schema`         | Print the DDL Sibyl is working from             |
| `.tables`         | List tables with row counts                     |
| `.last`           | Re-print the last generated SQL                 |
| `.export [file]`  | Save the last result to CSV                     |
| `.clear`          | Clear the terminal and reset conversation memory|
| `.help`           | Show the command list                           |
| `exit`            | Quit (also Ctrl-C / Ctrl-D)                      |

Question history persists across sessions (`~/.sibyl_history`) — arrow-up recalls
past questions.

**Web GUI & desktop app** — type `/` in the composer:

| Command          | What it does                              |
|------------------|-------------------------------------------|
| `/schema`        | Show the database schema Sibyl reads      |
| `/tables`        | List tables with row counts               |
| `/sql <query>`   | Run a read-only SQL query yourself        |
| `/new`           | Start a fresh conversation                |
| `/help`          | What Sibyl can do and how to ask          |

## Quick start (from source)

For development, or to run the evals and the web app:

```bash
# 1. Clone + install  (one pnpm workspace covers the engine and the web/ app)
git clone https://github.com/JAYKALIA007/sibyl.git
cd sibyl
pnpm install             # needs pnpm — `corepack enable` ships it with Node ≥ 16

# 2. Pull the model, then start the REPL
ollama pull qwen2.5-coder
pnpm sibyl
```

The from-source REPL reads `.env` in the repo root — copy `.env.example` and fill in
`DATABASE_URL`, or let the first-run onboarding create it. See
[Connecting a database](#connecting-a-database) for the read-only role.

> **Why pnpm?** Beyond a strict, content-addressed `node_modules`, we set a
> [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage) of 24h — pnpm
> refuses any dependency version published less than a day ago, so the typical
> npm-supply-chain compromise (malicious versions yanked within hours) never lands.

## Model swap

Sibyl defaults to `qwen2.5-coder` (strong SQL generation, runs on ~8 GB RAM).
Override via `.env`:

```
SIBYL_CHAT_MODEL=llama3.1
```

Any model served by your local Ollama works. Larger models produce better SQL;
the execution-accuracy eval measures the difference.

Ollama's default context window is only 2,048 tokens; Sibyl raises it to 8,192 so
the schema and conversation fit. Override with `SIBYL_NUM_CTX` (qwen2.5-coder
supports up to 32,768).

Every CLI answer prints a **token meter** (real counts from Ollama) so you can watch
how full the window is — the signal for when a schema has outgrown "whole schema
in the prompt":

```
ctx 1,009 / 8,192 (12%)  ·  out 30
```

## Architecture

One core engine (`core.ts`) behind three surfaces — the CLI, the web GUI, and the
native desktop shell:

```
question
   │
   ▼
introspect.ts  ──→  schema DDL
   │
   ▼
nl2sql.ts      ──→  SQL (temp 0, retry w/ error feedback)
   │
   ▼
guard.ts       ──→  SELECT-only check + LIMIT injection
   │
   ▼
db.ts          ──→  runQuery (read-only role, 5 s timeout)
   │
   ▼
core.ts        ──→  retry loop (cap 3) + NL summary
   │
   ├──→  cli.ts     (the REPL)
   └──→  server.ts  (Express API) ──→ web/ (React SPA)
                          │
                          └──→ src-tauri/ (native macOS shell — spawns the
                               server as a sidecar; see src-tauri/README.md)
```

See [`DESIGN.md`](./DESIGN.md) for the locked decisions and rationale, and
[`src-tauri/README.md`](./src-tauri/README.md) for the desktop app internals (Tauri
shell + Node sidecar) and how to build the `.dmg`.

## Web GUI

A browser front-end (React + shadcn + assistant-ui) over the same engine.

**Run it (one process):**

```bash
pnpm start        # builds web/ and serves the app + API at http://127.0.0.1:3001
```

**Multiple connections:** the left sidebar holds any number of saved databases —
add one (name + URL, validated before saving), switch between them without
restarting, rename or delete. Switching starts a fresh conversation (a different
schema is a different context). Saved connections live in `~/.sibyl/connections.json`
(`0600`); the raw URL stays server-side and the UI only ever shows a password-free
`user@host/db` label. Your existing `.env` `DATABASE_URL` is seeded as the first
connection. Type `/` in the composer for the built-in commands (`/schema`,
`/tables`, `/sql`, `/new`, `/help`).

**Develop it (two processes, hot reload):**

```bash
# terminal 1 — the API (Express over core.ask, localhost only)
pnpm server

# terminal 2 — the React app (Vite dev server, proxies /api → :3001)
pnpm --filter sibyl-web dev   # → http://localhost:5173
```

The server is stateless and loopback-bound; the browser owns the conversation.
Point the client at a different API with `VITE_API_URL` (defaults to `/api`,
proxied in dev). `SIBYL_SERVE_STATIC=false` runs the API alone — which is how the
desktop shell serves its own assets.

## Desktop app (from source)

The macOS app is a thin [Tauri](https://tauri.app) shell that opens the built web UI
and spawns the same Node server as a **sidecar** — all product logic (NL→SQL, `pg`,
Ollama, onboarding) stays in TypeScript, unchanged. To build the `.dmg` yourself:

```bash
pnpm install
pnpm tauri build     # → src-tauri/target/release/bundle/dmg/Sibyl_<version>_aarch64.dmg
```

Full details — the sidecar architecture, ad-hoc signing, Gatekeeper, and deferred
hardening (notarization, cross-arch, auto-update) — live in
[`src-tauri/README.md`](./src-tauri/README.md).

## Development

```bash
pnpm ollama:check   # verify Ollama + model
pnpm db:check       # verify DB connection + read-only role
pnpm schema:ddl     # print live schema as DDL
pnpm nl2sql:check   # generate SQL for sample questions
pnpm core:check     # run sample questions end-to-end
pnpm test           # unit tests (comparator + guard + schema formatter)
pnpm eval           # single-turn execution-accuracy eval (score vs gold SQL)
pnpm eval:multi     # multi-turn (conversational) eval + memory controls
pnpm sibyl          # interactive REPL
```

## Measuring accuracy

`pnpm eval` scores generated SQL against hand-written **gold SQL** by *executing
both and comparing the rows* — not by matching query text. The 19 cases span
filters, joins, group-by, `HAVING`, subqueries, self-joins, junction `AND`/`NOT`,
`NULL` logic, multi-table revenue aggregation, top-N ordering, and an off-schema
refusal. The brain is swappable; the eval decides which brain wins:

```
Sibyl execution-accuracy eval — model: qwen2.5-coder
  ✓ filter  ✓ aggregation×2  ✓ join  ✓ group-by  ✓ ordered  ✓ anti-join
  ✓ junction-and  ✓ subquery  ✓ having×2  ✓ multi-join-agg  ✓ self-join
  ✗ null-logic  ✓ anti-junction  ✓ nested-agg  ✓ distinct  ✓ top-n  ✓ refusal
  Score: 18/19 (95%)
```

The one miss is instructive: asked which shipments have *shipped but not been
delivered*, the model invents a `status` column instead of reasoning about the
`shipped_at` / `delivered_at` NULLs — a single-shot slip the retry loop
usually recovers from. Swap to a weaker/general model and the score drops sharply:

```bash
SIBYL_CHAT_MODEL=llama3.2 pnpm eval    # a general 3B model misses most of the hard rungs
```

### Multi-turn eval

`pnpm eval:multi` scores *conversations* — later turns refer back ("how many
did **they** order?"). It self-threads (feeds the model its own prior SQL, like the
CLI does) and reports two numbers plus a **no-history control** that proves the
memory — not luck — is doing the work:

```
Per-step:         8/8 (100%)
Per-conversation: 4/4 (100%)
Memory controls:  4/4 referential steps confirmed history-dependent
```

## Status

The core is complete and usable end-to-end: schema → SQL → guard → run → summarize,
behind a CLI REPL, a web GUI, and a native macOS desktop app, measured by an
execution-accuracy eval. Published as
[`sibyl-cli`](https://www.npmjs.com/package/sibyl-cli); desktop builds ship via
[GitHub Releases](https://github.com/JAYKALIA007/sibyl/releases/latest). Planned work
is tracked in [Issues](../../issues).

## License

MIT.
