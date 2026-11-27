import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm, stat} from 'node:fs/promises';
import {join, delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {Joog, findBinary, parseBinaryOutput} from '../src/joog.js';

// A standalone executable simulates the public Joog binary protocol. No source imports.
async function fixture(t: {after: (fn: () => Promise<void>) => void}, ttl?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'xoog-test-'));
  const binary = join(directory, 'joog'), log = join(directory, 'calls.jsonl');
  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), file = args[args.indexOf('--file') + 1];
const params = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, params, file, mode:fs.statSync(file).mode & 0o777}) + '\\n');
if (params.fail) { console.error(JSON.stringify({error:'Sign in again.'})); process.exit(1); }
if (params.slow) { setTimeout(() => console.log('{}'), 20000); }
else if (args.includes('messages.attachments.get')) {fs.writeFileSync(params.output,Buffer.from('PDF attachment bytes'),{flag:'wx',mode:0o600});console.log(JSON.stringify({path:params.output,bytes:20}));}
else if (args.includes('messages.list')) console.log(JSON.stringify({messages:[{id:'m'}]}));
else if (args.includes('messages.get')) console.log(JSON.stringify({id:'m',payload:{headers:[{name:'Subject',value:'Hello'}]}}));
else if (args.includes('calendars.list')) console.log(JSON.stringify({items:[{id:'primary',summary:'My calendar'}]}));
else if (args.includes('people.connections.list')) {
 console.log(JSON.stringify({connections:[{resourceName:'people/jeanne',names:[{displayName:'Jeanne Fleury'}],emailAddresses:[{value:'jeanne@example.com'}],memberships:[{contactGroupMembership:{contactGroupResourceName:'contactGroups/starred'}}]}],nextPageToken:'next'}));
 console.log(JSON.stringify({connections:[{resourceName:'people/bernard',names:[{displayName:'Bernard Lemaire'}]}]}));
}
else if (args.includes('other-contacts.list')) console.log(JSON.stringify({otherContacts:[{resourceName:'otherContacts/garage',names:[{displayName:'Garage des Acacias'}]}]}));
else if (args.includes('files.list')) {
 console.log(JSON.stringify({files:[{id:'receipts',name:'Receipts',mimeType:'application/vnd.google-apps.folder'}],nextPageToken:'next'}));
 console.log(JSON.stringify({files:[{id:'invoice',name:'Invoice 114.pdf',mimeType:'application/pdf',size:'692',capabilities:{canDownload:true}}]}));
}
else if ((args.includes('files.get') || args.includes('files.export')) && params.output) {fs.writeFileSync(params.output,Buffer.from('Drive file bytes'),{flag:'wx',mode:0o600});console.log(JSON.stringify({path:params.output}));}
else if (args.includes('tasks.list')) {
 console.log(JSON.stringify({kind:'tasks#tasks',nextPageToken:'page-two',items:[{id:'first',title:'Find the collection slip',status:'needsAction'}]}));
 console.log(JSON.stringify({kind:'tasks#tasks',nextPageToken:'page-three'}));
 console.log(JSON.stringify({kind:'tasks#tasks',items:[{id:'second',title:'Forward invoice 114',status:'completed'},{id:'removed',title:'Old task',deleted:true}]}));
}
else console.log('{}');
`;
  await writeFile(binary, script, {mode: 0o700});
  t.after(() => rm(directory, {recursive: true, force: true}));
  const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').map(s => JSON.parse(s));
  return {client: new Joog({account: 'test@example.com', binary, home: join(directory, 'state'), ttl}), calls, directory};
}

test('binary adapter uses private JSON files, explicit account and the public command names', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t);
  const mail = await client.mail('inbox', 'from:jeanne'); assert.equal(mail[0]?.subject, 'Hello');
  await client.calendars();
  await client.events('primary', new Date('2026-11-25T12:00:00Z'), 'planning');
  const log = await calls();
  assert.equal(log[0].params.q, 'in:inbox from:jeanne');
  assert.ok(log[0].args.includes('test@example.com'));
  assert.ok(log[0].args.includes('--json'));
  assert.equal(log[0].mode, 0o600);
  await assert.rejects(stat(log[0].file), {code: 'ENOENT'});
  assert.ok(log[2].args.includes('calendars.list'));
  assert.equal(log[3].params.calendar, 'primary'); assert.equal(log[3].params.query, 'planning');
  assert.ok(log[3].params.from); assert.ok(log[3].params.until);
  assert.ok(log.every(call => call.params.ttl === 5));
});
test('writes preserve labels, task state, MIME reply headers and calendar boundaries', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t);
  await client.mark('m', 'archive');
  await client.complete('list', {id: 't', title: 'T', notes: '', due: '', completed: true});
  await client.createTask('list', {title: 'Task', due: '2026-11-25', notes: 'Note'});
  await client.createEvent('work', {title: 'Meeting', start: '2026-11-25T09:00:00+01:00', end: '2026-11-25T10:00:00+01:00', location: 'Office', description: 'Agenda'});
  await client.send({to: 'jeanne@example.com', subject: 'Re: Notes', body: 'Thanks, Jeanne.'}, {id: 'm', threadId: 'thread', messageId: '<original@example.com>'} as any);
  const log = await calls();
  assert.deepEqual(log[0].params.body, {removeLabelIds: ['INBOX']});
  assert.deepEqual(log[1].params.body, {status: 'needsAction', completed: null});
  assert.equal(log[2].params.due, '2026-11-25T00:00:00Z');
  assert.equal(log[3].params.start.dateTime, '2026-11-25T09:00:00+01:00');
  assert.equal(log[4].params.body.threadId, 'thread');
  const mime = Buffer.from(log[4].params.body.raw, 'base64url').toString();
  assert.match(mime, /From: test@example.com\r\n/);
  assert.match(mime, /Date: .*GMT\r\n/);
  assert.match(mime, /In-Reply-To: <original@example.com>/);
  assert.ok(!log[4].args.join(' ').includes('Thanks'));
  assert.ok(log.every(call => !('ttl' in call.params)));
});
test('task listings combine JSON pages, tolerate empty pages, and filter deleted tasks', {skip: process.platform === 'win32'}, async t => {
  const {client} = await fixture(t);
  const tasks = await client.tasks('list');
  assert.deepEqual(tasks.map(task => [task.id, task.title, task.completed]), [
    ['first', 'Find the collection slip', false], ['second', 'Forward invoice 114', true],
  ]);
});
test('JSON output accepts pretty documents and JSON Lines while retaining only final pagination metadata', () => {
  const first = {items: [{id: 'one', notes: 'First line\nSecond line'}], nextPageToken: 'next', etag: 'first'};
  const last = {items: [{id: 'two'}], etag: 'last'};
  assert.deepEqual(parseBinaryOutput(JSON.stringify(first, null, 2), 'tasks.list'), first);
  const joined = `${JSON.stringify(first)}\r\n\r\n${JSON.stringify(last)}\r\n`;
  assert.deepEqual(parseBinaryOutput(joined, 'tasks.list'), {etag: 'last', items: [...first.items, ...last.items]});
  assert.deepEqual(parseBinaryOutput('{"messages":[{"id":"one"}]}\n{"messages":[{"id":"two"}]}\n', 'messages.list'), {messages: [{id: 'one'}, {id: 'two'}]});
  assert.throws(() => parseBinaryOutput('{"items":[{"id":"partial"}]}\nprivate-content', 'tasks.list'), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Xoog could not parse.*tasks\.list/);
    assert.doesNotMatch(error.message, /private-content/);
    return true;
  });
});
test('binary errors and cancellation clean up request files', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t);
  await assert.rejects(client.call('mail', 'messages.list', {fail: true}), /Sign in again/);
  const controller = new AbortController();
  const request = client.call('mail', 'messages.get', {slow: true}, controller.signal);
  setTimeout(() => controller.abort(), 150);
  await assert.rejects(request, {name: 'AbortError'});
  for (const call of await calls()) await assert.rejects(stat(call.file), {code: 'ENOENT'});
});
test('attachments download through the Joog binary, preserve existing files, and clean private staging files', {skip: process.platform === 'win32'}, async t => {
  const {client, calls, directory} = await fixture(t);
  const destination = join(directory, 'invoice.pdf');
  const attachment = {partId: '1', name: 'invoice.pdf', mimeType: 'application/pdf', attachmentId: 'attachment-id'};
  await client.downloadAttachment('message-id', attachment, destination);
  assert.equal(await readFile(destination, 'utf8'), 'PDF attachment bytes');
  const [call] = await calls();
  assert.equal(call.params.messageId, 'message-id'); assert.equal(call.params.id, 'attachment-id');
  assert.ok(call.args.includes('messages.attachments.get')); assert.notEqual(call.params.output, destination);
  assert.ok(!('ttl' in call.params));
  await assert.rejects(stat(call.params.output), {code: 'ENOENT'});
  await assert.rejects(client.downloadAttachment('message-id', attachment, destination), {code: 'EEXIST'});
  assert.equal(await readFile(destination, 'utf8'), 'PDF attachment bytes');
  const inline = join(directory, 'note.txt'), before = (await calls()).length;
  await client.downloadAttachment('message-id', {partId: '2', name: 'note.txt', mimeType: 'text/plain', data: Buffer.from('A note').toString('base64url')}, inline);
  assert.equal(await readFile(inline, 'utf8'), 'A note'); assert.equal((await calls()).length, before);
  assert.equal((await stat(inline)).mode & 0o777, 0o600);
});
test('an installed Joog executable takes priority over the sibling development binary', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'xoog-binary-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const {mkdir} = await import('node:fs/promises');
  const first = join(directory, 'first'), second = join(directory, 'second');
  await mkdir(first); await mkdir(second);
  const name = process.platform === 'win32' ? 'joog.exe' : 'joog';
  await mkdir(join(first, name));
  const executable = join(second, name);
  await writeFile(executable, '', {mode: 0o700});
  assert.equal(await findBinary(undefined, [first, second].join(delimiter)), executable);
  assert.equal(await findBinary('/chosen/joog', second), '/chosen/joog');
});

test('People and Drive use native binary commands, combine pages, and escape Drive search literals', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t);
  assert.deepEqual((await client.people('contacts')).map(person => person.title), ['Jeanne Fleury', 'Bernard Lemaire']);
  assert.deepEqual((await client.people('starred')).map(person => person.title), ['Jeanne Fleury']);
  assert.equal((await client.people('other'))[0]?.title, 'Garage des Acacias');
  const files = await client.files('root', undefined, "Odile's \\ invoice");
  assert.equal(files[1]?.size, 692);
  await client.files('shared', undefined, '');
  await client.files('recent', 'folder-id', '');
  await client.files('starred', undefined, '');
  const log = await calls();
  assert.ok(log[0].args.includes('contacts')); assert.ok(log[0].args.includes('people.connections.list'));
  assert.equal(log[0].params.resourceName, 'people/me'); assert.match(log[0].params.personFields, /memberships/);
  assert.equal(log[2].params.readMask, 'names,emailAddresses,phoneNumbers');
  assert.equal(log[3].params.q, "trashed = false and 'root' in parents and fullText contains 'Odile\\'s \\\\ invoice'");
  assert.match(log[3].params.fields, /nextPageToken.*capabilities/); assert.equal(log[3].params.includeItemsFromAllDrives, true);
  assert.match(log[4].params.q, /sharedWithMe = true/);
  assert.equal(log[5].params.q, "trashed = false and 'folder-id' in parents");
  assert.match(log[6].params.q, /starred = true/);
  assert.ok(log.every(call => call.params.ttl === 5));
});
test('Drive downloads and exports are private, preserve existing files, resolve shortcuts, and clean staging', {skip: process.platform === 'win32'}, async t => {
  const {client, calls, directory} = await fixture(t);
  const {normalizeFile} = await import('../src/model.js');
  const file = normalizeFile({id: 'invoice', name: 'Invoice.pdf', mimeType: 'application/pdf'});
  const destination = join(directory, 'invoice.pdf');
  await client.downloadFile(file, destination);
  assert.equal(await readFile(destination, 'utf8'), 'Drive file bytes');
  if (process.platform !== 'win32') assert.equal((await stat(destination)).mode & 0o777, 0o600);
  await assert.rejects(client.downloadFile(file, destination), {code: 'EEXIST'});
  assert.equal(await readFile(destination, 'utf8'), 'Drive file bytes');
  await client.downloadFile(normalizeFile({id: 'shortcut', name: 'Household expenses', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: {targetId: 'sheet', targetMimeType: 'application/vnd.google-apps.spreadsheet'}}), join(directory, 'expenses.xlsx'));
  const log = await calls();
  assert.ok(log[0].args.includes('files.get')); assert.equal(log[0].params.fileId, 'invoice');
  assert.ok(log[2].args.includes('files.export')); assert.equal(log[2].params.fileId, 'sheet');
  assert.match(log[2].params.mimeType, /spreadsheetml/);
  assert.ok(log.every(call => !('ttl' in call.params)));
  for (const call of log) await assert.rejects(stat(call.params.output), {code: 'ENOENT'});
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(client.downloadFile(file, join(directory, 'cancelled.pdf'), stopped.signal), {name: 'AbortError'});
  assert.equal((await calls()).length, log.length);
});

test('cacheable reads honor custom TTL, bypass it for forced refresh, and accept zero', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t, 12), fresh = {fresh: true};
  await client.mail('inbox', '', undefined, fresh);
  await client.message('m', undefined, fresh);
  await client.calendars(undefined, fresh);
  await client.events('primary', new Date('2026-11-26T12:00:00Z'), '', undefined, fresh);
  await client.tasklists(undefined, fresh);
  await client.tasks('list', undefined, fresh);
  await client.people('contacts', undefined, fresh);
  await client.people('other', undefined, fresh);
  await client.files('root', undefined, '', undefined, fresh);
  const forced = await calls();
  assert.equal(forced.length, 10);
  assert.ok(forced.every(call => call.params.ttl === 0));
  await client.message('m');
  assert.equal((await calls()).at(-1).params.ttl, 12);
  const disabled = await fixture(t, 0);
  await disabled.client.message('m');
  assert.equal((await disabled.calls())[0].params.ttl, 0);
});
