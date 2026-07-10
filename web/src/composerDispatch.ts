// What picking a slash command from the menu should do — the decision, separated
// from the assistant-ui side-effects (setText / send / switchToNewThread) that carry
// it out, so it can be unit-tested.
//   '/new'  (action)   → start a fresh thread, no message
//   '/sql'  (takesArg) → prime the composer and wait for the user to type the query
//   others  (content)  → fill the command name and send immediately

import type { Command } from './commands'

export type ComposerAction =
  | { kind: 'new-thread' }
  | { kind: 'prime'; text: string }
  | { kind: 'send'; text: string }

export function planCommand(cmd: Command): ComposerAction {
  if (cmd.kind === 'action') return { kind: 'new-thread' }
  if (cmd.takesArg) return { kind: 'prime', text: cmd.name + ' ' }
  return { kind: 'send', text: cmd.name }
}
