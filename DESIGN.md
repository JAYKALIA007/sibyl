# db-ai — "talk to your database" (working name)

A from-scratch, local-first tool: ask a question in English → it reads your
Postgres **schema**, writes SQL, runs it, shows the rows. CLI first, GUI later.

**Goal:** keep learning how LLM services are built (this is wrapper #3 after
rag-cli), while ending up with something actually usable. Every choice judged by
"does this teach me / will I use it," not "is it production-grade."

Built on the rag-cli foundation (embed · cosine search · agent loop · HITL · eval).

---

## Locked decisions

| Decision | Choice | Why (learning lens) |
| --- | --- | --- |
| Database | **Postgres only** | one driver (`pg`), one dialect → SQL runs or it doesn't; no adapter rabbit hole. It's what Sprinto uses. |
| Test DB | **Supabase project** (hosted Postgres) | real Postgres + a dashboard to seed tables/data in minutes; free tier. Needs `sslmode=require` + direct 5432 (not the 6543 pooler). Connection string lives in gitignored `.env`. |
| Schema → LLM | **Whole schema in the prompt (now)** | seeded DB is small (~10–30 tables) → fits the context window. Do the dumb thing, see it work. |
| Access | **Read-only v1** | enforced two ways: (1) connect with a read-only Postgres role (`GRANT SELECT` only) so the DB itself rejects writes even if the LLM emits `DROP`, and (2) a SELECT-only keyword check. Safety that does NOT depend on the model. |
| Model | **Local coder model** (`qwen2.5-coder` via Ollama), behind a one-line swap seam | SQL is a code task → use a code brain, not the general 3B. Stay local (free + private = the point). Swap seam (like rag-cli's `CHAT_MODEL`) lets the eval compare local vs API and *measure* which is worth it. |
| NL→SQL flow | **Agent retry loop, capped at 3** | generate → run → if Postgres errors, feed the exact error back → regenerate → retry (max 3). rag-cli's ReAct loop with SQL execution as the tool and the DB error as the observation. Biggest quality lever for text-to-SQL; teaches self-correction from tool output. |
| Architecture | **One core, two thin surfaces** — `core.ts` (connect · introspect · `nl2sql` → `{ sql, rows, columns, attempts }`, pure, no rendering) wrapped by a CLI and a GUI | separating engine from surface is the real service lesson (same core serves both, like Eigen serves drawer + full page). |
| Build order | **core → CLI → GUI** | core proven in isolation (`core:check`, like `ollama:check`); CLI second = fastest loop for tuning NL→SQL; GUI last. |
| GUI | **Vite + React SPA over a thin Node/Express API** that calls `core.ts` | FE home turf; data grid is nicer in React than a plain HTML file. NOT a desktop shell (Tauri/Electron) — that's packaging overhead, not AI. |
| Schema format | **DDL / `CREATE TABLE`** with types + PK + FK | the shape coder models were trained on → best pattern-match. FK `REFERENCES` lines are how the model knows how to join. |
| Result output | **SQL (always) + result table + short NL summary** | SQL shown = trust + learning layer (never a black box). Summary = a 2nd LLM call (`question + rows → one line`) over the first ~50 rows + total count (capped so big results don't blow the window). Teaches generate → execute → summarize. |
| Eval | **Execution accuracy** — dataset `{ question, goldSQL }`, ~15–20 items; run generated SQL + gold SQL, compare returned rows | deterministic → no flaky LLM-judge (the rag-cli burn). Industry standard (Spider/BIRD). Compare rows as sets, order-insensitive unless the question implies ordering. Ladder: filter · aggregation · join · group-by · one off-schema refusal case. |
| Connection | **Single `.env` `DATABASE_URL`** | one DB (seeded Supabase) is all v1 needs. Multi-profile + secure storage is product plumbing (keychain APIs), not AI — defer it. `.env` gitignored → creds stay local. |

### The core mental model
- **Schema = the map.** Read ONCE on connect via introspection (`information_schema` / `pg_catalog`). Small metadata, all the LLM needs to write SQL.
- **Data = the books.** NEVER slurped. Rows only ever enter the app as the *result* of a query the LLM generated. Same shape as RAG: give the model the index, it asks for the slice, only that slice returns.

---

## Deferred / do later

- **Schema-RAG (option B)** — when the schema outgrows the context window (real
  Sprinto-sized DB, hundreds of tables): embed each table's definition, and for a
  given question retrieve only the ~5 relevant tables into the prompt. This is
  rag-cli's chunk→embed→search loop applied to schema instead of prose — the
  genuinely new lesson, but not needed while the test DB is small.

---

- **Write-with-HITL (option B)** — once read-only works and evals prove the SQL is
  trustworthy, add `INSERT/UPDATE/DELETE` generation gated by explicit approval
  before execution (reuse rag-cli's HITL pause/resume). Not v1.

- **Exploratory querying (option C)** — let the agent peek at sample rows before
  committing to final SQL. Helps on messy schemas but doubles complexity + calls.
  Not v1.

- **Desktop shell (option C)** — wrap the web GUI in Tauri for a native app feel,
  once the web version is solid. Packaging/updates overhead; not v1.

- **Rich schema annotations (option C)** — sample values, column comments, row
  counts on top of the DDL. Helps on ambiguous columns but costs tokens; add only
  if evals show errors that samples would fix.

- **Multi-profile + secure connection storage (options B/C)** — saved profiles for
  several DBs, encrypted/keychain secret storage (the DataPanel surface). Real
  product work, not a lesson. Not v1.

---

## Prerequisites & review gaps (resolved)

- **Seed dataset** — a committed `seed.sql`: a tiny e-commerce schema
  (`users`, `products`, `orders`) with a handful of rows. Gives the eval a **fixed,
  known** DB to write gold SQL against, and a realistic schema (with FKs) to demo
  joins. Load it into Supabase once.
- **Read-only role (must exist before "read-only" means anything)** — Supabase's
  default user is superuser. Create a dedicated role and connect as it:
  ```sql
  CREATE ROLE dbai_ro LOGIN PASSWORD '...';
  GRANT CONNECT ON DATABASE postgres TO dbai_ro;
  GRANT USAGE ON SCHEMA public TO dbai_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO dbai_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dbai_ro;
  ```
- **Result-set safety (read-only ≠ safe from cost)** — a huge or cartesian `SELECT`
  floods memory / hangs. Guard with: inject a default `LIMIT` (e.g. 500) when the
  query has none, and set `statement_timeout` (e.g. 5s) on the connection.
- **Env loading** — run with Node 22's `--env-file=.env` (tsx won't auto-load it).
- **Eval row comparison** — coerce cells to normalized strings (handle numbers vs
  text, NULLs) before set-comparing generated vs gold rows.
- **Ambiguity** — v1 guesses and **always shows the SQL** (the SQL is the audit
  trail). Clarifying-question flow → Deferred.
- **Empty result ≠ error** — 0 rows is a valid answer, never a retry trigger.
- **Eval determinism** — `nl2sql` runs at temperature 0 during evals so the score
  reflects the change, not the dice.

---

## Module layout (~300 lines, mirrors rag-cli)

```
db-ai/
├── DESIGN.md
├── ollama.ts        # embed · generate (swap seam: CHAT_MODEL = a coder model)
├── db.ts            # pg connection (read-only role) + runQuery(sql) → { rows, columns }
├── introspect.ts    # information_schema/pg_catalog → DDL string (CREATE TABLE + PK + FK)
├── nl2sql.ts        # prompt(schemaDDL, question) → SQL; SELECT-only guard
├── core.ts          # THE ENGINE: nl2sql → runQuery → retry-on-error (≤3) → summarize
│                    #   returns { sql, rows, columns, summary, attempts }
├── cli.ts           # readline REPL → prints SQL + ASCII table + summary   (pnpm sibyl)
├── server.ts        # thin Express API: POST /ask → core                   (pnpm server)
├── web/             # Vite + React SPA (input → SQL + data grid + summary)
├── evals/
│   ├── dataset.json # [{ question, goldSQL }]  — the difficulty ladder
│   └── run.ts       # generated SQL + gold SQL → compare rows → % execution match
├── seed.sql         # fixed e-commerce schema + rows (the known DB evals grade against)
└── .env             # DATABASE_URL (read-only role, sslmode=require) — gitignored
```

## Build order (each step runs on its own — never write it all blind)

0. **Seed + role** — run `seed.sql` in Supabase, create the `dbai_ro` read-only
   role, put its connection string in `.env`. (Setup, not code.)
1. **`db.ts`** — connect to Supabase (read-only role, SSL), run a hardcoded
   `SELECT 1`, print rows. Nothing else until this works.
2. **`introspect.ts`** — dump the seeded DB's schema as DDL, eyeball it.
3. **`nl2sql.ts`** — schema + a hardcoded question → SQL string. Print it, run it by hand.
4. **`core.ts`** — wire 1→2→3 + the retry loop + summary. Prove `nl2sql("...")`
   end-to-end returns `{ sql, rows, summary }`.
5. **`cli.ts`** — the REPL. **This is where most learning + tuning happens.**
6. **`evals/`** — build the `{question, goldSQL}` ladder, run execution-match.
   *Now you can tune with a number.*
7. **`server.ts` + `web/`** — thin React GUI over the same core. Last.

## Exit criteria (definition of "done learning")

Runs, you can explain every file, **and** you've:
1. Watched the **retry loop** fix a bad query (Postgres error → corrected SQL).
2. Run the **execution-match eval** and moved the score by swapping the model
   (`llama3.2` vs `qwen2.5-coder`) — proving "the brain is swappable, evals decide."
3. Hit the **off-schema refusal** case (asks for a table that doesn't exist → says so,
   doesn't hallucinate SQL).

## What this teaches that rag-cli didn't

- Talking to a **live external stateful system** (Postgres), not local files.
- **Executable** structured output (SQL with real consequences) + safety enforced
  **below** the model (read-only DB role).
- **Self-correction** from tool output (the retry loop).
- **Deterministic evals** (execution match) — when you *can* grade without an LLM, do.
- **One core, two surfaces** — the real service shape (a mini-Eigen).
