import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Joom} from '../src/joom.js';
import {CliAccounts} from '../src/accounts.js';
import {isFolder} from '../src/model.js';

async function fixture(t: {after: (fn: () => Promise<void>) => void}) {
  const directory = await mkdtemp(join(tmpdir(), 'xoog-joom-test-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const binary = join(directory, 'joom'), log = join(directory, 'calls.jsonl');
  await writeFile(binary, `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2);
let input='';function run(){
 const auth=args.includes('auth'),service=auth?'auth':args[args.indexOf('--file')-3],command=auth?args.at(-1):args[args.indexOf('--file')-1];
 const file=auth?undefined:args[args.indexOf('--file')+1],params=file?JSON.parse(fs.readFileSync(file,'utf8')):{};
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args,params,input,file,mode:file?fs.statSync(file).mode&511:undefined})+'\\n');
 if(auth){if(args.includes('list'))console.log('['+JSON.stringify('simon.delcourt@example.com')+']');else if(args.includes('login')){console.error('Complete sign-in in your browser. Waiting for authorization.');console.log(JSON.stringify({account:args[args.indexOf('auth')+1]}));}else console.log('{}');return;}
 const allowed={
 'mail.messages.list':['q','max','ttl'],'mail.messages.get':['id','ttl'], 'mail.messages.send':['to','subject','text','body'], 'mail.messages.modify':['id','body'],
 'mail.messages.attachments.get':['id','messageId','output'], 'calendar.calendars.list':['max','ttl'],'calendar.events':['calendar','from','until','max','ttl','query'],
 'calendar.events.insert':['calendarId','summary','start','end','location','description'],
 'tasks.tasklists.list':['max','ttl'],'tasks.tasks.list':['tasklist','showCompleted','max','ttl'],'tasks.tasks.insert':['tasklist','title','notes','due'], 'tasks.tasks.patch':['tasklist','task','body'],
 'contacts.people.connections.list':['resourceName','ttl'],'drive.files.list':['q','orderBy','max','ttl'],'drive.files.get':['fileId','output']};
 const operation=service+'.'+command;
 if(!allowed[operation]||Object.keys(params).some(key=>!allowed[operation].includes(key))){console.error(JSON.stringify({error:'Unsupported Joom request parameter: '+operation}));process.exit(1);}
 if(operation==='mail.messages.list'){console.log(JSON.stringify({messages:[{id:'one'}],nextPageToken:'next'}));console.log(JSON.stringify({messages:[{id:'two'}]}));}
 else if(operation==='mail.messages.get')console.log(JSON.stringify({id:params.id,threadId:'conversation',labelIds:['UNREAD','STARRED'],payload:{headers:[{name:'From',value:'Jeanne Fleury <jeanne@example.com>'},{name:'Subject',value:'Saturday at ours?'},{name:'Message-ID',value:'<outlook@example.com>'}],parts:[{mimeType:'text/html',body:{data:Buffer.from('<p>Bring a bottle.</p>').toString('base64url')}},{filename:'invoice.pdf',mimeType:'application/pdf',body:{attachmentId:'file-one',size:19}}]}}));
 else if(operation==='calendar.calendars.list')console.log(JSON.stringify({items:[{id:'primary',summary:'Appointments'}]}));
 else if(operation==='calendar.events')console.log(JSON.stringify({items:[{id:'event',summary:'Pick up the car',start:{dateTime:'2026-11-27T17:30:00Z'},end:{dateTime:'2026-11-27T18:00:00Z'}}]}));
 else if(operation==='tasks.tasklists.list')console.log(JSON.stringify({items:[{id:'list',title:'Errands'}]}));
 else if(operation==='tasks.tasks.list')console.log(JSON.stringify({items:[{id:'task',title:'Find the collection slip',status:'needsAction',notes:'Kitchen drawer',due:'2026-11-27T00:00:00Z'}]}));
 else if(operation==='contacts.people.connections.list')console.log(JSON.stringify({connections:[{resourceName:'people/jeanne',names:[{displayName:'Jeanne Fleury'}],emailAddresses:[{value:'jeanne@example.com'}]}]}));
 else if(operation==='drive.files.list')console.log(JSON.stringify({files:[{id:'folder',name:'Receipts',mimeType:'inode/directory'},{id:'word',name:'Shopping list.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:19}]}));
 else if(params.output){fs.writeFileSync(params.output,'Joom download bytes',{flag:'wx',mode:384});console.log(JSON.stringify({path:params.output}));}
 else console.log('{}');
}
if(args.includes('--file'))run();else {process.stdin.on('data',bytes=>input+=bytes);process.stdin.on('end',run);}
`, {mode: 0o700});
  return {directory, client: new Joom({account: 'simon.delcourt@example.com', binary, home: directory, ttl: 12}), auth: new CliAccounts({binary, home: directory, backend: 'joom'}), calls: async () => (await readFile(log, 'utf8')).trim().split('\n').map(value => JSON.parse(value))};
}
test('Joom reads all five services using its supported parameters, normalized responses, and configured TTL', {skip: process.platform === 'win32'}, async t => {
  const {client, calls} = await fixture(t);
  const mail = await client.mail('all', 'Saturday'); assert.equal(mail.length, 2);
  const full = await client.message('one'); assert.match(full.body!, /Bring a bottle/); assert.equal(full.attachments?.[0]?.attachmentId, 'file-one');
  assert.equal((await client.calendars())[0]?.title, 'Appointments');
  assert.equal((await client.events('primary', new Date('2026-11-27T12:00:00Z'), ''))[0]?.title, 'Pick up the car');
  await client.tasklists(); assert.equal((await client.tasks('@default'))[0]?.due, '2026-11-27');
  assert.equal((await client.people('contacts'))[0]?.title, 'Jeanne Fleury');
  const files = await client.files('root', undefined, ''); assert.ok(isFolder(files[0]!)); assert.equal(files[1]?.title, 'Shopping list.docx');
  const log = await calls();
  assert.equal(log[0].params.q, 'Saturday');
  assert.ok(log.every(call => call.params.ttl === 12 && call.mode === 0o600));
  for (const call of log) await assert.rejects(stat(call.file), {code: 'ENOENT'});
  await client.message('one', undefined, {fresh: true}); assert.equal((await calls()).at(-1).params.ttl, 0);
  await client.message('one'); assert.equal((await calls()).at(-1).params.ttl, 12);
});
test('Joom writes, MIME replies, attachments, and original OneDrive downloads avoid Google-only fields', {skip: process.platform === 'win32'}, async t => {
  const {client, calls, directory} = await fixture(t);
  await client.mark('one', 'read'); await client.mark('one', 'star');
  await assert.rejects(client.mark('one', 'archive'), /does not expose/);
  const message = await client.message('one');
  await client.send({to: 'jeanne@example.com', subject: 'Re: Saturday', body: 'I will bring red.'}, message);
  await client.createTask('@default', {title: 'Find the slip', notes: '', due: ''});
  await client.complete('@default', {id: 'task', title: 'Find the slip', notes: '', due: '', completed: true});
  await client.createEvent('primary', {title: 'Pick up the car', start: '2026-11-27T17:00:00Z', end: '2026-11-27T18:00:00Z', location: 'Garage', description: ''});
  const destination = join(directory, 'invoice.pdf');
  await client.downloadAttachment('one', message.attachments![0]!, destination);
  assert.equal(await readFile(destination, 'utf8'), 'Joom download bytes');
  const file = (await client.files('root', 'folder-id', 'invoice'))[1]!;
  const target = join(directory, 'shopping.docx'); await client.downloadFile(file, target);
  await assert.rejects(client.downloadFile(file, target), {code: 'EEXIST'});
  const log = await calls(), send = log.find(call => call.args.includes('messages.send'));
  assert.ok(!('threadId' in send.params.body));
  assert.match(Buffer.from(send.params.body.raw, 'base64url').toString(), /In-Reply-To: <outlook@example.com>/);
  assert.ok(!send.args.join(' ').includes('bring red'));
  for (const call of log.filter(call => call.params.output)) await assert.rejects(stat(call.params.output), {code: 'ENOENT'});
  await assert.rejects(client.people('other'), /Contacts collection/);
  await assert.rejects(client.files('shared', undefined, ''), /OneDrive folders/);
});
test('Microsoft account commands list, initialize, enroll only the client ID, test, login, and logout through Joom', {skip: process.platform === 'win32'}, async t => {
  const {auth, calls} = await fixture(t);
  assert.deepEqual(await auth.list(), {accounts: ['simon.delcourt@example.com']});
  await auth.initialize(); await auth.enroll('application-id', 'must-not-be-sent'); await auth.test();
  const stages: string[] = [];
  assert.equal(await auth.login('simon.delcourt@example.com', undefined, stage => stages.push(stage)), 'simon.delcourt@example.com');
  await auth.logout('simon.delcourt@example.com');
  assert.deepEqual(stages, ['browser-opened']);
  const log = await calls(), enroll = log.find(call => call.args.includes('enroll'));
  assert.deepEqual(JSON.parse(enroll.input), {client_id: 'application-id'});
  assert.ok(log.every(call => !JSON.stringify(call).includes('must-not-be-sent')));
});
