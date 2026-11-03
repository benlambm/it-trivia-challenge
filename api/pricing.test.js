import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCost, nextPriceChange, priceFor } from './pricing.js';

const NOV_2026 = new Date('2026-11-03T20:00:00Z');
const FEB_2027 = new Date('2027-02-01T12:00:00Z');

test('3.8-flash is priced at the 2026 introductory rate', () => {
  const cost = estimateCost('googleai/gemini-3.8-flash', { input: 1_000_000, output: 1_000_000 }, NOV_2026);
  assert.deepEqual(cost, { usd: 4.5, priceFrom: '2026-01-01' });
});

test('thinking tokens are billed at the output rate and cached input at the cached rate', () => {
  const cost = estimateCost(
    'gemini-3.8-flash',
    { input: 1_000_000, cached: 400_000, output: 0, thoughts: 1_000_000 },
    NOV_2026,
  );
  // 600k fresh input * 0.75 + 400k cached * 0.075 + 1M thinking * 3.75
  assert.equal(cost.usd, 0.45 + 0.03 + 3.75);
});

test('calls from 2027 on use the doubled standard rate', () => {
  const cost = estimateCost('googleai/gemini-3.8-flash', { input: 1_000_000, output: 1_000_000 }, FEB_2027);
  assert.deepEqual(cost, { usd: 9, priceFrom: '2027-01-01' });
});

test('a typical quiz call costs fractions of a cent', () => {
  const cost = estimateCost('gemini-3.8-flash', { input: 1_500, output: 3_000, thoughts: 1_000 }, NOV_2026);
  assert.equal(cost.usd, (1_500 * 0.75 + 4_000 * 3.75) / 1_000_000);
});

test('unknown models have no price rather than a wrong one', () => {
  assert.equal(priceFor('googleai/gemini-9-ultra', NOV_2026), null);
  assert.equal(estimateCost('gemini-9-ultra', { input: 10 }, NOV_2026), null);
});

test('nextPriceChange announces the January 2027 increase until it happens', () => {
  assert.equal(nextPriceChange('googleai/gemini-3.8-flash', NOV_2026).from, '2027-01-01');
  assert.equal(nextPriceChange('googleai/gemini-3.8-flash', FEB_2027), null);
});
