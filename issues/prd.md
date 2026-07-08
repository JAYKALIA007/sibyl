# Sibyl — PRD

> Ask your database in plain English. From-scratch, local-first NL→SQL.
> Derived from `DESIGN.md` (10 locked decisions + review gaps). This PRD feeds
> `/prd-to-issues`; issues are built as vertical slices.

## Problem Statement

I regularly need answers that live in a Postgres database, but getting them means
remembering the schema, writing correct SQL (joins, aggregations, dialect quirks),
and context-switching out of what I was doing. Existing natural-language-to-SQL
tools are cloud services: to use them I'd have to send my schema — and sometimes my
data — to a third party, which is a non-starter for private or regulated data. I
want to ask a question in plain English and get a correct answer from my own
database, without my schema or data ever leaving my machine, and without trusting a
model to be "safe" — the tool must be structurally incapable of mutating my data.

Secondarily (this is a learning project): I want to understand how a real LLM
*service* is built end-to-end — one that talks to a live external system, produces
executable output safely, self-corrects, and is measured by evals.

## Solution

Sibyl is a local-first tool that connects to a Postgres database as a **read-only**
role, reads its schema, and turns an English question into SQL using a **local**
coder LLM (via Ollama — nothing leaves the machine). It runs the SQL, and if
Postgres returns an error it feeds that error back to the model and retries (up to
3 times). It shows the user three things: the **generated SQL** (always, as the
audit trail), the **result table**, and a short **natural-language summary**.

Safety is enforced *below* the model — a dedicated read-only Postgres role means the
database itself rejects any write, even if the model emits one — plus a SELECT-only
guard, an injected `LIMIT`, and a statement timeout to prevent runaway/expensive
queries.

Quality is measured by an **execution-accuracy eval**: a fixed seed database and a
set of `{ question, goldSQL }` cases; the generated SQL and the gold SQL are each
run and their returned rows compared. This is deterministic — no flaky LLM-judge.

There is one shared **core engine** behind two thin surfaces: a **CLI** (built
first, where most tuning happens) and, later, a **web GUI** (Vite + React).
Postgres first; DB-agnostic by design so other engines can be added later.

## User Stories

1. As a developer, I want to connect Sibyl to my Postgres database via a single
   connection string, so that I can start asking questions without configuration UI.
2. As a security-conscious developer, I want Sibyl to connect as a read-only role,
   so that no question I ask can ever modify or destroy my data.
3. As a developer, I want Sibyl to read my database's full schema on connect, so
   that the model knows my tables, columns, types, and relationships.
4. As a developer, I want the schema presented to the model as `CREATE TABLE` DDL
   with primary and foreign keys, so that generated joins are correct.
5. As a developer, I want to ask a question in plain English, so that I don't have
   to remember SQL syntax or my schema.
6. As a developer, I want to always see the SQL Sibyl generated, so that I can
   verify it did what I asked before trusting the answer.
7. As a developer, I want to see the query results as a readable table, so that I
   can read the raw answer.
8. As a developer, I want a short natural-language summary of the results, so that
   I get the gist without parsing the table myself.
9. As a developer, when my question produces invalid SQL, I want Sibyl to read the
   database error and retry automatically, so that transient mistakes self-correct
   without my involvement.
10. As a developer, I want retries capped (at 3), so that a hopeless query fails
    fast instead of looping forever.
11. As a developer, when I ask for something the schema can't answer, I want Sibyl
    to say it can't answer rather than hallucinate a query, so that I trust its
    answers.
12. As a developer, I want a default row limit injected into unbounded queries, so
    that a `SELECT *` on a huge table doesn't flood my terminal or memory.
13. As a developer, I want a statement timeout on the connection, so that an
    accidental cartesian join can't hang the tool.
14. As a developer, I want an empty result to be shown as a valid "0 rows" answer,
    so that it isn't mistaken for an error and retried.
15. As a developer, I want to run Sibyl as a CLI REPL, so that I can ask many
    questions quickly in a tight feedback loop.
