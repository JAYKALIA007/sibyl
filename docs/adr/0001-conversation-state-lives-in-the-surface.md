# 1. Conversation state lives in the surface, not the core

Date: 2026-07-09

## Status

Accepted

## Context

Sibyl is built as "one core, two thin surfaces" (`DESIGN.md`): `core.ts` is a
stateless engine, wrapped by a CLI today and a GUI later. Multi-turn memory
(issue #12) introduces *conversation state* — the buffer of prior turns fed to
the model so follow-up questions ("how many did *they* order?") resolve.

That state has to live somewhere. The tempting shortcut is a module-level
`history[]` inside `core.ts` that `ask()` mutates, because it makes the CLI
trivial (`ask(q)` with no extra argument).

## Decision

The **core stays stateless**. `ask(question, history?)` takes history as a
parameter and returns the new turn. Each **surface** owns its own conversation
buffer and passes it in. A history turn is `{question, sql}`; only successful
turns enter it; the window is the last 3.

## Consequences

- **Survives the GUI.** A module-level `history` in the core would be shared
  across every concurrent session — two browser tabs (or two users) would leak
  questions into each other's context. A parameter keeps each surface's
  conversation isolated, preserving the "same core serves both" property the
  whole architecture rests on.
- **Keeps the eval honest.** Generation stays a pure function of its inputs, so
  the single-turn execution-accuracy eval simply omits `history` and remains
  deterministic (the 9/9 baseline can't be perturbed by conversational state).
- Slightly more wiring at each call site (the surface must hold and pass the
  buffer) — a deliberate trade for isolation.
