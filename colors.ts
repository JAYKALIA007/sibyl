// Terminal colour helpers, shared by the REPL and the first-run wizard. Respects
// NO_COLOR (https://no-color.org/) and a --no-color flag, and disables colour when
// stdout isn't a TTY (piped output stays clean).

import { stdout as output } from 'node:process'

export const useColor =
  output.isTTY && !process.env.NO_COLOR && !process.argv.includes('--no-color')

export const c = {
  bold:    (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim:     (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  cyan:    (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  green:   (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow:  (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  red:     (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  magenta: (s: string) => (useColor ? `\x1b[35m${s}\x1b[0m` : s),
}
