import {dayKey, shiftDay, normalizePerson, normalizeFile, type Page, type Person, type DriveFile, type Workspace, type Mail, type Attachment, type Event, type Task, type MailDraft, type EventDraft, type TaskDraft} from '../../src/model.js';
import {decodeAttachmentData, writeNewAttachment} from '../../src/attachment-files.js';

export class FakeWorkspace implements Workspace {
  private messages: Array<Mail & {folder: string}>;
  private agenda: Array<Event & {calendar: string}>;
  private todos: Array<Task & {list: string}>;
  constructor(now = new Date()) {
    const date = (day: number, hour: number, minute = 0) => {const d = shiftDay(now, day); d.setHours(hour, minute, 0, 0); return d.toISOString();};
    this.messages = [
  [
    "Jeanne Fleury",
    "Saturday at ours?",
    "Simon,\n\nCome round after 7 on Saturday. Bernard's bringing dessert, so just bring a bottle if you can.\n\nI've found your blue scarf, by the way. I'll leave it by the door so we don't forget again.\n\nJeanne"
  ],
  [
    "Garage des Acacias",
    "Your car is ready",
    "Mr Delcourt,\n\nThe two front tyres have been replaced. You can collect the car today before 18:30.\n\nPlease bring the collection slip.\n\nPascal"
  ],
  [
    "Bernard Lemaire",
    "Re: the train on Saturday",
    "Booked the 16:42. Seat 38 in coach 6 if you want to sit nearby.\n\nI'll text you when I'm at the station."
  ],
  [
    "Le Passage",
    "Your table for Friday",
    "Your table for two is booked for Friday 27 November at 12:30.\n\nIf your plans change, reply to this email or give us a call."
  ],
  [
    "Odile Roux",
    "Invoice 114",
    "Simon,\n\nHave you had a chance to forward invoice 114 to accounts? They asked for it again this morning.\n\nOdile"
  ],
  [
    "Alain Besson",
    "The shelf measurements",
    "The gap is 82 cm across, not 80. Measured it again this morning. Can you leave a little room either side?"
  ],
  [
    "Simon Delcourt",
    "Re: Saturday at ours?",
    "I'll bring red. And yes, please put the scarf somewhere obvious. Third time lucky.\n\nSee you Saturday!"
  ]
].map(([name, subject, body], index) => ({
      id: `mail-${index}`, threadId: `thread-${index}`, subject: subject!,
      from: `${name} <${name!.toLowerCase().replace(/ /g, '.')}@example.com>`,
      to: 'test@example.com', replyTo: `${name!.toLowerCase().replace(/ /g, '.')}@example.com`,
      messageId: `<fixture-${index}@example.com>`, date: date(-Math.floor(index / 3), 10 - index),
      snippet: body!.replace(/\n/g, ' '), body, unread: index < 3, starred: index === 0 || index === 4,
      folder: index === 6 ? 'sent' : 'inbox',
    }));
    this.agenda = [
      {id: "event-1", title: "Pick up the car", start: date(0, 17, 30), end: date(0, 18, 0), allDay: false, location: "Garage des Acacias", description: "Two front tyres replaced. Closes at 18:30.\n\nThe collection slip should be in the kitchen drawer.", attendees: [], calendar: 'primary'},
      {id: "event-2", title: "Swimming", start: date(0, 19, 0), end: date(0, 20, 0), allDay: false, location: "Municipal pool", description: "Lane booked for 19:00. Bring the membership card.", attendees: [], calendar: 'primary'},
      {id: "event-3", title: "Lunch with Bernard", start: date(1, 12, 30), end: date(1, 13, 30), allDay: false, location: "Le Passage", description: "Table for two. Ask for a seat away from the kitchen.", attendees: ["Bernard Lemaire"], calendar: 'primary'},
      {id: "event-4", title: "Train to Lille", start: date(2, 16, 42), end: date(2, 17, 45), allDay: false, location: "Main station, coach 6", description: "Seat 38. Bernard is on the same train.", attendees: ["Bernard Lemaire"], calendar: 'primary'},
      {id: "event-5", title: "Dinner at Jeanne's", start: date(2, 19, 0), end: date(2, 22, 0), allDay: false, location: "Jeanne's flat", description: "Bring a bottle of red. Remember the scarf.", attendees: ["Jeanne Fleury","Bernard Lemaire"], calendar: 'personal'},
    ];
    this.todos = [
      {id: "task-1", title: "Find the car collection slip", notes: "Kitchen drawer, probably under the takeaway menus.", due: dayKey(shiftDay(now, 0)), completed: false, list: '@default'},
      {id: "task-2", title: "Forward invoice 114 to accounts", notes: "Odile's still waiting. Use the address on last month's invoice.", due: dayKey(shiftDay(now, 1)), completed: false, list: '@default'},
      {id: "task-3", title: "Book the chimney sweep", notes: "Ask whether he has a slot before Christmas.", due: dayKey(shiftDay(now, 2)), completed: false, list: '@default'},
      {id: "task-4", title: "Renew the library card", notes: "Done online. Same card number.", due: dayKey(shiftDay(now, 0)), completed: true, list: '@default'},
      {id: "task-5", title: "Measure the shelf again", notes: "Alain says 82 cm. Check the skirting board before ordering.", due: '', completed: false, list: 'personal'},
    ];
  }
  async mail(folder: string, query: string): Promise<Page<Mail>> {
    return {items: structuredClone(this.messages.filter(m => (folder === 'all' || (folder === 'unread' ? m.unread : folder === 'starred' ? m.starred : m.folder === folder)) && `${m.subject} ${m.from} ${m.body}`.toLowerCase().includes(query.toLowerCase())))};
  }
  async message(id: string): Promise<Mail> { const mail = this.messages.find(m => m.id === id); if (!mail) throw new Error('Message not found.'); return structuredClone(mail); }
  async downloadAttachment(_message: string, attachment: Attachment, destination: string, signal?: AbortSignal) {
    if (attachment.data === undefined) throw new Error('No attachment data in this fixture.');
    await writeNewAttachment(destination, decodeAttachmentData(attachment.data), signal);
  }
  async mark(id: string, action: 'read' | 'unread' | 'star' | 'unstar' | 'archive') {
    const m = this.messages.find(v => v.id === id); if (!m) return;
    if (action === 'archive') m.folder = 'archive';
    else if (action === 'read' || action === 'unread') m.unread = action === 'unread';
    else m.starred = action === 'star';
  }
  async send(draft: MailDraft) {
    this.messages.unshift({id: `sent-${Date.now()}`, threadId: '', subject: draft.subject, from: 'test@example.com', to: draft.to, replyTo: 'test@example.com', messageId: '', date: new Date().toISOString(), snippet: draft.body, body: draft.body, unread: false, starred: false, folder: 'sent'});
  }
  async calendars() { return [{id: 'primary', title: 'My calendar'}, {id: 'personal', title: 'Personal'}]; }
  async events(calendar: string, day: Date, query: string): Promise<Page<Event>> {
    const start = dayKey(day), end = dayKey(shiftDay(day, 7));
    return {items: structuredClone(this.agenda.filter(e => e.calendar === calendar && (e.allDay ? e.end > start : new Date(e.end) > new Date(`${start}T00:00:00`)) && (e.allDay ? e.start < end : new Date(e.start) < new Date(`${end}T00:00:00`)) && e.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.start.localeCompare(b.start)))};
  }
  async createEvent(calendar: string, draft: EventDraft) { this.agenda.push({id: `event-${Date.now()}`, ...draft, allDay: false, attendees: [], calendar}); }
  async tasklists() { return [{id: '@default', title: 'My tasks'}, {id: 'personal', title: 'Personal'}]; }
  async tasks(list: string): Promise<Page<Task>> { return {items: structuredClone(this.todos.filter(t => t.list === list))}; }
  async complete(list: string, task: Task) { const t = this.todos.find(v => v.id === task.id && v.list === list); if (t) t.completed = !t.completed; }
  async people(collection: string): Promise<Page<Person>> {
    const people = [normalizePerson({resourceName: 'people/jeanne', names: [{displayName: 'Jeanne Fleury'}], emailAddresses: [{value: 'jeanne.fleury@example.com'}], phoneNumbers: [{value: '+33 6 12 34 56 78'}], addresses: [{formattedValue: '18 rue des Lilas, Lille'}], biographies: [{value: 'Ring the downstairs bell.'}], memberships: [{contactGroupMembership: {contactGroupResourceName: 'contactGroups/starred'}}]}),
      normalizePerson({resourceName: 'people/bernard', names: [{displayName: 'Bernard Lemaire'}], emailAddresses: [{value: 'bernard.lemaire@example.com'}]})];
    return {items: collection === 'other' ? [] : people.filter(person => collection !== 'starred' || person.starred)};
  }
  async files(collection: string, folder: string | undefined, query: string): Promise<Page<DriveFile>> {
    const files = folder ? [{id: 'invoice', name: 'Invoice 114.pdf', mimeType: 'application/pdf', size: '692', modifiedTime: '2026-11-26T10:00:00Z', description: 'November repairs'}]
      : [{id: 'receipts', name: 'Receipts', mimeType: 'application/vnd.google-apps.folder'}, {id: 'shopping', name: 'Shopping list', mimeType: 'application/vnd.google-apps.document', starred: true}];
    return {items: files.map(normalizeFile).filter(file => (collection !== 'starred' || file.starred) && file.title.toLowerCase().includes(query.toLowerCase()))};
  }
  async downloadFile(_file: DriveFile, destination: string, signal?: AbortSignal) {await writeNewAttachment(destination, Buffer.from('File content'), signal);}
  async createTask(list: string, draft: TaskDraft) { this.todos.push({id: `task-${Date.now()}`, ...draft, completed: false, list}); }
}
