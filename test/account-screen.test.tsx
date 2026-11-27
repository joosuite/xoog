import React from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {AccountScreen} from '../src/account-screen.js';
import type {LoginProgress} from '../src/accounts.js';
import {FakeAccounts} from './support/accounts.js';

afterEach(cleanup);
const size = {columns: 100, rows: 30};
async function settle() {await pause(120);}
async function press(app: ReturnType<typeof render>, key: string) {app.stdin.write(key); await settle();}
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 80 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern);
  // Ink publishes the frame before React installs passive input effects.
  await pause(50);
}
test('login returns a selected account and logout requires confirmation', async () => {
  const auth = new FakeAccounts(); let selected = '';
  const app = render(<AccountScreen auth={auth} onSelect={value => selected = value} size={size}/>);
  await until(app, /test@example.com/); await press(app, 'l'); await press(app, 'new@example.com'); await press(app, '\r');
  assert.match(app.lastFrame()!, /Logged in/); assert.equal(selected, '');
  await press(app, '\r'); assert.equal(selected, 'new@example.com');
  await press(app, 'x'); assert.match(app.lastFrame()!, /Log out of this account/);
  assert.ok((await auth.list()).accounts.includes('new@example.com'));
  await press(app, '\x1b'); assert.ok((await auth.list()).accounts.includes('new@example.com'));
  await press(app, 'x'); await press(app, '\r');
  assert.ok(!(await auth.list()).accounts.includes('new@example.com')); assert.match(app.lastFrame()!, /Logged out/);
});
test('authentication setup initializes, masks credentials, enrolls, and tests the connection', async () => {
  class Auth extends FakeAccounts {
    initialized = false; credentials: string[] = []; tested = false;
    override async initialize() {this.initialized = true;}
    override async enroll(clientId: string, clientSecret: string) {this.credentials = [clientId, clientSecret];}
    override async test() {this.tested = true;}
  }
  const auth = new Auth();
  const app = render(<AccountScreen auth={auth} onSelect={() => {}} size={size}/>);
  await until(app, /test@example.com/); await press(app, 'I'); assert.equal(auth.initialized, true);
  await press(app, 'E'); await press(app, 'desktop-client'); await press(app, '\t'); await press(app, 'super-secret');
  assert.doesNotMatch(app.lastFrame()!, /super-secret/); assert.match(app.lastFrame()!, /\*{12}/);
  await press(app, '\r'); assert.deepEqual(auth.credentials.slice(0, 2), ['desktop-client', 'super-secret']);
  await press(app, 'T'); assert.equal(auth.tested, true);
});
test('empty and failed-login states stay usable and in-flight login can be cancelled', async () => {
  class Auth extends FakeAccounts {
    override async login(email: string, signal?: AbortSignal): Promise<string> {
      if (email === 'bad@example.com') throw new Error('Sign-in denied. Try again.');
      return new Promise((_, reject) => {signal!.addEventListener('abort', () => reject(new Error('Aborted')), {once: true});});
    }
  }
  const auth = new Auth(); await auth.logout('test@example.com');
  const app = render(<AccountScreen auth={auth} onSelect={() => {}} size={{columns: 52, rows: 18}}/>);
  await until(app, /No saved accounts/);
  await press(app, '\r'); await press(app, 'bad@example.com'); await press(app, '\r'); assert.match(app.lastFrame()!, /Sign-in denied/);
  await press(app, '\x1b');
  await press(app, '\x05'); await press(app, '\x15'); await press(app, 'slow@example.com'); await press(app, '\r');
  assert.match(app.lastFrame()!, /Starting Google sign-in/); await press(app, '\x1b'); assert.match(app.lastFrame()!, /Cancelled/);
});
test('login waits for the binary to confirm browser launch and shows complete errors', async () => {
  let notify: LoginProgress | undefined;
  class Auth extends FakeAccounts {
    override async login(_email: string, signal?: AbortSignal, progress?: LoginProgress): Promise<string> {
      notify = progress;
      return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('cancelled')), {once: true}));
    }
  }
  const app = render(<AccountScreen auth={new Auth()} onSelect={() => {}} size={size}/>);
  await until(app, /test@example.com/); await press(app, 'l'); await press(app, 'me@example.com'); await press(app, '\r');
  assert.match(app.lastFrame()!, /Starting Google sign-in/);
  assert.doesNotMatch(app.lastFrame()!, /Waiting up to/);
  notify!('browser-opened'); await until(app, /Waiting up to 3 minutes/);
  await press(app, '\x1b'); assert.match(app.lastFrame()!, /Cancelled/);
});
test('Tab and Enter navigate Authentication, All accounts, and Account actions', async () => {
  class Auth extends FakeAccounts {initialized = false; override async initialize() {this.initialized = true;}}
  const auth = new Auth(); let selected = '';
  const app = render(<AccountScreen auth={auth} onSelect={value => selected = value} size={size}/>);
  await until(app, /test@example.com/);
  await press(app, '\x1b[Z'); await press(app, '\r'); assert.equal(auth.initialized, true);
  await press(app, '\t'); await press(app, '\t'); await press(app, 'j'); await press(app, '\r');
  assert.match(app.lastFrame()!, /Log in to Google/);
  await press(app, '\x1b'); await press(app, 'j'); await press(app, '\r');
  assert.match(app.lastFrame()!, /Log out of this account/);
  await press(app, '\x1b'); await press(app, '\x1b[Z'); await press(app, '\r');
  assert.equal(selected, 'test@example.com');
});
test('global authentication actions and refresh preserve the selected account', async () => {
  class Auth extends FakeAccounts {override async list() {return {accounts: ['work@example.com', 'personal@example.com'], defaultAccount: 'work@example.com'};}}
  let selected = '';
  const app = render(<AccountScreen auth={new Auth()} onSelect={value => selected = value} size={size}/>);
  await until(app, /personal@example.com/); await press(app, 'j'); await press(app, 'T');
  await until(app, /connection successful/); await press(app, 'G'); await until(app, /Accounts refreshed/);
  await press(app, '\t'); await press(app, '\r');
  assert.equal(selected, 'personal@example.com');
});
