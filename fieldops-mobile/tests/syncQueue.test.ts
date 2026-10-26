import assert from 'node:assert/strict';
import test from 'node:test';

import { canRetry, nextRetryStatus } from '../src/features/inspections/syncQueue';

test('retries only failed operations', () => {
  assert.equal(canRetry('FAILED'), true);
  assert.equal(canRetry('PENDING'), false);
  assert.equal(canRetry('SYNCING'), false);
  assert.equal(canRetry('CONFLICT'), false);
});

test('returns a failed operation to pending without changing conflicts', () => {
  assert.equal(nextRetryStatus('FAILED'), 'PENDING');
  assert.equal(nextRetryStatus('CONFLICT'), 'CONFLICT');
});
