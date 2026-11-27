// Capture the real Ink renderer with synthetic accounts and TypeScript tooling.
import React from 'react';
import {PassThrough, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import xterm from '@xterm/headless';
import {terminalImage} from './terminal-image.js';
import {type BackendId} from '../src/backend.js';

process.env.FORCE_COLOR = '3';
process.env.TZ = 'Europe/Paris';
delete process.env.NO_COLOR;
const {render} = await import('ink');
const {ScreenshotPreview, installSnapshotClock, snapshotTime} = await import('./screenshot-preview.js');
const {account} = await import('./screenshot-content.js');
const {color, setTheme} = await import('../src/theme.js');
const root = fileURLToPath(new URL('../', import.meta.url));

class Input extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(value: boolean) {this.isRaw = value; return this;}
  ref() {return this;}
  unref() {return this;}
}
class Output extends Writable {
  isTTY = true;
  frame = '';
  constructor(readonly columns: number, readonly rows: number) {super();}
  override _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    const text = chunk.toString();
    if (stripVTControlCharacters(text).trim()) this.frame = text;
    done();
  }
}
type Step = readonly [keys: string, expected: string];
type Capture = {name: string; columns: number; rows: number; steps?: Step[]; light?: boolean; backend?: BackendId; accountHidden?: boolean};
const mail: Step[] = [['\r', 'Saturday at ours?']];
const invoice: Step[] = [...mail, ['j', 'Your car is ready'], ['j', 'Re: the train on Saturday'], ['j', 'Your table for Friday'], ['j', 'Invoice 114']];
const attachments: Step[] = [...invoice, ['v', 'Attachments · 2']];
const save: Step[] = [['d', 'Save file to'], ['\x15', 'Enter saves'], ['~/Downloads/invoice-114.pdf', '~/Downloads/invoice-114.pdf']];
const captures: Capture[] = [
  {name: 'accounts', columns: 120, rows: 30},
  {name: 'mail', columns: 140, rows: 36, steps: mail},
  {name: 'calendar', columns: 140, rows: 36, steps: [...mail, ['2', 'Pick up the car']]},
  {name: 'date-picker', columns: 140, rows: 36, steps: [...mail, ['2', 'Pick up the car'], ['d', 'Choose date']]},
  {name: 'people', columns: 140, rows: 36, steps: [...mail, ['4', 'Contact details']]},
  {name: 'drive', columns: 140, rows: 36, steps: [...mail, ['5', 'Receipts'], ['j', 'Holiday photos'], ['j', 'Household expenses']]},
  {name: 'tasks', columns: 140, rows: 36, steps: [...mail, ['3', 'Find the car collection slip']]},
  {name: 'mail-light', columns: 140, rows: 36, steps: mail, light: true},
  {name: 'mail-narrow', columns: 70, rows: 24, steps: [['\r', 'Jeanne Fleury']]},
  {name: 'attachments', columns: 120, rows: 30, steps: attachments},
  {name: 'attachment-text', columns: 120, rows: 30, steps: [...attachments, ['j', 'hours-november.csv'], ['\r', '2026-11-24,6']]},
  {name: 'attachment-save', columns: 70, rows: 24, steps: [...attachments, ...save]},
  {name: 'microsoft-accounts', columns: 120, rows: 30, backend: 'joom'},
  {name: 'microsoft-mail', columns: 140, rows: 36, backend: 'joom', steps: mail},
  {name: 'microsoft-drive', columns: 140, rows: 36, backend: 'joom', steps: [...mail, ['5', 'OneDrive'], ['j', 'Holiday photos'], ['j', 'Household expenses.xlsx']]},
];
const reviewCaptures: Capture[] = [
  {name: 'people-minimum', columns: 52, rows: 18, steps: [...mail, ['4', 'Jeanne Fleury'], ['\r', 'Contact details']]},
  {name: 'drive-minimum', columns: 52, rows: 18, steps: [...mail, ['5', 'Receipts'], ['\r', 'My Drive / Receipts']]},
  {name: 'drive-download-minimum', columns: 52, rows: 18, steps: [...mail, ['5', 'Receipts'], ['\r', 'Invoice 114.pdf'], ['d', 'Download ·'], ['\x15', 'Enter save'], ['~/Downloads/invoice-114.pdf', '~/Downloads/invoice-114.pdf']]},
  {name: 'drive-light', columns: 120, rows: 30, steps: [...mail, ['5', 'Receipts'], ['j', 'Holiday photos'], ['j', 'Household expenses']], light: true},
  {name: 'attachments-minimum', columns: 52, rows: 18, steps: attachments},
  {name: 'attachment-text-minimum', columns: 52, rows: 18, steps: [...attachments, ['j', 'hours-november.csv'], ['\r', '2026-11-24,6']]},
  {name: 'attachment-save-minimum', columns: 52, rows: 18, steps: [...attachments, ...save]},
  {name: 'attachments-light', columns: 120, rows: 30, steps: attachments, light: true},
  {name: 'attachment-external', columns: 120, rows: 30, steps: [...attachments, ['\r', 'Press o to open']]},
  {name: 'microsoft-accounts-minimum', columns: 52, rows: 18, backend: 'joom'},
  {name: 'microsoft-enroll-minimum', columns: 52, rows: 18, backend: 'joom', accountHidden: true, steps: [['E', 'Application client ID']]},
  {name: 'microsoft-mail-minimum', columns: 52, rows: 18, backend: 'joom', steps: [['\r', 'Jeanne Fleury']]},
  {name: 'microsoft-people', columns: 120, rows: 30, backend: 'joom', steps: [...mail, ['4', 'Contact details']]},
  {name: 'microsoft-light', columns: 120, rows: 30, backend: 'joom', light: true},
];