16. As a developer, I want the LLM model to be swappable via one setting, so that I
    can compare a local coder model against others without rewriting code.
17. As a developer/learner, I want an execution-accuracy eval over a fixed seed
    database, so that I can measure whether generated SQL is actually correct.
18. As a developer/learner, I want the eval to compare returned rows (not SQL
    strings), so that two differently-phrased-but-correct queries both pass.
19. As a developer/learner, I want the eval to compare rows order-insensitively
    unless the question implies ordering, so that grading matches intent.
20. As a developer/learner, I want to run the eval before and after swapping the
    model, so that I can see the score move and pick the better brain with data.
21. As a developer/learner, I want the eval's NL→SQL step to run deterministically
    (temperature 0), so that the score reflects my change, not randomness.
22. As a developer, I want my connection string and secrets kept in a gitignored
    local `.env`, so that credentials never get committed or leave my machine.
23. As a developer, I want a committed seed dataset (schema + rows), so that the
    eval has a known, reproducible database to grade against.
24. As a developer, I want clear setup instructions for creating the read-only role
    and loading the seed, so that I can get from clone to first question quickly.
25. As a developer (later), I want a web GUI where I type a question and see the
    SQL, a data grid, and the summary, so that I get a nicer experience than the
    terminal.
26. As a developer (later), I want the GUI to call the same core engine as the CLI
    via a thin API, so that behavior is identical across surfaces.

## Implementation Decisions

**Locked product/architecture decisions (from DESIGN.md):**

- **Postgres only** for v1 (one driver, one dialect). DB-agnostic structure so
  other engines can be added later.
- **Test/dev database is a hosted Supabase Postgres** (SSL required; use the direct
  5432 connection, not the pooler).
- **Whole schema in the prompt** for v1 (seed DB is small). Schema-RAG (embed table
  defs, retrieve only relevant tables) is deferred until the schema outgrows the
  context window.
- **Read-only access**, enforced two independent ways: (1) connect as a dedicated
  read-only Postgres role (`GRANT SELECT` only), and (2) a SELECT-only guard in
  code. Safety does not depend on the model.
- **Local coder model** (e.g. `qwen2.5-coder` via Ollama) as the default, behind a
  one-line model swap seam. Stays local/free/private.
- **NL→SQL is an agent retry loop capped at 3**: generate → run → on Postgres
  error, feed the error back → regenerate → retry.
- **One core engine, two thin surfaces.** Build order: core → CLI → GUI.
- **GUI is a Vite + React SPA** over a thin Node/Express API calling the core. No
  desktop shell.
- **Schema is formatted as `CREATE TABLE` DDL** with types, primary keys, and
  foreign keys.
