import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {App, useSize} from './app.js';
import {Input} from './input.js';
import {clean, type Workspace} from './model.js';
import {color} from './theme.js';
import {backendInfo, type BackendId} from './backend.js';
import {type AccountManager, type AccountList} from './accounts.js';
import {ScrollArea} from './scroll-area.js';
import wrapAnsi from 'wrap-ansi';
import {AccountHub, accountHubLayout, authenticationActions, accountActions, type AccountPane} from './account-hub.js';

type Screen = 'accounts' | 'login' | 'enroll' | 'logout';
type Size = {columns: number; rows: number};

export function Xoog({auth, workspace, initialCalendar, initialTasklist, size, backends, onBackend}: {
  auth: AccountManager; workspace: (account: string) => Workspace;
  initialCalendar?: string; initialTasklist?: string; size?: Size; backends?: BackendId[]; onBackend?: (backend: BackendId) => void;
}) {
  const [account, setAccount] = useState<string>();
  const api = useMemo(() => account ? workspace(account) : undefined, [account, workspace]);
  return account && api
    ? <App key={account} api={api} account={account} initialCalendar={initialCalendar} initialTasklist={initialTasklist} size={size} onAccounts={() => setAccount(undefined)}/>
    : <AccountScreen auth={auth} size={size} onSelect={setAccount} backends={backends} onBackend={onBackend}/>;
}

