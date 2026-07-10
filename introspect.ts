// Read the database's structure (introspection) and render it as CREATE TABLE DDL —
// the shape coder models were trained on, so it produces the best SQL. The FK lines
// are how the model learns how to join.
//
// toDDL is a DEEP, PURE module (metadata in → DDL string out, no I/O) so it can be
// unit-tested in isolation. getSchema is the impure half that hits the live DB.

import { runQuery, close, type Conn } from './db.ts'
import { isMain } from './isMain.ts'

export type Column = { name: string; type: string; notNull: boolean }
export type ForeignKey = { column: string; refTable: string; refColumn: string }
export type Table = {
  name: string
  columns: Column[]
  primaryKey: string[]
  foreignKeys: ForeignKey[]
}
export type Schema = Table[]

// PURE: schema metadata → CREATE TABLE DDL.
export function toDDL(schema: Schema): string {
  return schema
    .map((t) => {
      const lines: string[] = t.columns.map(
        (c) => `  ${c.name} ${c.type}${c.notNull ? ' NOT NULL' : ''}`
      )
      if (t.primaryKey.length) lines.push(`  PRIMARY KEY (${t.primaryKey.join(', ')})`)
      for (const fk of t.foreignKeys) {
        lines.push(`  FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn})`)
      }
      return `CREATE TABLE ${t.name} (\n${lines.join(',\n')}\n);`
    })
    .join('\n\n')
}

// IMPURE: read the live schema of the `public` tables via information_schema.
export async function getSchema(conn?: Conn): Promise<Schema> {
  const cols = await runQuery(`
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`, conn)

  // Constraints via pg_catalog — readable by any role. (information_schema hides
  // constraints from a SELECT-only role, so PKs/FKs would come back empty there.)
  // unnest conkey/confkey WITH ORDINALITY preserves column order + composite keys.
  const cons = await runQuery(`
    SELECT
      cl.relname  AS table_name,
      con.contype AS contype,
      a.attname   AS column_name,
      fcl.relname AS ref_table,
      fa.attname  AS ref_column,
      k.ord       AS ord
    FROM pg_constraint con
    JOIN pg_class cl     ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a  ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
    LEFT JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
    LEFT JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = fk.attnum
    WHERE con.contype IN ('p', 'f')
    ORDER BY cl.relname, con.conname, k.ord`, conn)

  for (const r of [cols, cons]) if ('error' in r) throw new Error(r.error)

  const tables = new Map<string, Table>()
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, { name, columns: [], primaryKey: [], foreignKeys: [] })
    return tables.get(name)!
  }
  for (const r of (cols as { rows: any[] }).rows) {
    table(r.table_name).columns.push({ name: r.column_name, type: r.data_type, notNull: r.is_nullable === 'NO' })
  }
  for (const r of (cons as { rows: any[] }).rows) {
    if (r.contype === 'p') table(r.table_name).primaryKey.push(r.column_name)
    else if (r.contype === 'f') {
      table(r.table_name).foreignKeys.push({ column: r.column_name, refTable: r.ref_table, refColumn: r.ref_column })
    }
  }
  return [...tables.values()]
}

// `npm run schema:ddl` — print the live DB's schema as DDL.
if (isMain(import.meta.url)) {
  console.log(toDDL(await getSchema()))
  await close()
}
