import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authError} from '../src/auth-error.js';

test('a nested keychain failure is not presented as missing enrollment', () => {
  const message = authError('enroll your Google client_id and client_secret with joog auth enroll: cannot unlock master key in OS keychain: Platform failure: An internal error has occurred.');
  assert.match(message, /cannot unlock/); assert.match(message, /does not require enrolling/);
  assert.doesNotMatch(message, /joog auth enroll/);
  assert.match(authError('master key missing; run joog auth init'), /Restore the original keychain entry/);
  assert.equal(authError('Google denied access.'), 'Google denied access.');
});
