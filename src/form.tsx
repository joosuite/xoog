import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {Input} from './input.js';
import wrapAnsi from 'wrap-ansi';
import {clean, dayKey, validateDraft, type DraftView} from './model.js';
import {color} from './theme.js';
import {ScrollArea} from './scroll-area.js';

type Field = {key: string; label: string; hint: string; multiline?: boolean};
const fields: Record<DraftView, Field[]> = {
  mail: [{key: 'to', label: 'To', hint: 'name@example.com, another@example.com'}, {key: 'subject', label: 'Subject', hint: 'Message subject'}, {key: 'body', label: 'Message', hint: 'Enter adds a line. Ctrl+S reviews the message.', multiline: true}],
  calendar: [{key: 'title', label: 'Title', hint: 'Event title'}, {key: 'start', label: 'Start', hint: 'RFC 3339, e.g. 2026-11-25T09:00:00+01:00'}, {key: 'end', label: 'End', hint: 'RFC 3339 timestamp, including timezone'}, {key: 'location', label: 'Location', hint: 'Optional'}, {key: 'description', label: 'Notes', hint: 'Optional'}],
  tasks: [{key: 'title', label: 'Title', hint: 'Task title'}, {key: 'due', label: 'Due', hint: 'YYYY-MM-DD, or leave empty'}, {key: 'notes', label: 'Notes', hint: 'Optional'}],
};
export function initialValues(view: DraftView, day: Date): Record<string, string> {
  if (view !== 'calendar') return {};
  const start = new Date(day); start.setHours(Math.max(9, new Date().getHours() + 1), 0, 0, 0);
  return {start: start.toISOString(), end: new Date(start.getTime() + 3600_000).toISOString()};
}

export function DraftForm({view, initial, height, width, busy, error, onCancel, onSave}: {
  view: DraftView; initial: Record<string, string>; height: number; width: number; busy: boolean; error: string;
  onCancel: () => void; onSave: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState(initial);
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [validation, setValidation] = useState('');
  const [offset, setOffset] = useState(0);
  const group = fields[view], field = group[index]!;
  const action = view === 'mail' ? 'Send message' : view === 'calendar' ? 'Create event' : 'Create task';
  const reviewLines = group.flatMap(f => [`${f.label}:`, ...(values[f.key] || '(empty)').split('\n'), '']).flatMap(text => wrapAnsi(text, Math.max(10, width - 6), {hard: true, trim: false}).split('\n'));
  const rows = Math.max(1, height - 9);
  const maxOffset = Math.max(0, reviewLines.length - rows);
  const reviewOffset = Math.min(offset, maxOffset);
  function advance() {
    if (index < group.length - 1) setIndex(i => i + 1);
    else check();
  }
  function check() {
    const message = validateDraft(view, values);
    setValidation(message ?? '');
    if (!message) { setReview(true); setOffset(0); }
  }
  useInput((input, key) => {
    if (busy) return;
    if (key.escape) { if (review) {setReview(false); setOffset(0);} else onCancel(); return; }
    if (review) {
      if (key.return || (key.ctrl && input === 's')) onSave(values);
      if (input === 'j' || key.downArrow || key.pageDown) setOffset(v => Math.min(maxOffset, v + (key.pageDown ? rows : 1)));
      if (input === 'k' || key.upArrow || key.pageUp) setOffset(v => Math.max(0, v - (key.pageUp ? rows : 1)));
      return;
    }
    if (key.ctrl && input === 's') { check(); return; }
    if (key.tab) { setIndex(i => (i + (key.shift ? group.length - 1 : 1)) % group.length); return; }
    if (key.return) {
      if (!field.multiline) advance();
    }
  });
  return <Box flexDirection="column" height={height} paddingX={2} paddingY={1}>
    <Text bold color={color.text}>{review ? `Review · ${action}` : `${view === 'mail' ? 'Compose' : 'New'} ${view === 'mail' ? 'message' : view === 'calendar' ? 'event' : 'task'}`}</Text>
    <Box marginTop={1} flexDirection="column" flexGrow={1} overflow="hidden">
      {review ? <ScrollArea total={reviewLines.length} visible={rows} offset={reviewOffset} height={rows} active>
        <Text color={color.text}>{reviewLines.slice(reviewOffset, reviewOffset + rows).join('\n')}</Text>
      </ScrollArea> : <>
        <Text color={color.muted}>{group.map((f, i) => `${i === index ? '>' : ' '} ${f.label}`).join('   ')}</Text>
        <Box marginTop={1}><Text color={color.accent} bold>{field.label} </Text><Text color={color.muted}>{field.hint}</Text></Box>
        <Box marginTop={1} width={Math.max(10, width - 6)} height={Math.max(2, height - 13)} overflow="hidden">
          <Input key={field.key} value={values[field.key] ?? ''} multiline={field.multiline} width={Math.max(10, width - 6)} rows={Math.max(2, height - 13)} onChange={v => setValues(old => ({...old, [field.key]: clean(v)}))} />
        </Box>
      </>}
    </Box>
    <Text color={color.error} wrap="truncate">{validation || error || ' '}</Text>
    <Text color={color.muted}>{busy ? 'Saving…' : review ? `Enter ${action.toLowerCase()}  ·  Esc edit  ·  j/k scroll` : 'Tab next field  ·  Ctrl+S review  ·  Esc discard'}</Text>
  </Box>;
}
