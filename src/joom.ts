import {Joog, type JoogOptions} from './joog.js';
import {normalizePerson, normalizeFile, folderMime, type Page, type ReadOptions} from './model.js';

type Raw = Record<string, any>;
export class Joom extends Joog {
  override readonly backend = 'joom' as const;
  constructor(options: JoogOptions) {super({...options, backend: 'joom'});}

  override async call(service: string, command: string, params: Raw = {}, signal?: AbortSignal, options?: ReadOptions) {
    const request = {...params};
    if (service === 'mail' && command === 'messages.get') delete request.format;
    if (service === 'tasks' && command === 'tasks.list') delete request.showHidden;
    if (service === 'calendar' && command === 'events.list') delete request.singleEvents;
    if (service === 'mail' && command === 'messages.send' && request.body && 'threadId' in request.body) {
      request.body = {...request.body}; delete request.body.threadId;
    }
    if (service === 'drive' && command === 'files.get') delete request.supportsAllDrives;
    return super.call(service, command, request, signal, options);
  }
  protected override mailQuery(folder: string, query: string) {
    const filters: Record<string, string> = {inbox: 'in:inbox', unread: 'is:unread', starred: 'is:starred', sent: 'in:sent', all: ''};
    return [filters[folder] ?? '', query].filter(Boolean).join(' ');
  }
  override async mark(id: string, action: 'read' | 'unread' | 'star' | 'unstar' | 'archive') {
    if (action === 'archive') throw new Error('Joom does not expose an Outlook archive operation.');
    return super.mark(id, action);
  }
  override async people(collection: string, signal?: AbortSignal, options?: ReadOptions): Promise<Page<ReturnType<typeof normalizePerson>>> {
    if (collection !== 'contacts') throw new Error('Joom supports the Contacts collection.');
    const raw = await this.call('contacts', 'people.connections.list', {resourceName: 'people/me', ...this.pageParameters('pageSize', options)}, signal, options);
    return this.page(raw, (raw.connections ?? []).map(normalizePerson));
  }
  override async files(collection: string, folder: string | undefined, query: string, signal?: AbortSignal, options?: ReadOptions): Promise<Page<ReturnType<typeof normalizeFile>>> {
    if (collection !== 'root') throw new Error('Joom supports browsing and searching OneDrive folders.');
    const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const raw = await this.call('drive', 'files.list', {
      q: `${quote(folder ?? 'root')} in parents${query ? ` and fullText contains ${quote(query)}` : ''}`, orderBy: 'name', ...this.pageParameters('pageSize', options),
    }, signal, options);
    return this.page(raw, (raw.files ?? []).map((file: Raw) => normalizeFile({...file, mimeType: file.mimeType === 'inode/directory' ? folderMime : file.mimeType})));
  }
}
