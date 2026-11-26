// Fictional correspondence and appointments for the public screenshots.
export const account = 'simon.delcourt@example.com';

export const messages = {
  'mail-0': {
    from: 'Jeanne Fleury <jeanne.fleury@example.com>',
    subject: 'Saturday at ours?',
    body: "Simon,\n\nCome round after 7 on Saturday. Bernard's bringing dessert, so just bring a bottle if you can.\n\nI've found your blue scarf, by the way. I'll leave it by the door so we don't forget again.\n\nJeanne",
  },
  'mail-1': {
    from: 'Garage des Acacias <garage.acacias@example.com>',
    subject: 'Your car is ready',
    body: 'Mr Delcourt,\n\nThe two front tyres have been replaced. You can collect the car today before 18:30.\n\nPlease bring the collection slip.\n\nPascal',
  },
  'mail-2': {
    from: 'Bernard Lemaire <bernard.lemaire@example.com>',
    subject: 'Re: the train on Saturday',
    body: "Booked the 16:42. Seat 38 in coach 6 if you want to sit nearby.\n\nI'll text you when I'm at the station.",
  },
  'mail-3': {
    from: 'Le Passage <le.passage@example.com>',
    subject: 'Your table for Friday',
    body: 'Your table for two is booked for Friday 27 November at 12:30.\n\nIf your plans change, reply to this email or give us a call.',
  },
  'mail-4': {
    from: 'Odile Roux <odile.roux@example.com>',
    subject: 'Invoice 114',
    body: 'Simon,\n\nHave you had a chance to forward invoice 114 to accounts? They asked for it again this morning.\n\nOdile',
  },
  'mail-5': {
    from: 'Alain Besson <alain.besson@example.com>',
    subject: 'The shelf measurements',
    body: 'The gap is 82 cm across, not 80. Measured it again this morning. Can you leave a little room either side?',
  },
  'mail-6': {
    from: `Simon Delcourt <${account}>`,
    to: 'jeanne.fleury@example.com',
    subject: 'Re: Saturday at ours?',
    body: "I'll bring red. And yes, please put the scarf somewhere obvious. Third time lucky.\n\nSee you Saturday!",
  },
};

export const events = {
  'event-1': {
    title: 'Pick up the car',
    hours: [17, 30, 18, 0],
    location: 'Garage des Acacias',
    description: 'Two front tyres replaced. Closes at 18:30.\n\nThe collection slip should be in the kitchen drawer.',
    attendees: [],
  },
  'event-2': {
    title: 'Swimming',
    hours: [19, 0, 20, 0],
    location: 'Municipal pool',
    description: 'Lane booked for 19:00. Bring the membership card.',
    attendees: [],
  },
  'event-3': {
    title: 'Lunch with Bernard',
    hours: [12, 30, 13, 30],
    location: 'Le Passage',
    description: 'Table for two. Ask for a seat away from the kitchen.',
    attendees: ['Bernard Lemaire'],
  },
  'event-4': {
    title: 'Train to Lille',
    hours: [16, 42, 17, 45],
    location: 'Main station, coach 6',
    description: 'Seat 38. Bernard is on the same train.',
    attendees: ['Bernard Lemaire'],
  },
  'event-5': {
    title: "Dinner at Jeanne's",
    hours: [19, 0, 22, 0],
    location: "Jeanne's flat",
    description: 'Bring a bottle of red. Remember the scarf.',
    attendees: ['Jeanne Fleury', 'Bernard Lemaire'],
  },
};

export const tasks = {
  'task-1': {title: 'Find the car collection slip', notes: 'Kitchen drawer, probably under the takeaway menus.'},
  'task-2': {title: 'Forward invoice 114 to accounts', notes: "Odile's still waiting. Use the address on last month's invoice."},
  'task-3': {title: 'Book the chimney sweep', notes: 'Ask whether he has a slot before Christmas.'},
  'task-4': {title: 'Renew the library card', notes: 'Done online. Same card number.'},
  'task-5': {title: 'Measure the shelf again', notes: 'Alain says 82 cm. Check the skirting board before ordering.'},
};

