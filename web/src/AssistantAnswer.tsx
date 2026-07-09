import type { AskResult, AskUsage } from './types'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'

const DISPLAY_ROW_CAP = 20

export function AssistantAnswer({ result }: { result: AskResult }) {
  if (result.kind === 'refused') {
    return <p className="text-sm text-muted-foreground">⚠ {result.reason}</p>
  }
  if (result.kind === 'error') {
    return (
      <div className="text-sm">
        <p className="font-medium text-destructive">
          ✗ Couldn&apos;t build a valid query after {result.attempts} attempt
          {result.attempts === 1 ? '' : 's'}.
        </p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{result.error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{result.summary}</p>
      <SqlBlock sql={result.sql} />
      <ResultTable columns={result.columns} rows={result.rows} />
      <Meter usage={result.usage} rowCount={result.rows.length} attempts={result.attempts} />
    </div>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      {sql.replace(/\s+/g, ' ').trim()}
    </pre>
  )
}

function ResultTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows matched.</p>
  }
  const shown = rows.slice(0, DISPLAY_ROW_CAP)
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col} className="font-mono text-xs">
                  {formatCell(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > DISPLAY_ROW_CAP && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          … and {rows.length - DISPLAY_ROW_CAP} more row
          {rows.length - DISPLAY_ROW_CAP === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

function Meter({
  usage,
  rowCount,
  attempts,
}: {
  usage: AskUsage
  rowCount: number
  attempts: number
}) {
  const n = (x: number) => x.toLocaleString('en-US')
  const ctx =
    usage.promptTokens === undefined
      ? `ctx ?/${n(usage.numCtx)}`
      : `ctx ${n(usage.promptTokens)} / ${n(usage.numCtx)} (${Math.round(
          (usage.promptTokens / usage.numCtx) * 100,
        )}%)`
  return (
    <p className="text-xs text-muted-foreground">
      {ctx} · out {n(usage.outputTokens ?? 0)} · {n(rowCount)} row{rowCount === 1 ? '' : 's'}
      {attempts > 1 ? ` · ${attempts} attempts` : ''}
    </p>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
