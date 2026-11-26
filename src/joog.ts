import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm, access, stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {clean, line, normalizeMail, normalizeEvent, normalizeTask, normalizePerson, normalizeFile, driveDownload, shiftDay, type ReadOptions, type Workspace, type Mail, type Attachment, type MailDraft, type EventDraft, type TaskDraft, type DriveFile} from './model.js';
import {authError} from './auth-error.js';
import {copyNewFile, decodeAttachmentData, writeNewAttachment} from './attachment-files.js';

export type JoogOptions = {account: string; binary: string; home?: string; ttl?: number};
type Raw = Record<string, any>;
// Only commands that accept Joog's TTL option belong here. Writes and downloads
// must keep their existing command parameters.
const cacheableReads = new Set([
  'mail.messages.list', 'mail.messages.get', 'calendar.calendars.list', 'calendar.events',
  'tasks.tasklists.list', 'tasks.tasks.list', 'contacts.people.connections.list',
  'contacts.other-contacts.list', 'drive.files.list',
]);

export function parseJoogOutput(stdout: string, operation: string): Raw {
  const text = stdout.trim();
  if (!text) return {};
  try {return JSON.parse(text);}
  catch {
    // Paginated Joog commands emit one complete JSON response per line.
    // A single non-paginated response may instead be pretty-printed JSON.
    try {
      const pages: Raw[] = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
      if (pages.length < 2 || pages.some(page => !page || typeof page !== 'object' || Array.isArray(page))) throw new Error();
      const collections = new Map<string, unknown[]>();
      for (const page of pages) for (const [key, value] of Object.entries(page)) {
        if (Array.isArray(value)) collections.set(key, (collections.get(key) ?? []).concat(value));
      }
      // Only the final response describes the remaining pagination state.
      return Object.fromEntries([...Object.entries(pages[pages.length - 1]!), ...collections]);
    } catch {
      // Do not echo stdout: it can contain private mail, tasks, or credentials.
      throw new Error(`Xoog could not parse the JSON output for ${operation}.`);
    }
  }
}

export async function findBinary(explicit?: string, searchPath = process.env.PATH ?? ''): Promise<string> {
  if (explicit) return explicit;
  const executable = process.platform === 'win32' ? 'joog.exe' : 'joog';
  for (const directory of searchPath.split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, executable);
    try {await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK); if ((await stat(candidate)).isFile()) return candidate;} catch {}
  }
  const local = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'joog/bin', executable);
  try { await access(local); return local; } catch { return 'joog'; }
}
export class Joog implements Workspace {
  constructor(private readonly options: JoogOptions) {}

  async call(service: string, command: string, params: Raw = {}, signal?: AbortSignal, options?: ReadOptions): Promise<Raw> {
    signal?.throwIfAborted();
    // Request files keep message bodies and other private content out of process arguments.
    const directory = await mkdtemp(join(tmpdir(), 'xoog-'));
    try {
      const file = join(directory, 'request.json');
      const request = cacheableReads.has(`${service}.${command}`) && params.output === undefined
        ? {...params, ttl: options?.fresh ? 0 : params.ttl ?? this.options.ttl ?? 5} : params;
      await writeFile(file, JSON.stringify(request), {mode: 0o600});
      const args = ['--json', '--timeout', '30', ...(this.options.home ? ['--home', this.options.home] : []), service, this.options.account, command, '--file', file];
      return await new Promise<Raw>((accept, reject) => {
        execFile(this.options.binary, args, {encoding: 'utf8', timeout: 40_000, maxBuffer: 16 * 1024 * 1024, signal, windowsHide: true}, (error, stdout, stderr) => {
          if (error) {
            if (error.name === 'AbortError') { reject(error); return; }
            let detail = clean(stderr).trim();
            try { detail = clean(JSON.parse(stderr).error); } catch {}
            reject(new Error((error as NodeJS.ErrnoException).code === 'ENOENT'
              ? 'Joog was not found. Install Joog or pass --joog /path/to/joog.'
              : (/insufficient.*scopes|access_token_scope_insufficient|insufficientpermissions/i.test(detail) ? 'Google permissions are missing. Press A for Accounts, then L to log in again and authorize the requested services.' : authError(detail)) || `Joog ${command} failed or timed out.`));
            return;
          }
          try {accept(parseJoogOutput(stdout, command));}
          catch (cause) {reject(cause);}
        });
      });
    } finally { await rm(directory, {recursive: true, force: true}); }
  }