export function AccountScreen({auth, size, onSelect, backends, onBackend}: {auth: AccountManager; size?: Size; onSelect: (account: string) => void; backends?: BackendId[]; onBackend?: (backend: BackendId) => void}) {
  const backend = auth.backend ?? 'joog', info = backendInfo[backend];
  const {exit} = useApp();
  const {columns, rows} = useSize(size);
  const borderedFooter = columns >= 90 && rows >= 24;
  const bodyHeight = rows - (borderedFooter ? 7 : 5);
  const [snapshot, setSnapshot] = useState<AccountList>({accounts: []});
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('accounts');
  const [cursor, setCursor] = useState(0);
  const [pane, setPane] = useState<AccountPane>('accounts');
  const [authenticationCursor, setAuthenticationCursor] = useState(0);
  const [actionCursor, setActionCursor] = useState(0);
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [field, setField] = useState(0);
  const [logoutAccount, setLogoutAccount] = useState('');
  const [error, setError] = useState('');
  const [errorOffset, setErrorOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void auth.list(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSnapshot(value); setCursor(Math.max(0, value.accounts.indexOf(value.defaultAccount ?? ''))); setLoading(false);
    }).catch(cause => {if (!controller.signal.aborted) {setError(clean(cause.message)); setLoading(false);}});
    return () => {mounted.current = false; controller.abort(); operation.current?.abort();};
  }, [auth]);

  async function refresh(preferred?: string, signal?: AbortSignal) {
    const value = await auth.list(signal);
    if (!mounted.current || signal?.aborted) return;
    setSnapshot(value);
    const selected = preferred ?? snapshot.accounts[cursor] ?? value.defaultAccount;
    const index = value.accounts.indexOf(selected ?? '');
    setCursor(index >= 0 ? index : Math.min(cursor, Math.max(0, value.accounts.length - 1)));
  }
  async function perform(label: string, task: (signal: AbortSignal) => Promise<string | void>, success: string, next: Screen = screen) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(label); setError(''); setNotice('');
    try {
      const preferred = await task(controller.signal);
      controller.signal.throwIfAborted();
      await refresh(typeof preferred === 'string' ? preferred : undefined, controller.signal);
      if (mounted.current) {setScreen(next); setNotice(success); if (screen === 'login' || screen === 'logout') setPane('accounts');}
    } catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted) setNotice('Cancelled. Press g to refresh account changes.');
        else setError(clean(cause instanceof Error ? cause.message : cause));
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (mounted.current) setBusy('');
    }
  }
  function runAuthentication(index: number) {
    setPane('authentication'); setAuthenticationCursor(index); setError('');
    if (index === 0) void perform('Initializing credential vault…', signal => auth.initialize(signal), 'Credential vault ready.', 'accounts');
    if (index === 1) {setScreen('enroll'); setField(0); setClientId(''); setClientSecret(''); setNotice('');}
    if (index === 2) void perform('Testing authentication connection…', signal => auth.test(signal), backend === 'joom' ? 'Microsoft OAuth endpoint reachable. App registration and sign-in were not verified.' : 'Google OAuth connection successful.', 'accounts');
  }
  function openLogin() {setScreen('login'); setEmail(''); setError(''); setNotice('');}
  function beginLogout() {
    const account = snapshot.accounts[cursor];
    if (!account) {setError('Select a saved account first, then press x to log out.'); return;}
    setLogoutAccount(account); setScreen('logout'); setError('');
  }
  function submit() {
    if (screen === 'login') {
      const value = email.trim().toLowerCase();
      if (!/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(value)) {setError(`Enter a valid ${info.provider} account email.`); return;}
      void perform(`Starting ${info.provider} sign-in…`, signal => auth.login(value, signal, () => {
        if (mounted.current && !signal.aborted) setBusy('Complete sign-in in your browser. Waiting up to 3 minutes…');
      }), 'Logged in. Press Enter to open the selected account.', 'accounts');
    } else if (screen === 'enroll') {
      if (!clientId.trim() || info.secret && !clientSecret.trim()) {setError(info.secret ? 'Enter both the client ID and client secret.' : 'Enter the Application client ID.'); return;}
      const id = clientId.trim(), secret = clientSecret.trim();
      setClientSecret('');
      void perform('Saving OAuth client credentials…', signal => auth.enroll(id, secret, signal), 'OAuth client saved. Press L to log in.', 'accounts');
    } else if (screen === 'logout') {
      void perform('Logging out…', signal => auth.logout(logoutAccount, signal), `Logged out ${logoutAccount}.`, 'accounts');
    }
  }
  useInput((input, key) => {
    if (columns < 52 || rows < 18) {if (input === 'q') exit(); return;}
    if (screen === 'accounts' && !busy && onBackend && /^[12]$/.test(input)) {
      const selected = backends?.[Number(input) - 1]; if (selected) onBackend(selected); return;
    }
    if (busy) {if (key.escape) operation.current?.abort(); return;}
    if (error) {
      if (key.escape || key.return) {setError(''); setErrorOffset(0); return;}
      if (input === 'q') {exit(); return;}
      if (input === 'j' || key.downArrow || key.pageDown) setErrorOffset(v => Math.min(errorMaxOffset, v + (key.pageDown ? errorRows : 1)));
      if (input === 'k' || key.upArrow || key.pageUp) setErrorOffset(v => Math.max(0, v - (key.pageUp ? errorRows : 1)));
      return;
    }
    if (key.escape) {setScreen('accounts'); setClientSecret(''); setError(''); return;}
    if (screen === 'login' || screen === 'enroll') {
      if (screen === 'enroll' && info.secret && key.tab) setField(v => 1 - v);
      if (key.return) {if (screen === 'enroll' && info.secret && field === 0) setField(1); else submit();}
      if (key.ctrl && input === 's' && screen === 'enroll') submit();
      return;
    }
    const shortcut = input.toLowerCase();
    if (shortcut === 'q') {exit(); return;}
    if (screen === 'logout') {if (key.return) submit(); return;}
    if (key.tab || key.leftArrow || key.rightArrow) {
      const panes: AccountPane[] = ['authentication', 'accounts', 'actions'];
      const backwards = key.shift || key.leftArrow;
      setPane(panes[(panes.indexOf(pane) + (backwards ? 2 : 1)) % panes.length]!); return;
    }
    const direction = shortcut === 'j' || key.downArrow || key.pageDown ? 1 : shortcut === 'k' || key.upArrow || key.pageUp ? -1 : 0;
    if (direction) {
      if (pane === 'authentication') setAuthenticationCursor(v => Math.max(0, Math.min(authenticationActions.length - 1, v + direction)));
      else if (pane === 'actions') setActionCursor(v => Math.max(0, Math.min(accountActions.length - 1, v + direction)));
      else setCursor(v => Math.max(0, Math.min(snapshot.accounts.length - 1, v + direction * (key.pageDown || key.pageUp ? accountHubLayout(columns, bodyHeight).pageSize : 1))));
      setError(''); return;
    }
    if (shortcut === 'i') {runAuthentication(0); return;}
    if (shortcut === 'e') {runAuthentication(1); return;}
    if (shortcut === 't') {runAuthentication(2); return;}
    if (shortcut === 'l') {openLogin(); return;}
    if (loading) return;
    if (shortcut === 'x') {beginLogout(); return;}
    if (shortcut === 'g') {void perform('Refreshing accounts…', async () => {}, 'Accounts refreshed.'); return;}
    if (key.return) {
      if (pane === 'authentication') {runAuthentication(authenticationCursor); return;}
      if (pane === 'actions' && actionCursor === 1) {openLogin(); return;}
      if (pane === 'actions' && actionCursor === 2) {if (snapshot.accounts.length) beginLogout(); return;}
      const selected = snapshot.accounts[cursor];
      if (selected) onSelect(selected); else if (pane === 'accounts') openLogin();
    }
  });

  if (columns < 52 || rows < 18) return <Text color={color.warning}>Xoog needs 52 columns and 18 rows. Resize, or press q to quit.</Text>;
  const editing = screen === 'login' || screen === 'enroll';
  const errorLines = wrapAnsi(error, Math.max(10, columns - 8), {hard: true, trim: false}).split('\n');
  const errorRows = Math.max(1, bodyHeight - 5);
  const errorMaxOffset = Math.max(0, errorLines.length - errorRows);
  const errorScroll = Math.min(errorOffset, errorMaxOffset);
  return <Box width={columns} height={rows - 1} flexDirection="column" backgroundColor={color.background}>
    <Box height={2} flexDirection="column"><Box height={1} paddingX={1}><Text bold color={color.accent}>xoog</Text><Text color={color.muted}> / accounts</Text><Box flexGrow={1}/>{backends?.map((id, index) => <Text key={id} color={id === backend ? color.selectedText : color.muted} backgroundColor={id === backend ? color.selection : undefined}>{` ${index + 1} ${backendInfo[id].provider} `}</Text>)}</Box><Text color={color.border}>{'─'.repeat(columns)}</Text></Box>
    {screen === 'accounts' && !busy && !error ? <AccountHub columns={columns} height={bodyHeight} accounts={snapshot.accounts} loading={loading} cursor={cursor}
      pane={pane} authenticationCursor={authenticationCursor} actionCursor={actionCursor}/> : <Box height={bodyHeight} borderStyle="single" borderColor={color.border} paddingX={2} flexDirection="column" overflow="hidden">
      <Text bold color={color.text}>{screen === 'accounts' ? 'Authentication' : screen === 'login' ? `Log in to ${info.provider}` : screen === 'enroll' ? 'OAuth client credentials' : 'Log out of this account?'}</Text>
      <Box marginTop={1} flexDirection="column" flexGrow={1} overflow="hidden">
        {busy ? <><Text bold color={color.accent}>{busy}</Text><Box marginTop={1}><Text color={color.muted}>{process.platform === 'darwin' && screen === 'login' && busy === `Starting ${info.provider} sign-in…` ? 'Check for a macOS Keychain approval prompt. Esc cancels.' : 'Esc cancels.'}</Text></Box></> : error ? <ScrollArea total={errorLines.length} visible={errorRows} offset={errorScroll} height={errorRows} active>
          <Text color={color.error}>{errorLines.slice(errorScroll, errorScroll + errorRows).join('\n')}</Text>
        </ScrollArea> : screen === 'login' ? <>
          <Text color={color.muted}>{`Enter your ${info.provider} account email. ${info.name} opens your browser to authorize mail, calendar, tasks, contacts, and ${backend === 'joom' ? 'OneDrive' : 'Drive'}.`}</Text>
          <Box marginTop={1}><Text color={color.accent}>Email</Text></Box><Box height={2} overflow="hidden"><Input value={email} width={columns - 6} onChange={setEmail}/></Box>
          <Text color={color.muted}>Need a client ID first? Esc, then E opens enrollment.</Text>
        </> : screen === 'enroll' ? <>
          <Text color={color.muted}>{info.secret ? 'Use OAuth credentials for a Desktop app from Google Cloud Console. Saving replaces the shared OAuth client.' : 'Use the Application client ID from Microsoft Entra. Register a mobile and desktop application with http://localhost/oauth/callback.'}</Text>
          <Box marginTop={1}><Text color={color.accent}>{field === 0 ? info.secret ? 'Client ID' : 'Application client ID' : 'Client secret'}{info.secret ? ` · ${field + 1}/2` : ''}</Text></Box>
          <Box height={2} overflow="hidden"><Input key={field} value={field === 0 ? clientId : clientSecret} width={columns - 6} masked={field === 1} onChange={field === 0 ? setClientId : setClientSecret}/></Box>
          <Text color={color.muted}>{info.secret ? 'The client secret is masked and sent to Joog over stdin.' : 'Joom uses a public client with PKCE. Enter saves the client ID.'}</Text>
        </> : <>
          <Text bold color={color.text}>{logoutAccount}</Text><Box marginTop={1}><Text color={color.muted}>{`This removes the account's local ${info.name} tokens. ${info.provider} permissions remain until you revoke them in your account settings.`}</Text></Box>
        </>}
      </Box>
      <Text>{' '}</Text>
    </Box>}
    <Box paddingX={1} height={1}><Text color={color.success} wrap="truncate">{error ? ' ' : notice || ' '}</Text></Box>
    <Box paddingX={1} height={borderedFooter ? 3 : 1} borderStyle={borderedFooter ? 'single' : undefined} borderColor={color.border}><Text color={color.muted} wrap="truncate">{busy ? 'Esc cancel' : error ? 'Enter / Esc back · j/k scroll · q quit' : editing ? screen === 'login' ? 'Enter log in · Esc back · Ctrl+C quit' : info.secret ? 'Tab change field · Enter next/save · Esc back' : 'Enter save client ID · Esc back' : screen === 'logout' ? 'Enter log out · Esc cancel' : columns >= 90 ? '[Tab] Switch pane  [j/k] Navigate  [Enter] Select  [G] Refresh  [Q] Quit' : 'Tab pane · j/k move · Enter · G refresh · Q quit'}</Text></Box>
  </Box>;
}
