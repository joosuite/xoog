import React from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {DatePicker, parseCalendarDate, shiftMonth} from '../src/date-picker.js';
import {App} from '../src/app.js';
import {FakeWorkspace} from './support/workspace.js';
import {dayKey} from '../src/model.js';

afterEach(cleanup);
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 100 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern);
  await pause(60);
}
async function press(app: ReturnType<typeof render>, input: string) {app.stdin.write(input); await pause(80);}

test('date parsing rejects rollover and month navigation clamps to leap-year boundaries', () => {
  assert.equal(dayKey(parseCalendarDate('2024-02-29')!), '2024-02-29');
  for (const value of ['2023-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-11-00', '0000-01-01', '2026-1-01', 'no date']) assert.equal(parseCalendarDate(value), undefined, value);
  assert.equal(dayKey(shiftMonth(new Date(2024, 0, 31, 12), 1)), '2024-02-29');
  assert.equal(dayKey(shiftMonth(new Date(2026, 0, 31, 12), 1)), '2026-02-28');
  assert.equal(dayKey(shiftMonth(new Date(2026, 0, 31, 12), -1)), '2025-12-31');
});

test('arrows browse individual days and weeks, cross month boundaries, and commit only on Enter', async () => {
  let selected: Date | undefined;
  const app = render(<DatePicker day={new Date(2026, 0, 31, 12)} width={100} height={22} onSelect={date => selected = date} onCancel={() => {}}/>);
  await until(app, /2026-01-31/);
  await press(app, '\x1b[C'); await until(app, /2026-02-01/);
  await press(app, '\x1b[B'); await until(app, /2026-02-08/);
  await press(app, '\x1b[D'); await until(app, /2026-02-07/);
  await press(app, '\x1b[A'); await until(app, /2026-01-31/);
  await press(app, '\x1b[6~'); await until(app, /2026-02-28/);
  await press(app, '\x1b[5~'); await until(app, /2026-01-28/);
  assert.equal(selected, undefined);
  await press(app, '\r'); assert.equal(dayKey(selected!), '2026-01-28');
});

test('a six-row month and controls fit at minimum size; invalid typed dates stay in the picker', async () => {
  let selected: Date | undefined;
  const app = render(<DatePicker day={new Date(2026, 2, 31, 12)} width={52} height={10} onSelect={date => selected = date} onCancel={() => {}}/>);
  await until(app, /Choose date/);
  assert.ok(app.lastFrame()!.split('\n').length <= 12);
  assert.match(app.lastFrame()!, /31/); assert.match(app.lastFrame()!, /Enter select · Esc/);
  await press(app, '2026-02-30'); await press(app, '\r'); await until(app, /Enter a valid date/);
  assert.equal(selected, undefined);
  await press(app, '\x1b[C'); await until(app, /2026-04-01/);
  await press(app, '2027-02-15'); await until(app, /2027-02-15/);
  await press(app, '\r'); assert.equal(dayKey(selected!), '2027-02-15');
});

test('calendar picker cancellation preserves the agenda, selection requests the chosen date and seeds new events', async () => {
  class TrackingWorkspace extends FakeWorkspace {
    requested: string[] = [];
    override async events(calendar: string, date: Date, query: string) {this.requested.push(dayKey(date)); return super.events(calendar, date, query);}
  }
  const api = new TrackingWorkspace();
  const app = render(<App api={api} account="test@example.com" size={{columns: 52, rows: 18}}/>);
  await until(app, /Jeanne Fleury/); await press(app, '2'); await until(app, /Pick up the car/);
  const original = api.requested.at(-1), count = api.requested.length;
  assert.match(app.lastFrame()!, /d date/);
  await press(app, 'd'); await until(app, /Choose date/);
  await press(app, '\x1b[C'); await press(app, '\x1b[6~'); assert.equal(api.requested.length, count);
  await press(app, '\x1b'); await until(app, /Pick up the car/); assert.equal(api.requested.at(-1), original);
  await press(app, 'd'); await until(app, /Choose date/);
  await press(app, '2027-02-15'); await press(app, '\r'); await until(app, /No events this week/);
  assert.equal(api.requested.at(-1), '2027-02-15'); assert.doesNotMatch(app.lastFrame()!, /Choose date/);
  await press(app, 'n'); await until(app, /New event/); await press(app, '\t'); await until(app, /2027-02-15T/);
});
