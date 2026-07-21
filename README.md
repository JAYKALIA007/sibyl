# Sibyl

**Ask your database in plain English.** Reads your schema, writes the SQL, runs it,
shows the answer — locally. No cloud, no API key. Schema, data, and questions never
leave your machine.

> Named for the [sibyls](https://en.wikipedia.org/wiki/Sibyl) — oracles you asked a
> question and got an answer from.

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

Model runs **locally via [Ollama](https://ollama.com)**, talks to **your own
Postgres**. Three surfaces, one engine underneath:

- 🖥️ **Native macOS app** — a `.dmg`, no terminal needed.
- 💬 **CLI REPL** — `npx sibyl-cli`.
- 🌐 **Web GUI** — `npx sibyl-cli serve`, browser front-end over the same engine.

<!-- TODO: add a screenshot of the desktop app / web GUI here, e.g.:
![Sibyl](docs/screenshot.png) -->

## Download

### macOS app — easiest, no terminal

**[⬇ Download the latest `.dmg` →](https://github.com/JAYKALIA007/sibyl/releases/latest)**

Open it, drag **Sibyl** to Applications, launch. First run walks you through
onboarding (install Ollama → pull model → connect a DB).

- **Apple Silicon (arm64) only** for now — Intel/universal on the roadmap
  ([`src-tauri/README.md`](./src-tauri/README.md)).
- **Unsigned** (no paid Apple account) → Gatekeeper warns on first launch.
  **Right-click → Open** once to whitelist.
- **[Ollama](https://ollama.com) required** — onboarding sets it up.

### Terminal

Same engine on npm as [`sibyl-cli`](https://www.npmjs.com/package/sibyl-cli):

```bash
npx sibyl-cli            # CLI REPL — run without installing
npx sibyl-cli serve      # web GUI — opens a local URL
npm i -g sibyl-cli       # or install globally → `sibyl` / `sibyl serve`
```

Publishes as `sibyl-cli`; the installed command is **`sibyl`**.

## Features

- **Local & private** — model runs on your machine; your schema, data, and questions
  never leave it, no API key. The desktop app's one optional network call is an update
  check, and it asks before making it.
- **Updates in place** (desktop) — opt in and Sibyl offers new versions as they ship,
  downloads in the background, and installs on restart. Decline and it never phones
  home; "Check for updates" in the sidebar is always there if you change your mind.
- **Read-only & safe** — only ever runs `SELECT` (a guard rejects the rest) and
  auto-injects a `LIMIT`. Point at a **read-only Postgres role** → the database itself
  is the safety wall.
- **First-run onboarding** — installs Ollama, pulls the model, connects a DB. No config
  files to edit.
- **Multi-connection sidebar** (web + desktop) — save any number of databases, switch
  without restarting; each switch starts a fresh conversation.
- **Slash commands** — `/schema`, `/tables`, `/sql <query>`, `/new`, `/help`.
- **Schema-aware starter questions** — empty state suggests questions from your actual
  schema.
- **Self-correcting** — retries on SQL errors, feeding the DB's error back to the model.
- **Conversational** — remembers recent turns, so "how many did *they* order?" resolves.
- **Measured** — an execution-accuracy eval proves the SQL is correct.

## Prerequisites

Two things `npx sibyl-cli` does **not** bundle (the desktop app bundles its own Node,
but still needs these):

1. **[Ollama](https://ollama.com)** — local model host. `ollama pull qwen2.5-coder`
   (~4.7 GB, one time). Onboarding does this for you.
2. **A PostgreSQL URL** — any Postgres you have read access to.

Sibyl checks both on startup — if Ollama's down or the model's missing, it tells you
exactly what to run.

<details>
<summary><b>First-run onboarding</b> — desktop, <code>serve</code>, and CLI</summary>

With nothing configured, Sibyl guides you through setup:

1. **Ollama** — if not installed/running, points you to
   [ollama.com/download](https://ollama.com/download) and waits.
2. **Model** — hands you `ollama pull qwen2.5-coder` (CLI offers to run it; web/desktop
   poll and advance when ready).
3. **Database** — connect a Postgres URL. CLI connects, reports the table count, offers
   to save to `.env`; web/desktop open an **Add connection** dialog and validate first.

> **CLI note:** reads/saves `.env` in the **current directory** — run it from where you
> want that `.env`. One-off run without a file: `sibyl --db "postgresql://…"`.

</details>

<details>
<summary><b>Connecting a database</b> — read-only role setup</summary>

Sibyl introspects the schema automatically — point it at any Postgres you have read
access to (onboarding, `DATABASE_URL` in `.env`, or `--db`). For **real data**, connect
as a **read-only role** — that's the safety wall; even a mistaken write is rejected by
the database itself.

> ⚠️ Don't run `seed.sql` against a database you care about — it's sample data for a
> fresh/throwaway DB.

**Create a read-only role** (run once — adds a login, modifies no data):

```sql
CREATE ROLE sibyl_ro LOGIN PASSWORD 'pick-a-strong-password';
GRANT CONNECT ON DATABASE postgres TO sibyl_ro;
GRANT USAGE  ON SCHEMA public       TO sibyl_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sibyl_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sibyl_ro;
```

Verify it's really read-only — this must **fail**:

```sql
SET ROLE sibyl_ro;
DELETE FROM <any-table> WHERE false;   -- expected: permission denied
RESET ROLE;
```

Point Sibyl at it:

```
DATABASE_URL=postgresql://sibyl_ro:PASSWORD@host:5432/dbname?sslmode=require
```

…or one-off: `npx sibyl-cli --db "postgresql://sibyl_ro:PASSWORD@host:5432/dbname?sslmode=require"`

On Supabase: **Project Settings → Database → Connection string → Direct connection**
(port **5432**, not the 6543 pooler); SSL required. Full walkthrough +
`seed.sql` in [`SETUP.md`](./SETUP.md).

</details>

## Commands

**CLI REPL** — type a `.command`:

| Command          | Does                                             |
|------------------|--------------------------------------------------|
| `.schema`        | Print the DDL Sibyl works from                   |
| `.tables`        | List tables with row counts                      |
| `.last`          | Re-print the last generated SQL                  |
| `.export [file]` | Save the last result to CSV                      |
| `.clear`         | Clear terminal + reset conversation memory       |
| `.help`          | Show the command list                            |
| `exit`           | Quit (also Ctrl-C / Ctrl-D)                       |

History persists (`~/.sibyl_history`) — arrow-up recalls past questions.

**Web GUI & desktop** — type `/` in the composer: `/schema`, `/tables`,
`/sql <query>`, `/new`, `/help`.

## From source & internals

<details>
<summary><b>Run from source</b></summary>

```bash
git clone https://github.com/JAYKALIA007/sibyl.git
cd sibyl
pnpm install             # needs pnpm — `corepack enable` ships it with Node ≥ 16
ollama pull qwen2.5-coder
pnpm sibyl               # REPL
```

Reads `.env` in the repo root — copy `.env.example` and set `DATABASE_URL`, or let
onboarding create it.

> **Why pnpm?** Strict content-addressed `node_modules` + a 24 h
> [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage): pnpm refuses any
> dependency published less than a day ago, so the typical npm-supply-chain compromise
> (yanked within hours) never lands.

</details>

<details>
<summary><b>Model swap</b> + the eval scoreboard + context window + token meter</summary>

**Scored by the eval.** The in-app switcher lists all five; we ran the 38-case
execution-accuracy eval (below) across them so you can trade size for accuracy with
open eyes. The lightweight coder is the default; the rest are one-click select/download:

| Model | Score | Size | |
|---|---|---|---|
| **qwen2.5-coder** | 87% | ~4.7 GB | **default** — best value, runs on 8 GB |
| qwen3-coder | 100% | ~18 GB | most accurate; heavy |
| codestral | 89% | ~13 GB | strong; needs ~16 GB |
| deepseek-coder-v2 | 87% | ~9 GB | solid on multi-join SQL |
| llama3.1 | 74% | ~4.9 GB | general model many already have |

Any Ollama-served model still works via `SIBYL_CHAT_MODEL`, and the switcher lets you
pick any other model you already have (marked "not tested"):

```
SIBYL_CHAT_MODEL=qwen3-coder
```

Larger = better SQL; the scoreboard is why we default to the light one and leave the
bigger ones a deliberate upgrade rather than the out-of-box cost.

Ollama's default context is only 2,048 tokens; Sibyl raises it to 8,192. Override with
`SIBYL_NUM_CTX` (qwen2.5-coder supports up to 32,768).

Every CLI answer prints a **token meter** (real Ollama counts) — the signal for when a
schema has outgrown "whole schema in the prompt":

```
ctx 1,009 / 8,192 (12%)  ·  out 30
```

</details>

<details>
<summary><b>Architecture</b></summary>

One core engine (`core.ts`) behind three surfaces:

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

Locked decisions + rationale in [`DESIGN.md`](./DESIGN.md); desktop internals in
[`src-tauri/README.md`](./src-tauri/README.md).

</details>

<details>
<summary><b>Web GUI</b> — run + develop</summary>

React + shadcn + assistant-ui over the same engine.

**Run (one process):**

```bash
pnpm start        # builds web/ + serves app + API at http://127.0.0.1:3001
```

**Multiple connections:** left sidebar holds any number of saved databases — add
(name + URL, validated first), switch without restarting, rename, delete. Switching
starts a fresh conversation. Saved in `~/.sibyl/connections.json` (`0600`); raw URL
stays server-side, UI shows only a password-free `user@host/db` label. Your `.env`
`DATABASE_URL` seeds the first connection.

**Develop (two processes, hot reload):**

```bash
pnpm server                   # terminal 1 — API (Express over core.ask, loopback)
pnpm --filter sibyl-web dev   # terminal 2 — Vite, proxies /api → :3001 → :5173
```

Server is stateless and loopback-bound; the browser owns the conversation. Point the
client elsewhere with `VITE_API_URL` (default `/api`). `SIBYL_SERVE_STATIC=false` runs
the API alone (how the desktop shell serves its own assets).

</details>

<details>
<summary><b>Desktop app from source</b></summary>

Thin [Tauri](https://tauri.app) shell opens the built web UI and spawns the Node server
as a **sidecar** — all logic stays TypeScript.

```bash
pnpm install
pnpm tauri build     # → src-tauri/target/release/bundle/dmg/Sibyl_<version>_aarch64.dmg
```

Sidecar architecture, ad-hoc signing, Gatekeeper, deferred hardening →
[`src-tauri/README.md`](./src-tauri/README.md).

</details>

<details>
<summary><b>Development commands</b></summary>

```bash
pnpm ollama:check   # verify Ollama + model
pnpm db:check       # verify DB connection + read-only role
pnpm schema:ddl     # print live schema as DDL
pnpm nl2sql:check   # generate SQL for sample questions
pnpm core:check     # run sample questions end-to-end
pnpm test           # unit tests (comparator + guard + schema formatter)
pnpm eval           # single-turn execution-accuracy eval
pnpm eval:multi     # multi-turn (conversational) eval + memory controls
pnpm sibyl          # interactive REPL
```

</details>

<details>
<summary><b>Measuring accuracy</b> — the evals</summary>

`pnpm eval` scores generated SQL against hand-written **gold SQL** by *executing both
and comparing rows* — not matching query text. 19 cases: filters, joins, group-by,
`HAVING`, subqueries, self-joins, junction `AND`/`NOT`, `NULL` logic, multi-table
aggregation, top-N, off-schema refusal.

```
Sibyl execution-accuracy eval — model: qwen2.5-coder
  ✓ filter  ✓ aggregation×2  ✓ join  ✓ group-by  ✓ ordered  ✓ anti-join
  ✓ junction-and  ✓ subquery  ✓ having×2  ✓ multi-join-agg  ✓ self-join
  ✗ null-logic  ✓ anti-junction  ✓ nested-agg  ✓ distinct  ✓ top-n  ✓ refusal
  Score: 18/19 (95%)
```

The one miss is instructive: asked which shipments *shipped but not delivered*, the
model invents a `status` column instead of reasoning about `shipped_at` /
`delivered_at` NULLs — a slip the retry loop usually recovers. Weaker model → score
drops sharply:

```bash
SIBYL_CHAT_MODEL=llama3.2 pnpm eval    # a general 3B model misses most hard rungs
```

**Multi-turn:** `pnpm eval:multi` scores *conversations* — later turns refer back
("how many did **they** order?"). Self-threads (feeds the model its own prior SQL) and
reports a **no-history control** proving memory — not luck — does the work:

```
Per-step:         8/8 (100%)
Per-conversation: 4/4 (100%)
Memory controls:  4/4 referential steps confirmed history-dependent
```

</details>

## Status

Core complete and usable end-to-end: schema → SQL → guard → run → summarize, behind a
CLI REPL, web GUI, and native macOS app, measured by an execution-accuracy eval.
Published as [`sibyl-cli`](https://www.npmjs.com/package/sibyl-cli); desktop builds via
[Releases](https://github.com/JAYKALIA007/sibyl/releases/latest). Planned work in
[Issues](../../issues).

## License

MIT.