// Valid, fictional PDF and CSV files for the attachment captures.
messages['mail-4'].attachments = [
  {partId: '1', name: 'invoice-114.pdf', mimeType: 'application/pdf', size: 692, data: "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA-PiA-PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4-CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTQ3ID4-CnN0cmVhbQpCVCAvRjEgMTggVGYgNTAgNzgwIFRkIChJbnZvaWNlIDExNCkgVGogL0YxIDEyIFRmIDAgLTMyIFRkIChOb3ZlbWJlciAyMDI2IC0gU2VydmljZXMpIFRqIDAgLTI0IFRkIChIb3VyczogMTgpIFRqIDAgLTI0IFRkIChUb3RhbDogRVVSIDU0MC4wMCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjUwOQolJUVPRgo"},
  {partId: '2', name: 'hours-november.csv', mimeType: 'text/csv', size: 60, data: Buffer.from('Date,Hours,Note\n2026-11-24,6,On site\n2026-11-25,6,Repairs\n2026-11-26,6,Finishing\n').toString('base64url')},
];
messages['mail-4'].attachments[1].size = Buffer.from(messages['mail-4'].attachments[1].data, 'base64url').length;

export const people = [
  {resourceName: 'people/jeanne', names: [{displayName: 'Jeanne Fleury'}], emailAddresses: [{value: 'jeanne.fleury@example.com'}], phoneNumbers: [{value: '+33 6 12 34 56 78'}], addresses: [{formattedValue: '18 rue des Lilas\n59000 Lille'}], birthdays: [{date: {month: 2, day: 3}}], biographies: [{value: 'Ring the downstairs bell. The upstairs one still does not work.'}], memberships: [{contactGroupMembership: {contactGroupResourceName: 'contactGroups/starred'}}]},
  {resourceName: 'people/bernard', names: [{displayName: 'Bernard Lemaire'}], emailAddresses: [{value: 'bernard.lemaire@example.com'}], phoneNumbers: [{value: '+33 6 23 45 67 89'}]},
  {resourceName: 'people/garage', names: [{displayName: 'Garage des Acacias'}], emailAddresses: [{value: 'atelier@example.com'}], phoneNumbers: [{value: '+33 3 20 00 12 34'}], organizations: [{name: 'Garage des Acacias', title: 'Workshop'}]},
  {resourceName: 'people/odile', names: [{displayName: 'Odile Roux'}], emailAddresses: [{value: 'odile.roux@example.com'}], phoneNumbers: [{value: '+33 6 34 56 78 90'}]},
  {resourceName: 'people/alain', names: [{displayName: 'Alain Besson'}], emailAddresses: [{value: 'alain.besson@example.com'}]},
];
export const driveFiles = [
  {id: 'receipts', name: 'Receipts', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-11-26T10:20:00Z', description: 'Invoices and repair receipts.', owners: [{displayName: 'Simon Delcourt'}], parent: 'root'},
  {id: 'photos', name: 'Holiday photos', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-11-24T18:10:00Z', parent: 'root'},
  {id: 'expenses', name: 'Household expenses', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-11-25T19:30:00Z', description: 'November bills, groceries, and the car repairs.\n\nAdd the tyre invoice once it has been paid.', owners: [{displayName: 'Simon Delcourt'}], starred: true, parent: 'root'},
  {id: 'shopping', name: 'Shopping list', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-11-25T17:00:00Z', owners: [{displayName: 'Simon Delcourt'}], parent: 'root'},
  {id: 'train', name: 'Train to Lille.pdf', mimeType: 'application/pdf', size: '48210', modifiedTime: '2026-11-23T08:40:00Z', owners: [{displayName: 'Bernard Lemaire'}], shared: true, parent: 'root'},
  {id: 'invoice', name: 'Invoice 114.pdf', mimeType: 'application/pdf', size: '692', modifiedTime: '2026-11-26T10:20:00Z', description: 'Two front tyres, fitted on 26 November.', owners: [{displayName: 'Simon Delcourt'}], parent: 'receipts'},
];
