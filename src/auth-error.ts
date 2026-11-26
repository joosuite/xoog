import {clean} from './model.js';

export function keychainError(message: string): string | undefined {
  const value = message.toLowerCase();
  if (value.includes('cannot unlock master key') || value.includes('os keychain unavailable')) {
    return 'Joog cannot unlock its existing OS Keychain master key. Unlock your login keychain and approve access for the Joog executable, then retry. This error does not require enrolling your Google client again.';
  }
  if (value.includes('master key missing')) {
    return 'Joog cannot find the original master key. Check that you are using the same state directory and OS keychain as before. Restore the original keychain entry to read the existing credentials.';
  }
  return undefined;
}

export function authError(message: string): string {
  return keychainError(message) ?? clean(message);
}
