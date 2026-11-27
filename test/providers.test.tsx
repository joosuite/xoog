import React from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {ProviderScreen} from '../src/provider-screen.js';
import {AccountScreen} from '../src/account-screen.js';
import {FakeAccounts} from './support/accounts.js';
import {FakeWorkspace} from './support/workspace.js';

afterEach(cleanup);
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 160 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern); await pause(100);
}
async function press(app: ReturnType<typeof render>, keys: string) {app.stdin.write(keys); await pause(120);}

test('account screen switches providers, keeps identical emails separate, and uses the selected workspace', async () => {
  class Microsoft extends FakeAccounts {readonly backend = 'joom' as const;}
  const opened: string[] = [];
  const app = render(<ProviderScreen connections={[
    {id: 'joog', auth: new FakeAccounts(), workspace: account => {opened.push(`joog:${account}`); return new FakeWorkspace();}},
    {id: 'joom', auth: new Microsoft(), workspace: account => {opened.push(`joom:${account}`); return Object.assign(new FakeWorkspace(), {backend: 'joom' as const});}},
  ]} size={{columns: 120, rows: 30}}/>);
  await until(app, /test@example.com/); assert.match(app.lastFrame()!, /1 Google/); assert.match(app.lastFrame()!, /2 Microsoft/);
  await press(app, '2'); await until(app, /test@example.com/); await press(app, '\r'); await until(app, /Microsoft Mail/);
  assert.deepEqual(opened, ['joom:test@example.com']);
  await press(app, 'A'); await until(app, /All accounts/); await press(app, '1'); await until(app, /test@example.com/);
  await press(app, '\r'); await until(app, /Saturday at ours/); assert.equal(opened.at(-1), 'joog:test@example.com');
});
test('Microsoft enrollment saves one client ID without asking for a secret', async () => {
  class Microsoft extends FakeAccounts {
    readonly backend = 'joom' as const;
    credentials: string[] = [];
    override async enroll(id: string, secret: string) {this.credentials = [id, secret];}
  }
  const auth = new Microsoft();
  const app = render(<AccountScreen auth={auth} onSelect={() => {}} size={{columns: 52, rows: 18}}/>);
  await until(app, /test@example.com/); await press(app, 'E'); await until(app, /Application client ID/);
  assert.doesNotMatch(app.lastFrame()!, /Client secret|Google Cloud/);
  await press(app, 'app-registration-id'); await press(app, '\r'); await until(app, /Sign-in setup saved/);
  assert.deepEqual(auth.credentials, ['app-registration-id', '']);
  assert.ok(app.lastFrame()!.split('\n').length <= 18);
});
test('a missing Google backend does not prevent switching to Microsoft', async () => {
  class Missing extends FakeAccounts {override async list(): Promise<never> {throw new Error('Joog was not found.');}}
  class Microsoft extends FakeAccounts {readonly backend = 'joom' as const;}
  const app = render(<ProviderScreen connections={[
    {id: 'joog', auth: new Missing(), workspace: () => new FakeWorkspace()},
    {id: 'joom', auth: new Microsoft(), workspace: () => new FakeWorkspace()},
  ]} size={{columns: 52, rows: 18}}/>);
  await until(app, /Joog was not found/); await press(app, '2'); await until(app, /test@example.com/);
});
