// Gemini API list prices (paid tier, Standard, USD per 1M tokens), used to
// estimate what each call cost. Source: https://aistudio.google.com/docs/pricing
// (checked 2026-11-03). Output prices include thinking tokens. Google's invoice
// is the authoritative receipt; these estimates attribute that bill to games.
//
// Each model lists price periods in date order; a call is priced by the period
// in effect on the day it was made (UTC), so history keeps the price it was
// charged at when rates change. Add a period here when Google announces one.

const FLASH_2026 = { from: '2026-01-01', input: 0.75, output: 3.75, cachedInput: 0.075 };
const FLASH_2027 = { from: '2027-01-01', input: 1.5, output: 7.5, cachedInput: 0.15 };

export const PRICES = {
  'gemini-3.8-flash': [FLASH_2026, FLASH_2027],
  // Retired 2026-10-09 and redirected to 3.8-flash at the same price.
  'gemini-3.7-flash': [FLASH_2026, FLASH_2027],
  'gemini-3.6-flash': [FLASH_2026, FLASH_2027],
};

export const PRICING_SOURCE = 'https://aistudio.google.com/docs/pricing';

function modelKey(model) {
  return String(model ?? '').replace(/^googleai\//, '');
}

export function priceFor(model, at = new Date()) {
  const periods = PRICES[modelKey(model)];
  if (!periods) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  let match = null;
  for (const period of periods) {
    if (period.from <= day) match = period;
  }
  return match;
}

// usage: { input, output, thoughts, cached } token counts (any may be missing).
// Returns { usd, priceFrom } or null when the model has no known price.
export function estimateCost(model, usage, at = new Date()) {
  const price = priceFor(model, at);
  if (!price) return null;
  const input = usage?.input ?? 0;
  const cached = Math.min(usage?.cached ?? 0, input);
  const output = (usage?.output ?? 0) + (usage?.thoughts ?? 0);
  const usd =
    ((input - cached) * price.input + cached * price.cachedInput + output * price.output) / 1_000_000;
  return { usd: Math.round(usd * 1e8) / 1e8, priceFrom: price.from };
}

// The next scheduled price change after `at`, for notices on the dashboard.
export function nextPriceChange(model, at = new Date()) {
  const periods = PRICES[modelKey(model)];
  if (!periods) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  return periods.find((period) => period.from > day) ?? null;
}
