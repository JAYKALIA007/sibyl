# Sibyl

**Ask your database in plain English.** Sibyl reads your schema, writes the SQL,
runs it, and shows you the rows — locally, from scratch, no cloud.

> Named for the [sibyls](https://en.wikipedia.org/wiki/Sibyl) — the oracles you
> asked a question and got an answer from.

A learning project: a from-scratch, local-first natural-language-to-SQL tool built
on a local LLM (Ollama). Postgres first, DB-agnostic by design. One core engine
behind a CLI and (later) a web GUI.

- **Local & private** — your schema and data never leave your machine.
- **Read-only & safe** — connects as a read-only role; the DB itself rejects writes.
- **Self-correcting** — retries on SQL errors by reading the database's own error.
- **Measured** — an execution-accuracy eval proves the generated SQL is correct.

See [`DESIGN.md`](./DESIGN.md) for the full architecture and locked decisions.

## Status

🚧 Early. Design locked; building in vertical slices (tracked in
[Issues](../../issues)).

## License

MIT.
