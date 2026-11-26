/*
Choose a specific calendar date using a native character grid. Inherit Xoog's
theme and borders. Arrows browse days, Page Up/Down browse months, Enter commits,
and Escape cancels without changing the agenda. Typing YYYY-MM-DD jumps directly.
The complete picker and its controls must fit the 52-column, 18-row minimum.
*/
import React, {useRef, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {dayKey, shiftDay} from './model.js';
import {color} from './theme.js';

export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (year >= 1 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
}

export function shiftMonth(day: Date, amount: number): Date {
  const next = new Date(day);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day.getDate(), last));
  return next;
}

export function DatePicker({day, width, height, onSelect, onCancel}: {
  day: Date; width: number; height: number;
  onSelect: (day: Date) => void; onCancel: () => void;
}) {
  const {exit} = useApp();
  const [cursor, setCursor] = useState(() => new Date(day));
  const [typed, setTyped] = useState('');
  const typedValue = useRef('');
  const [error, setError] = useState('');
  function type(value: string) {typedValue.current = value; setTyped(value); setError('');}
  function move(next: Date) {setCursor(next); type('');}
  useInput((input, key) => {
    if (key.escape) {onCancel(); return;}
    if (input === 'q') {exit(); return;}
    if (key.return) {
      const selected = typedValue.current ? parseCalendarDate(typedValue.current) : cursor;
      if (!selected) {setError('Enter a valid date as YYYY-MM-DD.'); return;}
      onSelect(selected); return;
    }
    if (key.leftArrow) {move(shiftDay(cursor, -1)); return;}
    if (key.rightArrow) {move(shiftDay(cursor, 1)); return;}
    if (key.upArrow) {move(shiftDay(cursor, -7)); return;}
    if (key.downArrow) {move(shiftDay(cursor, 7)); return;}
    if (key.pageUp) {move(shiftMonth(cursor, -1)); return;}
    if (key.pageDown) {move(shiftMonth(cursor, 1)); return;}
    if (input === 't') {move(new Date()); return;}
    if (key.ctrl || key.meta) return;
    if (key.backspace || key.delete) {type(typedValue.current.slice(0, -1)); return;}
    if (/^[\d-]+$/.test(input)) {
      const value = (typedValue.current + input).slice(0, 10);
      type(value);
      const selected = parseCalendarDate(value);
      if (selected) setCursor(selected);
    }
  });

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => i >= offset && i < offset + days ? i - offset + 1 : 0);
  const today = dayKey(new Date());
  return <Box width={width} height={height + 2} flexDirection="column">
    <Box height={height} borderStyle="single" borderColor={color.accent} paddingX={2} flexDirection="column">
      <Text bold color={color.text}>Choose date · {cursor.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</Text>
      <Box flexDirection="row">
        <Box width={22} flexShrink={0} flexDirection="column">
          <Text color={color.muted}>Mo Tu We Th Fr Sa Su</Text>
          {Array.from({length: cells.length / 7}, (_, week) => <Text key={week}>
            {cells.slice(week * 7, week * 7 + 7).map((n, i) => {
              const selected = n === cursor.getDate();
              const current = n > 0 && dayKey(new Date(cursor.getFullYear(), cursor.getMonth(), n)) === today;
              return <Text key={i}><Text bold={selected || current} color={selected ? color.selectedText : current ? color.accent : color.text}
                backgroundColor={selected ? color.selection : undefined}>{n ? String(n).padStart(2) : '  '}</Text>{i < 6 ? ' ' : ''}</Text>;
            })}
          </Text>)}
        </Box>
        {width >= 78 && <Box marginLeft={4} flexDirection="column">
          <Text bold color={color.text}>{cursor.toLocaleDateString(undefined, {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</Text>
          <Text color={color.muted}>←/→ one day · ↑/↓ one week</Text>
          <Text color={color.muted}>Page Up/Down previous/next month</Text>
          <Text color={color.muted}>Or type a date as YYYY-MM-DD</Text>
          <Text color={color.muted}>Enter selects · Esc cancels · t today</Text>
        </Box>}
      </Box>
    </Box>
    <Box height={1} paddingX={1}><Text color={error ? color.error : color.accent} wrap="truncate">{error || `Date: ${typed || dayKey(cursor)} · t today · Type YYYY-MM-DD`}</Text></Box>
    <Box height={1} paddingX={1}><Text color={color.muted} wrap="truncate">{width < 78 ? 'Arrows move · PgUp/Dn month · Enter select · Esc' : '←/→ day · ↑/↓ week · PgUp/PgDn month · Enter select · Esc cancel'}</Text></Box>
  </Box>;
}
