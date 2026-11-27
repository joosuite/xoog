# Test Xoog

From a checkout with dependencies installed, run the same checks as CI:

```sh
npm run check
npm test
npm run build
```

The CI workflow runs on Linux, macOS, and Windows with Node.js 22 and 24. Local
results apply to the operating system and Node.js version you use.

## Automated coverage

`npm run check` checks application and screenshot-tool TypeScript without emitting files. `npm run build` emits
the CLI and its modules into `dist/`. `npm test` runs the files in `test/` through
Node's test runner and `tsx`.

Keep tests focused on runtime behavior and backend contracts. Reuse existing
flows for shared behavior. Check fixed copy, palette values, and layout variants
through the screenshot workflow instead of adding separate smoke tests.

UI tests render Ink components with synthetic accounts and content. They cover
navigation, forms, auth actions, cancellation, account switching, errors, and
scrolling. Joom tests validate request parameters for all five services,
Microsoft client-ID enrollment, same-email provider isolation, and provider
switching with an unavailable backend. People and Drive tests cover contact fields and search, folder navigation,
exports, private downloads, existing-file errors, and cancellation. Model tests cover response normalization and display sanitization.
Subprocess tests use fixture executables to inspect arguments, stdin, JSON
request files, cleanup, and cancellation at the Joog binary boundary.

Tests do not contact Google, open an OAuth browser session, or use your keychain.
The shebang executable-fixture tests are skipped on Windows. Other tests still
run there. The suite does not establish that live authentication or Google API
requests work on every platform.

## Check a visible change

Install Joog and select a Google account for manual verification.

```sh
npm run dev
npm run dev -- --theme light
```

Verify the changed interaction with the keyboard. Check both the 52-column by
18-row minimum and a wide terminal. Confirm that lists and readers scroll,
shortcuts stay visible, and `Esc` and `q` behave as described. An account screen
test must also preserve login, logout confirmation, and every authentication
action at the minimum size.

For documentation images, use [the reproducible screenshot capture](../assets/screenshots/README.md).
All published screenshots use a fictitious account and synthetic content.
The fixture adapters under `test/support/` are used only by tests. The screenshot
tooling has separate read-only data. Neither is part of the compiled app.
