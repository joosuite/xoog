import React, {act} from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {App} from '../src/app.js';
import {Joog} from '../src/joog.js';
import {Joom} from '../src/joom.js';
import {type Item, type Mail, type Page, type ReadOptions} from '../src/model.js';
import {type BackendId} from '../src/backend.js';
import {FakeWorkspace} from './support/workspace.js';

afterEach(cleanup);
async function press(app: ReturnType<typeof render>, keys: string) {
  const environment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean};
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {await act(async () => {app.stdin.write(keys); await pause(40);});}
  finally {environment.IS_REACT_ACT_ENVIRONMENT = previous;}
}
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 150 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(20);
  assert.match(app.lastFrame()!, pattern); await pause(50);
}
async function end(app: ReturnType<typeof render>, total: number) {
  const counter = new RegExp(`${total} / ${total}(?![+\\d])`);
  for (let i = 0; i < 80 && !counter.test(app.lastFrame() ?? ''); i++) await press(app, '\x1b[6~');
  assert.match(app.lastFrame()!, counter);
}

class PagedWorkspace extends FakeWorkspace {
  reads: Array<{kind: string; token?: string; fresh: boolean}> = [];
  prepend = false;
  failNext = false;
  delayNext = false;
  pending?: {signal?: AbortSignal; finish: () => void};
  constructor(readonly backend: BackendId = 'joog', readonly total = 235) {super();}
  private async page<T extends Item>(kind: string, seed: T, signal?: AbortSignal, options?: ReadOptions): Promise<Page<T>> {
    this.reads.push({kind, token: options?.pageToken, fresh: options?.fresh === true});
    const offset = Number(options?.pageToken ?? 0);
    const rows = Array.from({length: this.total}, (_, index) => ({...seed, id: `${kind}-${index}`,
      ...(kind === 'Mail' ? {subject: `${kind} ${index + 1}`} : {title: `${kind} ${index + 1}`})} as T));
    if (kind === 'Mail' && this.prepend) rows.unshift({...seed, id: 'new-mail', subject: 'New mail'} as T);
    const items = rows.slice(offset, offset + 50);
    if (kind === 'Mail' && offset) items.unshift(rows[offset - 1]!);
    const result = {items, ...(offset + 50 < rows.length ? {nextPageToken: String(offset + 50)} : {})};
    if (kind === 'Mail' && offset && this.failNext) {this.failNext = false; throw new Error('Mail request failed.');}
    if (kind === 'Mail' && offset && this.delayNext) {
      this.delayNext = false;
      return new Promise(resolve => {this.pending = {signal, finish: () => resolve(result)};});
    }
    return result;
  }
  override async mail(_folder: string, _query: string, signal?: AbortSignal, options?: ReadOptions) {
    return this.page('Mail', (await super.mail('inbox', '')).items[0]!, signal, options);
  }
  override async message(id: string) {
    return {...(await super.mail('inbox', '')).items[0]!, id, subject: `Mail ${Number(id.split('-')[1]) + 1}`, body: 'Message text.'};
  }
  override async events(calendar: string, day: Date, query: string, signal?: AbortSignal, options?: ReadOptions) {
    return this.page('Event', (await super.events(calendar, day, query)).items[0]!, signal, options);
  }
  override async tasks(list: string, signal?: AbortSignal, options?: ReadOptions) {
    return this.page('Task', (await super.tasks(list)).items[0]!, signal, options);
  }
  override async people(collection: string, signal?: AbortSignal, options?: ReadOptions) {
    return this.page('Contact', (await super.people(collection)).items[0]!, signal, options);
  }
  override async files(collection: string, folder: string | undefined, query: string, signal?: AbortSignal, options?: ReadOptions) {
    return this.page('File', {...(await super.files(collection, folder, query)).items[0]!, mimeType: 'application/pdf'}, signal, options);
  }
}

for (const backend of ['joog', 'joom'] as const) {
  test(`${backend} mail scrolls past 40, deduplicates overlapping pages, and keeps older selections on refresh`, async () => {
    const api = new PagedWorkspace(backend, 125);
    const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
    await until(app, /Mail 1\b/); assert.equal(api.reads.length, 1);
    await press(app, 'f'); await until(app, /1 \/ 50\+/); assert.equal(api.reads.at(-1)?.fresh, true);
    await end(app, 125); assert.match(app.lastFrame()!, /Mail 125/);
    assert.deepEqual(api.reads.slice(2).map(read => [read.token, read.fresh]), [['50', false], ['100', false]]);
    const before = api.reads.length;
    api.prepend = true;
    await press(app, 'f'); await until(app, /126 \/ 126/);
    assert.match(app.lastFrame()!, /Mail 125/);
    assert.equal(api.reads.length - before, 3);
    assert.ok(api.reads.slice(before).every(read => read.fresh));
    await press(app, 'g'); await until(app, /126 \/ 126/);
    assert.ok(api.reads.slice(-3).every(read => !read.fresh));
  });
}

test('events, tasks, contacts and files remain browsable beyond 200 rows', async () => {
  const api = new PagedWorkspace();
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Mail 1\b/);
  for (const [key, kind] of [['2', 'Event'], ['3', 'Task'], ['4', 'Contact'], ['5', 'File']]) {
    await press(app, key!); await until(app, new RegExp(`${kind} 1\\b`));
    await end(app, 235); assert.match(app.lastFrame()!, new RegExp(`${kind} 235`));
    assert.equal(api.reads.filter(read => read.kind === kind).length, 5);
  }
});

