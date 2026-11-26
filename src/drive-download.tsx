import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {join} from 'node:path';
import wrapAnsi from 'wrap-ansi';
import {Input} from './input.js';
import {ScrollArea} from './scroll-area.js';
import {attachmentPath, safeAttachmentName} from './attachment-files.js';
import {clean, driveDownload, type DriveFile, type Workspace} from './model.js';
import {color} from './theme.js';

export function DriveDownload({api, file, width, height, onClose, onSaved}: {
  api: Workspace; file: DriveFile; width: number; height: number;
  onClose: () => void; onSaved: (path: string) => void;
}) {
  const format = driveDownload(file)!;
  const [path, setPath] = useState(join(process.cwd(), safeAttachmentName(format.name)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; controller.current?.abort();};}, []);
  const rows = Math.max(1, height - 7);
  const lines = wrapAnsi(error || (format.mimeType ? `Export as ${format.name.endsWith('.xlsx') ? 'Excel (.xlsx)' : 'PDF'}. Existing files will be kept.` : 'Existing files will be kept. Enter a new filename to save a copy.'), width - 8, {hard: true}).split('\n');
  useInput((input, key) => {
    if (key.escape) {controller.current?.abort(); onClose(); return;}
    if (busy || controller.current) return;
    if (key.pageDown || key.pageUp) {setOffset(value => Math.max(0, Math.min(lines.length - rows, value + (key.pageDown ? rows : -rows)))); return;}
    if (key.return) {
      let destination: string;
      try {destination = attachmentPath(path);} catch (cause) {setError(clean((cause as Error).message)); return;}
      const operation = new AbortController(); controller.current = operation;
      setBusy(true); setError(''); setOffset(0);
      void api.downloadFile(file, destination, operation.signal).then(() => {
        if (mounted.current && !operation.signal.aborted) onSaved(destination);
      }).catch(cause => {
        if (mounted.current && !operation.signal.aborted) setError((cause as NodeJS.ErrnoException).code === 'EEXIST' ? 'A file already exists at this path. Choose another filename.' : clean((cause as Error).message));
      }).finally(() => {controller.current = undefined; if (mounted.current) setBusy(false);});
    }
  });
  return <Box height={height} borderStyle="single" borderColor={color.accent} flexDirection="column" paddingX={2} overflow="hidden">
    <Text bold color={color.text} wrap="truncate">Download · {file.title}</Text>
    <Box marginTop={1}><Text color={color.accent}>Save to </Text><Input value={path} width={width - 14} onChange={value => {if (!busy) setPath(clean(value).replace(/[\r\n]/g, ''));}}/></Box>
    <Box marginTop={1} flexGrow={1}>
      <ScrollArea total={lines.length} visible={rows} offset={Math.min(offset, Math.max(0, lines.length - rows))} height={rows} active>
        <Text color={error ? color.error : color.muted}>{lines.slice(offset, offset + rows).join('\n')}</Text>
      </ScrollArea>
    </Box>
    <Text color={color.muted}>{busy ? 'Downloading… · Esc cancel' : 'Enter save · Esc cancel · PgUp/PgDn scroll'}</Text>
  </Box>;
}
