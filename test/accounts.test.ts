import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JoogAccounts} from '../src/accounts.js';

test('account discovery invokes auth list, accepts its array, and forwards custom state and cancellation', {skip: process.platform === 'win32'}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'xoog-accounts-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const binary = join(directory, 'joog'), response = join(directory, 'response.json'), log = join(directory, 'calls.jsonl');
  await writeFile(binary, `#!${process.execPath}
const fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');
const value=fs.readFileSync(${JSON.stringify(response)},'utf8');
if(value==='wait') setTimeout(()=>console.log('[]'),20000);
else process.stdout.write(value);
`, {mode: 0o700});
  const auth = new JoogAccounts({binary, home: directory});
  await writeFile(response, '[]');
  assert.deepEqual(await auth.list(), {accounts: []});
  await writeFile(response, JSON.stringify(['bernard@example.com', 'jeanne@example.com', 'bernard@example.com', ' \u001b[31modile@example.com\u001b[0m ', '']));
  assert.deepEqual(await auth.list(), {accounts: ['bernard@example.com', 'jeanne@example.com', 'odile@example.com']});
  for (const value of ['broken', '{}', 'null', '[42]', '{"accounts":["jeanne@example.com"]}']) {
    await writeFile(response, value);
    await assert.rejects(auth.list(), /parse the JSON output|array of account names/);
  }
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(value => JSON.parse(value));
  assert.ok(calls.every(args => JSON.stringify(args) === JSON.stringify(['--json', '--timeout', '30', '--home', directory, 'auth', 'list'])));
  const controller = new AbortController();
  await writeFile(response, 'wait');
  const pending = auth.list(controller.signal); setTimeout(() => controller.abort(), 150);
  await assert.rejects(pending, {name: 'AbortError'});
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(auth.list(cancelled.signal), {name: 'AbortError'});
});
test('account discovery reports a missing Joog executable', async () => {
  const auth = new JoogAccounts({binary: join(tmpdir(), 'missing-xoog-joog-executable')});
  await assert.rejects(auth.list(), /Joog was not found/);
});

test('auth uses Joog binaries, passes secrets over stdin, parses progress errors and supports cancellation', {skip: process.platform === 'win32'}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'xoog-auth-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const binary = join(directory, 'joog'), log = join(directory, 'calls.jsonl');
  await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
let input=''; process.stdin.on('data', s => input += s); process.stdin.on('end', () => {
 fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args,input})+'\\n');
 if (args.includes('slow@example.com')) {setTimeout(() => console.log('{}'),20000);return;}
 if (args.includes('fail@example.com')) {console.error('Complete sign-in in your browser.');console.error(JSON.stringify({error:'Google denied sign-in.'}));process.exit(1);}
 if (args.includes('keychain@example.com')) {console.error(JSON.stringify({error:'enroll your Google client_id and client_secret with joog auth enroll: cannot unlock master key in OS keychain: Platform failure: An internal error has occurred.'}));process.exit(1);}
 if (args.includes('progress@example.com')) {process.stderr.write('Complete sign-in in your bro');setTimeout(()=>{process.stderr.write('wser. Waiting for authorization.\\n');console.log(JSON.stringify({account:'progress@example.com'}));},20);return;}
 if (input.includes('reject-secret')) {console.error(input);process.exit(1);}
 console.log(JSON.stringify(args.includes('login') ? {account:args[args.indexOf('auth')+1]} : {}));
});`, {mode: 0o700});
  const auth = new JoogAccounts({binary, home: directory});
  await auth.initialize(); await auth.enroll('desktop-client', 'private-client-secret'); await auth.test();
  assert.equal(await auth.login('me@example.com'), 'me@example.com');
  await auth.logout('me@example.com');
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(s => JSON.parse(s));
  assert.deepEqual(calls.map(c => c.args.slice(c.args.indexOf('auth') + 1)), [['init'], ['enroll','--stdin'], ['test'], ['me@example.com','login','mail,calendar,tasks,contacts,drive'], ['me@example.com','logout']]);
  assert.deepEqual(JSON.parse(calls[1].input), {client_id: 'desktop-client', client_secret: 'private-client-secret'});
  assert.ok(calls.every(c => !c.args.join(' ').includes('private-client-secret') && c.args.includes(directory)));
  await assert.rejects(auth.login('fail@example.com'), /^Error: Google denied sign-in\.$/);
  await assert.rejects(auth.login('keychain@example.com'), /does not require enrolling/);
  const progress: string[] = [];
  assert.equal(await auth.login('progress@example.com', undefined, stage => progress.push(stage)), 'progress@example.com');
  assert.deepEqual(progress, ['browser-opened']);
  await assert.rejects(auth.enroll('desktop-client', 'reject-secret'), error => error instanceof Error && !error.message.includes('reject-secret'));
  const controller = new AbortController();
  const pending = auth.login('slow@example.com', controller.signal);
  setTimeout(() => controller.abort(), 150);
  await assert.rejects(pending, {name: 'AbortError'});
});

