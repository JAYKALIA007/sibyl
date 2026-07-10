import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSuggestions, tableNames, fallbackSuggestions } from './suggestions.ts'

test('parses a clean JSON array', () => {
  const raw = '["How many users are there?", "Top 5 products by price", "Orders per customer", "Products under $20"]'
  assert.deepEqual(parseSuggestions(raw), [
    'How many users are there?',
    'Top 5 products by price',
    'Orders per customer',
    'Products under $20',
  ])
})

test('extracts a JSON array embedded in prose', () => {
  const raw = 'Here are some ideas:\n["How many orders?", "Which users never ordered?"]\nHope that helps!'
  assert.deepEqual(parseSuggestions(raw), ['How many orders?', 'Which users never ordered?'])
})

test('falls back to line parsing, stripping bullets and numbers', () => {
  const raw = '1. How many products are there?\n- Which category sells most?\n* Top 3 reviewers'
  assert.deepEqual(parseSuggestions(raw), [
    'How many products are there?',
    'Which category sells most?',
    'Top 3 reviewers',
  ])
})

test('caps at four questions', () => {
  const raw = JSON.stringify(['a?', 'b?', 'c?', 'd?', 'e?', 'f?'].map((s) => 'question ' + s))
  assert.equal(parseSuggestions(raw).length, 4)
})

test('reads table names from DDL in order', () => {
  const ddl = 'CREATE TABLE users (id int);\nCREATE TABLE orders (id int);'
  assert.deepEqual(tableNames(ddl), ['users', 'orders'])
})

test('fallback leads with a sample-rows prompt, then counts (capped)', () => {
  const ddl = 'CREATE TABLE a (x int);\nCREATE TABLE b (x int);'
  assert.deepEqual(fallbackSuggestions(ddl), [
    'Show 10 rows from the a table',
    'How many rows are in the b table?',
  ])
})

test('fallback handles an empty schema', () => {
  assert.deepEqual(fallbackSuggestions(''), ['How many rows are in each table?'])
})
