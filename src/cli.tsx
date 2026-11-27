#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {ProviderScreen} from './provider-screen.js';
import {Joog, findBinary} from './joog.js';
import {CliAccounts} from './accounts.js';
import {Joom} from './joom.js';
import {clean} from './model.js';
import {setTheme} from './theme.js';
import {parseOptions} from './cli-options.js';
import {readFileSync} from 'node:fs';

declare const XOOG_VERSION: string;
const version = typeof XOOG_VERSION === 'string' ? XOOG_VERSION
  : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {version: string}).version;

const help = `Xoog · mail, calendar, tasks, People, and Drive in your terminal

Usage: xoog [options]

  --joog PATH         Joog executable; overrides JOOG_BIN and automatic discovery
  --joom PATH         Joom executable; overrides JOOM_BIN and automatic discovery
  --backend NAME      Initial provider: joog (default) or joom
  --home PATH         Forward a custom state directory to both backends
  --ttl MINUTES       Reuse cached responses (default: 5; 0 disables caching)
  --calendar ID       Initial calendar (default: primary)
  --tasklist ID       Initial task list (default: @default)
  --theme NAME        dark (default) or light
  --no-alt-screen     Keep the interface in the terminal's normal screen
  --help, -h          Show help
  --version, -v       Show version

The first screen manages accounts. E sets up sign-in, T tests the connection,
L logs in, and X logs out the selected account.
Press 1 for Google or 2 for Microsoft on the account screen.
Press A in the workspace to return to accounts.

Xoog uses Joog and Joom binaries. Standalone releases need no Node.js installation.
Press ? inside the app for keyboard shortcuts.
`;

async function main() {
  const values = parseOptions();
  if (values.help) {process.stdout.write(help); return;}
  if (values.version) {process.stdout.write(`xoog ${version}\n`); return;}
  if (values.theme !== 'dark' && values.theme !== 'light') throw new Error('--theme must be dark or light.');
  setTheme(values.theme);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Xoog needs an interactive terminal. Use --help for usage.');
  const [google, microsoft] = await Promise.all([
    findBinary(values.joog || process.env.JOOG_BIN),
    findBinary(values.joom || process.env.JOOM_BIN, process.env.PATH ?? '', 'joom'),
  ]);
  const connections = [
    {id: 'joog' as const, auth: new CliAccounts({binary: google, home: values.home}), workspace: (account: string) => new Joog({account, binary: google, home: values.home, ttl: values.ttl})},
    {id: 'joom' as const, auth: new CliAccounts({binary: microsoft, home: values.home, backend: 'joom'}), workspace: (account: string) => new Joom({account, binary: microsoft, home: values.home, ttl: values.ttl})},
  ];
  const alternate = !values['no-alt-screen'];
  if (alternate) process.stdout.write('\x1b[?1049h');
  let restored = false;
  const restore = () => {if (!restored) {restored = true; if (alternate) process.stdout.write('\x1b[?1049l');}};
  const terminate = () => {restore(); process.exit(0);};
  process.once('exit', restore); process.once('SIGTERM', terminate); process.once('SIGHUP', terminate);
  try {
    const app = render(<ProviderScreen connections={connections} initialBackend={values.backend} initialCalendar={values.calendar} initialTasklist={values.tasklist}/>, {exitOnCtrlC: true, patchConsole: false});
    await app.waitUntilExit();
  } finally {
    restore(); process.off('exit', restore); process.off('SIGTERM', terminate); process.off('SIGHUP', terminate);
  }
}
main().catch(error => {process.stderr.write(`xoog: ${clean(error.message)}\n`); process.exitCode = 1;});
