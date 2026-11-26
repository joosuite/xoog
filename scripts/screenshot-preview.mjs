// Documentation tooling only. This entry point cannot invoke Joog or read accounts.
import React from 'react';
import {Box, Text, render} from 'ink';
import {Xoog} from '../dist/account-screen.js';
import {dayKey, shiftDay, normalizePerson, normalizeFile} from '../dist/model.js';
import {color, setTheme} from '../dist/theme.js';
import {account, messages, events, tasks, people, driveFiles} from './screenshot-content.mjs';
import {decodeAttachmentData, writeNewAttachment} from '../dist/attachment-files.js';

const snapshotTime = Date.parse('2026-11-26T11:00:00Z');
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) {super(...(args.length ? args : [snapshotTime]));}
  static now() {return snapshotTime;}
};
const date = (offset, hour, minute = 0) => {
  const value = shiftDay(new Date(), offset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};
const readOnly = async () => {throw new Error('Screenshot data is read-only.');};
const auth = {list: async () => ({accounts: [account], defaultAccount: account}),
  initialize: readOnly, enroll: readOnly, test: readOnly, login: readOnly, logout: readOnly};

const mail = Object.entries(messages).map(([id, content], index) => ({
  ...content, id, threadId: id, to: content.to ?? account,
  replyTo: content.from.match(/<([^>]+)>/)?.[1] ?? content.from,
  messageId: `<${id}@example.com>`, date: date(-Math.floor(index / 3), 10 - index),
  snippet: content.body.replace(/\n/g, ' '), unread: index < 3,
  starred: index === 0 || index === 4, folder: index === 6 ? 'sent' : 'inbox',
}));
const agenda = Object.entries(events).map(([id, content], index) => {
  const {hours, ...copy} = content, offset = [0, 0, 1, 2, 2][index];
  return {...copy, id, allDay: false, start: date(offset, hours[0], hours[1]),
    end: date(offset, hours[2], hours[3]), calendar: index === 4 ? 'personal' : 'primary'};
});
const todos = Object.entries(tasks).map(([id, content], index) => ({
  ...content, id, due: index === 4 ? '' : dayKey(shiftDay(new Date(), [0, 1, 2, 0][index])),
  completed: index === 3, list: index === 4 ? 'personal' : '@default',
}));
const workspace = {
  mail: async (folder, query) => mail.filter(item =>
    (folder === 'all' || (folder === 'unread' ? item.unread : folder === 'starred' ? item.starred : item.folder === folder)) &&
    `${item.subject} ${item.from} ${item.body}`.toLowerCase().includes(query.toLowerCase())),
  message: async id => mail.find(item => item.id === id),
  downloadAttachment: async (_id, attachment, destination, signal) => writeNewAttachment(destination, decodeAttachmentData(attachment.data), signal),
  calendars: async () => [{id: 'primary', title: 'Appointments'}, {id: 'personal', title: 'Home'}],
  events: async (calendar, day, query) => {
    const start = new Date(`${dayKey(day)}T00:00:00`), end = shiftDay(start, 7);
    return agenda.filter(item => item.calendar === calendar && new Date(item.end) > start &&
      new Date(item.start) < end && item.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.start.localeCompare(b.start));
  },
  tasklists: async () => [{id: '@default', title: 'Errands'}, {id: 'personal', title: 'House'}],
  tasks: async list => todos.filter(item => item.list === list),
  people: async collection => collection === 'other' ? [] : people.map(normalizePerson).filter(person => collection !== 'starred' || person.starred),
  files: async (collection, folder, query) => driveFiles.filter(file =>
    (folder ? file.parent === folder : collection === 'root' ? file.parent === 'root' : collection === 'starred' ? file.starred : collection === 'shared' ? file.shared : true) &&
    file.name.toLowerCase().includes(query.toLowerCase())).map(normalizeFile),
  downloadFile: readOnly,
  mark: readOnly, send: readOnly, complete: readOnly, createEvent: readOnly, createTask: readOnly,
};

setTheme(process.argv.includes('--light') ? 'light' : 'dark');
const review = process.argv.includes('--review');
const size = {columns: process.stdout.columns || 140, rows: (process.stdout.rows || 36) - (review ? 0 : 1)};
const app = render(React.createElement(Box, {flexDirection: 'column', backgroundColor: color.background},
  !review && React.createElement(Text, {color: color.muted}, 'SAMPLE DATA / FICTIONAL ACCOUNT'),
  React.createElement(Xoog, {auth, workspace: () => workspace, size}),
), {patchConsole: false});
await app.waitUntilExit();
