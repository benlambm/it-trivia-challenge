#!/usr/bin/env node
// Usage report from the analytics events file (see ../analytics.js).
//
//   node scripts/report.mjs [--file PATH] [--month YYYY-MM|previous|current|all] [--format text|csv|json|events|month]
//
// Defaults: --file $TRIVIA_EVENTS_FILE or /var/lib/trivia-api/events.jsonl,
// --month previous (the last full calendar month, America/New_York), --format text.
// The monthly email (ops/trivia-monthly-report) runs this once per format.
import { parseArgs } from 'node:util';
import {
  dailyCsv,
  eventsInMonth,
  localMonth,
  monthlyReportText,
  readEvents,
  summarize,
} from '../analytics.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: process.env.TRIVIA_EVENTS_FILE || '/var/lib/trivia-api/events.jsonl' },
    month: { type: 'string', default: 'previous' },
    format: { type: 'string', default: 'text' },
  },
});

function resolveMonth(value, now = new Date()) {
  if (value === 'all') return null;
  const current = localMonth(now);
  if (value === 'current') return current;
  if (value === 'previous') {
    const [year, month] = current.split('-').map(Number);
    const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    return prev;
  }
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  throw new Error(`--month must be YYYY-MM, previous, current or all (got ${value})`);
}

const all = readEvents(values.file);
const month = resolveMonth(values.month);
const selected = month ? eventsInMonth(all, month) : all;

switch (values.format) {
  case 'text':
    process.stdout.write(monthlyReportText(summarize(selected), summarize(all), month ?? localMonth(new Date())));
    break;
  case 'csv':
    process.stdout.write(dailyCsv(summarize(selected)));
    break;
  case 'json':
    process.stdout.write(`${JSON.stringify(summarize(selected), null, 2)}\n`);
    break;
  case 'events':
    for (const event of selected) process.stdout.write(`${JSON.stringify(event)}\n`);
    break;
  case 'month':
    process.stdout.write(`${month ?? 'all'}\n`);
    break;
  default:
    throw new Error(`--format must be text, csv, json, events or month (got ${values.format})`);
}
