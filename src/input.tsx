import React, {useEffect, useState} from 'react';
import {Text, useInput} from 'ink';
import wrapAnsi from 'wrap-ansi';
import {clean} from './model.js';
import {color} from './theme.js';

export function Input({value, onChange, multiline = false, width = 70, rows = 1, masked = false}: {value: string; onChange: (value: string) => void; multiline?: boolean; width?: number; rows?: number; masked?: boolean}) {
  const [cursor, setCursor] = useState(value.length);
  useEffect(() => {setCursor(v => Math.min(v, value.length));}, [value]);
  useInput((input, key) => {
    if (key.tab || key.escape || key.upArrow || key.downArrow || key.pageDown || key.pageUp) return;
    const position = Math.min(cursor, value.length);
    if (key.ctrl) {
      if (input === 'a') setCursor(0);
      if (input === 'e') setCursor(value.length);
      if (input === 'u') {onChange(value.slice(position)); setCursor(0);}
      return;
    }
    if (key.home) {setCursor(0); return;}
    if (key.end) {setCursor(value.length); return;}
    if (key.leftArrow) {setCursor(Math.max(0, position - [...value.slice(0, position)].slice(-1).join('').length)); return;}
    if (key.rightArrow) {setCursor(position + [...value.slice(position)].slice(0, 1).join('').length); return;}
    if (key.backspace || key.delete) {
      const length = [...value.slice(0, position)].slice(-1).join('').length;
      onChange(value.slice(0, position - length) + value.slice(position)); setCursor(position - length); return;
    }
    if (key.return && !multiline) return;
    const text = key.return ? '\n' : clean(input).replace(multiline ? /\r/g : /[\r\n]/g, '');
    onChange(value.slice(0, position) + text + value.slice(position)); setCursor(position + text.length);
  });
  const position = Math.min(cursor, value.length);
  const display = masked ? '*'.repeat(value.length) : value;
  const before = wrapAnsi(display.slice(0, position), Math.max(1, width), {hard: true, trim: false});
  const preceding = before.split('\n').slice(-Math.max(1, rows));
  const character = [...display.slice(position)][0] ?? ' ';
  const after = display.slice(position + (character === ' ' && position === value.length ? 0 : character.length));
  return <Text color={color.text}>{preceding.join('\n')}<Text inverse>{character === '\n' ? ' ' : character}</Text>{character === '\n' ? '\n' : ''}{after}</Text>;
}
