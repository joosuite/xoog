import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOptions} from '../src/cli-options.js';

test('CLI defaults to five cache minutes and accepts explicit TTLs including zero', () => {
  assert.equal(parseOptions([]).ttl, 5);
  assert.equal(parseOptions(['--ttl', '0']).ttl, 0);
  assert.equal(parseOptions(['--ttl=12']).ttl, 12);
  assert.equal(parseOptions(['--ttl', '4294967295']).ttl, 4294967295);
});
test('CLI rejects missing, negative, fractional, nonnumeric, and out-of-range TTLs', () => {
  for (const value of ['', '-1', '1.5', 'five', '1e2', 'Infinity', 'NaN', ' 5', '4294967296']) {
    assert.throws(() => parseOptions([`--ttl=${value}`]), /--ttl must be a whole number/);
  }
  assert.throws(() => parseOptions(['--ttl']), /argument missing|argument must be specified/i);
});
test('CLI selects Joom explicitly or by its binary option without changing account selection', () => {
  assert.equal(parseOptions([]).backend, 'joog');
  assert.equal(parseOptions(['--backend', 'joom']).backend, 'joom');
  assert.equal(parseOptions(['--joom', '/bin/joom']).backend, 'joom');
  assert.equal(parseOptions(['--backend', 'joog', '--joom', '/bin/joom']).backend, 'joog');
  assert.throws(() => parseOptions(['--backend', 'other']), /--backend must/);
});
