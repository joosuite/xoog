#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {Xoog} from './account-screen.js';
import {Joog, findBinary} from './joog.js';
import {JoogAccounts} from './accounts.js';
import {clean} from './model.js';
import {setTheme} from './theme.js';
import {parseOptions} from './cli-options.js';

const help = `Xoog · mail, calendar, tasks, People, and Drive in your terminal

Usage: xoog [options]

  --joog PATH         Joog executable; defaults to JOOG_BIN, PATH, or a sibling binary
  --home PATH         Forward Joog's custom state directory
  --ttl MINUTES       Reuse Joog's cached responses (default: 5; 0 disables caching)
  --calendar ID       Initial calendar (default: primary)
  --tasklist ID       Initial task list (default: @default)
  --theme NAME        dark (default) or light
  --no-alt-screen     Keep the interface in the terminal's normal screen
  --help, -h          Show help
  --version, -v       Show version

The first screen manages accounts. I initializes the vault, E enrolls a client,
T tests authentication, L logs in, and X logs out the selected account.
Press A in the workspace to return to accounts.

Xoog uses Joog's JSON commands and encrypted credentials. Node.js 22+ required.
Press ? inside the app for keyboard shortcuts.
`;

async function main() {
  const values = parseOptions();
  if (values.help) {process.stdout.write(help); return;}
  if (values.version) {process.stdout.write('xoog 0.1.0\n'); return;}
  if (values.theme !== 'dark' && values.theme !== 'light') throw new Error('--theme must be dark or light.');
  setTheme(values.theme);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Xoog needs an interactive terminal. Use --help for usage.');
  const binary = await findBinary(values.joog || process.env.JOOG_BIN);
  const auth = new JoogAccounts({binary, home: values.home});
  const workspace = (account: string) => new Joog({account, binary, home: values.home, ttl: values.ttl});
  const alternate = !values['no-alt-screen'];
  if (alternate) process.stdout.write('\x1b[?1049h');
  let restored = false;
  const restore = () => {if (!restored) {restored = true; if (alternate) process.stdout.write('\x1b[?1049l');}};
  const terminate = () => {restore(); process.exit(0);};
  process.once('exit', restore); process.once('SIGTERM', terminate); process.once('SIGHUP', terminate);
  try {
    const app = render(<Xoog auth={auth} workspace={workspace} initialCalendar={values.calendar} initialTasklist={values.tasklist}/>, {exitOnCtrlC: true, patchConsole: false});
    await app.waitUntilExit();
  } finally {
    restore(); process.off('exit', restore); process.off('SIGTERM', terminate); process.off('SIGHUP', terminate);
  }
}
main().catch(error => {process.stderr.write(`xoog: ${clean(error.message)}\n`); process.exitCode = 1;});
