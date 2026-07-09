# Sibyl GUI — PRD

A browser front-end for Sibyl, sharing the exact same engine (`core.ts`) as the
CLI. This is the "second surface" the whole architecture was built for.

## Problem Statement

Sibyl works today, but only in a terminal. Someone who wants to "talk to their
database in plain English" has to run a Node REPL, read a box-drawn table, and
copy SQL out of a scrollback buffer. That excludes non-terminal users, makes
results hard to read and export, and hides the tool's best trait — a real
conversation — behind a text prompt. The engine is already a stateless function
(`core.ask(question, history)`); it just has no visual surface.

## Solution

A local web app: a chat interface where you type a question and get back, as a
chat message, the generated SQL, a proper result table, a one-line summary, and a
token meter — with follow-up questions that remember the last few turns. It runs
entirely on your machine: a thin Express server calls the existing `core.ask`, and
a React single-page app renders the conversation. The server holds no session
state; the browser owns the conversation, exactly as the CLI does. Nothing about
the engine changes — the GUI is purely a new surface over the same brain.

## User Stories

1. As a user, I want to type a natural-language question into a web page and get an answer, so that I don't have to use a terminal.
2. As a user, I want to see the generated SQL for every answer, so that I can trust and learn from what ran.
3. As a user, I want results rendered as a readable table, so that I can scan rows more easily than terminal output.
4. As a user, I want a one-line plain-English summary of each result, so that I get the answer without reading the whole table.
5. As a user, I want a token meter on each answer, so that I can see how full the model's context window is.
6. As a user, I want to ask follow-up questions that refer back ("how many did they order?"), so that I can drill in without repeating myself.
7. As a user, I want the conversation shown as a scrollable thread, so that I can review earlier questions and answers.
8. As a user, I want the composer disabled while a question is being answered, so that I don't accidentally fire overlapping requests.
9. As a user, I want off-schema questions to come back as a clear "can't answer that" message, so that I understand the tool's limits instead of seeing a crash.
10. As a user, I want a failed query (model couldn't produce valid SQL) shown as a normal message, so that a bad question doesn't look like the app broke.
11. As a user, I want a distinct connection-level banner when the server or database is actually down, so that I can tell an outage from a normal refusal.
12. As a user, I want the empty state to invite a first question, so that I know what to do when I open the app.
13. As a user, I want long result sets capped in the UI (first N rows + "…N more"), so that a huge table doesn't freeze the page.
14. As a user, I want the app to run entirely on my machine, so that my schema and data never leave localhost.
15. As a user, I want the server to bind to localhost only, so that my database-connected API isn't reachable from the network.
16. As a developer, I want the web app to live in its own folder with its own dependencies, so that the React toolchain doesn't tangle with the Node engine.
17. As a developer, I want the API to be a single stateless endpoint that mirrors `core.ask`, so that the server is trivial to reason about and scale.
18. As a developer, I want the browser to own the conversation buffer and send it with each request, so that the server keeps no per-user state (extends ADR 0001).
19. As a developer, I want the visual thread and the model-context buffer kept separate, so that scrolling back forever never blows the context window.
20. As a developer, I want the server to warm the schema cache on boot, so that the first question isn't slow.
21. As a developer, I want the API base URL to be runtime-configurable, so that a future desktop shell (Tauri/Wails sidecar) can point the same build at a dynamic port.
22. As a developer, I want "serve the API" and "serve the static build" kept as separable concerns, so that a desktop shell can serve the assets itself while the sidecar serves only the API.
23. As a developer, I want a dev setup where the Vite dev server proxies API calls to Express, so that I can develop with hot reload against the real engine.
24. As a developer, I want the production path to have Express serve the built SPA, so that the whole app runs from one process for a simple demo.
25. As a user, I want the interface built on a familiar chat shell (thread, composer, auto-scroll), so that it feels like a modern AI chat rather than a form.
26. As a user, I want the SQL, table, summary, and meter visually distinct within one answer, so that I can find the part I care about at a glance.

## Implementation Decisions

### Architecture
- **Two surfaces, one core.** The engine (`core.ask(question, history)`) is unchanged. The GUI adds an HTTP server surface and a React client surface. No engine edits.
- **Stateless server, client owns history.** The React client holds the conversation `Turn[]` buffer and sends it with every request. The server keeps no session state. This is the direct extension of ADR 0001 (conversation state lives in the surface) to the web.
- **Two histories, kept separate.** The *visual thread* (every message shown, managed by the chat shell) is distinct from the *model-context buffer* (`Turn[]`, capped at the window of 3, `{question, sql}` only). The context buffer is derived from the client's own record of *successful* turns — never scraped from the rendered thread. Sending the whole visual thread as context would violate the window-of-3 design and inflate the prompt.

### API contract
- A single endpoint accepts a question plus the client-held history and returns the engine's result.
- **All three domain outcomes** (answer, refused, error) return **HTTP 200** — they are valid results the client renders as messages. A `refused` or an after-retries `error` is *not* an HTTP failure.
- **HTTP 5xx** is reserved for genuine faults: the model backend is unreachable, the database is down, or the engine threw. The client surfaces these as a connection-level banner, not a chat message.
- The server warms the schema/DDL cache on boot so the first request isn't cold.
- The server binds to loopback only. No authentication in v1 — it is a local tool and database credentials stay server-side in the environment file.

### Client
- Built on a chat-shell library that provides the thread, composer, auto-scroll, and a pluggable runtime; wired to the single endpoint via a custom runtime.
- Each assistant turn renders as a **custom message** with four parts — the SQL (as a code block), the result table (with a row cap plus an "N more" indicator), the natural-language summary, and a dim token meter — plus two alternate states: a refusal notice and an error notice.
- The composer is disabled while a request is in flight.
- Component primitives come from a copy-in component library (shadcn-style) over Tailwind; no dynamic/generative UI in v1 (see Out of Scope).

### Project layout
- The engine stays flat at the repo root. A new server entrypoint at the root runs under the existing `tsx` setup and imports the engine directly.
- The web app lives in its own folder with its **own `package.json` and `tsconfig`**, isolating the React/DOM/JSX toolchain from the Node engine.
- Development runs two processes: the API server and the Vite dev server, with Vite proxying API calls to Express. Production has Express serve the built SPA plus the API.

### Desktop-readiness (not built in v1)
- The client reads its API base URL from a runtime-configurable value, so a future Tauri/Wails sidecar can point the same build at a dynamically assigned port.
- "Serve the API" and "serve the static build" are kept as separable concerns in the server, so a desktop shell can serve assets itself while the sidecar serves only the API.

## Testing Decisions

- **What a good test is here:** it exercises external behavior through a stable interface, not implementation details. The existing suite (`rowsEqual.test.ts`, `guard.test.ts`, `introspect.test.ts`) is the prior art — small, pure, deterministic, no mocks.
- **The deep module to extract and test:** the mapping from an engine `AskResult` (plus a fault) to the HTTP response shape — i.e. the decision "which outcome becomes 200-with-body vs 5xx." This is pure (`AskResult | fault → { status, body }`), it is the single most error-prone rule (conflating refused with an outage), and it can be unit-tested with no server or database. Test it in isolation like the existing pure modules.
- **Also worth a pure test:** the client-side derivation of the capped `Turn[]` context buffer from the list of successful turns (window of 3, `{question, sql}` only) — the rule that keeps the visual thread and the model buffer separate. Pure input→output, no React needed.
- The React rendering, the Express wiring, and the live engine calls are verified manually (run the app, ask questions, observe the four outcomes) rather than with heavy integration harnesses — consistent with how the CLI was verified.

## Out of Scope

- **SSE / streaming responses** — v1 is plain request/response JSON. Streaming is the immediate follow-up slice (and folds in the standalone streaming issue).
- **Generative UI / model-chosen visualization** — the model does not pick charts vs tables in v1; output shape is fixed. Deferred to a dedicated future slice (tracked separately).
- **Desktop packaging** (Tauri/Wails) — v1 is web-only; we only keep the two carryover decisions that leave the door open.
- **Authentication / multi-user / network exposure** — local, single-user, loopback-only.
- **Switching databases from the UI** — the server points at one database via its environment; the CLI's `--db` flag is not surfaced in the web UI in v1.
- **Write operations / HITL** — read-only, same as the rest of Sibyl.

## Further Notes

- The engine, CLI, and both evals (single-turn 9/9, multi-turn 8/8) already exist and are done; this PRD adds only surfaces.
- Build order mirrors the CLI's tracer-bullet discipline: the first slice is a walking skeleton — React + chat shell → one `POST /api/ask` → `core.ask` → render a single answer end-to-end — before layering states, table polish, and eventually streaming.
- Every locked decision here was chosen to keep a future desktop shell a *packaging* change, not an architecture rewrite.
