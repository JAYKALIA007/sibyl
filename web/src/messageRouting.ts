// Where a submitted message goes, decided purely from its text — extracted from the
// runtime adapter's run() closure so the decision is unit-testable without a runtime.
//   `/sql <query>`            → run raw SQL through the guard
//   /schema | /tables | /help → render a client-side command result (no engine)
//   anything else             → a natural-language question for the NL→SQL engine
//
// '/new' is a UI action intercepted in the composer and never submitted, so it lands
// in 'ask' here (harmless — it never reaches routeMessage in practice).

import { parseCommand, parseSqlCommand } from './commands'

export type Route =
  | { kind: 'sql'; query: string }
  | { kind: 'command'; name: string }
  | { kind: 'ask' }

export function routeMessage(text: string): Route {
  const query = parseSqlCommand(text)
  if (query) return { kind: 'sql', query }
  const command = parseCommand(text)
  if (command && command.kind === 'content') return { kind: 'command', name: command.name.slice(1) }
  return { kind: 'ask' }
}
