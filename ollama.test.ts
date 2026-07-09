import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasModel } from './ollama.ts'

test('matches an exact tagged name', () => {
  assert.ok(hasModel(['qwen2.5-coder:latest'], 'qwen2.5-coder:latest'))
})

test('a bare name matches any tag of that model', () => {
  assert.ok(hasModel(['qwen2.5-coder:latest', 'llama3.2:latest'], 'qwen2.5-coder'))
  assert.ok(hasModel(['qwen2.5-coder:q4_K_M'], 'qwen2.5-coder'))
})

test('no match when the model is absent', () => {
  assert.ok(!hasModel(['llama3.2:latest'], 'qwen2.5-coder'))
})

test('a tagged request requires an exact match', () => {
  assert.ok(!hasModel(['qwen2.5-coder:latest'], 'qwen2.5-coder:q4'))
})

test('an empty list never matches', () => {
  assert.ok(!hasModel([], 'qwen2.5-coder'))
})
