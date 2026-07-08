import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toDDL, type Schema } from './introspect.ts'

test('renders a single table with a primary key', () => {
  const schema: Schema = [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'integer', notNull: true },
        { name: 'name', type: 'text', notNull: true },
        { name: 'note', type: 'text', notNull: false },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
    },
  ]
  assert.equal(
    toDDL(schema),
    ['CREATE TABLE users (', '  id integer NOT NULL,', '  name text NOT NULL,', '  note text,', '  PRIMARY KEY (id)', ');'].join('\n')
  )
})

test('renders a foreign key as a REFERENCES line', () => {
  const schema: Schema = [
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'integer', notNull: true },
        { name: 'user_id', type: 'integer', notNull: true },
      ],
      primaryKey: ['id'],
      foreignKeys: [{ column: 'user_id', refTable: 'users', refColumn: 'id' }],
    },
  ]
  const ddl = toDDL(schema)
  assert.match(ddl, /FOREIGN KEY \(user_id\) REFERENCES users\(id\)/)
  assert.match(ddl, /PRIMARY KEY \(id\)/)
})

test('separates multiple tables with a blank line', () => {
  const schema: Schema = [
    { name: 'a', columns: [{ name: 'id', type: 'integer', notNull: true }], primaryKey: ['id'], foreignKeys: [] },
    { name: 'b', columns: [{ name: 'id', type: 'integer', notNull: true }], primaryKey: ['id'], foreignKeys: [] },
  ]
  assert.match(toDDL(schema), /\);\n\nCREATE TABLE b/)
})

test('supports a composite primary key', () => {
  const schema: Schema = [
    {
      name: 'membership',
      columns: [
        { name: 'user_id', type: 'integer', notNull: true },
        { name: 'group_id', type: 'integer', notNull: true },
      ],
      primaryKey: ['user_id', 'group_id'],
      foreignKeys: [],
    },
  ]
  assert.match(toDDL(schema), /PRIMARY KEY \(user_id, group_id\)/)
})
