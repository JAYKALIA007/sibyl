import { ThreadPrimitive } from '@assistant-ui/react'
import type { AskResult, AskUsage } from './types'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { CopyButton } from './components/CopyButton'
import { cn } from './lib/utils'
import { toCsv } from './csv'

const DISPLAY_ROW_CAP = 20

export function AssistantAnswer({ result }: { result: AskResult }) {
  if (result.kind === 'refused') {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm">
        <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
          <span aria-hidden className="mt-px">⚠</span>
          <p>{result.reason}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          <span>Try</span>
          <RefusalChip prompt="/tables">the tables</RefusalChip>
          <RefusalChip prompt="/schema">the schema</RefusalChip>
          <span>
            or type <code className="rounded bg-muted px-1 font-mono text-foreground">/sql …</code> to query directly.
          </span>
        </div>
      </div>
    )
  }
  if (result.kind === 'error') {
    return (
      <div className="rounded-md bg-destructive/5 px-3 py-2 text-sm">
        <p className="flex items-start gap-2 font-medium text-destructive">
          <span aria-hidden>✗</span>
          <span>
            Couldn&apos;t build a valid query after {result.attempts} attempt
            {result.attempts === 1 ? '' : 's'}.
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap pl-6 text-muted-foreground">{result.error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed">{result.summary}</p>
      <SqlBlock sql={result.sql} />
      <ResultTable columns={result.columns} rows={result.rows} />
      <Meter usage={result.usage} rowCount={result.rows.length} attempts={result.attempts} />
    </div>
  )
}

// A tiny chip that sends a slash command (e.g. /schema) when a question is refused —
// turning the dead-end into a next step.
function RefusalChip({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return (
    <ThreadPrimitive.Suggestion
      prompt={prompt}
      send
      className={cn(
        'rounded-md border border-border bg-card px-1.5 py-0.5 font-medium text-foreground/80',
        'transition-colors hover:border-foreground/20 hover:bg-muted',
      )}
    >
      {children}
    </ThreadPrimitive.Suggestion>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  const pretty = sql.replace(/\s+/g, ' ').trim()
  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/60">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">SQL</span>
        <CopyButton text={pretty} label="Copy" />
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
        {pretty}
      </pre>
    </div>
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
  const overflow = rows.length - DISPLAY_ROW_CAP
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {rows.length.toLocaleString('en-US')} row{rows.length === 1 ? '' : 's'}
        </span>
        <CopyButton
          text={toCsv(columns, rows)}
          label="Copy CSV"
          copiedLabel="Copied"
          variant="download"
        />
      </div>
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row, i) => (
              <TableRow key={i} className="even:bg-muted/30">
                {columns.map((col) => (
                  <TableCell key={col} className="whitespace-nowrap font-mono text-xs">
                    {formatCell(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {overflow > 0 && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          … and {overflow.toLocaleString('en-US')} more row{overflow === 1 ? '' : 's'}. Copy CSV for all
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
  const hasCtx = usage.promptTokens !== undefined
  const pct = hasCtx ? Math.min(100, Math.round((usage.promptTokens! / usage.numCtx) * 100)) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {hasCtx && (
        <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-muted-foreground/50"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
      <span>
        {hasCtx
          ? `ctx ${n(usage.promptTokens!)} / ${n(usage.numCtx)} (${pct}%)`
          : `ctx ?/${n(usage.numCtx)}`}{' '}
        · out {n(usage.outputTokens ?? 0)} · {n(rowCount)} row{rowCount === 1 ? '' : 's'}
        {attempts > 1 ? ` · ${attempts} attempts` : ''}
      </span>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
