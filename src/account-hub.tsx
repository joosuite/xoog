/*
THESIS: Saved accounts and every authentication action share one first screen.
OWN-WORLD: Native character grid, square borders, explicit themes, cobalt selection.
STORY: Choose an account, open its workspace, or act without entering a setup menu.
FIRST VIEWPORT: Authentication left; account table and Account actions right.
FORM: Approved accounts-hub-v2.png. Narrow terminals stack the same visible actions.
FINISH: Verify the approved layout, keyboard actions, overflow, and both themes.
*/
import React from 'react';
import {Box, Text} from 'ink';
import {ScrollArea} from './scroll-area.js';
import {color} from './theme.js';
import {cellWordmark, cellWordmarkWidth, cellWordmarkHeight} from './brand.js';

export type AccountPane = 'authentication' | 'accounts' | 'actions';
export const authenticationActions = [
  {id: 'enroll', key: 'E', label: 'Set up sign-in', description: 'Add your app\'s client ID.'},
  {id: 'test', key: 'T', label: 'Test connection', description: 'Check the sign-in service.'},
] as const;
export const accountActions = [
  {id: 'open', key: 'Enter', label: 'Open workspace'},
  {id: 'login', key: 'L', label: 'Log in / add account'},
  {id: 'logout', key: 'X', label: 'Log out selected account'},
] as const;

export function accountHubLayout(columns: number, height: number) {
  const wide = columns >= 90;
  const authenticationWidth = Math.floor(columns * 0.36);
  const accountsWidth = wide ? columns - authenticationWidth - 1 : columns;
  const accountsHeight = wide ? height : height - 4;
  const tableRows = accountsHeight >= 14 ? 2 : 0;
  const actionRows = accountsHeight >= 20 ? 8 : 5;
  return {wide, authenticationWidth, accountsWidth, accountsHeight, tableRows, actionRows,
    pageSize: Math.max(1, accountsHeight - 2 - 1 - tableRows - actionRows)};
}

export function AccountHub({columns, height, accounts, loading, cursor, pane, authenticationCursor, actionCursor}: {
  columns: number; height: number; accounts: string[]; loading: boolean; cursor: number;
  pane: AccountPane; authenticationCursor: number; actionCursor: number;
}) {
  const layout = accountHubLayout(columns, height);
  const showWordmark = layout.wide && layout.authenticationWidth - 4 >= cellWordmarkWidth && height >= 21;
  const offset = Math.max(0, Math.min(cursor - layout.pageSize + 1, accounts.length - layout.pageSize));
  const statusWidth = layout.accountsWidth >= 68 ? 14 : 7;
  const rule = '─'.repeat(Math.max(1, layout.accountsWidth - 4));
  return <Box height={height} flexDirection={layout.wide ? 'row' : 'column'}>
    <Box width={layout.wide ? layout.authenticationWidth : columns} height={layout.wide ? height : 4} flexShrink={0}
      marginRight={layout.wide ? 1 : 0} borderStyle="single" borderColor={pane === 'authentication' ? color.accent : color.border} paddingX={1} flexDirection="column" overflow="hidden">
      <Text bold color={color.text}>Authentication</Text>
      <Box marginTop={layout.wide ? 1 : 0} flexDirection={layout.wide ? 'column' : 'row'}>
        {authenticationActions.map((action, index) => <Box key={action.id} flexDirection="column" marginBottom={layout.wide ? 1 : 0} marginRight={layout.wide || index === authenticationActions.length - 1 ? 0 : 1} flexShrink={0}>
          <Text bold={pane === 'authentication' && authenticationCursor === index} color={pane === 'authentication' && authenticationCursor === index ? color.selectedText : color.text}
            backgroundColor={pane === 'authentication' && authenticationCursor === index ? color.selection : undefined}>[{action.key}] {action.label}</Text>
          {layout.wide && <Text color={color.muted} wrap="truncate">{action.description}</Text>}
        </Box>)}
      </Box>
      {showWordmark && <><Box flexGrow={1}/><Box height={cellWordmarkHeight} flexShrink={0} marginTop={1}><Text bold color={color.accent}>{cellWordmark}</Text></Box></>}
    </Box>
    <Box width={layout.accountsWidth} height={layout.accountsHeight} flexShrink={0} borderStyle="single"
      borderColor={pane === 'accounts' || pane === 'actions' ? color.accent : color.border} paddingX={1} flexDirection="column" overflow="hidden">
      <Box height={1} flexShrink={0}><Text bold color={color.text}>All accounts</Text><Box flexGrow={1}/><Text color={color.muted}>{loading ? 'Loading…' : `${accounts.length} saved`}</Text></Box>
      {layout.tableRows > 0 && <Box height={2} flexShrink={0} flexDirection="column">
        <Box><Text color={color.muted}>{'  '}Account</Text><Box flexGrow={1}/><Box width={statusWidth}><Text color={color.muted}>Status</Text></Box><Box width={2}/></Box>
        <Text color={color.border}>{rule}</Text>
      </Box>}
      <ScrollArea total={loading ? 0 : accounts.length} visible={layout.pageSize} offset={offset} height={layout.pageSize} active={pane === 'accounts'}>
        {loading ? <Text color={color.muted}>Loading saved accounts…</Text> : !accounts.length ? <Text color={color.muted}>No saved accounts. E setup · L log in.</Text> : accounts.slice(offset, offset + layout.pageSize).map((account, index) => {
          const selected = index + offset === cursor;
          return <Box key={account} height={1} flexShrink={0} backgroundColor={selected ? color.selection : undefined}>
            <Text color={selected ? color.selectedText : color.text}>{selected ? '> ' : '  '}</Text>
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text bold={selected} color={selected ? color.selectedText : color.text} wrap="truncate">{account}</Text></Box>
            <Box width={statusWidth} flexShrink={0}><Text color={selected ? color.selectedText : color.muted}>Saved</Text></Box>
          </Box>;
        })}
      </ScrollArea>
      <Box height={layout.actionRows} flexShrink={0} flexDirection="column">
        <Text color={color.border}>{rule}</Text>
        <Text bold color={color.text}>Account actions</Text>
        {layout.actionRows > 5 && <Text>{' '}</Text>}
        {accountActions.map((action, index) => {
          const disabled = action.id !== 'login' && (loading || accounts.length === 0);
          const focused = pane === 'actions' && actionCursor === index && !disabled;
          return <Text key={action.id} color={disabled ? color.border : focused ? color.selectedText : color.text}
            backgroundColor={focused ? color.selection : undefined} wrap="truncate">[{action.key}] {action.label}</Text>;
        })}
      </Box>
    </Box>
  </Box>;
}
