import {clean} from './model.js';
import {backendInfo, type BackendId} from './backend.js';

export function keychainError(message: string, backend: BackendId = 'joog'): string | undefined {
  const {name, provider} = backendInfo[backend];
  const value = message.toLowerCase();
  if (value.includes('cannot unlock master key') || value.includes('os keychain unavailable')) {
    return `${name} cannot unlock its existing OS Keychain master key. Unlock your login keychain and approve access for the ${name} executable, then retry. This error does not require enrolling your ${provider} client again.`;
  }
  if (value.includes('master key missing')) {
    return `${name} cannot find the original master key. Check that you are using the same state directory and OS keychain as before. Restore the original keychain entry to read the existing credentials.`;
  }
  return undefined;
}

export function authError(message: string, backend: BackendId = 'joog'): string {
  return keychainError(message, backend) ?? clean(message);
}