async function capture(spec: Capture, output: string, review: boolean) {
  setTheme(spec.light ? 'light' : 'dark');
  const stdin = new Input(), stdout = new Output(spec.columns, spec.rows), stderr = new Output(spec.columns, spec.rows);
  const terminal = new xterm.Terminal({cols: spec.columns, rows: spec.rows, convertEol: true, allowProposedApi: true, scrollback: 0});
  const app = render(<ScreenshotPreview columns={spec.columns} rows={spec.rows} review={review} backend={spec.backend}/>, {
    stdout: stdout as unknown as NodeJS.WriteStream, stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stderr as unknown as NodeJS.WriteStream, debug: true, exitOnCtrlC: false, patchConsole: false,
  });
  const waitFor = async (expected: string) => {
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      await pause(25);
      if (stripVTControlCharacters(stdout.frame).includes(expected)) {await pause(100); return;}
    }
    throw new Error(`${spec.name}: did not render ${JSON.stringify(expected)}\n${stripVTControlCharacters(stdout.frame)}`);
  };
  try {
    await waitFor(account);
    for (const [keys, expected] of spec.steps ?? []) {stdin.write(keys); await waitFor(expected);}
    await new Promise<void>(resolve => terminal.write(stdout.frame, resolve));
    const text = Array.from({length: spec.rows}, (_, row) => terminal.buffer.active.getLine(row)?.translateToString(true) ?? '').join('\n');
    if (!spec.accountHidden && !text.includes(account) || !review && !text.includes('SAMPLE DATA / FICTIONAL ACCOUNT')) throw new Error(`${spec.name}: missing fictitious account or sample-data label`);
    if (spec.accountHidden && !text.includes('2 Microsoft')) throw new Error(`${spec.name}: missing provider context`);
    if (/Loading…|Loading saved|Error:/.test(text)) throw new Error(`${spec.name}: screen not ready`);
    const source = `Actual Xoog React/Ink output captured in a ${spec.columns}x${spec.rows} virtual terminal. Fictitious Google account ${account}. All content is synthetic. Source: scripts/screenshot-preview.tsx and scripts/capture-screenshots.tsx. No Google connection or generated image.`;
    await writeFile(join(output, `${spec.name}.png`), await terminalImage(terminal, color, source));
    console.log(`${spec.name}: ${spec.columns}x${spec.rows}`);
    return {file: `${spec.name}.png`, columns: spec.columns, rows: spec.rows, theme: spec.light ? 'light' : 'dark', backend: spec.backend ?? 'joog', source};
  } finally {
    app.unmount(); app.cleanup(); terminal.dispose(); stdin.destroy(); stdout.destroy(); stderr.destroy();
  }
}

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--review')) throw new Error('Usage: npm run screenshots [-- --review]');
const review = args.includes('--review');
const output = join(root, review ? '.impeccable/review' : 'assets/screenshots');
await mkdir(output, {recursive: true});
const restoreClock = installSnapshotClock();
try {
  const results = [];
  for (const spec of review ? reviewCaptures : captures) results.push(await capture(spec, output, review));
  await writeFile(join(output, 'manifest.json'), JSON.stringify({account, fictitious: true, content: 'synthetic', snapshotTime, captures: results}, null, 2) + '\n');
} finally {restoreClock();}