test('task and contact searches find matches on pages not yet loaded', async () => {
  const api = new PagedWorkspace();
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Mail 1\b/);
  for (const [key, kind] of [['3', 'Task'], ['4', 'Contact']]) {
    await press(app, key!); await until(app, new RegExp(`${kind} 1\\b`));
    await press(app, '/'); await press(app, `${kind} 235`); await press(app, '\r');
    await until(app, /1 \/ 1(?![+\d])/);
    assert.match(app.lastFrame()!, new RegExp(`${kind} 235`));
    assert.equal(api.reads.filter(read => read.kind === kind).length, 5);
  }
});

test('a failed older page keeps loaded mail usable and refresh retries it', async () => {
  const api = new PagedWorkspace('joog', 125); api.failNext = true;
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Mail 1\b/);
  for (let i = 0; i < 4; i++) await press(app, '\x1b[6~');
  await until(app, /Mail request failed/); assert.match(app.lastFrame()!, /Mail 50/);
  const failed = api.reads.length; await pause(150); assert.equal(api.reads.length, failed);
  await press(app, 'g'); await end(app, 125);
  assert.match(app.lastFrame()!, /Mail 125/); assert.doesNotMatch(app.lastFrame()!, /Mail request failed/);
});

test('switching services cancels the older-page request and ignores its late response', async () => {
  const api = new PagedWorkspace('joom', 125); api.delayNext = true;
  const app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Mail 1\b/);
  for (let i = 0; i < 4; i++) await press(app, '\x1b[6~');
  await until(app, /Loading older messages/); assert.ok(api.pending);
  await press(app, '3'); await until(app, /Task 1\b/); assert.ok(api.pending.signal?.aborted);
  api.pending.finish(); await pause(100);
  assert.match(app.lastFrame()!, /Task 1\b/); assert.doesNotMatch(app.lastFrame()!, /Mail 51/);
});

test('a repeated cursor stops automatic paging without discarding loaded mail', async () => {
  class Repeated extends FakeWorkspace {
    requests = 0;
    override async mail(): Promise<Page<Mail>> {
      this.requests++;
      return {items: (await super.mail('inbox', '')).items.slice(0, 1), nextPageToken: 'same'};
    }
  }
  const api = new Repeated(), app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /repeated a page cursor/); await pause(150);
  assert.equal(api.requests, 2); assert.match(app.lastFrame()!, /Saturday at ours/);
});

test('empty contact pages keep advancing until contacts or the end are reached', async () => {
  class EmptyPages extends FakeWorkspace {
    requests = 0;
    override async people(collection: string, _signal?: AbortSignal, options?: ReadOptions) {
      this.requests++;
      if (!options?.pageToken) return {items: [], nextPageToken: 'empty'};
      if (options.pageToken === 'empty') return {items: [], nextPageToken: 'contacts'};
      return super.people(collection);
    }
  }
  const api = new EmptyPages(), app = render(<App api={api} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Saturday at ours/); await press(app, '4'); await until(app, /Jeanne Fleury/);
  assert.equal(api.requests, 3); assert.doesNotMatch(app.lastFrame()!, /No contacts here/);
});

for (const Client of [Joog, Joom]) {
  test(`${Client.name} preserves opaque cursors and uses page sizes instead of total limits across services`, async () => {
    const token = Client === Joom ? 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=a%2Bb&$top=50' : 'opaque+cursor/==';
    class Stub extends Client {
      requests: Array<{service: string; command: string; params: Record<string, any>}> = [];
      override async call(service: string, command: string, params: Record<string, any> = {}) {
        this.requests.push({service, command, params});
        if (command === 'messages.get') return {id: params.id, payload: {headers: []}};
        if (command === 'calendars.list' || command === 'tasklists.list') return {items: Array.from({length: 135}, (_, i) => ({id: String(i), title: 'List', summary: 'Calendar'}))};
        const id = params.pageToken ? 'second' : 'first';
        const key = service === 'mail' ? 'messages' : service === 'drive' ? 'files' : service === 'contacts' ? 'connections' : 'items';
        return {[key]: [{id, resourceName: id, title: id, summary: id, name: id, status: 'needsAction'}], ...(!params.pageToken ? {nextPageToken: token} : {})};
      }
    }
    const api = new Stub({account: 'test@example.com', binary: 'unused'});
    const loaders = [
      (options: ReadOptions) => api.mail('all', '', undefined, options),
      (options: ReadOptions) => api.events('primary', new Date('2026-11-27T12:00:00Z'), '', undefined, options),
      (options: ReadOptions) => api.tasks('@default', undefined, options),
      (options: ReadOptions) => api.people('contacts', undefined, options),
      (options: ReadOptions) => api.files('root', undefined, '', undefined, options),
    ];
    for (const load of loaders) {
      const first = await load({}); assert.equal(first.nextPageToken, token);
      const second = await load({pageToken: token}); assert.equal(second.items[0]?.id, 'second'); assert.equal(second.nextPageToken, undefined);
    }
    const pages = api.requests.filter(request => request.command !== 'messages.get');
    assert.equal(pages.length, 10);
    for (let i = 0; i < pages.length; i++) {
      const params = pages[i]!.params;
      assert.equal(params.maxPages, 1); assert.ok(!('max' in params));
      assert.equal(params.maxResults ?? params.pageSize, 50);
      assert.equal(params.pageToken, i % 2 ? token : undefined);
      if (i % 2) {const {pageToken, ...rest} = params; assert.deepEqual(rest, pages[i - 1]!.params);}
    }
    assert.equal((await api.calendars()).length, 135); assert.equal((await api.tasklists()).length, 135);
    assert.ok(api.requests.slice(-2).every(request => !('max' in request.params) && !('maxPages' in request.params)));
  });
}
