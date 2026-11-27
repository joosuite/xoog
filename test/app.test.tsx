import React, {act} from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {App} from '../src/app.js';
import {FakeWorkspace} from './support/workspace.js';
import {type ReadOptions} from '../src/model.js';

afterEach(cleanup);
async function settle() {await pause(100);}
async function input(app: ReturnType<typeof render>, text: string) {
  const environment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean};
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {await act(async () => {app.stdin.write(text); await settle();});}
  finally {environment.IS_REACT_ACT_ENVIRONMENT = previous;}
}
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 80 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern);
  await pause(50);
}
test('keyboard navigation switches services, completes tasks and selects collections', async () => {
  const app = render(<App api={new FakeWorkspace()} account="test@example.com" size={{columns: 140, rows: 36}}/>);
  await until(app, /Saturday at ours/);
  await input(app, '2'); await until(app, /Pick up the car/);
  await input(app, '3'); await until(app, /\[ \] Find the car collection slip/);
  await input(app, ' '); await until(app, /\[x\] Find the car collection slip/);
  await input(app, 'h'); await input(app, 'j'); await input(app, '\r');
  await until(app, /Measure the shelf again/);
});
test('search accepts spaces and escape clears the applied query', async () => {
  const app = render(<App api={new FakeWorkspace()} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Saturday at ours/);
  app.stdin.write('/'); await until(app, /Search \//);
  app.stdin.write('Saturday at'); await until(app, /Search \/ Saturday at/);
  app.stdin.write('\r');
  await until(app, /Search: Saturday at/);
  await until(app, /1 \/ 1/);
  assert.doesNotMatch(app.lastFrame()!, /Your car is ready/);
  app.stdin.write('\x1b'); await until(app, /Your car is ready/);
});
test('drafts require review and save through the workspace adapter', async () => {
  const api = new FakeWorkspace();
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 34}}/>);
  await until(app, /Saturday at ours/); app.stdin.write('n'); await until(app, /Compose message/);
  app.stdin.write('jeanne@example.com'); await until(app, /jeanne@example.com/);
  app.stdin.write('\t'); await until(app, /Message subject/);
  app.stdin.write('A test subject'); await until(app, /A test subject/);
  app.stdin.write('\t'); await until(app, /Enter adds a line/);
  app.stdin.write('First line'); await until(app, /First line/); app.stdin.write('\r'); await settle();
  app.stdin.write('Second line'); await until(app, /Second line/);
  app.stdin.write('\x13'); await until(app, /Review · Send message/);
  assert.equal((await api.mail('sent', 'A test subject')).items.length, 0);
  app.stdin.write('\r'); await until(app, /Message sent/);
  const {items: sent} = await api.mail('sent', 'A test subject');
  assert.equal(sent.length, 1); assert.equal(sent[0]?.body, 'First line\nSecond line');
});
test('collection failures are recoverable with refresh', async () => {
  class Failing extends FakeWorkspace {attempts = 0; override async mail(folder: string, query: string) {if (this.attempts++ === 0) throw new Error('Sign in with Joog.'); return super.mail(folder, query);}}
  const app = render(<App api={new Failing()} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Press g to retry/);
  app.stdin.write('g'); await until(app, /Saturday at ours/);
});
test('f forces current reads once across all services while g keeps the TTL and r still replies', async () => {
  class Observed extends FakeWorkspace {
    reads: Array<{name: string; fresh: boolean}> = [];
    record(name: string, options?: ReadOptions) {this.reads.push({name, fresh: options?.fresh === true});}
    override async mail(folder: string, query: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('mail', options); return super.mail(folder, query);}
    override async message(id: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('message', options); return super.message(id);}
    override async calendars(_signal?: AbortSignal, options?: ReadOptions) {this.record('calendars', options); return super.calendars();}
    override async events(calendar: string, day: Date, query: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('events', options); return super.events(calendar, day, query);}
    override async tasklists(_signal?: AbortSignal, options?: ReadOptions) {this.record('tasklists', options); return super.tasklists();}
    override async tasks(list: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('tasks', options); return super.tasks(list);}
    override async people(collection: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('people', options); return super.people(collection);}
    override async files(collection: string, folder: string | undefined, query: string, _signal?: AbortSignal, options?: ReadOptions) {this.record('files', options); return super.files(collection, folder, query);}
  }
  const api = new Observed(), app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Saturday at ours/);
  const press = async (key: string) => input(app, key);
  const checkRefresh = async (names: string[]) => {
    api.reads = []; await press('f');
    assert.deepEqual(api.reads.map(read => read.name).sort(), names.slice().sort());
    assert.ok(api.reads.every(read => read.fresh));
    api.reads = []; await press('g');
    assert.deepEqual(api.reads.map(read => read.name).sort(), names.slice().sort());
    assert.ok(api.reads.every(read => !read.fresh));
  };
  await checkRefresh(['mail', 'message']);
  api.reads = []; await press('j'); assert.deepEqual(api.reads, [{name: 'message', fresh: false}]);
  await press('r'); await until(app, /Compose message/); await press('\x1b');
  for (const [key, title, names] of [
    ['2', /Pick up the car/, ['calendars', 'events']], ['3', /Find the car collection slip/, ['tasklists', 'tasks']],
    ['4', /Contact details/, ['people']], ['5', /Receipts/, ['files']],
  ] as const) {
    await press(key); await until(app, title); await checkRefresh([...names]);
  }
  await press('/'); api.reads = []; await press('f');
  assert.match(app.lastFrame()!, /Search \/ f/); assert.deepEqual(api.reads, []);
});
test('task creation and timed event creation pass reviewed fields to the adapter', async () => {
  const api = new FakeWorkspace();
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 34}}/>);
  const press = async (text: string) => input(app, text);
  await until(app, /Saturday at ours/); await press('3'); await press('n');
  await press('A reviewed task'); await press('\t'); await press('2026-12-01'); await press('\t'); await press('Task note');
  await press('\x13'); assert.match(app.lastFrame()!, /Review · Create task/); await press('\r');
  assert.ok((await api.tasks('@default')).items.find(t => t.title === 'A reviewed task' && t.due === '2026-12-01'));
  await until(app, /Task created/);
  await press('2'); await until(app, /xoog \/ Calendar/); await press('n'); await press('A reviewed event');
  await press('\t'); await press('\x05'); await press('\x15'); await press('2026-12-01T09:00:00Z');
  await press('\t'); await press('\x05'); await press('\x15'); await press('2026-12-01T10:00:00Z');
  await press('\x13'); assert.match(app.lastFrame()!, /Review · Create event/); await press('\r');
  assert.ok((await api.events('primary', new Date('2026-12-01T12:00:00Z'), '')).items.find(e => e.title === 'A reviewed event'));
});
