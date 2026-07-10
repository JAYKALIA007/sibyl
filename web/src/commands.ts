// Slash commands for the composer — the GUI face of the CLI's built-ins
// (.schema / .tables / .help / .clear). Typing `/` opens a menu so the commands
// are discoverable; picking one either produces an assistant bubble (schema,
// tables, help) or acts on the UI (new). Pure and unit-tested; the composer wires
// the menu and the runtime executes the content commands.

export type CommandName = '/sql' | '/schema' | '/tables' | '/help' | '/new'

export type Command = {
  name: CommandName
  description: string
  // 'content' commands run through the runtime and render an assistant message;
  // 'action' commands act on the UI (no message, no LLM, no server call).
  kind: 'content' | 'action'
  // 'arg' commands take a trailing argument (e.g. `/sql <query>`), so they don't
  // fire on an exact-name match and stay in the menu until you type past them.
  takesArg?: boolean
}

export const COMMANDS: readonly Command[] = [
  { name: '/sql', description: 'Run a SQL query yourself (read-only)', kind: 'content', takesArg: true },
  { name: '/schema', description: 'Show the database schema Sibyl reads', kind: 'content' },
  { name: '/tables', description: 'List tables with row counts', kind: 'content' },
  { name: '/help', description: 'What Sibyl can do and how to ask', kind: 'content' },
  { name: '/new', description: 'Start a fresh conversation', kind: 'action' },
]

// `/sql <query>` → the raw query, or null if this isn't a /sql invocation. The
// runtime intercepts this before the NL→SQL engine and runs it through the guard.
export function parseSqlCommand(text: string): string | null {
  const m = text.match(/^\/sql\s+([\s\S]+)$/i)
  const query = m?.[1].trim()
  return query ? query : null
}

// Which commands the menu should offer for the current composer text. Only while
// the user is typing the command token itself: input must start with '/' and hold
// no whitespace yet (once there's a space it's a question, not a command). Empty
// list ⇒ the menu stays closed.
export function matchCommands(input: string): Command[] {
  if (!input.startsWith('/') || /\s/.test(input)) return []
  const typed = input.slice(1).toLowerCase()
  return COMMANDS.filter((c) => c.name.slice(1).startsWith(typed))
}

// Resolve fully-typed text to a command (exact match only) — the runtime uses this
// to intercept a submitted `/schema` etc. before it reaches the NL→SQL engine.
export function parseCommand(text: string): Command | null {
  const t = text.trim().toLowerCase()
  return COMMANDS.find((c) => c.name === t) ?? null
}
