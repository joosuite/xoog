import {test} from 'node:test';
import assert from 'node:assert/strict';
import {color, setTheme} from '../src/theme.js';

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
test('both explicit themes retain readable text, status and selection contrast', () => {
  try {
    for (const theme of ['dark', 'light'] as const) {
      setTheme(theme);
      for (const name of ['text', 'muted', 'accent', 'success', 'warning', 'error'] as const) {
        assert.ok(contrast(color[name], color.background) >= 4.5, `${theme} ${name} contrast`);
      }
      assert.ok(contrast(color.selectedText, color.selection) >= 4.5, `${theme} selection contrast`);
    }
  } finally {setTheme('dark');}
});
