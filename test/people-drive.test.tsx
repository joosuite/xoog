import React, {act} from 'react';
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render, cleanup} from 'ink-testing-library';
import {setTimeout as pause} from 'node:timers/promises';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {App} from '../src/app.js';
import {DriveDownload} from '../src/drive-download.js';
import {driveDownload, isFolder, normalizeFile, normalizePerson, type DriveFile, type Page} from '../src/model.js';
import {FakeWorkspace} from './support/workspace.js';

afterEach(cleanup);
async function until(app: ReturnType<typeof render>, pattern: RegExp) {
  for (let i = 0; i < 100 && !pattern.test(app.lastFrame() ?? ''); i++) await pause(25);
  assert.match(app.lastFrame()!, pattern); await pause(50);
}
async function press(app: ReturnType<typeof render>, key: string) {
  const environment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean};
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {await act(async () => {app.stdin.write(key); await pause(100);});}
  finally {environment.IS_REACT_ACT_ENVIRONMENT = previous;}
}

test('People searches contact fields, shows details, and selects Starred and Other contacts', async () => {
  const app = render(<App api={new FakeWorkspace()} account="test@example.com" size={{columns: 140, rows: 36}}/>);
  await until(app, /Saturday at ours/); await press(app, '4'); await until(app, /Contact details/);
  assert.match(app.lastFrame()!, /Phone: \+33/); assert.match(app.lastFrame()!, /Ring the downstairs bell/);
  await press(app, '/'); await until(app, /Search \//); await press(app, 'bernard.lemaire'); await press(app, '\r');
  await until(app, /1 \/ 1/); assert.doesNotMatch(app.lastFrame()!, /Jeanne Fleury/);
  await press(app, '\x1b'); await until(app, /Jeanne Fleury/);
  await press(app, 'h'); await press(app, 'j'); await press(app, '\r'); await until(app, /Starred\s+1/);
  await press(app, 'h'); await press(app, 'j'); await press(app, '\r'); await until(app, /No contacts here/);
  await press(app, 'n'); assert.doesNotMatch(app.lastFrame()!, /New task/);
});
test('Drive opens folders, restores the parent, searches, and downloads from a minimum terminal', async () => {
  const app = render(<App api={new FakeWorkspace()} account="test@example.com" size={{columns: 52, rows: 18}}/>);
  await until(app, /Jeanne Fleury/); await press(app, '5'); await until(app, /Receipts/);
  assert.match(app.lastFrame()!, /4 People/); assert.match(app.lastFrame()!, /5 Drive/);
  await press(app, '\r'); await until(app, /My Drive \/ Receipts/); assert.match(app.lastFrame()!, /Invoice 114/);
  await press(app, '\r'); await until(app, /File details/); assert.match(app.lastFrame()!, /Size: 692 B/);
  await press(app, '\x1b'); await press(app, 'd'); await until(app, /Download · Invoice 114/);
  await press(app, '\x1b'); await until(app, /My Drive \/ Receipts/);
  await press(app, '\x7f'); await until(app, /Shopping list/);
  await press(app, '/'); await press(app, 'Shopping'); await press(app, '\r'); await until(app, /1 \/ 1/);
  await press(app, 'd'); await until(app, /Export as PDF/);
  assert.ok(app.lastFrame()!.split('\n').length <= 18);
});
test('Drive save errors preserve existing files, allow retry, and cancellation aborts the operation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xoog-drive-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const destination = join(root, 'invoice.pdf'), file = normalizeFile({id: 'invoice', name: 'Invoice.pdf', mimeType: 'application/pdf'});
  const api = new FakeWorkspace(); await api.downloadFile(file, destination);
  let saved = '';
  const app = render(<DriveDownload api={api} file={file} width={70} height={16} onClose={() => {}} onSaved={path => {saved = path;}}/>);
  await until(app, /Download · Invoice/); await press(app, '\x15'); await press(app, destination); await press(app, '\r');
  await until(app, /already exists/); assert.equal(saved, ''); assert.equal(await readFile(destination, 'utf8'), 'File content');
  await press(app, '\x15'); await press(app, join(root, 'copy.pdf')); await press(app, '\r');
  for (let i = 0; i < 60 && !saved; i++) await pause(25);
  assert.equal(await readFile(saved, 'utf8'), 'File content'); app.unmount();
  let aborted = false, closed = false;
  class Pending extends FakeWorkspace {
    override async downloadFile(_file: DriveFile, _path: string, signal?: AbortSignal): Promise<void> {
      return new Promise((_, reject) => signal!.addEventListener('abort', () => {aborted = true; reject(new Error('Aborted'));}, {once: true}));
    }
  }
  const waiting = render(<DriveDownload api={new Pending()} file={file} width={52} height={10} onClose={() => {closed = true;}} onSaved={() => {}}/>);
  await until(waiting, /Download · Invoice/); await press(waiting, '\r'); await until(waiting, /Downloading/);
  await press(waiting, '\x1b'); assert.ok(aborted); assert.ok(closed);
});
test('switching services aborts an outstanding Drive request and ignores its late result', async () => {
  let finish: (files: Page<DriveFile>) => void = () => {};
  let signal: AbortSignal | undefined;
  class Pending extends FakeWorkspace {
    override async files(_collection: string, _folder: string | undefined, _query: string, nextSignal?: AbortSignal): Promise<Page<DriveFile>> {
      signal = nextSignal; return new Promise(resolve => {finish = resolve;});
    }
  }
  const app = render(<App api={new Pending()} account="test@example.com" size={{columns: 100, rows: 30}}/>);
  await until(app, /Saturday at ours/); await press(app, '5'); await until(app, /Loading files/);
  await press(app, '4'); await until(app, /Contact details/); assert.ok(signal?.aborted);
  finish({items: [normalizeFile({id: 'late', name: 'Late Drive response.pdf', mimeType: 'application/pdf'})]});
  await pause(80); assert.doesNotMatch(app.lastFrame()!, /Late Drive response/); assert.match(app.lastFrame()!, /Jeanne Fleury/);
});
test('normalization strips terminal controls and chooses supported Drive export formats', () => {
  const person = normalizePerson({resourceName: 'people/1', names: [{displayName: '\x1b[31mJeanne\x1b[0m'}], birthdays: [{date: {month: 2, day: 3}}], organizations: [{name: 'Le Passage', title: 'Owner'}]});
  assert.equal(person.title, 'Jeanne'); assert.deepEqual(person.birthdays, ['02-03']); assert.deepEqual(person.organizations, ['Owner · Le Passage']);
  const file = normalizeFile({id: '1', name: 'Expenses', mimeType: 'application/vnd.google-apps.spreadsheet', size: 'invalid'});
  assert.equal(file.size, undefined); assert.match(driveDownload(file)!.name, /Expenses.xlsx/);
  assert.equal(driveDownload({...file, canDownload: false}), undefined);
  assert.equal(driveDownload({...file, mimeType: 'application/vnd.google-apps.form'}), undefined);
  assert.ok(isFolder({...file, shortcut: {id: 'folder', mimeType: 'application/vnd.google-apps.folder'}}));
});
