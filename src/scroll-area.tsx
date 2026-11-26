import React, {type ReactNode} from 'react';
import {Box, Text} from 'ink';
import {color} from './theme.js';

export function scrollThumb(total: number, visible: number, offset: number, height: number) {
  const rows = Math.max(0, Math.floor(height));
  if (rows === 0 || visible <= 0 || total <= visible) return undefined;
  const size = Math.max(1, Math.min(rows, Math.round(rows * visible / total)));
  const position = Math.max(0, Math.min(offset, total - visible));
  return {size, top: Math.round((rows - size) * position / (total - visible))};
}

// Reserve the gutter even when content fits, so wrapping does not shift as it loads.
export function ScrollArea({total, visible, offset, height, active = false, children}: {
  total: number; visible: number; offset: number; height: number; active?: boolean; children: ReactNode;
}) {
  const thumb = scrollThumb(total, visible, offset, height);
  return <Box width="100%" height={height} flexShrink={0} overflow="hidden">
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">{children}</Box>
    <Box width={1} marginLeft={1} height={height} flexShrink={0}>
      {thumb && <Text aria-hidden>{Array.from({length: height}, (_, row) => {
        const filled = row >= thumb.top && row < thumb.top + thumb.size;
        return <Text key={row} color={filled ? active ? color.accent : color.muted : color.border}>{filled ? '█' : '░'}{row < height - 1 ? '\n' : ''}</Text>;
      })}</Text>}
    </Box>
  </Box>;
}
