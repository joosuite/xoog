/*
Show message attachments inside the existing terminal workspace. Inherit its
theme, borders, scrolling and minimum size. Enter previews text; opening a PDF
or image requires O. D chooses a destination, with exclusive file creation.
Preview files stay in private temporary directories until this screen closes.
FINISH: Verify keyboard actions, file handling, both themes and the minimum size;
finish with an independent review and an updated design record.
*/
import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import wrapAnsi from 'wrap-ansi';
import {clean, type Attachment, type Mail, type Workspace} from './model.js';
import {attachmentPath, attachmentPreview, attachmentSize, openAttachmentPreview, readAttachmentPreview, safeAttachmentName} from './attachment-files.js';
import {Input} from './input.js';
import {ScrollArea} from './scroll-area.js';
import {color} from './theme.js';

type Mode = 'list' | 'preview' | 'save';
export function AttachmentScreen({api, message, width, height, onClose, openFile = openAttachmentPreview}: {
  api: Workspace; message: Mail; width: number; height: number; onClose: () => void;
  openFile?: typeof openAttachmentPreview;
}) {
  const {exit} = useApp();
  const [files, setFiles] = useState<Attachment[]>(message.attachments ?? []);
  const [loading, setLoading] = useState(message.attachments === undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [path, setPath] = useState('');
  const [text, setText] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const mounted = useRef(true);
  const operation = useRef<AbortController | undefined>(undefined);
  const directories = useRef(new Set<string>());
  const cache = useRef(new Map<string, string>());
  const selected = files[cursor];
  const contentRows = Math.max(1, height - 5);
  const pageSize = Math.max(1, Math.floor(contentRows / 2));
  const listOffset = Math.max(0, Math.min(cursor - pageSize + 1, files.length - pageSize));
  const lines = wrapAnsi(error || text, Math.max(10, width - 8), {hard: true, trim: false}).split('\n');
  const maxOffset = Math.max(0, lines.length - contentRows);
  const scroll = Math.min(offset, maxOffset);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    if (message.attachments === undefined) {
      setLoading(true); setLoadFailed(false);
      void api.message(message.id, controller.signal).then(value => {
        if (!controller.signal.aborted) {setFiles(value.attachments ?? []); setLoading(false);}
      }).catch(cause => {if (!controller.signal.aborted) {setError(clean(cause.message)); setLoading(false); setLoadFailed(true);}});
    }
    return () => {
      mounted.current = false; controller.abort(); operation.current?.abort();
      for (const directory of directories.current) void rm(directory, {recursive: true, force: true}).catch(() => {});
    };
  }, [api, message.id, revision]);

  async function perform(label: string, task: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(label); setError(''); setNotice(''); setOffset(0);
    try {await task(controller.signal);}
    catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted) setNotice('Cancelled.');
        else {
          const code = (cause as NodeJS.ErrnoException).code;
          setError(code === 'EEXIST' ? 'A file already exists at that path. Choose another name.' :
            code === 'ENOENT' ? 'The destination folder does not exist.' : clean(cause instanceof Error ? cause.message : cause));
        }
      }
    } finally {if (operation.current === controller) operation.current = undefined; if (mounted.current) setBusy('');}
  }
  async function previewFile(attachment: Attachment, signal: AbortSignal): Promise<string> {
    const key = `${attachment.partId}:${attachment.attachmentId ?? ''}`;
    const cached = cache.current.get(key);
    if (cached) {signal.throwIfAborted(); return cached;}
    const directory = await mkdtemp(join(tmpdir(), 'xoog-preview-'));
    directories.current.add(directory);
    const file = join(directory, `attachment${attachmentPreview(attachment)?.extension ?? '.bin'}`);
    try {
      signal.throwIfAborted();
      await api.downloadAttachment(message.id, attachment, file, signal);
      signal.throwIfAborted(); cache.current.set(key, file); return file;
    } catch (cause) {
      directories.current.delete(directory); await rm(directory, {recursive: true, force: true}); throw cause;
    }
  }
  function preview() {
    if (!selected) return;
    const kind = attachmentPreview(selected);
    setMode('preview'); setOffset(0); setText(''); setNotice('');
    if (kind?.kind !== 'text') {
      setText(kind?.kind === 'external' ? 'Press o to open this file in the system viewer.\n\nPress d to download a copy.' :
        'This file type has no built-in preview.\n\nPress d to download it.'); return;
    }
    void perform('Loading text preview…', async signal => {
      const value = await readAttachmentPreview(await previewFile(selected, signal), signal);
      if (mounted.current && !signal.aborted) setText(value);
    });
  }
  function save() {
    if (!selected) return;
    setMode('save'); setPath(resolve(safeAttachmentName(selected.name))); setError(''); setNotice(''); setOffset(0);
  }
  useInput((input, key) => {
    if (busy) {if (key.escape) operation.current?.abort(); return;}
    if (error) {
      if (input === 'g' && loadFailed) {setError(''); setRevision(value => value + 1); return;}
      if (key.escape || key.return) {setError(''); setOffset(0); return;}
      if (input === 'q') {exit(); return;}
      if (input === 'j' || key.downArrow || key.pageDown) setOffset(value => Math.min(maxOffset, value + (key.pageDown ? contentRows : 1)));
      if (input === 'k' || key.upArrow || key.pageUp) setOffset(value => Math.max(0, value - (key.pageUp ? contentRows : 1)));
      return;
    }
    if (key.escape) {if (mode === 'list') onClose(); else {setMode('list'); setOffset(0); setNotice('');} return;}
    if (mode === 'save') {
      if (key.return && selected) void perform('Downloading attachment…', async signal => {
        const destination = attachmentPath(path);
        await api.downloadAttachment(message.id, selected, destination, signal);
        if (mounted.current && !signal.aborted) {setMode('list'); setNotice(`Saved ${destination}`);}
      });
      return;
    }
    if (input === 'q') {exit(); return;}
    if (input === 'g' && loadFailed) {setRevision(value => value + 1); return;}
    if (loading) return;
    const direction = input === 'j' || key.downArrow || key.pageDown ? 1 : input === 'k' || key.upArrow || key.pageUp ? -1 : 0;
    if (direction) {
      if (mode === 'list') setCursor(value => Math.max(0, Math.min(files.length - 1, value + direction * (key.pageDown || key.pageUp ? pageSize : 1))));
      else setOffset(value => Math.max(0, Math.min(maxOffset, value + direction * (key.pageDown || key.pageUp ? contentRows : 1))));
      return;
    }
    if (input === 'd') {save(); return;}
    if (input === 'o' && selected) {
      if (attachmentPreview(selected)?.kind !== 'external') {setNotice('Use Enter for text preview, or d to download this file.'); return;}
      void perform('Opening system viewer…', async signal => {
        await openFile(await previewFile(selected, signal), selected, signal);
        if (mounted.current && !signal.aborted) setNotice('Opened in the system viewer.');
      }); return;
    }
    if (key.return || input === 'p') preview();
  });

  const subtitle = mode === 'list' ? message.subject : selected ? `${selected.mimeType} · ${attachmentSize(selected.size)}` : message.subject;
  return <Box width={width} height={height + 2} flexDirection="column">
    <Box height={height} borderStyle="single" borderColor={color.accent} paddingX={1} flexDirection="column" overflow="hidden">
      <Text bold color={color.text} wrap="truncate">{mode === 'list' ? `Attachments · ${files.length}` : mode === 'save' ? 'Download attachment' : selected?.name}</Text>
      <Text color={color.muted} wrap="truncate">{subtitle}</Text>
      <Box marginTop={1} flexDirection="column" height={contentRows} overflow="hidden">
        {busy ? <Text color={color.accent}>{busy}</Text> : error ? <ScrollArea total={lines.length} visible={contentRows} offset={scroll} height={contentRows} active><Text color={color.error}>{lines.slice(scroll, scroll + contentRows).join('\n')}</Text></ScrollArea> : mode === 'save' ? <>
          <Text color={color.accent}>Save file to</Text>
          <Input value={path} onChange={setPath} width={Math.max(10, width - 6)}/>
          <Text color={color.muted}>Enter saves · Ctrl+U clears the path</Text>
        </> : mode === 'preview' ? <ScrollArea total={lines.length} visible={contentRows} offset={scroll} height={contentRows} active><Text color={color.text}>{lines.slice(scroll, scroll + contentRows).join('\n')}</Text></ScrollArea> : loading ? <Text color={color.muted}>Loading attachments…</Text> : loadFailed ? <Text color={color.muted}>Could not load attachments. Press g to retry.</Text> : !files.length ? <Text color={color.muted}>No attachments in this message.</Text> :
          <ScrollArea total={files.length} visible={pageSize} offset={listOffset} height={contentRows} active>
            {files.slice(listOffset, listOffset + pageSize).map((file, index) => {
              const active = index + listOffset === cursor;
              return <Box key={`${file.partId}:${index + listOffset}`} height={2} flexShrink={0} flexDirection="column" backgroundColor={active ? color.selection : undefined}>
                <Text color={active ? color.selectedText : color.text} bold={active} wrap="truncate">{active ? '> ' : '  '}{file.name}</Text>
                <Text color={active ? color.selectedText : color.muted} wrap="truncate">{'  '}{file.mimeType} · {attachmentSize(file.size)}</Text>
              </Box>;
            })}
          </ScrollArea>}
      </Box>
    </Box>
    <Box height={1} paddingX={1}><Text color={color.success} wrap="truncate">{notice || ' '}</Text></Box>
    <Box height={1} paddingX={1}><Text color={color.muted} wrap="truncate">{busy ? 'Esc cancel' : error ? loadFailed ? 'g retry · Enter / Esc back · j/k scroll' : 'Enter / Esc back · j/k scroll · q quit' : mode === 'save' ? 'Enter save · Esc cancel · Ctrl+C quit' : mode === 'preview' ? 'j/k scroll · o open · d download · Esc back' : 'j/k move · Enter preview · o open · d save · Esc'}</Text></Box>
  </Box>;
}
