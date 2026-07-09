// Pure CSV serialization for the result grid — the browser mirror of the CLI's
// `.export`. Kept dependency-free and unit-tested; the UI just wires it to a
// clipboard/download button.

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Quote when the field contains a comma, quote, or newline (RFC 4180); escape
  // embedded quotes by doubling them.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map(escapeField).join(',')
  const body = rows.map((row) => columns.map((col) => escapeField(row[col])).join(','))
  return [header, ...body].join('\n')
}
