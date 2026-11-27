import {parseArgs} from 'node:util';
import {type BackendId} from './backend.js';

export function parseOptions(args = process.argv.slice(2)) {
  const {values} = parseArgs({args, options: {
    joog: {type: 'string'}, joom: {type: 'string'}, backend: {type: 'string'}, home: {type: 'string'}, calendar: {type: 'string'}, tasklist: {type: 'string'},
    ttl: {type: 'string', default: '5'}, theme: {type: 'string', default: 'dark'},
    'no-alt-screen': {type: 'boolean'}, help: {type: 'boolean', short: 'h'}, version: {type: 'boolean', short: 'v'},
  }});
  const ttl = Number(values.ttl);
  if (!/^\d+$/.test(values.ttl!) || !Number.isInteger(ttl) || ttl < 0 || ttl > 0xffff_ffff) {
    throw new Error('--ttl must be a whole number of minutes from 0 to 4294967295. Use 0 to disable caching.');
  }
  const backend = values.backend ?? (values.joom && !values.joog ? 'joom' : 'joog');
  if (backend !== 'joog' && backend !== 'joom') throw new Error('--backend must be joog or joom.');
  return {...values, ttl, backend: backend as BackendId};
}
