import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDuration, formatScore, formatWon, safeExternalUrl, safeImageUrl, safePhoneNumber } from '../src/lib/formatters.js';

test('display formatters handle known and missing data', () => {
  assert.equal(formatWon(18000), '18,000원');
  assert.equal(formatWon(0), '가격 정보 없음');
  assert.equal(formatDuration(70), '70분');
  assert.equal(formatDuration(null), '시간 정보 없음');
  assert.equal(formatScore(3.45), '3.5');
  assert.equal(formatScore(undefined), '—');
});

test('external links and image URLs reject unsafe schemes', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('https://example.com/book'), 'https://example.com/book');
  assert.equal(safeImageUrl('data:image/svg+xml,<svg/>'), '');
  assert.equal(safeImageUrl('http://images.example.com/poster.jpg'), 'https://images.example.com/poster.jpg');
});

test('phone links only contain phone characters', () => {
  assert.equal(safePhoneNumber('02-1234-5678'), '02-1234-5678');
  assert.equal(safePhoneNumber('call me'), '');
});
