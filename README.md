# Sibyl

**Ask your database in plain English.** Sibyl reads your schema, writes the SQL,
runs it, and shows you the answer — locally, with no cloud.

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

- **Local & private** — your schema and data never leave your machine.
- **Read-only & safe** — connects as a read-only role; the DB itself rejects writes.
- **Self-correcting** — retries on SQL errors with the database's own error message as feedback.
- **Conversational** — remembers the last few turns, so follow-ups like "how many did *they* order?" resolve.
- **Measured** — an execution-accuracy eval proves the generated SQL is correct.

## Quick start

**Prerequisites:** [Ollama](https://ollama.com) running locally with `qwen2.5-coder` pulled,
and a PostgreSQL database you can connect to.

```bash
# 1. Clone + install
git clone https://github.com/JAYKALIA007/sibyl.git
cd sibyl
npm install        # or pnpm / yarn

# 2. Pull the model
ollama pull qwen2.5-coder

# 3. Point Sibyl at your database
cp .env.example .env
#  → open .env, fill in DATABASE_URL with a read-only (or regular) connection string

# 4. (Optional) Load the bundled seed database to try it out
#    Run the SQL in seed.sql against your Postgres instance, then point .env at it.
#    See SETUP.md for the full read-only role setup.

# 5. Start the REPL
npm run sibyl
```

### Using your own database

Point `DATABASE_URL` at any PostgreSQL database you have read access to:

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
```

Sibyl introspects the schema automatically — no configuration needed. Or point at
one for a single run without touching `.env`:

```bash
npm run sibyl -- --db postgresql://user:pass@host:5432/dbname
```

### Built-in commands

| Command           | What it does                                    |
|-------------------|-------------------------------------------------|
| `.schema`         | Print the DDL Sibyl is working from             |
| `.tables`         | List tables with row counts                     |
| `.last`           | Re-print the last generated SQL                 |
| `.export [file]`  | Save the last result to CSV                     |
| `.clear`          | Clear the terminal and reset conversation memory|
| `exit`            | Quit (also Ctrl-C / Ctrl-D)                      |

Question history persists across sessions (`~/.sibyl_history`) — arrow-up recalls
past questions.

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

Every answer prints a **token meter** (real counts from Ollama) so you can watch
how full the window is — the signal for when a schema has outgrown "whole schema
in the prompt":

```
ctx 1,009 / 8,192 (12%)  ·  out 30
```

## Setup (seed database + read-only role)

See [`SETUP.md`](./SETUP.md) for the full walkthrough:
1. Load `seed.sql` into Postgres (creates `users`, `products`, `orders`, `reviews`).
2. Create a `sibyl_ro` read-only role.
3. Add the connection string to `.env`.

## Architecture

One core engine (`core.ts`) behind a CLI surface today and a web GUI later:

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
   ├──→  cli.ts   (this REPL)
   └──→  (web GUI — later)
```

See [`DESIGN.md`](./DESIGN.md) for locked decisions and rationale.

## Development

```bash
npm run ollama:check   # verify Ollama + model
npm run db:check       # verify DB connection + read-only role
npm run schema:ddl     # print live schema as DDL
npm run nl2sql:check   # generate SQL for sample questions
npm run core:check     # run sample questions end-to-end
npm run test           # unit tests (comparator + guard + schema formatter)
npm run eval           # single-turn execution-accuracy eval (score vs gold SQL)
npm run eval:multi     # multi-turn (conversational) eval + memory controls
npm run sibyl          # interactive REPL
```

## Measuring accuracy

`npm run eval` scores generated SQL against hand-written **gold SQL** by *executing
both and comparing the rows* — not by matching query text. The brain is swappable;
the eval decides which brain wins:

```
Sibyl execution-accuracy eval — model: qwen2.5-coder
  ✓  [filter] · ✓ [aggregation] · ✓ [join] · ✓ [group-by] · ✓ [ordered]
  ✓  [anti-join] · ✓ [junction-and] · ✓ [off-schema-refusal]
  Score: 9/9 (100%)
```

Swap the model to see the number move:

```bash
SIBYL_CHAT_MODEL=llama3.2 npm run eval    # → 7/9 (78%): misses AND-tag + ordering
```

### Multi-turn eval

`npm run eval:multi` scores *conversations* — later turns refer back ("how many
did **they** order?"). It self-threads (feeds the model its own prior SQL, like the
CLI does) and reports two numbers plus a **no-history control** that proves the
memory — not luck — is doing the work:

```
Per-step:         8/8 (100%)
Per-conversation: 4/4 (100%)
Memory controls:  4/4 referential steps confirmed history-dependent
```

## Status

**9 / 9 slices done.** Core vertical complete: schema → SQL → guard → run →
summarize, behind a CLI, measured by an execution-accuracy eval.
Further work tracked in [Issues](../../issues).

## License

MIT.
