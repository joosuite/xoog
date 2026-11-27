import React, {useState} from 'react';
import {Xoog} from './account-screen.js';
import {type AccountManager} from './accounts.js';
import {type BackendId} from './backend.js';
import {type Workspace} from './model.js';

export type Connection = {id: BackendId; auth: AccountManager; workspace: (account: string) => Workspace};
export function ProviderScreen({connections, initialBackend = 'joog', ...props}: {
  connections: Connection[]; initialBackend?: BackendId;
  initialCalendar?: string; initialTasklist?: string; size?: {columns: number; rows: number};
}) {
  const [backend, setBackend] = useState(initialBackend);
  const connection = connections.find(value => value.id === backend) ?? connections[0];
  if (!connection) throw new Error('Configure at least one account provider.');
  return <Xoog key={connection.id} auth={connection.auth} workspace={connection.workspace}
    backends={connections.map(value => value.id)} onBackend={setBackend} size={props.size}
    initialCalendar={connection.id === initialBackend ? props.initialCalendar : undefined}
    initialTasklist={connection.id === initialBackend ? props.initialTasklist : undefined}/>;
}
