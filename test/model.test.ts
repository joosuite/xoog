import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clean, normalizeMail, validateDraft} from '../src/model.js';

test('mail decodes nested MIME and removes terminal control sequences', () => {
  const mail = normalizeMail({id: 'm', labelIds: ['UNREAD', 'STARRED'], payload: {headers: [{name: 'Subject', value: '\x1b[31mSubject\x1b[0m'}, {name: 'From', value: 'Jeanne <jeanne@example.com>'}], mimeType: 'multipart/alternative', parts: [{mimeType: 'text/plain', body: {data: Buffer.from('Hello\n\x1b]52;c;attack\x07world').toString('base64url')}}, {mimeType: 'text/html', body: {data: Buffer.from('<b>Fallback</b>').toString('base64url')}}]}}, true);
  assert.equal(mail.subject, 'Subject');
  assert.equal(mail.body, 'Hello\nworld');
  assert.equal(mail.unread, true); assert.equal(mail.starred, true);
  assert.equal(clean('a\r\nb\0\x1b[2J'), 'a\nb');
});
test('HTML-only mail becomes readable plain text', () => {
  const mail = normalizeMail({id: 'm', payload: {mimeType: 'text/html', body: {data: Buffer.from('<p>Hello &amp; welcome.</p><script>attack()</script>').toString('base64url')}}}, true);
  assert.match(mail.body!, /Hello & welcome/); assert.doesNotMatch(mail.body!, /attack/);
});
test('nested MIME attachments keep metadata and inline data without leaking their text into the message body', () => {
  const encoded = (text: string) => Buffer.from(text).toString('base64url');
  const mail = normalizeMail({id: 'message', payload: {mimeType: 'multipart/mixed', parts: [
    {partId: '0', mimeType: 'multipart/alternative', parts: [{partId: '0.0', mimeType: 'text/plain', body: {data: encoded('Message body')}}]},
    {partId: '1', filename: '../../invoice\u001b[2J.pdf', mimeType: 'application/pdf', body: {size: 1200, attachmentId: 'remote-id'}},
    {partId: '2', filename: 'directions.txt', mimeType: 'text/plain', body: {size: 13, data: encoded('Attached text')}},
    {partId: '3', mimeType: 'image/png', body: {size: 50, attachmentId: 'inline-image'}},
  ]}}, true);
  assert.equal(mail.body, 'Message body'); assert.equal(mail.attachments?.length, 3);
  assert.equal(mail.attachments?.[0]?.attachmentId, 'remote-id'); assert.equal(mail.attachments?.[0]?.size, 1200);
  assert.equal(mail.attachments?.[1]?.data, encoded('Attached text'));
  assert.equal(mail.attachments?.[2]?.mimeType, 'image/png');
  assert.ok(!mail.attachments?.[0]?.name.includes('\u001b'));
});
test('draft validation rejects invalid dates, missing timezones and reversed events', () => {
  for (const due of ['2026-02-30', '2026-13-01', 'bad date']) assert.ok(validateDraft('tasks', {title: 'Task', due}));
  assert.equal(validateDraft('tasks', {title: 'Task', due: '2028-02-29'}), undefined);
  assert.ok(validateDraft('calendar', {title: 'Event', start: '2026-11-25T12:00:00', end: '2026-11-25T13:00:00Z'}));
  assert.ok(validateDraft('calendar', {title: 'Event', start: '2026-11-25T14:00:00Z', end: '2026-11-25T13:00:00Z'}));
  assert.ok(validateDraft('calendar', {title: 'Event', start: '2026-02-30T14:00:00Z', end: '2026-03-01T15:00:00Z'}));
  assert.equal(validateDraft('calendar', {title: 'Event', start: '2026-11-25T14:00:00.000Z', end: '2026-11-25T15:00:00.000Z'}), undefined);
  assert.ok(validateDraft('mail', {to: 'bad\r\nBcc:attack@example.com', subject: 'A', body: 'B'}));
  assert.equal(validateDraft('mail', {to: 'a@example.com, b@example.com', subject: 'A', body: 'B'}), undefined);
});
