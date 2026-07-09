# Context — Glossary

Canonical terms for Sibyl. One term, one definition. No implementation notes.

- **Core** — the stateless engine (`core.ts`): schema → SQL → guard → run → summarize. Takes all state as parameters; owns none.
- **Surface** — a thin client over the core (the CLI today, a GUI later). Owns its own session state.
- **Turn** — one completed question/answer exchange (the question and what the engine produced for it).
- **History** — the ordered buffer of prior turns a surface passes into the core to give the model conversational context. A turn is `{question, sql}`; only successful turns enter it; window of 3.
- **Referential step** — a conversation step whose question is unanswerable without history (a pronoun or ellipsis: "how many did *they* order?", "and *for India*?").
- **No-history control** — running a referential step with empty history to prove the history — not the model guessing — is what makes it pass.
- **Self-threading** — in the multi-turn eval, feeding the model its *own* generated prior SQL as history (mirrors runtime), not the gold SQL.
