/*
THESIS: One keyboard workspace for mail, calendar, tasks, People, and Drive through Joog and Joom binaries.
OWN-WORLD: Character borders, navy or light ground, native font, cobalt selection.
STORY: Choose a service and collection, scan rows, read the selected item, act.
FIRST VIEWPORT: Header and service tabs above folders, list, and preview; shortcuts below.
FORM: Split workspace, user selected option 1, surface seed ac819dc6.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/
import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {Input} from './input.js';
import wrapAnsi from 'wrap-ansi';
import {clean, line, dayKey, dateLabel, timeLabel, shiftDay, views, viewTitle, isFolder, driveDownload, driveFileType, type ReadOptions, type Person, type DriveFile, type DraftView, type Choice, type View, type Workspace, type Item, type Mail, type Event, type Task, type MailDraft, type EventDraft, type TaskDraft} from './model.js';
import {DraftForm, initialValues} from './form.js';
import {color} from './theme.js';
import {backendInfo} from './backend.js';
import {ScrollArea} from './scroll-area.js';
import {DatePicker} from './date-picker.js';
import {AttachmentScreen} from './attachment-screen.js';
import {attachmentSize} from './attachment-files.js';
import {DriveDownload} from './drive-download.js';

const folders: Choice[] = [{id: 'inbox', title: 'Inbox'}, {id: 'unread', title: 'Unread'}, {id: 'starred', title: 'Starred'}, {id: 'sent', title: 'Sent'}, {id: 'all', title: 'All mail'}];
type Pane = 'nav' | 'list' | 'detail';
const peopleCollections: Choice[] = [{id: 'contacts', title: 'Contacts'}, {id: 'starred', title: 'Starred'}, {id: 'other', title: 'Other contacts'}];
const driveCollections: Choice[] = [{id: 'root', title: 'My Drive'}, {id: 'recent', title: 'Recent'}, {id: 'starred', title: 'Starred'}, {id: 'shared', title: 'Shared with me'}];
type Draft = {view: DraftView; initial: Record<string, string>; reply?: Mail};
type DataState = {view: View; items: Item[]; loading: boolean; error: string};

export function useSize(fixed?: {columns: number; rows: number}) {
  const {stdout} = useStdout();
  const [size, setSize] = useState({columns: stdout.columns || 100, rows: stdout.rows || 30});
  useEffect(() => {
    const resize = () => setSize({columns: stdout.columns || 100, rows: stdout.rows || 30});
    stdout.on('resize', resize); return () => {stdout.off('resize', resize);};
  }, [stdout]);
  return fixed ?? size;
}
function itemTitle(view: View, item: Item): string { return view === 'mail' ? (item as Mail).subject : (item as Exclude<Item, Mail>).title; }
function details(view: View, item: Item, message: Mail | undefined): string[] {
  if (view === 'mail') {
    const mail = message ?? item as Mail;
    return [`From: ${mail.from}`, `To: ${mail.to}`, `Date: ${dateLabel(mail.date)} ${timeLabel(mail.date)}`,
      ...(mail.attachments?.length ? [`Attachments: ${mail.attachments.length} · v view`] : []), '', mail.body ?? mail.snippet];
  }
  if (view === 'calendar') {
    const event = item as Event;
    return [event.allDay ? `All day · ${dateLabel(event.start, true)}` : `${dateLabel(event.start)} · ${timeLabel(event.start)} - ${timeLabel(event.end)}`, ...(event.location ? [`Location: ${event.location}`] : []), ...(event.attendees.length ? [`With: ${event.attendees.join(', ')}`] : []), '', event.description || 'No event notes.'];
  }
  if (view === 'people') {
    const person = item as Person;
    return [...person.emails.map(value => `Email: ${value}`), ...person.phones.map(value => `Phone: ${value}`),
      ...person.organizations.map(value => `Work: ${value}`), ...person.addresses.map(value => `Address: ${value}`),
      ...person.birthdays.map(value => `Birthday: ${value}`), ...person.urls.map(value => `Website: ${value}`),
      '', person.notes || 'No contact notes.'];
  }
  if (view === 'drive') {
    const file = item as DriveFile, format = driveDownload(file);
    return [isFolder(file) ? 'Folder' : `Type: ${file.mimeType}`, ...(file.shortcut ? ['Shortcut'] : []),
      ...(file.size !== undefined ? [`Size: ${attachmentSize(file.size)}`] : []),
      ...(file.modified ? [`Modified: ${dateLabel(file.modified)} ${timeLabel(file.modified)}`] : []),
      ...(file.owners.length ? [`Owner: ${file.owners.join(', ')}`] : []),
      ...(file.shared ? ['Shared'] : []), ...(file.starred ? ['Starred'] : []),
      ...(format?.mimeType ? [`Download as ${format.name.endsWith('.xlsx') ? 'Excel (.xlsx)' : 'PDF'}`] : []),
      ...(!isFolder(file) && !format ? ['Download unavailable for this item.'] : []), '', file.description || 'No description.'];
  }
  const task = item as Task;
  return [`Status: ${task.completed ? 'Completed' : 'To do'}`, ...(task.due ? [`Due: ${dateLabel(task.due, true)}`] : ['No due date']), '', task.notes || 'No task notes.'];
}

function CollectionNav({view, choices, active, cursor, focused, day, height}: {view: View; choices: Choice[]; active: string; cursor: number; focused: boolean; day: Date; height: number}) {
  const showMonth = view === 'calendar' && height >= 22;
  const first = new Date(day.getFullYear(), day.getMonth(), 1);
  const days = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  const monthRows = Math.ceil(((first.getDay() + 6) % 7 + days) / 7);
  const visible = Math.max(1, height - 6 - (showMonth ? monthRows + 7 : 0));
  const offset = Math.max(0, cursor - visible + 1);
  const listRows = Math.max(1, Math.min(visible, choices.length));
  return <Box width={24} flexShrink={0} flexDirection="column" borderStyle="single" borderColor={focused ? color.accent : color.border} paddingX={1} overflow="hidden">
    <Text bold color={color.muted}>{view === 'mail' ? 'Mailboxes' : view === 'calendar' ? 'Calendars' : view === 'tasks' ? 'Task lists' : viewTitle[view]}</Text>
    <Box marginTop={1} flexDirection="column" flexShrink={0}>
      <ScrollArea total={choices.length} visible={visible} offset={offset} height={listRows} active={focused}>
      {choices.slice(offset, offset + visible).map((choice, i) => <Text key={choice.id} color={focused && cursor === i + offset ? color.selectedText : choice.id === active ? color.text : color.muted} bold={choice.id === active} backgroundColor={focused && cursor === i + offset ? color.selection : undefined} wrap="truncate">{choice.id === active ? '> ' : '  '}{choice.title}</Text>)}
      {!choices.length && <Text color={color.muted}>None available</Text>}
      </ScrollArea>
    </Box>
    {showMonth && <Box marginTop={2} flexDirection="column" flexShrink={0}><Text bold color={color.text}>{day.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</Text><Text color={color.muted}>{'Mo Tu We Th Fr Sa Su'}</Text><Month day={day}/><Box marginTop={1}><Text color={color.muted}>{'d choose date\nt today'}</Text></Box></Box>}
    <Box flexGrow={1}/>
    <Text color={color.muted}>{view === 'mail' ? 'n compose' : view === 'calendar' ? 'n new event' : view === 'tasks' ? 'n new task' : view === 'people' ? '/ find a contact' : 'Backspace up folder'}</Text>
    <Text color={color.muted}>Tab switch pane</Text>
  </Box>;
}
function Month({day}: {day: Date}) {
  const first = new Date(day.getFullYear(), day.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  const cells = Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => i >= offset && i < days + offset ? i - offset + 1 : 0);
  return <Box flexDirection="column">{Array.from({length: cells.length / 7}, (_, week) => <Text key={week}>{cells.slice(week * 7, week * 7 + 7).map((n, i) => <Text key={i} color={n === day.getDate() ? color.selectedText : color.muted} backgroundColor={n === day.getDate() ? color.selection : undefined}>{n ? String(n).padStart(2) : '  '}{i < 6 ? ' ' : ''}</Text>)}</Text>)}</Box>;
}
function ItemRow({view, item, selected, width}: {view: View; item: Item; selected: boolean; width: number}) {
  const foreground = selected ? color.selectedText : color.muted;
  if (view === 'mail') {
    const mail = item as Mail;
    const sender = mail.from.replace(/\s*<.*>/, '') || mail.from;
    const senderWidth = Math.min(19, Math.max(12, Math.floor(width * 0.3)));
    return <Box backgroundColor={selected ? color.selection : undefined} width="100%" height={1}>
      <Text color={selected ? color.selectedText : mail.unread ? color.accent : color.muted}>{mail.unread ? '* ' : '  '}</Text>
      <Box width={senderWidth} flexShrink={0}><Text bold={mail.unread} color={foreground} wrap="truncate">{sender}</Text></Box>
      <Box flexGrow={1}><Text color={foreground} bold={mail.unread} wrap="truncate">{mail.starred ? '* ' : ''}{mail.subject}</Text></Box>
    </Box>;
  }
  if (view === 'calendar') {
    const event = item as Event;
    return <Box backgroundColor={selected ? color.selection : undefined} height={2} flexDirection="column">
      <Text color={foreground} bold wrap="truncate">{event.allDay ? 'All day' : timeLabel(event.start)}  {event.title}</Text>
      <Text color={foreground} wrap="truncate">{'  '}{dateLabel(event.start, event.allDay)}{event.location ? ` · ${event.location}` : ''}</Text>
    </Box>;
  }
  if (view === 'people' || view === 'drive') {
    const person = item as Person, file = item as DriveFile;
    const secondary = view === 'people' ? person.emails[0] || person.phones[0] || person.organizations[0] || 'No email or phone'
      : `${isFolder(file) ? 'Folder' : file.shortcut ? 'Shortcut' : file.size === undefined ? driveFileType(file) : attachmentSize(file.size)}${file.modified ? ` · ${dateLabel(file.modified)}` : ''}`;
    return <Box backgroundColor={selected ? color.selection : undefined} height={2} flexDirection="column">
      <Text color={selected ? color.selectedText : color.text} bold wrap="truncate">{view === 'drive' && isFolder(file) ? '+ ' : ''}{person.title}</Text>
      <Text color={foreground} wrap="truncate">{'  '}{secondary}</Text>
    </Box>;
  }
  const task = item as Task;
  return <Box backgroundColor={selected ? color.selection : undefined} height={2} flexDirection="column">
    <Text color={selected ? color.selectedText : task.completed ? color.success : color.text} wrap="truncate">{task.completed ? '[x]' : '[ ]'} {task.title}</Text>
    <Text color={foreground} wrap="truncate">{'    '}{task.completed ? 'Completed' : task.due ? `Due ${dateLabel(task.due, true)}` : 'No due date'}</Text>
  </Box>;
}

export function App({api, account, initialCalendar = 'primary', initialTasklist = '@default', size, onAccounts}: {api: Workspace; account: string; initialCalendar?: string; initialTasklist?: string; size?: {columns: number; rows: number}; onAccounts?: () => void}) {
  const {exit} = useApp();
  const {columns, rows} = useSize(size);
  const [view, setView] = useState<View>('mail');
  const [folder, setFolder] = useState('inbox');
  const [calendar, setCalendar] = useState(initialCalendar);
  const [peopleCollection, setPeopleCollection] = useState('contacts');
  const [driveCollection, setDriveCollection] = useState('root');
  const [drivePath, setDrivePath] = useState<Choice[]>([]);
  const [downloading, setDownloading] = useState<DriveFile>();
  const [tasklist, setTasklist] = useState(initialTasklist);
  const [calendars, setCalendars] = useState<Choice[]>([{id: initialCalendar, title: initialCalendar === 'primary' ? 'My calendar' : initialCalendar}]);
  const [tasklists, setTasklists] = useState<Choice[]>([{id: initialTasklist, title: initialTasklist === '@default' ? 'My tasks' : initialTasklist}]);
  const [collectionError, setCollectionError] = useState('');
  const [day, setDay] = useState(new Date());
  const [pickingDate, setPickingDate] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState<Mail>();
  const [queries, setQueries] = useState<Record<View, string>>({mail: '', calendar: '', tasks: '', people: '', drive: ''});
  const [search, setSearch] = useState<string | undefined>();
  const [data, setData] = useState<DataState>({view: 'mail', items: [], loading: true, error: ''});
  const [selected, setSelected] = useState(0);
  const [pane, setPane] = useState<Pane>('list');
  const [navCursor, setNavCursor] = useState(0);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState({id: 0, fresh: false});
  const readRevisions = useRef({collections: 0, list: 0, detail: 0});
  const lastContext = useRef('');
  const [detail, setDetail] = useState<{id: string; mail?: Mail; loading?: boolean; error?: string}>({id: ''});
  const [draft, setDraft] = useState<Draft | undefined>();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const microsoft = api.backend === 'joom';
  const accountFolders = microsoft ? folders.map(folder => folder.id === 'starred' ? {...folder, title: 'Flagged'} : folder) : folders;
  const accountPeople = microsoft ? peopleCollections.filter(choice => choice.id === 'contacts') : peopleCollections;
  const accountDrive = microsoft ? [{id: 'root', title: 'OneDrive'}] : driveCollections;
  const query = queries[view];
  const choices = view === 'mail' ? accountFolders : view === 'calendar' ? calendars : view === 'tasks' ? tasklists : view === 'people' ? accountPeople : accountDrive;
  const collection = view === 'mail' ? folder : view === 'calendar' ? calendar : view === 'tasks' ? tasklist : view === 'people' ? peopleCollection : driveCollection;
  const currentItems = data.view === view ? data.items : [];
  const localSearch = view === 'tasks' || view === 'people';
  const items = localSearch && query ? currentItems.filter(item => (view === 'tasks' ? `${(item as Task).title} ${(item as Task).notes}` : [(item as Person).title, ...(item as Person).emails, ...(item as Person).phones, ...(item as Person).addresses, ...(item as Person).organizations, ...(item as Person).birthdays, ...(item as Person).urls, (item as Person).notes].join(' ')).toLowerCase().includes(query.toLowerCase())) : currentItems;
  const item = items[Math.min(selected, Math.max(0, items.length - 1))];
  const bodyHeight = Math.max(10, rows - 8);
  const hasNav = columns >= 110;
  const hasPreview = columns >= 82;
  const showList = hasPreview || pane !== 'detail';
  const showDetail = hasPreview || pane === 'detail';
  const listWidth = hasPreview ? Math.floor((columns - (hasNav ? 24 : 0)) * 0.48) : columns;
  const detailWidth = hasPreview ? columns - listWidth - (hasNav ? 24 : 0) : columns;
  const itemHeight = view === 'mail' ? 1 : 2;
  const listRows = Math.max(1, bodyHeight - 6);
  const pageSize = Math.max(1, Math.floor(listRows / itemHeight));
  const listOffset = Math.max(0, selected - pageSize + 1);
  const actualListWidth = pane === 'nav' && !hasNav ? columns - 24 : listWidth;

  function readOptions(group: keyof typeof readRevisions.current): ReadOptions {
    const fresh = revision.fresh && readRevisions.current[group] !== revision.id;
    readRevisions.current[group] = revision.id;
    return {fresh};
  }

  useEffect(() => {
    const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const options = readOptions('collections');
    setCollectionError('');
    if (view !== 'calendar' && view !== 'tasks') return;
    const controller = new AbortController();
    setCollectionError('');
    const load = view === 'calendar' ? api.calendars(controller.signal, options) : api.tasklists(controller.signal, options);
    void load.then(value => {
      if (controller.signal.aborted) return;
      if (view === 'calendar') setCalendars(value); else setTasklists(value);
    }).catch(error => {if (!controller.signal.aborted) setCollectionError(clean(error.message));});
    return () => controller.abort();
  }, [api, view, revision]);
  useEffect(() => {
    const controller = new AbortController();
    const options = readOptions('list');
    const context = JSON.stringify([view, folder, calendar, tasklist, peopleCollection, driveCollection, drivePath, day, localSearch ? '' : query]);
    const changed = lastContext.current !== context;
    lastContext.current = context;
    setData(old => ({view, items: changed ? [] : old.items, loading: true, error: ''}));
    if (changed) {setSelected(0); setOffset(0); setDetail({id: ''});}
    const load = view === 'mail' ? api.mail(folder, query, controller.signal, options) : view === 'calendar' ? api.events(calendar, day, query, controller.signal, options) : view === 'tasks' ? api.tasks(tasklist, controller.signal, options) : view === 'people' ? api.people(peopleCollection, controller.signal, options) : api.files(driveCollection, drivePath.at(-1)?.id, query, controller.signal, options);
    void load.then(value => {if (!controller.signal.aborted) {setData({view, items: value, loading: false, error: ''}); setSelected(v => Math.max(0, Math.min(v, value.length - 1)));}}).catch(error => {if (!controller.signal.aborted) setData({view, items: [], loading: false, error: clean(error.message)});});
    return () => controller.abort();
  }, [api, view, folder, calendar, tasklist, peopleCollection, driveCollection, drivePath, day, localSearch ? '' : query, revision]);
  useEffect(() => {
    const options = readOptions('detail');
    setOffset(0);
    if (view !== 'mail' || !item || !showDetail) return;
    const controller = new AbortController(), id = item.id;
    setDetail({id, loading: true});
    void api.message(id, controller.signal, options).then(mail => {if (!controller.signal.aborted) setDetail({id, mail});}).catch(error => {if (!controller.signal.aborted) setDetail({id, error: clean(error.message)});});
    return () => controller.abort();
  }, [api, view, item?.id, showDetail, revision]);

  function switchView(next: View) {
    setView(next); setSelected(0); setNavCursor(0); setPane('list'); setActionError(''); setNotice('');
  }
  function chooseCollection(index: number) {
    const choice = choices[index]; if (!choice) return;
    if (view === 'mail') setFolder(choice.id); else if (view === 'calendar') setCalendar(choice.id); else if (view === 'tasks') setTasklist(choice.id); else if (view === 'people') setPeopleCollection(choice.id); else {setDriveCollection(choice.id); setDrivePath([]); setQueries(value => ({...value, drive: ''}));}
    setSelected(0); setPane('list');
  }
  async function act(operation: () => Promise<void>, message: string, closeDraft = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError('');
    try { await operation(); setNotice(message); if (closeDraft) setDraft(undefined); setRevision(v => ({id: v.id + 1, fresh: false})); }
    catch (error) { setActionError(clean(error instanceof Error ? error.message : error)); }
    finally {busyRef.current = false; setBusy(false);}
  }
  function compose(reply?: Mail) {
    if (view === 'people' || view === 'drive') return;
    setActionError('');
    setDraft({view, initial: reply ? {to: reply.replyTo.match(/<([^>]+)>/)?.[1] ?? reply.replyTo, subject: /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`, body: ''} : initialValues(view, day), reply});
  }
  function save(values: Record<string, string>) {
    if (!draft) return;
    if (draft.view === 'mail') void act(() => api.send(values as MailDraft, draft.reply), 'Message sent.', true);
    if (draft.view === 'calendar') void act(() => api.createEvent(calendar, values as EventDraft), 'Event created.', true);
    if (draft.view === 'tasks') void act(() => api.createTask(tasklist, values as TaskDraft), 'Task created.', true);
  }

  useInput((input, key) => {
    if (columns < 52 || rows < 18) {if (input === 'q') exit(); return;}
    if (search !== undefined) {
      if (key.escape) setSearch(undefined);
      if (key.return) {setQueries(v => ({...v, [view]: search})); setSelected(0); setSearch(undefined);}
      return;
    }
    if (help) {
      if (input === '?' || key.escape || input === 'q') {setHelp(false); setOffset(0);}
      if (input === 'j' || key.downArrow || key.pageDown) setOffset(v => Math.min(helpMaxOffset, v + (key.pageDown ? helpPageRows : 1)));
      if (input === 'k' || key.upArrow || key.pageUp) setOffset(v => Math.max(0, v - (key.pageUp ? helpPageRows : 1)));
      return;
    }
    if (input === 'q') {exit(); return;}
    if (busy) return;
    if (input === 'A' && onAccounts) {onAccounts(); return;}
    if (input === '?') {setHelp(true); setOffset(0); return;}
    if (/^[1-5]$/.test(input)) {switchView(views[Number(input) - 1]!); return;}
    if (input === '/') {setSearch(query); return;}
    if (input === 'f') {setActionError(''); setRevision(v => ({id: v.id + 1, fresh: true})); return;}
    if (input === 'g') {setActionError(''); setRevision(v => ({id: v.id + 1, fresh: false})); return;}
    if (input === 'n') {compose(); return;}
    if (input === 'v' && view === 'mail' && item) {setAttachmentMessage(detail.mail?.id === item.id ? detail.mail : item as Mail); return;}
    if (input === 'd' && view === 'calendar') {setPickingDate(true); return;}
    if (input === '[' && view === 'calendar') {setDay(v => shiftDay(v, -7)); return;}
    if (input === ']' && view === 'calendar') {setDay(v => shiftDay(v, 7)); return;}
    if (input === 't' && view === 'calendar') {setDay(new Date()); return;}
    if (view === 'drive' && (key.backspace || key.delete) && drivePath.length) {setDrivePath(path => path.slice(0, -1)); setQueries(value => ({...value, drive: ''})); setPane('list'); return;}
    if (key.escape) {
      if (pane !== 'list') setPane('list'); else if (query) setQueries(v => ({...v, [view]: ''}));
      setActionError(''); return;
    }
    if (key.tab) {
      const panes: Pane[] = hasPreview ? ['nav', 'list', 'detail'] : ['nav', 'list'];
      setPane(panes[(panes.indexOf(pane) + (key.shift ? panes.length - 1 : 1)) % panes.length]!);
      return;
    }
    if (input === 'h' || key.leftArrow) {setPane(pane === 'detail' ? 'list' : 'nav'); return;}
    if (input === 'l' || key.rightArrow) {setPane(pane === 'nav' ? 'list' : 'detail'); return;}
    const direction = input === 'j' || key.downArrow || key.pageDown ? 1 : input === 'k' || key.upArrow || key.pageUp ? -1 : 0;
    if (direction) {
      const amount = key.pageDown || key.pageUp ? pageSize : 1;
      if (pane === 'nav') setNavCursor(v => Math.max(0, Math.min(choices.length - 1, v + direction)));
      else if (pane === 'detail') setOffset(v => Math.max(0, Math.min(detailMaxOffset, v + direction * amount)));
      else setSelected(v => Math.max(0, Math.min(items.length - 1, v + direction * amount)));
      return;
    }
    if (key.return && pane === 'nav') {chooseCollection(navCursor); return;}
    if (!item || data.loading) return;
    if (view === 'drive' && input === 'd') {
      if (driveDownload(item as DriveFile)) setDownloading(item as DriveFile);
      else setActionError('This item cannot be downloaded.');
      return;
    }
    if (key.return) {
      if (view === 'drive' && isFolder(item as DriveFile)) {setDrivePath(path => [...path, {id: (item as DriveFile).shortcut?.id ?? item.id, title: (item as DriveFile).title}]); setQueries(value => ({...value, drive: ''})); setPane('list'); return;}
      setPane('detail');
      if (view === 'mail' && (item as Mail).unread) void act(() => api.mark(item.id, 'read'), 'Marked as read.');
      return;
    }
    if (view === 'mail') {
      const mail = item as Mail;
      if (input === 'u') void act(() => api.mark(mail.id, mail.unread ? 'read' : 'unread'), mail.unread ? 'Marked as read.' : 'Marked as unread.');
      if (input === 's') void act(() => api.mark(mail.id, mail.starred ? 'unstar' : 'star'), mail.starred ? microsoft ? 'Flag removed.' : 'Star removed.' : microsoft ? 'Message flagged.' : 'Message starred.');
      if (input === 'a') {if (microsoft) setActionError('Archiving is not available through Joom.'); else void act(() => api.mark(mail.id, 'archive'), 'Message archived.');}
      if (input === 'r') {
        if (detail.mail?.id === mail.id) compose(detail.mail);
        else void act(async () => compose(await api.message(mail.id)), 'Reply ready.');
      }
    }
    if (view === 'tasks' && input === ' ') void act(() => api.complete(tasklist, item as Task), (item as Task).completed ? 'Task reopened.' : 'Task completed.');
  }, {isActive: !draft && !pickingDate && !attachmentMessage && !downloading});

  if (columns < 52 || rows < 18) return <Box width={columns} backgroundColor={color.background} flexDirection="column"><Text color={color.warning}>Xoog needs at least 52 columns and 18 rows.</Text><Text color={color.text}>Resize the terminal. Press q to quit.</Text></Box>;
  const collectionTitle = view === 'drive' && drivePath.length ? [accountDrive.find(choice => choice.id === driveCollection)?.title, ...drivePath.map(folder => folder.title)].join(' / ') : choices.find(c => c.id === collection)?.title ?? collection;
  const shownMessage = item && detail.mail?.id === item.id ? detail.mail : undefined;
  const detailLines = item ? details(view, item, shownMessage).flatMap(text => wrapAnsi(text, Math.max(10, detailWidth - 8), {hard: true, trim: false}).split('\n')) : [];
  const detailRows = bodyHeight - 7;
  const detailMaxOffset = Math.max(0, detailLines.length - detailRows);
  const detailOffset = Math.min(offset, detailMaxOffset);
  const error = actionError || data.error || collectionError;
  const helpLines = [
    ...(onAccounts ? ['A           Accounts, login, logout, and authentication setup'] : []),
    '1 / 2 / 3   Mail / Calendar / Tasks', '4 / 5       People / Drive', 'Tab         Switch between navigation, list, and reader', 'h / l       Focus the previous / next pane', 'j / k       Move through rows or scroll the reader', 'Enter       Open an item; choose a mailbox, calendar, or task list', microsoft ? '/           Search with Joom Outlook filters' : '/           Search (Gmail query syntax in live mail)', 'Esc         Back; clear an active search', 'g           Reload using the configured cache TTL', 'f           Force refresh, bypassing the cache', 'n           Compose mail, create an event, or create a task', '', microsoft ? 'Mail: v attachments · u read/unread · s flag · r reply' : 'Mail: v attachments · u read/unread · s star · a archive · r reply', 'Calendar: d choose date · t today · [ / ] previous/next week', 'Tasks: Space complete / reopen', 'People: / searches names, email, phone, and contact details', 'Drive: Enter opens folders · Backspace goes up · d downloads', 'Drive search matches file contents inside the current collection.', '', 'Forms: Tab fields · Ctrl+S review · Enter save after review', 'Message body: Enter adds a new line', 'q or Ctrl+C quits; Esc closes this help', '', 'Loads up to 40 messages; 200 events, tasks, or Drive files.', 'People loads all contacts in the selected collection.', 'Calendar agenda covers seven days in your local timezone.', ...(microsoft ? ['Outlook: use All mail for full-text search with no read/flag filter.', 'Joom exposes Contacts and OneDrive folders, without Google-only collections.'] : []),
  ];
  const helpWrapped = helpLines.flatMap(text => wrapAnsi(text, Math.max(10, columns - 8), {hard: true, trim: false}).split('\n'));
  const helpPageRows = Math.max(1, bodyHeight - 4);
  const helpMaxOffset = Math.max(0, helpWrapped.length - helpPageRows);
  const helpOffset = Math.min(offset, helpMaxOffset);
  return <Box width={columns} height={rows - 1} flexDirection="column" backgroundColor={color.background}>
    <Box paddingX={1} height={2} alignItems="center">
      <Text color={color.accent} bold>xoog</Text><Text color={color.muted}> / {api.backend ? `${backendInfo[api.backend].provider} ` : ''}{viewTitle[view]}</Text>
      <Box flexGrow={1}/><Text color={color.muted} wrap="truncate">{line(account)}</Text>
    </Box>
    <Box borderStyle="single" borderColor={color.border} height={3} paddingX={1}>
      {views.map((v, i) => <Box key={v} marginRight={columns >= 82 ? 2 : 0} flexShrink={0}><Text bold={view === v} color={view === v ? color.selectedText : color.muted} backgroundColor={view === v ? color.selection : undefined}>{columns >= 82 ? ` ${i + 1} ${viewTitle[v]} ` : `${i + 1} ${viewTitle[v]} `}</Text></Box>)}
      <Box flexGrow={1}/>{columns >= 82 && <Text color={color.muted}>{busy ? 'Saving…' : data.loading ? 'Loading…' : dateLabel(dayKey(view === 'calendar' ? day : new Date()), true)}</Text>}
    </Box>
    {downloading ? <DriveDownload api={api} file={downloading} width={columns} height={bodyHeight + 2} onClose={() => setDownloading(undefined)} onSaved={path => {setDownloading(undefined); setNotice(`Saved ${path}`);}}/> : attachmentMessage ? <AttachmentScreen key={attachmentMessage.id} api={api} message={attachmentMessage} width={columns} height={bodyHeight} onClose={() => setAttachmentMessage(undefined)}/> : pickingDate ? <DatePicker day={day} width={columns} height={bodyHeight} onCancel={() => setPickingDate(false)} onSelect={selected => {setDay(selected); setPickingDate(false); setPane('list'); setSelected(0); setOffset(0);}}/> : draft ? <DraftForm key={`${draft.view}-${draft.reply?.id ?? 'new'}`} view={draft.view} initial={draft.initial} height={bodyHeight} width={columns} busy={busy} error={actionError} onCancel={() => {setDraft(undefined); setActionError('');}} onSave={save}/> : help ? <Box height={bodyHeight} borderStyle="single" borderColor={color.accent} paddingX={2} flexDirection="column" overflow="hidden">
      <Text bold color={color.accent}>Keyboard shortcuts</Text>
      <ScrollArea total={helpWrapped.length} visible={helpPageRows} offset={helpOffset} height={helpPageRows} active>
        <Text color={color.text}>{helpWrapped.slice(helpOffset, helpOffset + helpPageRows).join('\n')}</Text>
      </ScrollArea>
      <Text color={color.muted}>j/k scroll · Esc close{helpMaxOffset ? ` · ${helpOffset + 1}/${helpMaxOffset + 1}` : ''}</Text>
    </Box> : <Box height={bodyHeight}>
      {(hasNav || pane === 'nav') && <CollectionNav view={view} choices={choices} active={collection} cursor={navCursor} focused={pane === 'nav'} day={day} height={bodyHeight}/>}
      {showList && <Box width={actualListWidth} flexShrink={0} borderStyle="single" borderColor={pane === 'list' ? color.accent : color.border} flexDirection="column" paddingX={1} overflow="hidden">
        <Box height={1}><Text bold color={color.text} wrap="truncate">{collectionTitle}</Text><Box flexGrow={1}/><Text color={color.muted}>{items.length}{view === 'mail' && items.length === 40 || (view === 'calendar' || view === 'tasks' || view === 'drive') && items.length === 200 ? '+' : ''}</Text></Box>
        <Text color={color.muted} wrap="truncate">{query ? `Search: ${query}` : view === 'calendar' ? `${dateLabel(dayKey(day), true)} - ${dateLabel(dayKey(shiftDay(day, 6)), true)}` : view === 'mail' ? 'From                 Subject' : view === 'tasks' ? 'Space completes a task' : view === 'people' ? 'Name / Email / Phone' : 'Enter opens folders · d download'}</Text>
        <Box marginTop={1} flexDirection="column" flexGrow={1} overflow="hidden">
          <ScrollArea total={data.loading || data.error ? 0 : items.length} visible={pageSize} offset={listOffset} height={listRows} active={pane === 'list'}>
            {data.loading ? <Text color={color.muted}>Loading {view === 'mail' ? 'messages' : view === 'calendar' ? 'events' : view === 'tasks' ? 'tasks' : view === 'people' ? 'contacts' : 'files'}…</Text> : data.error ? <Text color={color.error}>Could not load this collection.{"\n\n"}Press g to retry.</Text> : !items.length ? <Text color={color.muted}>{query ? 'No results. Press Esc to clear your search.' : view === 'mail' ? 'No messages here.' : view === 'calendar' ? 'No events this week.' : view === 'tasks' ? 'No tasks here. Press n to create one.' : view === 'people' ? 'No contacts here.' : 'No files here.'}</Text> : items.slice(listOffset, listOffset + pageSize).map((entry, i) => <ItemRow key={entry.id} view={view} item={entry} selected={selected === i + listOffset} width={actualListWidth - 6}/>)}
          </ScrollArea>
        </Box>
        <Text color={color.muted}>{items.length ? `${Math.min(selected + 1, items.length)} / ${items.length}` : ' '}{pane === 'nav' && !hasNav ? ' · Enter chooses collection' : ''}</Text>
      </Box>}
      {showDetail && !(pane === 'nav' && !hasNav) && <Box width={detailWidth} borderStyle="single" borderColor={pane === 'detail' ? color.accent : color.border} flexDirection="column" paddingX={2} overflow="hidden">
        {item ? <>
          <Text color={color.text} bold wrap="truncate">{itemTitle(view, item)}</Text>
          <Text color={color.muted}>{view === 'mail' ? `${(item as Mail).unread ? 'Unread' : 'Read'}${(item as Mail).starred ? microsoft ? ' · Flagged' : ' · Starred' : ''}` : view === 'calendar' ? 'Event details' : view === 'tasks' ? 'Task details' : view === 'people' ? 'Contact details' : 'File details'}</Text>
          <Box marginTop={1} flexGrow={1} flexDirection="column" overflow="hidden">
            <ScrollArea total={detailLines.length} visible={detailRows} offset={detailOffset} height={detailRows} active={pane === 'detail'}>
              <Text color={color.text}>{detailLines.slice(detailOffset, detailOffset + detailRows).join('\n')}</Text>
            </ScrollArea>
          </Box>
          <Text color={detail.error ? color.error : color.muted} wrap="truncate">{detail.id === item.id && detail.error ? detail.error : detail.id === item.id && detail.loading ? 'Loading message…' : detailLines.length > detailRows ? `${detailOffset + 1}-${Math.min(detailLines.length, detailOffset + detailRows)} / ${detailLines.length} lines · ${pane === 'detail' ? 'j/k scroll · Esc back' : 'Tab, then j/k'}` : ' '}</Text>
          <Text color={color.muted} wrap="truncate">{view === 'mail' ? microsoft ? 'v attachments · r reply · u read/unread · s flag' : 'v attachments · r reply · u read/unread · s star · a archive' : view === 'tasks' ? 'Space complete / reopen' : view === 'calendar' ? 'd choose date · t today · n new event' : view === 'people' ? '/ find a contact' : 'Enter open folder · d download · Backspace up'}</Text>
        </> : <Box marginTop={2} flexDirection="column"><Text bold color={color.text}>Choose {view === 'mail' ? 'a message' : view === 'calendar' ? 'an event' : view === 'tasks' ? 'a task' : view === 'people' ? 'a contact' : 'a file'}</Text><Text color={color.muted}>j/k moves through the list. Enter opens the reader.</Text></Box>}
      </Box>}
    </Box>}
    {!pickingDate && !attachmentMessage && !downloading && <Box paddingX={1} height={1} overflow="hidden">{search !== undefined ? <><Text color={color.accent}>Search / </Text><Input value={search} width={columns - 12} onChange={v => setSearch(clean(v).replace(/[\r\n]/g, ''))}/></> : <Text color={error ? color.error : notice ? color.success : color.muted} wrap="truncate">{error || notice || ' '}</Text>}</Box>}
    {!pickingDate && !attachmentMessage && !downloading && <Box paddingX={1} height={1}><Text color={color.muted} wrap="truncate">{downloading ? 'Enter save · Esc cancel' : search !== undefined ? 'Enter search · Esc cancel' : view === 'drive' && columns < 82 ? `d save · Backspace up · / find · ${onAccounts ? 'A accounts · ' : ''}?` : view === 'people' && columns < 82 ? `j/k move · Enter read · / find · ${onAccounts ? 'A accounts · ' : ''}?` : view === 'calendar' && columns < 82 ? `d date · j/k events · Enter · ${onAccounts ? 'A accounts · ' : ''}q quit` : `${view === 'mail' ? 'v files · ' : ''}${onAccounts ? 'A accounts · ' : ''}${view === 'calendar' ? 'd date · ' : ''}j/k move · Enter open · Tab pane · ${view === 'people' ? '' : view === 'drive' ? 'd save · ' : 'n new · '}/ search · ? help · q quit`}</Text></Box>}
  </Box>;
}
