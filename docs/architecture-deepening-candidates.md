# Architecture deepening candidates

Backlog of module-deepening refactors, ranked by payoff. A **deep module** (Ousterhout)
has a small interface hiding a large implementation — more testable, more navigable,
tested at the boundary instead of inside.

**Context:** the codebase (~5k LOC) is mostly already deep. `guard`, `rowsEqual`,
`introspect`, `connections`, `history`, `commands`, `csv`, `suggestionStage` all have
small interfaces over real complexity and are well-tested. Friction is concentrated in
a few spots, and they share one root cause: **the interesting logic lives in modules
whose dependencies (Ollama, Postgres, assistant-ui, React state) aren't injectable, so
the critical paths are untested.**

Dependency categories referenced below:
- **In-process** — pure computation / in-memory state; merge and test directly.
- **Local-substitutable** — has a local test stand-in (PGLite, in-memory FS).
- **Remote-owned / external** — inject a port; in-memory adapter for tests, real
  adapter in production.

---

## 1. The query engine (`ask` pipeline) — highest leverage

**Cluster:** `core.ts` (`ask`, `loadSchema`, `summarize`, DDL cache) + its hard imports
of `ollama.ts` (network) and `db.ts` (Postgres pool).

**Why coupled:** `core.ts` reaches directly into a live LLM and a live DB, so the retry
loop, refusal handling, and summarize step can only run end-to-end against real infra.

**Dependency category:** mixed — `db` is **Local-substitutable** (PGLite); `ollama` is
**external / remote-owned** (inject an LLM port).

**What's untested today (all critical-path):**
- guard-reject → retry with feedback → succeed loop (`core.ts:82-113`)
- DB-error → feedback → retry → succeed
- `MAX_ATTEMPTS` exhaustion → error result
- "SQL succeeded but `summarize()` threw" — currently fails the whole call
  (`core.ts:43-56`); should degrade gracefully like `suggestions.ts` does
- `toSql` **throwing** mid-loop (not just returning bad SQL) → bubbles as 5xx instead of
  a domain error, retry loop doesn't catch it
- DDL-cache race: two concurrent `/api/ask` on one connection both introspect.
  `suggestions.ts` dedupes in-flight (cache + `inflight` map); `core.loadSchema`
  (`core.ts:35-39`) does not.

**Deepening sketch:** `ask` becomes a deep module taking an **LLM port** and a
**query-executor port**. Production wires the real Ollama + pg adapters; tests wire
in-memory adapters that script "bad SQL then good SQL" / "error then success". Adopt the
`inflight` dedup pattern for `loadSchema`.

**Test impact:** net-new coverage of the heart of the product; no existing tests to
delete.

---

## 2. Frontend active-connection state

**Cluster:** `App.tsx` + `Workspace` + `runtime.tsx` (`connRef`) + `Sidebar`/`ConnectionRow`.

**Why coupled:** `activeId` is duplicated across React state, `localStorage`, and a
runtime ref. Switching a connection is a hand-choreographed sequence (reset thread →
`setActiveId` → persist → effect refetches meta + suggestions) smeared across three files
(`App.tsx:46-52`, `App.tsx:122-127`, `runtime.tsx:160-162`).

**Dependency category:** **In-process** (React state + localStorage stand-in).

**Deepening sketch:** a `useActiveConnection` hook — interface roughly
`{ activeId, connections, switch(id), add(), rename(), remove() }` — hiding persistence,
thread-reset, and refetch. Collapses App.tsx's 9-prop `Workspace` explosion.

**Test impact:** connection-switch and setup-gate logic are wholly untested; a single
deep hook makes them testable in isolation.

---

## 3. The runtime↔thread message contract

**Cluster:** `runtime.tsx` (produces `metadata.custom.{result|command}`) ↔ `thread.tsx`
`AssistantMessage` (consumes via `as` casts, `thread.tsx:178-183`).

**Why coupled:** adapter and renderer agree on an **untyped, opaque** blob; any change to
result shape silently breaks rendering with no compiler help.

**Dependency category:** **In-process** (typed contract + pure adapter functions).

**Deepening sketch:** a typed `SibylMessage` contract + extract the pure adapter bits
(`lastUserText`, `toHistoryMessages`, `ask`-vs-`/sql`-vs-command routing) out of the
assistant-ui `run()` closure so routing is testable without a harness.

**Test impact:** `runtime.tsx`'s pure logic is currently untested; extraction makes the
routing decision unit-testable.

---

## 4. `thread.tsx` God component (368 lines)

**Cluster:** message rendering + Composer + slash-command dispatch (`selectCommand`,
`thread.tsx:251-267`) + suggestion choreography (`useSuggestionStage`), all in one file.

**Why coupled:** understanding "how does a typed message become a rendered answer"
requires reading 4 nested components + `runtime` + `api`. Command-dispatch branching
(action / arg-taking / send) is tangled into the Composer.

**Dependency category:** **In-process**, but assistant-ui hooks make parts hard to isolate.

**Deepening sketch:** split into Composer + dispatch, message rendering, and
suggestion choreography. The dispatch logic (pure) becomes testable; rendering becomes
snapshot-able.

**Test impact:** nothing here is tested today.

---

## 5. Backend connection source (CLI vs server divergence)

**Cluster:** `cli.ts` (resolves DB via `DATABASE_URL` env) vs `server.ts` /
`connections.ts` (resolves via `~/.sibyl/connections.json`).

**Why coupled:** two surfaces answer "which DB am I talking to" through **different
mechanisms** that only coincide on first-run seeding (`connections.ts:105-106`), then
drift. File I/O + probe-before-save is untested; a corrupt `connections.json` silently
yields `[]` → empty sidebar with no error (`connections.ts:103-109`).

**Dependency category:** **Local-substitutable** (in-memory filesystem).

**Deepening sketch:** unify both surfaces behind one connection-source module; test
read / write / probe / corruption paths with an in-memory FS.

**Test impact:** impure shell of `connections.ts` (file I/O, chmod, probe-then-save) is
currently untested.

---

## Minor (not a deepening, just cleanup)

- `AssistantAnswer.tsx` and `CommandAnswer.tsx` duplicate `ResultTable` and `formatCell`
  (`AssistantAnswer.tsx:86-140,175-179` ≈ `CommandAnswer.tsx:38-104,106-110`). Extract a
  shared `TableView`. In-process, straightforward.

---

## Suggested order

1. **#1** first — highest leverage, it's the actual product logic and it's fully untested.
2. **#2 + #3** compose well together (both are the frontend connection/message spine).
3. **#4** benefits from #3 landing first (typed contract simplifies the rendering split).
4. **#5** independent; do whenever the CLI/server drift starts biting.
