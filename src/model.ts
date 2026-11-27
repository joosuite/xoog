import {stripVTControlCharacters} from 'node:util';
import {convert} from 'html-to-text';
import {type BackendId} from './backend.js';

export type DraftView = 'mail' | 'calendar' | 'tasks';
export type View = DraftView | 'people' | 'drive';
export const views: View[] = ['mail', 'calendar', 'tasks', 'people', 'drive'];
export const viewTitle: Record<View, string> = {mail: 'Mail', calendar: 'Calendar', tasks: 'Tasks', people: 'People', drive: 'Drive'};
export type Choice = {id: string; title: string};
export type Attachment = {
  partId: string; name: string; mimeType: string; size?: number;
  attachmentId?: string; data?: string;
};
export type Mail = {
  id: string; threadId: string; subject: string; from: string; to: string;
  replyTo: string; messageId: string; date: string; snippet: string;
  unread: boolean; starred: boolean; body?: string; attachments?: Attachment[];
};
export type Event = {
  id: string; title: string; start: string; end: string; allDay: boolean;
  location: string; description: string; attendees: string[];
};
export type Task = {
  id: string; title: string; notes: string; due: string; completed: boolean;
};
export type Person = {
  id: string; title: string; emails: string[]; phones: string[]; addresses: string[];
  organizations: string[]; birthdays: string[]; urls: string[]; notes: string; starred: boolean;
};
export type DriveFile = {
  id: string; title: string; mimeType: string; size?: number; modified: string;
  description: string; owners: string[]; shared: boolean; starred: boolean; canDownload: boolean;
  shortcut?: {id: string; mimeType: string};
};
export const folderMime = 'application/vnd.google-apps.folder';
export function isFolder(file: DriveFile): boolean {return (file.shortcut?.mimeType ?? file.mimeType) === folderMime;}
export function driveFileType(file: DriveFile): string {
  const mime = file.shortcut?.mimeType ?? file.mimeType;
  const labels: Record<string, string> = {
    [folderMime]: 'Folder', 'application/vnd.google-apps.document': 'Google Docs',
    'application/vnd.google-apps.spreadsheet': 'Google Sheets', 'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.drawing': 'Google Drawings', 'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel workbook',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint presentation',
  };
  return labels[mime] ?? mime;
}
export type Item = Mail | Event | Task | Person | DriveFile;
export type MailDraft = {to: string; subject: string; body: string};
export type EventDraft = {title: string; start: string; end: string; location: string; description: string};
export type TaskDraft = {title: string; due: string; notes: string};
export type ReadOptions = {fresh?: boolean};
export interface Workspace {
  readonly backend?: BackendId;
  mail(folder: string, query: string, signal?: AbortSignal, options?: ReadOptions): Promise<Mail[]>;
  message(id: string, signal?: AbortSignal, options?: ReadOptions): Promise<Mail>;
  downloadAttachment(messageId: string, attachment: Attachment, destination: string, signal?: AbortSignal): Promise<void>;
  mark(id: string, action: 'read' | 'unread' | 'star' | 'unstar' | 'archive'): Promise<void>;
  send(draft: MailDraft, reply?: Mail): Promise<void>;
  calendars(signal?: AbortSignal, options?: ReadOptions): Promise<Choice[]>;
  events(calendar: string, day: Date, query: string, signal?: AbortSignal, options?: ReadOptions): Promise<Event[]>;
  createEvent(calendar: string, draft: EventDraft): Promise<void>;
  tasklists(signal?: AbortSignal, options?: ReadOptions): Promise<Choice[]>;
  tasks(list: string, signal?: AbortSignal, options?: ReadOptions): Promise<Task[]>;
  complete(list: string, task: Task): Promise<void>;
  createTask(list: string, draft: TaskDraft): Promise<void>;
  people(collection: string, signal?: AbortSignal, options?: ReadOptions): Promise<Person[]>;
  files(collection: string, folder: string | undefined, query: string, signal?: AbortSignal, options?: ReadOptions): Promise<DriveFile[]>;
  downloadFile(file: DriveFile, destination: string, signal?: AbortSignal): Promise<void>;
}

