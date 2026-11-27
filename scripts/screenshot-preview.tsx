// Documentation tooling only. This entry point cannot invoke Joog or read accounts.
import React from 'react';
import {Box, Text} from 'ink';
import {ProviderScreen} from '../src/provider-screen.js';
import {type BackendId} from '../src/backend.js';
import {dayKey, shiftDay, normalizePerson, normalizeFile, type Workspace} from '../src/model.js';
import {color} from '../src/theme.js';
import {account, messages, events, tasks, people, driveFiles} from './screenshot-content.js';
import {decodeAttachmentData, writeNewAttachment} from '../src/attachment-files.js';
import {type AccountManager} from '../src/accounts.js';

export const snapshotTime = '2026-11-26T11:00:00Z';
export function installSnapshotClock(): () => void {
  const NativeDate = Date, time = NativeDate.parse(snapshotTime);
  globalThis.Date = new Proxy(NativeDate, {
    construct(target, args, newTarget) {return Reflect.construct(target, args.length ? args : [time], newTarget);},
    apply() {return new NativeDate(time).toString();},
    get(target, property, receiver) {return property === 'now' ? () => time : Reflect.get(target, property, receiver);},
  });
  return () => {globalThis.Date = NativeDate;};
}
const date = (offset: number, hour: number, minute = 0) => {
  const value = shiftDay(new Date(), offset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};
const readOnly = async (): Promise<never> => {throw new Error('Screenshot data is read-only.');};
const auth: AccountManager = {list: async () => ({accounts: [account], defaultAccount: account}),
  initialize: readOnly, enroll: readOnly, test: readOnly, login: readOnly, logout: readOnly};

function createWorkspace(backend: BackendId): Workspace {
  const mail = Object.entries(messages).map(([id, content], index) => ({
    ...content, id, threadId: id, to: content.to ?? account,
    replyTo: content.from.match(/<([^>]+)>/)?.[1] ?? content.from,
    messageId: `<${id}@example.com>`, date: date(-Math.floor(index / 3), 10 - index),
    snippet: content.body.replace(/\n/g, ' '), unread: index < 3,
    starred: index === 0 || index === 4, folder: index === 6 ? 'sent' : 'inbox',
  }));
  const agenda = Object.entries(events).map(([id, content], index) => {
    const {hours, ...copy} = content, offset = [0, 0, 1, 2, 2][index]!;
    return {...copy, id, allDay: false, start: date(offset, hours[0], hours[1]),
      end: date(offset, hours[2], hours[3]), calendar: index === 4 ? 'personal' : 'primary'};
  });
  const todos = Object.entries(tasks).map(([id, content], index) => ({
    ...content, id, due: index === 4 ? '' : dayKey(shiftDay(new Date(), [0, 1, 2, 0][index]!)),
    completed: index === 3, list: index === 4 ? 'personal' : '@default',
  }));
  return {
    backend,
    mail: async (folder, query) => mail.filter(item =>
      (folder === 'all' || (folder === 'unread' ? item.unread : folder === 'starred' ? item.starred : item.folder === folder)) &&
      `${item.subject} ${item.from} ${item.body}`.toLowerCase().includes(query.toLowerCase())),
    message: async id => {const message = mail.find(item => item.id === id); if (!message) throw new Error('Screenshot message not found.'); return message;},
    downloadAttachment: async (_id, attachment, destination, signal) => {
      if (attachment.data === undefined) throw new Error('Screenshot attachment has no inline content.');
      await writeNewAttachment(destination, decodeAttachmentData(attachment.data), signal);
    },
    calendars: async () => [{id: 'primary', title: 'Appointments'}, {id: 'personal', title: 'Home'}],
    events: async (calendar, day, query) => {
      const start = new Date(`${dayKey(day)}T00:00:00`), end = shiftDay(start, 7);
      return agenda.filter(item => item.calendar === calendar && new Date(item.end) > start &&
        new Date(item.start) < end && item.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.start.localeCompare(b.start));
    },
    tasklists: async () => [{id: '@default', title: 'Errands'}, {id: 'personal', title: 'House'}],
    tasks: async list => todos.filter(item => item.list === list),
    people: async collection => collection === 'other' ? [] : people.map(normalizePerson).filter(person => collection !== 'starred' || person.starred)
      .map(person => backend === 'joom' ? {...person, addresses: [], birthdays: [], urls: [], starred: false} : person),
    files: async (collection, folder, query) => driveFiles.filter(file =>
      (folder ? file.parent === folder : collection === 'root' ? file.parent === 'root' : collection === 'starred' ? file.starred : collection === 'shared' ? file.shared : true) &&
      file.name.toLowerCase().includes(query.toLowerCase())).map(file => {
        const content = backend === 'joom' ? {...file, owners: [], starred: false, shared: false} : file;
        if (backend === 'joom' && file.mimeType === 'application/vnd.google-apps.document') return normalizeFile({...content, name: `${file.name}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        if (backend === 'joom' && file.mimeType === 'application/vnd.google-apps.spreadsheet') return normalizeFile({...content, name: `${file.name}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        return normalizeFile(content);
      }),
    downloadFile: readOnly,
    mark: readOnly, send: readOnly, complete: readOnly, createEvent: readOnly, createTask: readOnly,
  };
}

export function ScreenshotPreview({columns, rows, review, backend = 'joog'}: {columns: number; rows: number; review: boolean; backend?: BackendId}) {
  const connections = React.useMemo(() => (['joog', 'joom'] as const).map(id => {
    const workspace = createWorkspace(id);
    return {id, auth: {...auth, backend: id}, workspace: () => workspace};
  }), []);
  const size = {columns, rows: rows - (review ? 0 : 1)};
  return <Box flexDirection="column" backgroundColor={color.background}>
    {!review && <Text color={color.muted}>SAMPLE DATA / FICTIONAL ACCOUNT</Text>}
    <ProviderScreen connections={connections} initialBackend={backend} size={size}/>
  </Box>;
}
