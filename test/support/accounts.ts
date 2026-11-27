import type {AccountManager} from '../../src/accounts.js';

export class FakeAccounts implements AccountManager {
  private accounts = ['test@example.com'];
  async list() {return {accounts: [...this.accounts], defaultAccount: this.accounts[0]};}
  async enroll() {}
  async test() {}
  async login(email: string) {const account = email.toLowerCase(); if (!this.accounts.includes(account)) this.accounts.push(account); return account;}
  async logout(email: string) {this.accounts = this.accounts.filter(value => value !== email);}
}