// Untrusted Google content must never execute terminal escape sequences.
export function clean(value: unknown): string {
  return stripVTControlCharacters(String(value ?? ''))
    .replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}
export function line(value: unknown): string { return clean(value).replace(/\s+/g, ' ').trim(); }
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDay(date: Date, amount: number): Date {
  const next = new Date(date); next.setDate(next.getDate() + amount); return next;
}
export function dateLabel(value: string, allDay = false): string {
  const date = new Date(allDay || /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(0, 10)}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}
export function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit', hour12: false});
}

type Raw = Record<string, any>;
function header(raw: Raw, name: string): string {
  return line(raw.payload?.headers?.find((h: Raw) => String(h.name).toLowerCase() === name)?.value);
}
function decodeBody(part: Raw, mime: string): string[] {
  if (isAttachmentPart(part)) return [];
  if (part.mimeType === mime && part.body?.data) {
    return [Buffer.from(part.body.data, 'base64url').toString('utf8')];
  }
  return (part.parts ?? []).flatMap((child: Raw) => decodeBody(child, mime));
}
function isAttachmentPart(part: Raw): boolean {
  const disposition = part.headers?.find((entry: Raw) => String(entry.name).toLowerCase() === 'content-disposition')?.value ?? '';
  return Boolean(part.filename || /^attachment\b/i.test(disposition) ||
    (part.mimeType && !/^text\/(plain|html)$|^multipart\//i.test(part.mimeType) &&
      (part.body?.attachmentId || typeof part.body?.data === 'string')));
}
function attachments(part: Raw, path = '0'): Attachment[] {
  if (isAttachmentPart(part)) return [{
    partId: String(part.partId ?? path), name: line(part.filename) || `attachment-${path}`,
    mimeType: line(part.mimeType) || 'application/octet-stream',
    ...(typeof part.body?.size === 'number' && Number.isFinite(part.body.size) && part.body.size >= 0 ? {size: part.body.size} : {}),
    ...(typeof part.body?.attachmentId === 'string' && part.body.attachmentId ? {attachmentId: part.body.attachmentId} : {}),
    ...(typeof part.body?.data === 'string' ? {data: part.body.data} : {}),
  }];
  return (part.parts ?? []).flatMap((child: Raw, index: number) => attachments(child, `${path}.${index}`));
}
export function normalizeMail(raw: Raw, full = false): Mail {
  const plain = decodeBody(raw.payload ?? {}, 'text/plain').join('\n\n');
  const html = decodeBody(raw.payload ?? {}, 'text/html').join('\n\n');
  return {
    id: String(raw.id), threadId: String(raw.threadId ?? ''),
    subject: header(raw, 'subject') || '(No subject)', from: header(raw, 'from'),
    to: header(raw, 'to'), replyTo: header(raw, 'reply-to') || header(raw, 'from'),
    messageId: header(raw, 'message-id'),
    date: header(raw, 'date') || (raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : ''),
    snippet: line(raw.snippet), unread: (raw.labelIds ?? []).includes('UNREAD'),
    starred: (raw.labelIds ?? []).includes('STARRED'),
    ...(full ? {body: clean(plain || (html ? convert(html, {wordwrap: false, selectors: [{selector: 'img', format: 'skip'}]}) : raw.snippet ?? 'No readable message body.')), attachments: attachments(raw.payload ?? {})} : {}),
  };
}
export function normalizeEvent(raw: Raw): Event {
  return {
    id: String(raw.id), title: line(raw.summary) || '(Untitled event)',
    start: raw.start?.dateTime ?? raw.start?.date ?? '', end: raw.end?.dateTime ?? raw.end?.date ?? '',
    allDay: Boolean(raw.start?.date), location: line(raw.location), description: clean(raw.description),
    attendees: (raw.attendees ?? []).map((a: Raw) => line(a.displayName || a.email)),
  };
}
export function normalizeTask(raw: Raw): Task {
  return {id: String(raw.id), title: line(raw.title) || '(Untitled task)', notes: clean(raw.notes), due: String(raw.due ?? '').slice(0, 10), completed: raw.status === 'completed'};
}

