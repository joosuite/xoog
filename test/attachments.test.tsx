import React from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {attachmentPath, attachmentPreview, decodeAttachmentData, readAttachmentPreview, safeAttachmentName, writeNewAttachment} from '../src/attachment-files.js';
import {AttachmentScreen} from '../src/attachment-screen.js';
import {App} from '../src/app.js';
import {type Attachment, type Mail} from '../src/model.js';
import {FakeWorkspace} from './support/workspace.js';

afterEach(cleanup);
const attachment = {partId: '1', name: 'hours.csv', mimeType: 'text/csv', size: 20, data: Buffer.from('Date,Hours\nNov 26,6\n').toString('base64url')};
const message: Mail = {id: 'mail-0', threadId: '', subject: 'Invoice 114', from: 'Odile Roux', to: 'test@example.com', messageId: '', date: '', snippet: '', unread: false, starred: false,
  attachments: [attachment, {partId: '2', name: 'invoice.command', mimeType: 'application/pdf', size: 100, data: Buffer.from('%PDF-1.4\n').toString('base64url')}]};
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 100 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern); await pause(60);
}
async function press(app: ReturnType<typeof render>, key: string) {app.stdin.write(key); await pause(80);}
async function directory(t: {after: (fn: () => Promise<void>) => void}) {
  const value = await mkdtemp(join(tmpdir(), 'xoog-files-test-'));
  t.after(() => rm(value, {recursive: true, force: true})); return value;
}

test('attachment paths stay local, data is validated, and system preview excludes active content', () => {
  assert.equal(safeAttachmentName('../../notes.txt'), 'notes.txt');
  assert.equal(safeAttachmentName('..\\..\\notes.txt'), 'notes.txt');
  assert.equal(safeAttachmentName('NUL.txt'), '_NUL.txt');
  assert.equal(safeAttachmentName('..'), 'attachment');
  assert.ok(Buffer.byteLength(safeAttachmentName('é'.repeat(200) + '.pdf')) <= 200);
  assert.equal(attachmentPath('~/notes.txt'), join(homedir(), 'notes.txt'));
  assert.throws(() => attachmentPath(' '), /destination/);
  assert.throws(() => decodeAttachmentData('not!base64'), /invalid/);
  assert.equal(decodeAttachmentData('aGVsbG8=').toString(), 'hello');
  assert.equal(attachmentPreview({...attachment, mimeType: 'image/svg+xml'})?.kind, 'text');
  assert.equal(attachmentPreview({...attachment, name: 'invoice.pdf', mimeType: 'application/x-executable'}), undefined);
});
test('new files are private, existing files survive, and text preview strips terminal controls and limits large files', async t => {
  const root = await directory(t), file = join(root, 'note.txt');
  await writeNewAttachment(file, Buffer.from('Hello\u001b]52;c;attack\u0007 world'));
  assert.equal(await readAttachmentPreview(file), 'Hello world');
  await assert.rejects(writeNewAttachment(file, Buffer.from('replace')), {code: 'EEXIST'});
  assert.match(await readFile(file, 'utf8'), /Hello/);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(writeNewAttachment(join(root, 'cancelled.txt'), Buffer.from('no'), aborted.signal), {name: 'AbortError'});
  await assert.rejects(stat(join(root, 'cancelled.txt')), {code: 'ENOENT'});
  await writeFile(join(root, 'large.txt'), 'é'.repeat(200_000));
  assert.match(await readAttachmentPreview(join(root, 'large.txt')), /Preview limited to 256 KiB/);
});
test('minimum-size attachment browser previews text, saves to an edited path, and explicitly opens PDFs with a safe extension', async t => {
  const root = await directory(t), destination = join(root, 'hours.csv');
  let opened = '';
  const app = render(<AttachmentScreen api={new FakeWorkspace()} message={message} width={52} height={10} onClose={() => {}}
    openFile={async (path, file) => {opened = path; assert.equal(file.mimeType, 'application/pdf'); assert.match(await readFile(path, 'utf8'), /PDF/);}}/>);
  await until(app, /hours.csv/); assert.match(app.lastFrame()!, /text\/csv/); assert.match(app.lastFrame()!, /Enter preview/);
  await press(app, '\r'); await until(app, /Nov 26,6/); await press(app, '\x1b');
  await press(app, 'd'); await until(app, /Save file to/); await press(app, '\x15'); await press(app, destination); await until(app, /hours.csv/);
  await press(app, '\r'); await until(app, /Saved/); assert.match(await readFile(destination, 'utf8'), /Date,Hours/);
  await press(app, 'j'); await press(app, '\r'); await until(app, /Press o to open/); assert.equal(opened, '');
  await press(app, 'o'); await until(app, /Opened in the system viewer/); assert.match(opened, /\.pdf$/);
  assert.ok(!opened.endsWith('.command')); app.unmount(); await pause(100);
  await assert.rejects(stat(opened), {code: 'ENOENT'});
});
test('attachment loading, empty state, errors, cancellation and long lists remain usable', async () => {
  const app = render(<AttachmentScreen api={new FakeWorkspace()} message={{...message, attachments: []}} width={52} height={10} onClose={() => {}}/>);
  await until(app, /No attachments/); app.unmount();
  class Pending extends FakeWorkspace {
    override async downloadAttachment(_id: string, _file: Attachment, _path: string, signal?: AbortSignal): Promise<void> {
      return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('Aborted')), {once: true}));
    }
  }
  const waiting = render(<AttachmentScreen api={new Pending()} message={message} width={52} height={10} onClose={() => {}}/>);
  await until(waiting, /hours.csv/); await press(waiting, '\r'); await until(waiting, /Loading text preview/);
  await press(waiting, '\x1b'); await until(waiting, /Cancelled/); waiting.unmount();
  const many = Array.from({length: 15}, (_, i) => ({...attachment, partId: `${i}`, name: `file-${i}.txt`}));
  const list = render(<AttachmentScreen api={new FakeWorkspace()} message={{...message, attachments: many}} width={52} height={10} onClose={() => {}}/>);
  await until(list, /file-0.txt/); assert.match(list.lastFrame()!, /█/);
  for (let i = 0; i < 8; i++) await press(list, '\x1b[6~');
  assert.match(list.lastFrame()!, /file-14.txt/); list.unmount();
  class Failing extends FakeWorkspace {
    attempts = 0;
    override async message(id: string) {if (this.attempts++ === 0) throw new Error('Connection interrupted.'); return {...await super.message(id), attachments: message.attachments};}
  }
  const failed = render(<AttachmentScreen api={new Failing()} message={{...message, attachments: undefined}} width={52} height={10} onClose={() => {}}/>);
  await until(failed, /Connection interrupted/); await press(failed, 'g'); await until(failed, /hours.csv/);
});
test('mail opens attachments with v without applying mail shortcuts inside the attachment screen', async () => {
  class Attached extends FakeWorkspace {override async message(id: string) {return {...await super.message(id), attachments: message.attachments};}}
  const app = render(<App api={new Attached()} account="test@example.com" size={{columns: 52, rows: 18}}/>);
  await until(app, /Jeanne Fleury/); await press(app, 'v'); await until(app, /Attachments · 2/);
  await press(app, '\x1b'); await until(app, /Inbox/); assert.doesNotMatch(app.lastFrame()!, /Attachments · 2/);
});
