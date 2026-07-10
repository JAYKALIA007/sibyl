// Renders the result of a slash command as an assistant bubble: the schema DDL,
// the table list, or the help card. The NL→SQL answer renderer lives in
// AssistantAnswer; this is its command-side sibling.

import type { CommandResult, SchemaTable } from './types'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { CopyButton } from './components/CopyButton'
import { toCsv } from './csv'
import { COMMANDS } from './commands'

const DISPLAY_ROW_CAP = 20

export function CommandAnswer({ command }: { command: CommandResult }) {
  switch (command.kind) {
    case 'help':
      return <HelpCard />
    case 'schema':
      return <SchemaBlock ddl={command.ddl} tables={command.tables} />
    case 'tables':
      return <TablesBlock tables={command.tables} />
    case 'sql':
      return <SqlResultBlock sql={command.sql} columns={command.columns} rows={command.rows} />
    case 'sql-error':
      return (
        <div className="rounded-md bg-destructive/5 px-3 py-2 text-sm">
          <p className="flex items-start gap-2 font-medium text-destructive">
            <span aria-hidden>✗</span>
            <span>Your query couldn’t run.</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap pl-6 font-mono text-xs text-muted-foreground">
            {command.message}
          </p>
        </div>
      )
  }
}

function SqlResultBlock({
  sql,
  columns,
  rows,
}: {
  sql: string
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const pretty = sql.replace(/\s+/g, ' ').trim()
  const shown = rows.slice(0, DISPLAY_ROW_CAP)
  const overflow = rows.length - DISPLAY_ROW_CAP
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-border bg-muted/60">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Your SQL
          </span>
          <CopyButton text={pretty} label="Copy" />
        </div>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
          {pretty}
        </pre>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows matched.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {rows.length.toLocaleString('en-US')} row{rows.length === 1 ? '' : 's'}
            </span>
            <CopyButton text={toCsv(columns, rows)} label="Copy CSV" copiedLabel="Copied" variant="download" />
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
              … and {overflow.toLocaleString('en-US')} more row{overflow === 1 ? '' : 's'} — Copy CSV for all
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function HelpCard() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="leading-relaxed">
        Ask anything about your data in plain English — Sibyl writes the SQL, runs it, and
        explains the result. Follow-ups remember the last few turns, so you can say
        “now just the active ones”.
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Commands
        </div>
        <ul className="divide-y divide-border">
          {COMMANDS.map((c) => (
            <li key={c.name} className="flex items-baseline gap-3 px-3 py-1.5">
              <code className="shrink-0 font-mono text-xs text-primary">{c.name}</code>
              <span className="text-muted-foreground">{c.description}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Type “/” in the box to bring up this menu anytime.</p>
    </div>
  )
}

function SchemaBlock({ ddl, tables }: { ddl: string; tables: SchemaTable[] }) {
  const pretty = ddl.trim()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed">
        Sibyl prompts with this schema — {tables.length.toLocaleString('en-US')} table
        {tables.length === 1 ? '' : 's'} in scope.
      </p>
      <div className="overflow-hidden rounded-md border border-border bg-muted/60">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Schema
          </span>
          <CopyButton text={pretty} label="Copy" />
        </div>
        <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
          {pretty}
        </pre>
      </div>
    </div>
  )
}

function TablesBlock({ tables }: { tables: SchemaTable[] }) {
  if (tables.length === 0) {
    return <p className="text-sm text-muted-foreground">No tables in the public schema.</p>
  }
  const columns = ['table', 'rows']
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed">
        {tables.length.toLocaleString('en-US')} table{tables.length === 1 ? '' : 's'} in the
        public schema.
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tables
          </span>
          <CopyButton
            text={toCsv(columns, tables as unknown as Record<string, unknown>[])}
            label="Copy CSV"
            copiedLabel="Copied"
            variant="download"
          />
        </div>
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>table</TableHead>
                <TableHead className="text-right">rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((t) => (
                <TableRow key={t.table} className="even:bg-muted/30">
                  <TableCell className="font-mono text-xs">{t.table}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {t.rows === '?' ? <span className="text-muted-foreground">?</span> : Number(t.rows).toLocaleString('en-US')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
