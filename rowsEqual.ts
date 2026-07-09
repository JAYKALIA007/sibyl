// Deep, pure result-set comparator for the execution-accuracy eval.
//
// Two SQL queries are "execution-equal" if running them yields the same rows.
// The generated SQL and the gold SQL will differ in surface form — different
// column aliases, different column order, ints-as-strings from the driver — so a
// naive deep-equal would report false mismatches. This normalises those away:
//
//   - column NAMES and column ORDER are ignored (each row → a sorted multiset of
//     its normalised cell values). This tolerates `AS n` vs `AS count` and
//     `SELECT a, b` vs `SELECT b, a`. Trade-off: two swapped same-typed columns
//     can't be told apart — an accepted leniency for NL→SQL scoring.
//   - numeric strings ("5", "24.90") and numbers (5, 24.9) compare equal
//     (node-postgres returns numeric/bigint as strings).
//   - NULL / undefined collapse to one sentinel.
//   - Dates compare by instant; booleans by value; objects (jsonb) by stable JSON.
//   - row ORDER is ignored by default (set/multiset compare); pass { ordered:true }
//     when the question demands a specific order (e.g. "... cheapest first").

export type Row = Record<string, unknown>

const NULL = '\x00'

function normNum(n: number): string {
  if (!isFinite(n)) return String(n)
  // round to 6 dp to absorb float noise without masking real differences
  return String(Math.round((n + Number.EPSILON) * 1e6) / 1e6)
}

// Only plain decimal strings count as numeric — never emails, ids like "12a",
// or dates ("2026-07-09" has dashes, so it stays a string).
const NUMERIC = /^-?\d+(?:\.\d+)?$/

function normCell(v: unknown): string {
  if (v === null || v === undefined) return NULL
  if (v instanceof Date) return 'D' + v.getTime()
  if (typeof v === 'boolean') return v ? 'B1' : 'B0'
  if (typeof v === 'number') return 'N' + normNum(v)
  if (typeof v === 'string') {
    const t = v.trim()
    if (t !== '' && NUMERIC.test(t)) return 'N' + normNum(Number(t))
    return 'S' + t
  }
  return 'J' + JSON.stringify(v)
}

// A row → a canonical key, independent of column names/order.
function normRow(row: Row): string {
  return JSON.stringify(Object.values(row).map(normCell).sort())
}

function multisetEqual(a: string[], b: string[]): boolean {
  const counts = new Map<string, number>()
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1)
  for (const x of b) {
    const c = counts.get(x)
    if (!c) return false
    counts.set(x, c - 1)
  }
  return true
}

export function rowsEqual(a: Row[], b: Row[], opts: { ordered?: boolean } = {}): boolean {
  if (a.length !== b.length) return false
  const na = a.map(normRow)
  const nb = b.map(normRow)
  if (opts.ordered) return na.every((x, i) => x === nb[i])
  return multisetEqual(na, nb)
}
