import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateViralityScore } from './viralityService.js';

test('calculateViralityScore returns valid score ranges', () => {
  const result = calculateViralityScore('Este é o grande segredo que você precisa saber para viralizar rápido', 30);
  assert.ok(result.score >= 50 && result.score <= 100);
  assert.ok(result.hookStrength >= 50 && result.hookStrength <= 100);
  assert.ok(result.retentionProbability >= 50 && result.retentionProbability <= 100);
  assert.ok(result.reasoning.length > 0);
});

test('calculateViralityScore gives bonus to strong hooks', () => {
  const strongHook = calculateViralityScore('O segredo que ninguém te conta sobre dinheiro e riqueza', 30);
  const plainHook = calculateViralityScore('Hoje nós vamos passear um pouco pelo parque da cidade', 30);
  assert.ok(strongHook.hookStrength > plainHook.hookStrength);
});
