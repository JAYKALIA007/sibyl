// SQL safety guard (pure). The in-code half of read-only + result-size safety;
// the read-only DB role is the other, STRONGER half. This is a belt over that
// suspender, plus the default-LIMIT injector.
//
// Deliberately NOT a full SQL parser (that's a rabbit hole). It strips comments and
// blanks string/identifier literal CONTENTS, then applies a few simple, well-tested
// rules. If this guard is ever fooled, Postgres still rejects the write because we
// connect as a SELECT-only role.

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string }

const DEFAULT_LIMIT = 500

// Remove -- line comments and /* */ block comments.
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

// Blank the CONTENTS of '...' strings and "..." identifiers so inner semicolons or
// keywords can't fool statement-splitting or the keyword checks. Structure (quotes,
// length) is preserved; only the characters between quotes become spaces.
function blankLiterals(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === "'" || c === '"') {
      out += c
      i++
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) { out += '  '; i += 2; continue } // doubled = escaped quote
          out += c
          i++
          break
        }
        out += ' '
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

function splitStatements(scrubbed: string): string[] {
  return scrubbed.split(';').map((s) => s.trim()).filter(Boolean)
}

export function guard(sql: string, defaultLimit = DEFAULT_LIMIT): GuardResult {
  const raw = sql.trim()
  if (!raw) return { ok: false, reason: 'empty query' }

  const scrubbed = blankLiterals(stripComments(raw))
  const parts = splitStatements(scrubbed)
  if (parts.length === 0) return { ok: false, reason: 'empty query' }
  if (parts.length > 1) return { ok: false, reason: 'multiple statements are not allowed' }

  const firstWord = parts[0].match(/^[a-z]+/i)?.[0]?.toLowerCase()
  if (firstWord !== 'select' && firstWord !== 'with') {
    return { ok: false, reason: `only read-only SELECT queries are allowed (got "${firstWord ?? '?'}")` }
  }
  // A CTE (WITH) can legally precede INSERT/UPDATE/DELETE/MERGE in Postgres. Block it.
  if (firstWord === 'with' && /\b(insert|update|delete|merge)\b/i.test(parts[0])) {
    return { ok: false, reason: 'data-modifying statement inside a CTE is not allowed' }
  }

  // Build clean output: drop comments + trailing semicolon (keep real literals).
  const clean = stripComments(raw).replace(/;\s*$/, '').trim()
  // Inject a default LIMIT only if the query has none anywhere (conservative).
  const hasLimit = /\blimit\b/i.test(scrubbed)
  const outSql = hasLimit ? clean : `${clean}\nLIMIT ${defaultLimit}`
  return { ok: true, sql: outSql }
}