export function normalizePerson(raw: Raw): Person {
  const values = (key: string, field: string) => (raw[key] ?? []).map((entry: Raw) => clean(entry[field])).filter(Boolean);
  const emails = values('emailAddresses', 'value'), phones = values('phoneNumbers', 'value');
  const primary = raw.names?.find((name: Raw) => name.metadata?.primary) ?? raw.names?.[0];
  return {
    id: String(raw.resourceName), title: line(primary?.displayName) || emails[0] || phones[0] || '(Unnamed contact)',
    emails, phones, addresses: values('addresses', 'formattedValue'),
    organizations: (raw.organizations ?? []).map((entry: Raw) => [line(entry.title), line(entry.name)].filter(Boolean).join(' · ')).filter(Boolean),
    birthdays: (raw.birthdays ?? []).map((entry: Raw) => entry.text ? line(entry.text) : entry.date?.month && entry.date?.day ? `${entry.date.year ? `${entry.date.year}-` : ''}${String(entry.date.month).padStart(2, '0')}-${String(entry.date.day).padStart(2, '0')}` : '').filter(Boolean),
    urls: values('urls', 'value'), notes: values('biographies', 'value').join('\n\n'),
    starred: (raw.memberships ?? []).some((entry: Raw) => entry.contactGroupMembership?.contactGroupResourceName === 'contactGroups/starred'),
  };
}
export function normalizeFile(raw: Raw): DriveFile {
  const size = Number(raw.size);
  return {
    id: String(raw.id), title: line(raw.name) || '(Unnamed file)', mimeType: line(raw.mimeType),
    ...(raw.size != null && Number.isFinite(size) && size >= 0 ? {size} : {}),
    modified: line(raw.modifiedTime), description: clean(raw.description),
    owners: (raw.owners ?? []).map((owner: Raw) => line(owner.displayName || owner.emailAddress)).filter(Boolean),
    shared: Boolean(raw.shared), starred: Boolean(raw.starred), canDownload: raw.capabilities?.canDownload !== false,
    ...(raw.shortcutDetails?.targetId ? {shortcut: {id: String(raw.shortcutDetails.targetId), mimeType: line(raw.shortcutDetails.targetMimeType)}} : {}),
  };
}
const driveExports: Record<string, {mimeType: string; extension: string}> = {
  'application/vnd.google-apps.document': {mimeType: 'application/pdf', extension: '.pdf'},
  'application/vnd.google-apps.spreadsheet': {mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx'},
  'application/vnd.google-apps.presentation': {mimeType: 'application/pdf', extension: '.pdf'},
  'application/vnd.google-apps.drawing': {mimeType: 'application/pdf', extension: '.pdf'},
};
export function driveDownload(file: DriveFile): {name: string; mimeType?: string} | undefined {
  const mime = file.shortcut?.mimeType ?? file.mimeType;
  if (!file.canDownload || mime === folderMime) return;
  const format = driveExports[mime];
  if (format) return {name: file.title.toLowerCase().endsWith(format.extension) ? file.title : file.title + format.extension, mimeType: format.mimeType};
  if (mime.startsWith('application/vnd.google-apps.')) return;
  return {name: file.title};
}

export function validateDraft(view: DraftView, values: Record<string, string>): string | undefined {
  if (view === 'mail') {
    const recipients = (values.to ?? '').split(',').map(v => v.trim());
    if (!recipients.length || recipients.some(v => !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(v))) return 'Enter email addresses separated by commas.';
    if (!values.subject?.trim()) return 'Enter a subject.';
    if (!values.body?.trim()) return 'Enter a message.';
  } else {
    if (!values.title?.trim()) return 'Enter a title.';
    if (view === 'calendar') {
      const start = new Date(values.start ?? ''), end = new Date(values.end ?? '');
      const validTimestamp = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
        const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
      };
      if (!validTimestamp(values.start ?? '') || !validTimestamp(values.end ?? '') || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Use timestamps with a timezone, e.g. 2026-11-25T09:00:00+01:00.';
      if (end <= start) return 'The end must be after the start.';
    }
    if (view === 'tasks' && values.due) {
      const due = values.due;
      const date = new Date(`${due}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== due) return 'Use a valid date in YYYY-MM-DD format.';
    }
  }
  return undefined;
}