  async mail(folder: string, query: string, signal?: AbortSignal, options?: ReadOptions) {
    const filters: Record<string, string> = {inbox: 'in:inbox', unread: 'is:unread', starred: 'is:starred', sent: 'in:sent', all: '-in:trash -in:spam'};
    const result = await this.call('mail', 'messages.list', {q: `${filters[folder] ?? filters.inbox} ${query}`.trim(), max: 40}, signal, options);
    const messages: Mail[] = [];
    // Four concurrent Joog processes cap keychain and API pressure.
    const ids: Raw[] = result.messages ?? [];
    for (let offset = 0; offset < ids.length; offset += 4) {
      const batch = await Promise.all(ids.slice(offset, offset + 4).map(raw => this.call('mail', 'messages.get', {id: raw.id, format: 'metadata'}, signal, options)));
      messages.push(...batch.map(raw => normalizeMail(raw)));
    }
    return messages;
  }
  async message(id: string, signal?: AbortSignal, options?: ReadOptions) { return normalizeMail(await this.call('mail', 'messages.get', {id, format: 'full'}, signal, options), true); }
  async downloadAttachment(messageId: string, attachment: Attachment, destination: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (attachment.data !== undefined) return writeNewAttachment(destination, decodeAttachmentData(attachment.data), signal);
    if (!attachment.attachmentId) throw new Error('This message part has no downloadable content.');
    const directory = await mkdtemp(join(tmpdir(), 'xoog-attachment-'));
    try {
      const output = join(directory, 'content');
      await this.call('mail', 'messages.attachments.get', {messageId, id: attachment.attachmentId, output}, signal);
      await writeNewAttachment(destination, await readFile(output, {signal}), signal);
    } finally {await rm(directory, {recursive: true, force: true});}
  }
  async mark(id: string, action: 'read' | 'unread' | 'star' | 'unstar' | 'archive') {
    const labels = {read: {removeLabelIds: ['UNREAD']}, unread: {addLabelIds: ['UNREAD']}, star: {addLabelIds: ['STARRED']}, unstar: {removeLabelIds: ['STARRED']}, archive: {removeLabelIds: ['INBOX']}};
    await this.call('mail', 'messages.modify', {id, body: labels[action]});
  }
  async send(draft: MailDraft, reply?: Mail) {
    const params: Raw = {to: draft.to.split(',').map(v => v.trim()), subject: draft.subject, text: draft.body};
    if (reply?.messageId) {
      // Raw MIME is needed for reply headers; base64url keeps it a JSON string.
      const headers = [`From: ${line(this.options.account)}`, `To: ${params.to.join(', ')}`, `Date: ${new Date().toUTCString()}`, `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', `In-Reply-To: ${line(reply.messageId)}`, `References: ${line(reply.messageId)}`];
      const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${Buffer.from(draft.body).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''}\r\n`).toString('base64url');
      await this.call('mail', 'messages.send', {body: {raw, threadId: reply.threadId}});
    } else { await this.call('mail', 'messages.send', params); }
  }
  async calendars(signal?: AbortSignal, options?: ReadOptions) {
    const raw = await this.call('calendar', 'calendars.list', {max: 100}, signal, options);
    return (raw.items ?? []).map((v: Raw) => ({id: String(v.id), title: clean(v.summaryOverride || v.summary || v.id)}));
  }
  async events(calendar: string, day: Date, query: string, signal?: AbortSignal, options?: ReadOptions) {
    const from = new Date(day); from.setHours(0, 0, 0, 0);
    const raw = await this.call('calendar', 'events', {calendar, from: from.toISOString(), until: shiftDay(from, 7).toISOString(), ...(query ? {query} : {}), max: 200}, signal, options);
    return (raw.items ?? []).filter((v: Raw) => v.status !== 'cancelled').map(normalizeEvent);
  }
  async createEvent(calendar: string, draft: EventDraft) {
    await this.call('calendar', 'events.insert', {calendarId: calendar, summary: draft.title, start: {dateTime: draft.start}, end: {dateTime: draft.end}, location: draft.location, description: draft.description});
  }
  async tasklists(signal?: AbortSignal, options?: ReadOptions) {
    const raw = await this.call('tasks', 'tasklists.list', {max: 100}, signal, options);
    return (raw.items ?? []).map((v: Raw) => ({id: String(v.id), title: clean(v.title)}));
  }
  async tasks(list: string, signal?: AbortSignal, options?: ReadOptions) {
    const raw = await this.call('tasks', 'tasks.list', {tasklist: list, showCompleted: true, showHidden: true, max: 200}, signal, options);
    return (raw.items ?? []).filter((v: Raw) => !v.deleted).map(normalizeTask);
  }
  async complete(list: string, task: ReturnType<typeof normalizeTask>) {
    await this.call('tasks', 'tasks.patch', {tasklist: list, task: task.id, body: {status: task.completed ? 'needsAction' : 'completed', ...(!task.completed ? {} : {completed: null})}});
  }
  async createTask(list: string, draft: TaskDraft) {
    await this.call('tasks', 'tasks.insert', {tasklist: list, title: draft.title, notes: draft.notes, ...(draft.due ? {due: `${draft.due}T00:00:00Z`} : {})});
  }
  async people(collection: string, signal?: AbortSignal, options?: ReadOptions) {
    const other = collection === 'other';
    const raw = await this.call('contacts', other ? 'other-contacts.list' : 'people.connections.list', other
      ? {readMask: 'names,emailAddresses,phoneNumbers'}
      : {resourceName: 'people/me', personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies,memberships', sortOrder: 'FIRST_NAME_ASCENDING'}, signal, options);
    return (raw[other ? 'otherContacts' : 'connections'] ?? []).map(normalizePerson)
      .filter((person: ReturnType<typeof normalizePerson>) => collection !== 'starred' || person.starred);
  }
  async files(collection: string, folder: string | undefined, query: string, signal?: AbortSignal, options?: ReadOptions) {
    const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const filters = ['trashed = false'];
    if (folder) filters.push(`${quote(folder)} in parents`);
    else if (collection === 'root') filters.push("'root' in parents");
    else if (collection === 'starred') filters.push('starred = true');
    else if (collection === 'shared') filters.push('sharedWithMe = true');
    if (query) filters.push(`fullText contains ${quote(query)}`);
    const raw = await this.call('drive', 'files.list', {
      q: filters.join(' and '), orderBy: folder || collection === 'root' ? 'folder,name_natural' : 'modifiedTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,description,owners(displayName,emailAddress),shared,starred,capabilities(canDownload),shortcutDetails(targetId,targetMimeType))',
      supportsAllDrives: true, includeItemsFromAllDrives: true, max: 200,
    }, signal, options);
    return (raw.files ?? []).map(normalizeFile);
  }
  async downloadFile(file: DriveFile, destination: string, signal?: AbortSignal) {
    const format = driveDownload(file);
    if (!format) throw new Error('This item cannot be downloaded.');
    signal?.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'xoog-drive-'));
    try {
      const output = join(directory, 'content'), fileId = file.shortcut?.id ?? file.id;
      await this.call('drive', format.mimeType ? 'files.export' : 'files.get', {
        fileId, output, ...(format.mimeType ? {mimeType: format.mimeType} : {supportsAllDrives: true}),
      }, signal);
      await copyNewFile(output, destination, signal);
    } finally {await rm(directory, {recursive: true, force: true});}
  }
}
