import {execFile} from 'node:child_process';
import {parseBinaryOutput} from './joog.js';
import {clean, line} from './model.js';
import {authError, keychainError} from './auth-error.js';
import {backendInfo, type BackendId} from './backend.js';

export type AccountList = {accounts: string[]; defaultAccount?: string};
export type LoginProgress = (stage: 'browser-opened') => void;
export interface AccountManager {
  readonly backend?: BackendId;
  list(signal?: AbortSignal): Promise<AccountList>;
  initialize(signal?: AbortSignal): Promise<void>;
  enroll(clientId: string, clientSecret: string, signal?: AbortSignal): Promise<void>;
  test(signal?: AbortSignal): Promise<void>;
  login(email: string, signal?: AbortSignal, progress?: LoginProgress): Promise<string>;
  logout(email: string, signal?: AbortSignal): Promise<void>;
}

export class CliAccounts implements AccountManager {
  readonly backend: BackendId;
  constructor(private readonly options: {binary: string; home?: string; backend?: BackendId}) {this.backend = options.backend ?? 'joog';}
  async list(signal?: AbortSignal): Promise<AccountList> {
    const accounts = await this.run(['list'], signal);
    if (!Array.isArray(accounts) || !accounts.every(account => typeof account === 'string')) {
      throw new Error(`${backendInfo[this.backend].name} auth list did not return an array of account names. Press g to retry.`);
    }
    return {accounts: [...new Set(accounts.map(line).filter(Boolean))]};
  }
  private async run(args: string[], signal?: AbortSignal, input?: string, progress?: LoginProgress): Promise<unknown> {
    signal?.throwIfAborted();
    const info = backendInfo[this.backend];
    return new Promise((accept, reject) => {
      const child = execFile(this.options.binary, ['--json', '--timeout', '30', ...(this.options.home ? ['--home', this.options.home] : []), 'auth', ...args], {encoding: 'utf8', timeout: args.includes('login') ? 240_000 : 40_000, maxBuffer: 1024 * 1024, windowsHide: true, signal}, (error, stdout, stderr) => {
        if (error) {
          if (error.name === 'AbortError') {reject(error); return;}
          let detail = clean(stderr).trim();
          // Login writes a progress line before the final JSON error.
          for (const entry of stderr.trim().split('\n').reverse()) {
            try {const value = JSON.parse(entry); if (typeof value.error === 'string') {detail = clean(value.error); break;}} catch {}
          }
          if (input) detail = keychainError(detail, this.backend) ?? `Could not save client credentials. Check the ${info.provider} app registration and OS keychain, then retry.`;
          reject(new Error((error as NodeJS.ErrnoException).code === 'ENOENT' ? `${info.name} was not found. Install it or restart Xoog with --${this.backend} /path/to/${this.backend}.` : authError(detail, this.backend) || 'Authentication failed or timed out. Try again.'));
          return;
        }
        try {accept(parseBinaryOutput(stdout, 'authentication'));} catch (cause) {reject(cause);}
      });
      let tail = '', browserReported = false;
      if (progress) child.stderr?.on('data', chunk => {
        tail = (tail + String(chunk)).slice(-1024);
        if (!browserReported && tail.includes('Complete sign-in in your browser.')) {
          browserReported = true; progress('browser-opened');
        }
      });
      // Client credentials travel only over stdin, never argv or a temporary file.
      child.stdin?.on('error', () => {});
      child.stdin?.end(input ?? '');
    });
  }
  async initialize(signal?: AbortSignal) {await this.run(['init'], signal);}
  async enroll(clientId: string, clientSecret: string, signal?: AbortSignal) {await this.run(['enroll', '--stdin'], signal, JSON.stringify({client_id: clientId, ...(backendInfo[this.backend].secret ? {client_secret: clientSecret} : {})}));}
  async test(signal?: AbortSignal) {await this.run(['test'], signal);}
  async login(email: string, signal?: AbortSignal, progress?: LoginProgress) {
    const result = await this.run([email, 'login', 'mail,calendar,tasks,contacts,drive'], signal, undefined, progress);
    const account = result && typeof result === 'object' && 'account' in result ? result.account : undefined;
    if (typeof account !== 'string' || !account.trim()) throw new Error(`${backendInfo[this.backend].name} did not return the signed-in account. Refresh the account list.`);
    return line(account);
  }
  async logout(email: string, signal?: AbortSignal) {await this.run([email, 'logout'], signal);}
}