- **Result output** is: the generated SQL (always), the result table, and a short
  NL summary. The summary is a second LLM call over the first ~50 rows plus the
  total row count (capped so large results don't exceed the context window).
- **Eval grades by execution accuracy**: dataset of `{ question, goldSQL }`; run
  both, compare returned rows.
- **Single `.env` connection** for v1; multi-profile / secure secret storage
  deferred.

**Review-gap decisions:**

- A committed **seed SQL** defines a small e-commerce schema (`users`, `products`,
  `orders`) with rows — the fixed known database the eval grades against.
- **Result-set safety:** inject a default `LIMIT` when the query has none; set a
  `statement_timeout` on the connection.
- **Ambiguous questions:** v1 guesses and always shows the SQL (the SQL is the audit
  trail). A clarifying-question flow is deferred.
- **Empty results** are a valid answer, never a retry trigger.

**Modules (by responsibility and interface, deepest first):**

- **Ollama client** — embed and generate against a local Ollama server; the chat
  model is a single swappable constant. Interface: `generate(prompt, options) →
  text`. Thin wrapper over HTTP.
- **Database access** — open a read-only, SSL, timeout-bounded connection; run a SQL
  string and return `{ rows, columns }` or a structured error. Interface:
  `runQuery(sql) → { rows, columns } | { error }`.
- **Schema→DDL formatter** *(deep, pure)* — given raw introspection metadata
  (tables, columns, types, PKs, FKs), produce a `CREATE TABLE` DDL string. No I/O.
  Interface: `toDDL(schemaMetadata) → string`.
- **SQL safety guard** *(deep, pure)* — given a SQL string, decide if it is a
  single read-only `SELECT`; reject non-SELECT and multi-statement input; inject a
  default `LIMIT` when absent. Interface: `guard(sql) → { ok, sql } | { rejected,
  reason }`. No I/O.
- **NL→SQL** — given the schema DDL and a question, prompt the model for a SQL
  query (temperature 0 in eval mode). Interface: `toSql(ddl, question) → sql`.
- **Core engine** — orchestrates the whole flow: introspect → `toSql` → `guard` →
  `runQuery` → on error, retry with the error fed back (≤3) → summarize. Returns
  `{ sql, rows, columns, summary, attempts }` (or a "can't answer" result).
- **Result-row comparator** *(deep, pure)* — normalize two result sets (coerce cell
  types to comparable strings, handle NULLs) and compare as sets, order-insensitive
  unless ordering is required. Interface: `rowsEqual(a, b, { ordered }) → boolean`.
- **CLI surface** — a REPL that calls the core and prints SQL + table + summary.
- **API + GUI surface (later)** — a thin endpoint that calls the core; a React SPA
  that renders SQL + data grid + summary.
- **Eval runner** — load `{ question, goldSQL }` dataset; for each, run core's
  generated SQL and the gold SQL, compare rows via the comparator, print a
  pass/percentage score.

## Testing Decisions

- **What makes a good test:** assert external behavior through a module's public
  interface, not internal implementation details. Tests should not break when
  internals are refactored as long as behavior holds.
- **Primary quality gate = the execution-accuracy eval** (not unit tests). It grades
  the whole NL→SQL pipeline deterministically by comparing returned rows against
  gold SQL on a fixed seed database. Cases span a difficulty ladder: a simple
  filter, an aggregation, a join (requires the FK), a group-by, and one off-schema
  question that must be refused.
- **Unit tests for the three deep, pure modules** (no live DB or LLM needed):
  - Schema→DDL formatter — given known introspection metadata, asserts the exact
    DDL, including PK/FK lines.
  - SQL safety guard — asserts SELECT passes, non-SELECT/multi-statement is
    rejected, and a limitless query gets a `LIMIT` injected.
  - Result-row comparator — asserts equal sets match regardless of order, type
    coercion (`100` vs `"100"`) and NULLs are handled, and ordering is respected
    when required.
- **Prior art:** the eval mirrors the rag-cli project's `evals/run.ts` pattern
  (dataset → run through the real system → score), but swaps the flaky LLM-judge for
  deterministic row comparison.

## Out of Scope

The following are explicitly deferred (tracked for later, not this build):

- Schema-RAG (retrieving only relevant tables) — only needed for very large schemas.
- Write operations with human-in-the-loop approval — v1 is read-only.
- Exploratory querying (the agent sampling rows before writing final SQL).
- Rich schema annotations (sample values, comments, row counts).
- A desktop shell (Tauri/Electron) wrapping the web GUI.
- Multi-connection profiles and encrypted/keychain secret storage.
- Clarifying-question flow for ambiguous questions.
- Non-Postgres database engines.
- Streaming the summary token-by-token.

## Further Notes

- **Learning intent:** Sibyl is the third "wrapper around a rented brain" after a
  RAG CLI project. It deliberately introduces what that project lacked: talking to a
  live external stateful system, executable structured output with safety enforced
  below the model, self-correction from tool errors, and deterministic evals. It is
  a "mini-Eigen" — one core behind multiple surfaces.
- **Build order is vertical-slice friendly:** setup (seed + read-only role) →
  database access → schema introspection/DDL → NL→SQL → core loop → CLI → eval →
  API + GUI. Each slice runs and is demonstrable on its own.
- **Definition of done (learning):** the retry loop is observed fixing a bad query;
  the eval score moves when the model is swapped; the off-schema refusal case works.
