# Contributing to Xoog

## Report a bug or suggest a feature

Search existing issues before opening a new one. For bugs, include the Xoog
version or commit, Node.js and Joog versions, operating system, terminal,
terminal dimensions, theme, and the keys that reproduce the problem.
State what you expected and what happened, with enough detail to reproduce it.

Replace real account names, resource IDs, messages, events, and tasks with
examples. Use a fictitious account in screenshots. Never include OAuth client
secrets, tokens, credential files, or private account content.

For feature requests, describe the task you want to complete and the proposed
interaction. Discuss broad changes to navigation or keyboard shortcuts before
implementing them. Use [SECURITY.md](SECURITY.md) for private vulnerability reports.

## Set up development

Install Node.js 22 or newer, npm, and the
[Joog executable](https://github.com/joko76ers/joog). From the Xoog directory:

```sh
npm ci
npm run dev
```

Select or log in to an account on the first screen. Read
[sign-in setup](docs/authentication.md) for authentication. Automated tests use
fixtures under `test/support/` and need neither Joog nor a Google account.

## Preserve the terminal and binary contracts

Xoog uses React and Ink to render a native terminal interface. Keep every action
reachable by keyboard. Verify changed screens at 52 columns by 18 rows and at
their wider layouts, in both themes. Keep overflowing content scrollable and
leave shortcuts visible.

Xoog calls Joog binaries through `src/joog.ts` and `src/accounts.ts`. Do not import
Joog sources or read encrypted credentials directly. Xoog starts with account
management. Accounts do not belong in its command-line arguments.

When changing a user interaction, update its shortcuts, help, documentation, and
relevant regression tests together. The [architecture](docs/architecture.md)
describes subprocess requests, cancellation, and state handling.

## Validate changes

Run the relevant tests while developing, then run the checks used by CI:

```sh
npm run check
npm test
npm run build
```

Tests use synthetic data and fixture executables. They do not contact Google or
need stored credentials. Some executable-fixture tests are skipped on Windows.
See [testing](docs/testing.md) for the test boundaries and manual checks.

Regenerate documentation screenshots when a visible screen changes. Follow
[the screenshot guide](assets/screenshots/README.md) and inspect each image.

## Submit a pull request

Keep each pull request focused on one problem. Explain the resulting behavior,
any compatibility impact, and the checks you ran. Include before and after
screenshots for visible changes, using fictitious account data. Update user
documentation with the implementation.

Contributions submitted for inclusion in Xoog are licensed under the
[Apache License, Version 2.0](LICENSE), unless explicitly stated otherwise.
Participation is subject to the [code of conduct](CODE_OF_CONDUCT.md).
