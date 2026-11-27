import React from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {scrollThumb} from '../src/scroll-area.js';
import {App} from '../src/app.js';
import {AccountScreen} from '../src/account-screen.js';
import {DraftForm} from '../src/form.js';
import {FakeWorkspace} from './support/workspace.js';
import {FakeAccounts} from './support/accounts.js';

afterEach(cleanup);
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 100 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern);
  await pause(50);
}
async function press(app: ReturnType<typeof render>, key: string) {app.stdin.write(key); await pause(60);}
function thumbRows(frame: string) {return frame.split('\n').flatMap((line, index) => line.includes('█') ? [index] : []);}

test('scroll thumbs reach both endpoints, clamp overscroll, and disappear when content fits', () => {
  assert.equal(scrollThumb(0, 5, 0, 5), undefined);
  assert.equal(scrollThumb(5, 5, 0, 5), undefined);
  assert.equal(scrollThumb(100, 5, 0, 0), undefined);
  for (const height of [1, 5, 20]) {
    const top = scrollThumb(100, 10, -100, height)!;
    const bottom = scrollThumb(100, 10, 999, height)!;
    assert.equal(top.top, 0);
    assert.equal(bottom.top + bottom.size, height);
    assert.ok(top.size >= 1 && top.size <= height);
  }
  const largeViewport = scrollThumb(100, 80, 0, 10)!;
  const smallViewport = scrollThumb(100, 10, 0, 10)!;
  assert.ok(largeViewport.size > smallViewport.size);
});
test('mail list and reader bars follow selection and cannot scroll past the end', async () => {
  class LongMail extends FakeWorkspace {
    override async mail() {const base = (await super.mail('inbox', '')).items[0]!; return {items: Array.from({length: 30}, (_, i) => ({...base, id: `m${i}`, subject: `Message ${i + 1}`}))};}
    override async message(id: string) {const base = (await super.mail('inbox', '')).items[0]!; return {...base, id, body: Array.from({length: 40}, (_, i) => `Body line ${i + 1}`).join('\n')};}
    override async mark() {}
  }
  const app = render(<App api={new LongMail()} account="test@example.com" size={{columns: 70, rows: 24}}/>);
  await until(app, /Message 1/); assert.match(app.lastFrame()!, /█/);
  const top = thumbRows(app.lastFrame()!)[0]!;
  for (let i = 0; i < 4; i++) await press(app, '\x1b[6~');
  assert.match(app.lastFrame()!, /Message 30/); assert.ok(thumbRows(app.lastFrame()!)[0]! > top);
  await press(app, '\r'); await until(app, /Body line 1/);
  for (let i = 0; i < 8; i++) await press(app, '\x1b[6~');
  assert.match(app.lastFrame()!, /Body line 40/);
  const end = app.lastFrame(); await press(app, 'j'); assert.equal(app.lastFrame(), end);
  await press(app, 'k'); assert.doesNotMatch(app.lastFrame()!, /Body line 40/);
  await press(app, '\x1b'); assert.match(app.lastFrame()!, /Message 30/);
});
test('account and help bars follow the visible content', async () => {
  class ManyAccounts extends FakeAccounts {
    override async list() {return {accounts: Array.from({length: 20}, (_, i) => `account${i}@example.com`), defaultAccount: 'account0@example.com'};}
  }
  const accounts = render(<AccountScreen auth={new ManyAccounts()} onSelect={() => {}} size={{columns: 70, rows: 24}}/>);
  await until(accounts, /account0@example.com/); assert.match(accounts.lastFrame()!, /█/);
  const top = thumbRows(accounts.lastFrame()!)[0]!;
  for (let i = 0; i < 22; i++) await press(accounts, 'j');
  assert.match(accounts.lastFrame()!, /account19@example.com/); assert.ok(thumbRows(accounts.lastFrame()!)[0]! > top);
  accounts.unmount();
  const app = render(<App api={new FakeWorkspace()} account="test@example.com" size={{columns: 70, rows: 24}}/>);
  await until(app, /Saturday at/); await press(app, '?'); assert.match(app.lastFrame()!, /█/);
  for (let i = 0; i < 4; i++) await press(app, '\x1b[6~');
  assert.match(app.lastFrame()!, /local timezone/);
});
test('draft review bars track long wrapped text and keep the save action visible', async () => {
  const app = render(<DraftForm view="tasks" initial={{title: 'Review a long draft', notes: Array.from({length: 40}, (_, i) => `Note ${i}`).join('\n')}} width={70} height={22} busy={false} error="" onCancel={() => {}} onSave={() => {}}/>);
  await pause(100); await press(app, '\x13'); await until(app, /Review · Create task/);
  assert.match(app.lastFrame()!, /█/); assert.match(app.lastFrame()!, /Enter create task/);
  for (let i = 0; i < 5; i++) await press(app, '\x1b[6~');
  assert.match(app.lastFrame()!, /Note 39/);
  const end = app.lastFrame(); await press(app, 'j'); assert.equal(app.lastFrame(), end);
});
